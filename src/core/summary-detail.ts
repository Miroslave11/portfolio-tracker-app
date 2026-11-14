import type { Portfolio } from '../shared/model'
import type { PriceCache } from '../shared/prices'
import type { MonthDetail } from '../shared/summary'
import { addDays, addMonths } from './date'
import { computeLots, timeTestFreeFrom } from './lots'
import { monthsToReach } from './goal-projection'
import { computePerformance, type CurvePoint, type PerfPoint } from './performance'
import { valueAtOrBefore } from './portfolio-calc'
import { computeRebalance, monthsToTarget, type RebalanceTarget } from './rebalance'

export interface DetailOptions {
  /** Yahoo ticker benchmarku (Nastavení na obrazovce Výkon). */
  benchmark: string
  /** Cílová alokace podle skupin indexu; prázdné = sekce alokace se vynechá. */
  targets: readonly RebalanceTarget[]
  /** Měsíční vklad v EUR z obrazovky Cíl (odhad dosažení cíle). */
  monthlyEur: number
  /** Částka měsíčního nákupu pro cílovou alokaci; chybí = měsíční vklad z Cíle. */
  allocationEur?: number
  /** Předpokládaný roční výnos z obrazovky Cíl. */
  annualReturn: number
  targetCzk: number
}

export interface DetailInput extends DetailOptions {
  portfolio: Portfolio
  prices: PriceCache
  /** „RRRR-MM“, poslední den měsíce, den hodnot a konec předchozího měsíce. */
  month: string
  to: string
  asOf: string
  prevEnd: string
  /** Výkon bez vkladů (EUR) od začátku dat. */
  points: readonly PerfPoint[] | null
  /** Hodnota ETF na konci měsíce podle tickeru. */
  positions: ReadonlyMap<string, number>
  valueEndCzk: number | null
  fxEnd: number | null
}

const EPS = 1e-9
const TRADING_DAYS = 252
/** Odchylka ±3 p. b. ročního výnosu pro rozpětí odhadu cíle (jako scénáře na obrazovce Cíl). */
const PROJECTION_SPREAD = 0.03

/** Denní výnosy z kumulativní křivky; dny beze změny (víkendy, svátky) se vynechají. */
export function dailyReturns(curve: readonly CurvePoint[]): { date: string; pct: number }[] {
  const out: { date: string; pct: number }[] = []
  for (let i = 1; i < curve.length; i++) {
    const prev = 1 + curve[i - 1].pct
    if (prev <= EPS) continue
    const pct = (1 + curve[i].pct) / prev - 1
    if (Math.abs(pct) > 1e-12) out.push({ date: curve[i].date, pct })
  }
  return out
}

/** Roční kolísavost (směrodatná odchylka denních výnosů × √252); `null` při méně než 5 dnech. */
export function annualVolatility(returns: readonly number[]): number | null {
  if (returns.length < 5) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS)
}

function benchmarkPart(input: DetailInput): MonthDetail['benchmark'] {
  const series = input.prices.securities[input.benchmark]?.prices ?? []
  if (series.length === 0) return null
  const at = (d: string): number | null => valueAtOrBefore(series, d)
  const ret = (from: string): number | null => {
    const a = at(from)
    const b = at(input.asOf)
    // Benchmark musí mít kurz už na začátku období, jinak by výsledek nebyl za celé období.
    return a !== null && b !== null && a > EPS && series[0][0] <= from ? b / a - 1 : null
  }
  const name = input.portfolio.securities.find((s) => s.id === input.benchmark)?.name
  return {
    ticker: input.benchmark,
    name: name ?? input.benchmark,
    periodReturn: ret(input.prevEnd),
    ytdReturn: ret(`${Number(input.month.slice(0, 4)) - 1}-12-31`)
  }
}

function riskPart(input: DetailInput): MonthDetail['risk'] {
  const empty = { worstDay: null, bestDay: null, volatility: null, volatilityTypical: null }
  if (!input.points) return empty
  const month = computePerformance(input.points, input.prevEnd, input.asOf)
  const year = computePerformance(input.points, addMonths(input.asOf, -12), input.asOf)
  const days = month ? dailyReturns(month.curve) : []
  let worst: { date: string; pct: number } | null = null
  let best: { date: string; pct: number } | null = null
  for (const d of days) {
    if (!worst || d.pct < worst.pct) worst = d
    if (!best || d.pct > best.pct) best = d
  }
  return {
    worstDay: worst && worst.pct < 0 ? worst : null,
    bestDay: best && best.pct > 0 ? best : null,
    volatility: annualVolatility(days.map((d) => d.pct)),
    volatilityTypical: year ? annualVolatility(dailyReturns(year.curve).map((d) => d.pct)) : null
  }
}

