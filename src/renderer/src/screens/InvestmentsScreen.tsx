import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { formatMonth } from '../../../core/date'
import {
  calculateInvestments,
  type InvestmentStats,
  type MonthRow
} from '../../../core/investments'
import { formatMoney, type MoneyCurrency } from '../../../core/money'
import { valueAtOrBefore } from '../../../core/portfolio-calc'
import { FX_EUR_CZK } from '../../../shared/prices'
import type { Account } from '../../../shared/model'
import { type ChartColors, useChartColors } from '../chartColors'
import { Card } from '../components/Card'
import { ExportMenu } from '../components/ExportMenu'
import { monthlyInvestmentsTable } from '../../../core/export-tables'
import { todayIso } from '../../../core/date'
import { EChart } from '../components/EChart'
import { Kpi } from '../components/Kpi'
import { Segmented } from '../components/Segmented'
import { useApp } from '../store'

type Range = '12' | '36' | '60' | 'ALL'
const RANGES: { value: Range; label: string; months: number | null }[] = [
  { value: '12', label: '1R', months: 12 },
  { value: '36', label: '3R', months: 36 },
  { value: '60', label: '5R', months: 60 },
  { value: 'ALL', label: 'Max', months: null }
]

function monthsLabel(n: number): string {
  return `${n} ${n === 1 ? 'měsíc' : n >= 2 && n <= 4 ? 'měsíce' : 'měsíců'}`
}

function compactAxis(value: number, currency: MoneyCurrency): string {
  const unit = currency === 'CZK' ? 'Kč' : '€'
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. ${unit}`
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)} tis. ${unit}`
  return `${Math.round(value)} ${unit}`
}

function buildBarOption(
  months: MonthRow[],
  accounts: Account[],
  average: number | null,
  currency: MoneyCurrency,
  c: ChartColors
): EChartsCoreOption {
  const byMonth = new Map(months.map((m) => [m.month, m]))
  const money = (v: number): string => formatMoney(v, currency, 0)
  return {
    animationDuration: 700,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { axisValue: string }[]) => {
        // Hodnoty se berou z vlastních dat podle měsíce (viz tooltip grafu na Přehledu).
        const row = byMonth.get(params[0]?.axisValue ?? '')
        if (!row) return ''
        const parts = accounts
          .filter((a) => (row.byAccount[a.id] ?? 0) > 0)
          .map(
            (a) =>
              `<span style="color:${a.color}">●</span> ${a.name}: ${money(row.byAccount[a.id])}`
          )
        return (
          `<b>${formatMonth(row.month)}</b><br/>` +
          (parts.length ? parts.join('<br/>') + '<br/>' : '') +
          `Celkem: <b>${money(row.total)}</b>` +
          (row.buys > 0 ? ` (${row.buys}× nákup)` : ' – bez nákupu')
        )
      }
    },
    xAxis: {
      type: 'category',
      data: months.map((m) => m.month),
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
      axisLabel: {
        color: c.muted,
        hideOverlap: true,
        formatter: (v: string) => formatMonth(v)
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (v: number) => compactAxis(v, currency) },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      ...accounts.map((a) => ({
        name: a.name,
        type: 'bar',
        stack: 'nakupy',
        barMaxWidth: 30,
        itemStyle: { color: a.color },
        data: months.map((m) => m.byAccount[a.id] ?? 0)
      })),
      ...(average !== null
        ? [
            {
              name: 'Průměr',
              type: 'line',
              showSymbol: false,
              silent: true,
              tooltip: { show: false },
              lineStyle: { width: 1.6, type: 'dashed', color: c.muted },
              itemStyle: { color: c.muted },
              z: 5,
              data: months.map(() => average)
            }
          ]
        : [])
    ]
  }
}

