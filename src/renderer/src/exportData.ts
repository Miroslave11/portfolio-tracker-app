import { allocateBySecurity } from '../../core/allocation'
import { addDays, addMonths, todayIso } from '../../core/date'
import {
  monthlyInvestmentsTable,
  performanceYearsTable,
  positionsTable,
  realizedSalesTable,
  transactionsTable
} from '../../core/export-tables'
import { calculateInvestments } from '../../core/investments'
import { computeLots } from '../../core/lots'
import type { MoneyCurrency } from '../../core/money'
import {
  computePerformance,
  performanceByYear,
  toPerfPoints,
  type PerfPoint
} from '../../core/performance'
import { calculatePortfolio, valueAtOrBefore } from '../../core/portfolio-calc'
import type { ReportData } from '../../core/report-html'
import type { ExportTable } from '../../shared/export'
import type { Portfolio } from '../../shared/model'
import { FX_EUR_CZK, type PriceCache } from '../../shared/prices'
import type { BrokerFilter } from './store'

/** Stav, ze kterého se export sestavuje (filtr brokera platí jako na obrazovkách). */
export interface ExportContext {
  portfolio: Portfolio
  prices: PriceCache
  brokerFilter: BrokerFilter
}

export function accountIdsOf(ctx: ExportContext): Set<string> | null {
  if (ctx.brokerFilter === 'all') return null
  return new Set(ctx.portfolio.accounts.filter((a) => a.name === ctx.brokerFilter).map((a) => a.id))
}

export function scopeLabel(ctx: ExportContext): string {
  return ctx.brokerFilter === 'all' ? 'všichni brokeři' : ctx.brokerFilter
}

const lastTransactionDate = (p: Portfolio): string =>
  p.transactions.reduce((max, t) => (t.date > max ? t.date : max), '0000-00-00')

/** Kurz EUR/CZK k danému dni (nebo nejstarší známý); `null` bez stažených kurzů. */
export function fxLookup(prices: PriceCache): ((date: string) => number) | null {
  const rates = prices.fx[FX_EUR_CZK]?.rates
  if (!rates || rates.length === 0) return null
  return (date) => valueAtOrBefore(rates, date) ?? rates[0][1]
}

/** Všechna data jako listy Excelu: transakce, měsíční investice, pozice, výkon po letech, prodeje. */
export function workbookSheets(ctx: ExportContext): ExportTable[] {
  const { portfolio, prices } = ctx
  const ids = accountIdsOf(ctx)
  const fx = fxLookup(prices)
  const calc = calculatePortfolio({ portfolio, prices, accountIds: ids })
  const summary = calc.summary

  const txs = portfolio.transactions
    .filter((t) => !ids || ids.has(t.accountId))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  const asOf = summary?.asOf ?? lastTransactionDate(portfolio)
  const stats = calculateInvestments(portfolio, { accountIds: ids, asOf })
  const czkTotals = fx
    ? new Map(
        calculateInvestments(portfolio, {
          accountIds: ids,
          asOf,
          convert: (amount, date) => amount * fx(date)
        }).months.map((m) => [m.month, m.total])
      )
    : null

  const points = toPerfPoints(calc.series, 'EUR')
  const lots = computeLots(portfolio, { fxAt: fx ?? undefined })
  const sales = lots.sales
    .filter((s) => !ids || ids.has(s.accountId))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  return [
    transactionsTable(txs, portfolio),
    monthlyInvestmentsTable(stats, portfolio.accounts, { czkTotals }),
    positionsTable(summary?.positions ?? [], portfolio.securities, summary?.fxRate ?? null),
    performanceYearsTable(points ? performanceByYear(points) : [], 'EUR'),
    realizedSalesTable(sales, portfolio)
  ]
}

/** Měsíce nabízené pro report: od prvního měsíce s transakcí po aktuální, nejnovější první. */
export function reportMonths(portfolio: Portfolio): string[] {
  if (portfolio.transactions.length === 0) return []
  const first = portfolio.transactions.reduce(
    (min, t) => (t.date < min ? t.date : min),
    '9999-99-99'
  )
  const last = todayIso().slice(0, 7)
  const months: string[] = []
  for (let m = `${first.slice(0, 7)}-01`; m.slice(0, 7) <= last; m = addMonths(m, 1)) {
    months.push(m.slice(0, 7))
  }
  return months.reverse()
}

export interface ReportOptions {
  month: string
  currency: MoneyCurrency
  summary: boolean
  investments: boolean
  positions: boolean
  performance: boolean
}

