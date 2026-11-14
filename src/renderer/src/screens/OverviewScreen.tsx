import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarPlus, FileUp } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { CHART_RANGES, sliceByRange, type ChartRange } from '../../../core/chart-range'
import { todayIso, formatDate, formatMonth, formatMonthLong } from '../../../core/date'
import { missingMonth } from '../../../core/monthly-plan'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import type { SeriesPoint, Summary } from '../../../core/portfolio-calc'
import { Card } from '../components/Card'
import { RealModeBanner } from '../components/RealModeBanner'
import { Kpi, Tip } from '../components/Kpi'
import { toneClass } from '../tone'
import { computePerformance, toPerfPoints } from '../../../core/performance'
import { type ChartColors, useChartColors } from '../chartColors'
import { EChart } from '../components/EChart'
import { Segmented } from '../components/Segmented'
import { TX_TYPE_LABELS } from '../../../shared/model'
import { useApp } from '../store'
import { usePortfolioCalc } from '../useCalc'

function compactAxis(value: number, currency: MoneyCurrency): string {
  const abs = Math.abs(value)
  const unit = currency === 'CZK' ? 'Kč' : '€'
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. ${unit}`
  if (abs >= 1e3) return `${Math.round(value / 1e3)} tis. ${unit}`
  return `${Math.round(value)} ${unit}`
}

function buildChartOption(
  points: { date: string; value: number; invested: number }[],
  currency: MoneyCurrency,
  c: ChartColors
): EChartsCoreOption {
  const money = (v: number): string => formatMoney(v, currency, 0)
  const byDate = new Map(points.map((p) => [p.date, p]))
  return {
    animationDuration: 700,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        // Hodnoty se berou z vlastních dat podle data, ne z toho, které body ECharts
        // zrovna vrátil (jinak by při chybějícím bodu jedné křivky vyšla hodnota 0).
        const point = byDate.get(params[0]?.data[0] ?? '')
        if (!point) return ''
        const day = formatDate(point.date)
        const { value, invested } = point
        const profit = value - invested
        const tone = profit >= 0 ? c.pos : c.neg
        return (
          `<b>${day}</b><br/>Hodnota: <b>${money(value)}</b><br/>Vloženo: ${money(invested)}` +
          `<br/>Zisk: <b style="color:${tone}">${formatSignedMoney(profit, currency, 0)}</b>`
        )
      }
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        formatter: (ms: number) => {
          const d = new Date(ms)
          return `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
        }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (v: number) => compactAxis(v, currency) },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        name: 'Hodnota',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.2, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${c.accent}59` },
              { offset: 1, color: `${c.accent}00` }
            ]
          }
        },
        data: points.map((p) => [p.date, p.value])
      },
      {
        name: 'Vloženo',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.6, color: c.muted, type: 'dashed' },
        itemStyle: { color: c.muted },
        data: points.map((p) => [p.date, p.invested])
      }
    ]
  }
}

function ValueChart({
  series,
  currency
}: {
  series: SeriesPoint[]
  currency: MoneyCurrency
}): React.JSX.Element {
  const [range, setRange] = useState<ChartRange>('MAX')
  const colors = useChartColors()
  const option = useMemo(() => {
    const czk = currency === 'CZK'
    const points = sliceByRange(series, range).map((p) => ({
      date: p.date,
      value: czk ? (p.valueCzk ?? p.value) : p.value,
      invested: czk ? (p.investedCzk ?? p.invested) : p.invested
    }))
    return buildChartOption(points, currency, colors)
  }, [series, range, currency, colors])

  return (
    <Card>
      <div className="mb-3 flex items-center">
        <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          Hodnota vs. vloženo
        </h3>
        <div className="ml-auto">
          <Segmented<ChartRange>
            ariaLabel="Období grafu"
            options={CHART_RANGES.map((r) => ({ value: r.id, label: r.label }))}
            value={range}
            onChange={setRange}
          />
        </div>
      </div>
      <EChart
        option={option}
        height={320}
        ariaLabel="Graf hodnoty portfolia a vloženého kapitálu v čase"
      />
    </Card>
  )
}

export function OverviewScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const updating = useApp((s) => s.priceUpdating)
  const setScreen = useApp((s) => s.setScreen)
  const monthlyPlan = useApp((s) => s.settings.monthlyPlan)
  const openTxDialog = useApp((s) => s.openTxDialog)
  const calc = usePortfolioCalc()

  if (!portfolio || portfolio.transactions.length === 0) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
            <FileUp size={28} />
          </div>
          <div className="text-lg font-semibold">Zatím tu nejsou žádná data</div>
          <p className="max-w-md text-muted">
            Naimportuj historii transakcí na obrazovce Obchody, pak se tady objeví hodnota
            portfolia, zisk a graf.
          </p>
          <button
            onClick={() => setScreen('transactions')}
            className="mt-1 rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          >
            Přejít na Obchody
          </button>
        </div>
      </Card>
    )
  }

  const summary = calc?.summary
  if (!calc || !summary) {
    return (
      <Card>
        <div className="py-10 text-center text-muted">
          Pro {brokerFilter === 'all' ? 'vybraný výběr' : brokerFilter} nejsou žádné transakce.
        </div>
      </Card>
    )
  }

  const czk = displayCurrency === 'CZK' && summary.fxRate !== null
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'
  const rate = czk ? summary.fxRate! : 1
  const value = czk ? summary.valueCzk! : summary.value
  const invested = czk ? summary.investedCzk! : summary.invested
  const profit = czk ? summary.profitCzk! : summary.profit
  const profitPct = invested > 0 ? profit / invested : null
  const day = summary.dayChange === null ? null : summary.dayChange * rate
  const perfPoints = toPerfPoints(calc.series, currency)
  const overall = perfPoints
    ? computePerformance(perfPoints, summary.firstDate, summary.asOf)
    : null

  const reminderMonth = missingMonth(portfolio, monthlyPlan, todayIso())

  const notes: string[] = [...summary.warnings]
  if (displayCurrency === 'CZK' && summary.fxRate === null) {
    notes.push('Kurz EUR/CZK z ČNB zatím není stažený – zobrazuji EUR.')
  }
  if (summary.missingPrices.length > 0 && updating) {
    notes.push('Kurzy se právě stahují, hodnoty se za chvíli upřesní.')
  }

  return (
    <div className="grid gap-4">
      <RealModeBanner firstDate={summary.firstDate} />
      {reminderMonth && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-[13px]"
        >
          <CalendarPlus size={16} className="shrink-0 text-accent" />
          <span>
            Za <b>{formatMonthLong(reminderMonth)}</b> ještě nemáš zapsaný žádný nákup.
          </span>
          <button
            onClick={() => openTxDialog({ mode: 'monthly' })}
            className="ml-auto rounded-[9px] bg-accent px-3.5 py-[6px] text-[13px] font-semibold text-white hover:brightness-110"
          >
            Zapsat měsíční nákup
          </button>
        </div>
      )}
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
          title="Hodnota portfolia"
          value={formatMoney(value, currency, 0)}
          sub={`k ${formatDate(summary.asOf)}`}
        />
        <Kpi
          title="Vloženo"
          value={formatMoney(invested, currency, 0)}
          sub={`od ${formatMonth(summary.firstDate)} · ${summary.depositCount} vkladů`}
        />
        <Kpi
          title="Zisk"
          value={formatSignedMoney(profit, currency, 0)}
          tone={toneClass(profit)}
          sub={
            profitPct === null ? (
              '–'
            ) : (
              <>
                <span className={toneClass(profit)}>{formatPercent(profitPct, 1, true)}</span>
                {overall?.irr != null && (
                  <>
                    {' · '}
                    <Tip text="Peněžně vážený roční výnos – kolik reálně vydělávají tvoje peníze včetně načasování vkladů. Detail na obrazovce Výkon.">
                      IRR
                    </Tip>{' '}
                    {formatPercent(overall.irr, 1)} p.a.
                  </>
                )}
              </>
            )
          }
        />
        <Kpi
          title="Změna za den"
          value={day === null ? '–' : formatSignedMoney(day, currency, 0)}
          tone={day === null ? '' : toneClass(day)}
          sub={
            summary.dayChangePct === null ? (
              'málo dat o kurzech'
            ) : (
              <span className={toneClass(summary.dayChangePct)}>
                {formatPercent(summary.dayChangePct, 2, true)}
              </span>
            )
          }
        />
      </div>

      <ValueChart series={calc.series} currency={currency} />

      <div className="grid grid-cols-[3fr_2fr] gap-4">
        <PositionsCard summary={summary} currency={currency} rate={rate} />
        <LastTradesCard />
      </div>
    </div>
  )
}

function PositionsCard({
  summary,
  currency,
  rate
}: {
  summary: Summary
  currency: MoneyCurrency
  rate: number
}): React.JSX.Element {
  const securities = useApp((s) => s.portfolio?.securities)
  const meta = useMemo(() => new Map((securities ?? []).map((s) => [s.id, s])), [securities])
  const total = summary.positions.reduce((s, p) => s + p.value, 0)

  return (
    <Card title="Pozice" className="!pb-2">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-xs text-muted">
            {['ETF', 'Kusy', 'Kurz', 'Hodnota', 'Podíl', 'Zisk'].map((h, i) => (
              <th key={h} className={`border-b px-2 py-1.5 font-semibold ${i ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summary.positions.map((p) => {
            const sec = meta.get(p.securityId)
            return (
              <tr key={p.securityId} className="hover:bg-surface-2">
                <td className="border-b px-2 py-2">
                  <span
                    className="mr-2 inline-block size-2 rounded-full"
                    style={{ background: sec?.color }}
                  />
                  <b>{p.securityId}</b>
                  <div className="ml-4 text-xs text-muted">{sec?.indexGroup}</div>
                </td>
                <td className="border-b px-2 py-2 text-right">
                  {Number.isInteger(p.shares) ? p.shares : p.shares.toFixed(3)}
                </td>
                <td
                  className="border-b px-2 py-2 text-right whitespace-nowrap text-muted"
                  title={p.estimated ? 'Kurz chybí – cena posledního obchodu' : undefined}
                >
                  {formatMoney(p.price, 'EUR')}
                  {p.estimated && ' *'}
                </td>
                <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                  {formatMoney(p.value * rate, currency, 0)}
                </td>
                <td className="border-b px-2 py-2 text-right text-muted">
                  {total > 0 ? formatPercent(p.value / total, 1) : '–'}
                </td>
                <td
                  className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(p.unrealized)}`}
                >
                  {formatSignedMoney(p.unrealized * rate, currency, 0)}
                  {p.unrealizedPct !== null && (
                    <div className="text-xs">{formatPercent(p.unrealizedPct, 1, true)}</div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {currency === 'CZK' && summary.fxRate !== null && (
        <p className="mt-2 text-xs text-muted">
          Hodnoty pozic přepočteny dnešním kurzem ČNB ({summary.fxRate.toFixed(3).replace('.', ',')}{' '}
          Kč/€). Zisk pozice se počítá v EUR.
        </p>
      )}
    </Card>
  )
}

function LastTradesCard(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const setScreen = useApp((s) => s.setScreen)

  const rows = useMemo(() => {
    if (!portfolio) return []
    const accounts = new Map(portfolio.accounts.map((a) => [a.id, a]))
    return portfolio.transactions
      .filter(
        (t) =>
          (t.type === 'BUY' || t.type === 'SELL') &&
          (brokerFilter === 'all' || accounts.get(t.accountId)?.name === brokerFilter)
      )
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 7)
      .map((t) => ({ t, account: accounts.get(t.accountId) }))
  }, [portfolio, brokerFilter])

  return (
    <Card title="Poslední obchody" className="!pb-2">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-xs text-muted">
            {['Datum', 'ETF', 'Kusy', 'Částka'].map((h, i) => (
              <th
                key={h}
                className={`border-b px-2 py-1.5 font-semibold ${i > 1 ? 'text-right' : ''}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, account }) => (
            <tr key={t.id} className="hover:bg-surface-2">
              <td className="border-b px-2 py-2 whitespace-nowrap">
                <span
                  className="mr-2 inline-block size-2 rounded-full"
                  style={{ background: account?.color }}
                  title={account?.name}
                />
                {formatDate(t.date)}
              </td>
              <td className="border-b px-2 py-2">
                <b>{t.securityId}</b>
                {t.type === 'SELL' && (
                  <span className="ml-1.5 text-xs text-neg">{TX_TYPE_LABELS.SELL}</span>
                )}
              </td>
              <td className="border-b px-2 py-2 text-right">{t.shares}</td>
              <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                {formatMoney(t.amount, t.currency as MoneyCurrency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        onClick={() => setScreen('transactions')}
        className="mt-2 text-xs text-accent hover:underline"
      >
        Všechny obchody →
      </button>
    </Card>
  )
}