export function InvestmentsScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const setScreen = useApp((s) => s.setScreen)
  const colors = useChartColors()
  const [range, setRange] = useState<Range>('36')

  const fxSeries = prices.fx[FX_EUR_CZK]?.rates
  const fxRates = useMemo(() => fxSeries ?? [], [fxSeries])
  const czk = displayCurrency === 'CZK' && fxRates.length > 0
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'

  const stats: InvestmentStats | null = useMemo(() => {
    if (!portfolio) return null
    const accountIds =
      brokerFilter === 'all'
        ? null
        : new Set(portfolio.accounts.filter((a) => a.name === brokerFilter).map((a) => a.id))
    return calculateInvestments(portfolio, {
      accountIds,
      // „Dnes“ = poslední známý kurz, jinak poslední transakce.
      asOf: latestDate(prices, portfolio),
      convert: czk
        ? (amount, date) => amount * (valueAtOrBefore(fxRates, date) ?? fxRates[0][1])
        : undefined
    })
  }, [portfolio, prices, brokerFilter, czk, fxRates])

  const accounts = useMemo(() => {
    if (!portfolio || !stats) return []
    const used = new Set(stats.years.flatMap((y) => Object.keys(y.byAccount)))
    return portfolio.accounts.filter((a) => used.has(a.id))
  }, [portfolio, stats])

  const visible = useMemo(() => {
    if (!stats) return []
    const n = RANGES.find((r) => r.value === range)?.months ?? null
    return n === null ? stats.months : stats.months.slice(-n)
  }, [stats, range])

  const option = useMemo(
    () => buildBarOption(visible, accounts, stats?.average12 ?? null, currency, colors),
    [visible, accounts, stats?.average12, currency, colors]
  )

  if (!portfolio || !stats || stats.months.length === 0) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="text-lg font-semibold">Zatím nejsou žádné nákupy</div>
          <p className="max-w-md text-muted">
            {portfolio && portfolio.transactions.length > 0
              ? `Pro ${brokerFilter === 'all' ? 'vybraný výběr' : brokerFilter} nejsou žádné nákupy.`
              : 'Naimportuj historii transakcí na obrazovce Obchody.'}
          </p>
          {(!portfolio || portfolio.transactions.length === 0) && (
            <button
              onClick={() => setScreen('transactions')}
              className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Přejít na Obchody
            </button>
          )}
        </div>
      </Card>
    )
  }

  const money = (v: number): string => formatMoney(v, currency, 0)
  const lastYear = Number(stats.lastMonth!.slice(0, 4))
  const thisYear = stats.years.find((y) => y.year === lastYear)
  const prevYear = stats.years.find((y) => y.year === lastYear - 1)
  const totals = stats.years.reduce(
    (acc, y) => ({
      total: acc.total + y.total,
      months: acc.months + y.monthsWithBuy,
      counted: acc.counted + y.monthsCounted,
      buys: acc.buys + y.buys,
      sold: acc.sold + y.sold
    }),
    { total: 0, months: 0, counted: 0, buys: 0, sold: 0 }
  )
  const hasSold = stats.totalSold > 0
  const notes: string[] = []
  if (displayCurrency === 'CZK' && !czk) {
    notes.push('Kurz EUR/CZK z ČNB zatím není stažený – zobrazuji EUR.')
  }
  if (czk) {
    notes.push('V Kč je každý nákup přepočtený kurzem ČNB platným v den nákupu.')
  }

  return (
    <div className="grid gap-4">
      {notes.length > 0 && (
        <div className="grid gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
          {notes.map((n) => (
            <div key={n} className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {n}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        <Kpi
          title={`Letos (${lastYear})`}
          value={money(thisYear?.total ?? 0)}
          sub={`${monthsLabel(thisYear?.monthsWithBuy ?? 0)} s nákupem`}
        />
        <Kpi
          title={`Loni (${lastYear - 1})`}
          value={money(prevYear?.total ?? 0)}
          sub={`${monthsLabel(prevYear?.monthsWithBuy ?? 0)} s nákupem`}
        />
        <Kpi
          title="Průměr / měsíc (12 m)"
          value={stats.average12 === null ? '–' : money(stats.average12)}
          sub={
            stats.median12 === null
              ? 'zatím bez nákupů'
              : `medián nákupního měsíce ${money(stats.median12)}`
          }
        />
        <Kpi
          title="Celkem nakoupeno"
          value={money(stats.totalBought)}
          sub={`${stats.buyCount} nákupů od ${formatMonth(stats.firstMonth!)}`}
        />
      </div>

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
            Zainvestováno po měsících
          </h3>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
            {accounts.map((a) => (
              <span key={a.id} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: a.color }}
                />
                {a.name}
              </span>
            ))}
            {stats.average12 !== null && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 border-t-2 border-dashed border-muted" />
                průměr 12 m
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ExportMenu
              csv={{
                label: 'CSV – investice po měsících',
                fileName: `investice-po-mesicich-${todayIso()}.csv`,
                build: () =>
                  monthlyInvestmentsTable(stats, accounts, {
                    currencyLabel: czk ? 'Kč' : 'EUR'
                  })
              }}
            />
            <Segmented<Range>
              ariaLabel="Období grafu investic"
              options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
              value={range}
              onChange={setRange}
            />
          </div>
        </div>
        <EChart
          option={option}
          height={320}
          ariaLabel="Sloupcový graf částek nakoupených po měsících podle brokera"
        />
        {stats.currentMonthEmpty && (
          <p className="mt-2 text-xs text-muted">
            Aktuální měsíc ({formatMonth(stats.lastMonth!)}) zatím nemá žádný nákup – do průměru se
            nezapočítává.
          </p>
        )}
      </Card>

      <Card title="Po letech" className="!pb-2">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="border-b px-2 py-1.5 font-semibold">Rok</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Nakoupeno</th>
              {accounts.map((a) => (
                <th key={a.id} className="border-b px-2 py-1.5 text-right font-semibold">
                  {a.name}
                </th>
              ))}
              <th className="border-b px-2 py-1.5 text-right font-semibold">Měsíců s nákupem</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Nákupů</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Průměr / měsíc</th>
              {hasSold && (
                <th className="border-b px-2 py-1.5 text-right font-semibold">Prodáno</th>
              )}
            </tr>
          </thead>
          <tbody>
            {[...stats.years].reverse().map((y) => (
              <tr key={y.year} className="hover:bg-surface-2">
                <td className="border-b px-2 py-2 font-semibold">
                  {y.year}
                  {y.monthsCounted < 12 && (
                    <span className="ml-1 text-xs font-normal text-muted">
                      ({monthsLabel(y.monthsCounted)})
                    </span>
                  )}
                </td>
                <td className="border-b px-2 py-2 text-right font-semibold whitespace-nowrap">
                  {money(y.total)}
                </td>
                {accounts.map((a) => (
                  <td
                    key={a.id}
                    className="border-b px-2 py-2 text-right whitespace-nowrap text-muted"
                  >
                    {y.byAccount[a.id] ? money(y.byAccount[a.id]) : '–'}
                  </td>
                ))}
                <td className="border-b px-2 py-2 text-right">
                  {y.monthsWithBuy} z {y.monthsCounted}
                </td>
                <td className="border-b px-2 py-2 text-right">{y.buys}</td>
                <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                  {money(y.average)}
                </td>
                {hasSold && (
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap text-muted">
                    {y.sold ? money(y.sold) : '–'}
                  </td>
                )}
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-2 py-2">Celkem</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{money(totals.total)}</td>
              {accounts.map((a) => (
                <td key={a.id} className="px-2 py-2 text-right whitespace-nowrap">
                  {money(stats.years.reduce((s, y) => s + (y.byAccount[a.id] ?? 0), 0))}
                </td>
              ))}
              <td className="px-2 py-2 text-right">
                {totals.months} z {totals.counted}
              </td>
              <td className="px-2 py-2 text-right">{totals.buys}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {money(totals.counted > 0 ? totals.total / totals.counted : 0)}
              </td>
              {hasSold && (
                <td className="px-2 py-2 text-right whitespace-nowrap">{money(totals.sold)}</td>
              )}
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">
          Počítají se nákupy ETF (ne vklady na účty). Průměr zahrnuje i měsíce bez nákupu.
        </p>
      </Card>
    </div>
  )
}

/** Poslední známé datum: nejnovější kurz některého ETF, jinak poslední transakce. */
function latestDate(
  prices: { securities: Record<string, { prices: [string, number][] }> },
  portfolio: { transactions: { date: string }[] }
): string | undefined {
  const dates = Object.values(prices.securities)
    .map((s) => s.prices.at(-1)?.[0])
    .filter((d): d is string => !!d)
  const lastTx = portfolio.transactions
    .map((t) => t.date)
    .sort()
    .at(-1)
  return [...dates, ...(lastTx ? [lastTx] : [])].sort().at(-1)
}