/**
 * Data měsíčního reportu k poslednímu dni vybraného měsíce (u rozpracovaného měsíce
 * k poslednímu známému dni). `null`, když pro měsíc nejsou žádná data.
 */
export function buildReportData(ctx: ExportContext, opts: ReportOptions): ReportData | null {
  const { portfolio, prices } = ctx
  const ids = accountIdsOf(ctx)
  const monthStart = `${opts.month}-01`
  const monthEnd = addDays(addMonths(monthStart, 1), -1)
  const full = calculatePortfolio({ portfolio, prices, accountIds: ids })
  if (!full.summary) return null
  const asOf = monthEnd < full.summary.asOf ? monthEnd : full.summary.asOf
  const calc =
    asOf === full.summary.asOf
      ? full
      : calculatePortfolio({ portfolio, prices, accountIds: ids, asOf })
  const summary = calc.summary
  if (!summary) return null

  // Kč jen s kurzem; jinak se použije EUR.
  const fx = fxLookup(prices)
  const currency: MoneyCurrency = opts.currency === 'CZK' && fx && summary.fxRate ? 'CZK' : 'EUR'
  const rate = currency === 'CZK' ? summary.fxRate! : 1
  const points: PerfPoint[] | null = toPerfPoints(calc.series, currency)
  const first = summary.firstDate

  const data: ReportData = {
    month: opts.month,
    currency,
    generatedAt: todayIso(),
    scope: scopeLabel(ctx)
  }

  if (opts.summary) {
    const total = points ? computePerformance(points, first, asOf) : null
    const value = currency === 'CZK' ? (summary.valueCzk ?? summary.value * rate) : summary.value
    const invested =
      currency === 'CZK' ? (summary.investedCzk ?? summary.invested * rate) : summary.invested
    data.summary = {
      asOf,
      value,
      invested,
      profit: value - invested,
      profitPct: invested > 0 ? (value - invested) / invested : null,
      irr: total?.irr ?? null
    }
  }

  if (opts.investments) {
    const stats = calculateInvestments(portfolio, {
      accountIds: ids,
      asOf,
      convert: currency === 'CZK' && fx ? (amount, date) => amount * fx(date) : undefined
    })
    const idx = stats.months.findIndex((m) => m.month === opts.month)
    const row = idx >= 0 ? stats.months[idx] : null
    const names = new Map(portfolio.accounts.map((a) => [a.id, a.name]))
    const byBroker = row
      ? Object.entries(row.byAccount)
          .filter(([, total]) => total > 0)
          .map(([id, total]) => ({
            name: names.get(id) ?? id,
            total,
            buys: portfolio.transactions.filter(
              (t) => t.type === 'BUY' && t.accountId === id && t.date.slice(0, 7) === opts.month
            ).length
          }))
          .sort((a, b) => b.total - a.total)
      : []
    data.investments = {
      byBroker,
      total: row?.total ?? 0,
      buys: row?.buys ?? 0,
      previousMonthTotal: idx > 0 ? stats.months[idx - 1].total : null,
      average12: stats.average12
    }
  }

  if (opts.positions) {
    const slices = allocateBySecurity(summary.positions, portfolio.securities, 'index')
    const names = new Map(portfolio.securities.map((s) => [s.id, s.name]))
    const total = summary.positions.reduce((s, p) => s + p.value, 0)
    data.positions = {
      rows: summary.positions
        .slice()
        .sort((a, b) => b.value - a.value)
        .map((p) => ({
          ticker: p.securityId,
          name: names.get(p.securityId) ?? '',
          shares: p.shares,
          value: p.value * rate,
          share: total > 0 ? p.value / total : 0,
          unrealized: p.unrealized * rate
        })),
      byIndex: slices.map((s) => ({ label: s.label, value: s.value * rate, share: s.share })),
      total: total * rate
    }
  }

  if (opts.performance) {
    const total = points ? computePerformance(points, first, asOf) : null
    const month = points ? computePerformance(points, monthStart, asOf) : null
    data.performance = {
      total: total
        ? { from: total.from, to: total.to, ttwror: total.ttwror, irr: total.irr }
        : null,
      month: month
        ? { from: month.from, to: month.to, ttwror: month.ttwror, profit: month.profit }
        : null,
      years: points
        ? performanceByYear(points).map(({ year, result: r }) => ({
            year,
            profit: r?.profit ?? null,
            ttwror: r?.ttwror ?? null,
            irr: r?.irr ?? null
          }))
        : []
    }
  }
  return data
}