function allocationPart(input: DetailInput): MonthDetail['allocation'] {
  if (!input.targets.some((t) => t.share > EPS)) return null
  const groupOf = new Map(input.portfolio.securities.map((s) => [s.id, s.indexGroup]))
  const values = new Map<string, number>()
  for (const [id, value] of input.positions) {
    const group = groupOf.get(id) ?? id
    values.set(group, (values.get(group) ?? 0) + value)
  }
  const monthly = input.allocationEur ?? input.monthlyEur
  const rows = computeRebalance(values, input.targets, monthly)
  return {
    rows: rows.map((r) => ({ group: r.group, share: r.share, target: r.target, buy: r.buy })),
    monthlyEur: monthly,
    monthsToTarget: monthly > 0 ? monthsToTarget(values, input.targets, monthly) : null
  }
}

function projectionPart(input: DetailInput): MonthDetail['projection'] {
  if (input.valueEndCzk === null || input.fxEnd === null || input.targetCzk <= 0) return null
  const monthlyCzk = input.monthlyEur * input.fxEnd
  const reach = (r: number): number | null =>
    monthsToReach(input.valueEndCzk!, monthlyCzk, r, input.targetCzk)
  return {
    annualReturn: input.annualReturn,
    monthlyEur: input.monthlyEur,
    months: reach(input.annualReturn),
    // Vyšší výnos = dřív (dolní hranice počtu měsíců).
    monthsLow: reach(input.annualReturn + PROJECTION_SPREAD),
    monthsHigh: reach(input.annualReturn - PROJECTION_SPREAD)
  }
}

function timeTestPart(input: DetailInput): MonthDetail['timeTest'] {
  const upTo: Portfolio = {
    ...input.portfolio,
    transactions: input.portfolio.transactions.filter((t) => t.date <= input.asOf)
  }
  const { openLots } = computeLots(upTo)
  if (openLots.length === 0) return null
  const priceOf = (id: string, fallback: number): number =>
    valueAtOrBefore(input.prices.securities[id]?.prices ?? [], input.asOf) ?? fallback
  const nextMonth = addMonths(`${input.month}-01`, 1).slice(0, 7)
  const nextEnd = addDays(addMonths(`${nextMonth}-01`, 1), -1)
  // Konec roku, do kterého spadá další měsíc (u prosince už příští rok).
  const yearEnd = `${nextMonth.slice(0, 4)}-12-31`
  // Den po konci měsíce: k němu se počítá, co je už „po testu“.
  const day = addDays(input.to, 1)

  let totalValue = 0
  let freeValue = 0
  let freeYearEnd = 0
  const releasing: NonNullable<MonthDetail['timeTest']>['releasing'] = []
  for (const lot of openLots) {
    const value = lot.remaining * priceOf(lot.securityId, lot.costPerShare)
    const freeFrom = timeTestFreeFrom(lot.date)
    totalValue += value
    if (freeFrom <= day) freeValue += value
    if (freeFrom <= addDays(yearEnd, 1)) freeYearEnd += value
    if (freeFrom > day && freeFrom <= nextEnd) {
      releasing.push({
        ticker: lot.securityId,
        buyDate: lot.date,
        freeFrom,
        value: Math.round(value * 100) / 100
      })
    }
  }
  releasing.sort((a, b) => a.freeFrom.localeCompare(b.freeFrom) || a.ticker.localeCompare(b.ticker))
  return {
    totalValue: Math.round(totalValue * 100) / 100,
    freeValue: Math.round(freeValue * 100) / 100,
    nextMonth,
    releasing,
    freeShareYearEnd: totalValue > EPS ? freeYearEnd / totalValue : 0
  }
}

/** Údaje pro detailní sekce článku (srovnání s trhem, riziko, alokace, cíl, časový test). */
export function buildMonthDetail(input: DetailInput): MonthDetail {
  return {
    benchmark: benchmarkPart(input),
    risk: riskPart(input),
    allocation: allocationPart(input),
    projection: projectionPart(input),
    timeTest: timeTestPart(input)
  }
}
