import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { addMonths, formatDate, formatMonthLong } from '../../../core/date'
import { formatMoney, formatPercent } from '../../../core/money'
import {
  monthAtProbability,
  monthIndexAtYearEnd,
  probabilityByYearEnd,
  type MonteCarloResult
} from '../../../core/monte-carlo'
import { type ChartColors, useChartColors } from '../chartColors'
import { useMonteCarlo } from '../useMonteCarlo'
import { toneClass } from '../tone'
import { Card } from './Card'
import { EChart } from './EChart'
import { Tip } from './Kpi'

const RUNS = 5000
const DEFAULT_VOLATILITY = 0.15
const HELP_VOL =
  'Jak moc trh kolísá: roční směrodatná odchylka výnosu. Akciové ETF typicky 14–18 %. Čím vyšší, tím širší rozpětí možných výsledků.'

function compactCzk(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. Kč`
  if (abs >= 1e3) return `${Math.round(value / 1e3)} tis. Kč`
  return `${Math.round(value)} Kč`
}

function buildOption(
  r: MonteCarloResult,
  today: string,
  rate: number,
  targetCzk: number,
  c: ChartColors
): EChartsCoreOption {
  const dates = r.bands.p50.map((_, i) => addMonths(today, i))
  const czk = (arr: number[]): number[] => arr.map((v) => v * rate)
  const p10 = czk(r.bands.p10)
  const p25 = czk(r.bands.p25)
  const p50 = czk(r.bands.p50)
  const p75 = czk(r.bands.p75)
  const p90 = czk(r.bands.p90)
  const byDate = new Map(dates.map((d, i) => [d, i]))
  const money = (v: number): string => formatMoney(v, 'CZK', 0)
  const pts = (arr: number[]): [string, number][] => arr.map((v, i) => [dates[i], v])
  const diff = (hi: number[], lo: number[]): [string, number][] =>
    hi.map((v, i) => [dates[i], v - lo[i]])
  const band = (stack: string, lo: number[], hi: number[], opacity: string): object[] => [
    {
      type: 'line',
      stack,
      silent: true,
      showSymbol: false,
      lineStyle: { opacity: 0 },
      data: pts(lo)
    },
    {
      type: 'line',
      stack,
      silent: true,
      showSymbol: false,
      lineStyle: { opacity: 0 },
      areaStyle: { color: `${c.accent}${opacity}` },
      data: diff(hi, lo)
    }
  ]
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        const date = params[0]?.data[0] ?? ''
        const i = byDate.get(date)
        if (i === undefined) return ''
        return (
          `<b>${formatDate(date)}</b>` +
          `<br/>90 % scénářů nad: ${money(p10[i])}` +
          `<br/>Medián: <b>${money(p50[i])}</b>` +
          `<br/>10 % scénářů nad: ${money(p90[i])}` +
          `<br/>Cíl splněný v <b>${formatPercent(r.reachedBy[i], 0)}</b> scénářů`
        )
      }
    },
    xAxis: {
      type: 'time',
      min: dates[0],
      max: dates[dates.length - 1],
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        hideOverlap: true,
        formatter: (ms: number) => String(new Date(ms).getUTCFullYear())
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: compactCzk },
      splitLine: { lineStyle: { color: c.border } }
    },
    series: [
      ...band('outer', p10, p90, '33'),
      ...band('inner', p25, p75, '4d'),
      {
        name: 'Medián',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.2, color: c.accent },
        itemStyle: { color: c.accent },
        data: pts(p50)
      },
      {
        name: 'Cíl',
        type: 'line',
        showSymbol: false,
        silent: true,
        lineStyle: { width: 1.6, color: c.pos },
        itemStyle: { color: c.pos },
        data: [
          [dates[0], targetCzk],
          [dates[dates.length - 1], targetCzk]
        ]
      }
    ]
  }
}

/** Roky pro tabulku: od prvního s šancí ≥ 5 % po konec simulace, nejvýš ~8 sloupců. */
function tableYears(r: MonteCarloResult, today: string): number[] {
  const y0 = Number(today.slice(0, 4))
  const years: number[] = []
  for (let y = y0; monthIndexAtYearEnd(today, y) < r.reachedBy.length; y++) years.push(y)
  const first = years.findIndex((y) => (probabilityByYearEnd(r, today, y) ?? 0) >= 0.05)
  const usable = years.slice(Math.max(0, first === -1 ? years.length - 1 : first))
  const step = Math.max(1, Math.ceil(usable.length / 8))
  return usable.filter((_, i) => i % step === 0)
}

interface Props {
  /** Dnešní hodnota v EUR. */
  start: number
  monthlyEur: number
  /** Výnos použitý v projekci (v režimu po inflaci už reálný). */
  annualReturn: number
  targetEur: number
  targetCzk: number
  /** Kurz EUR/CZK pro zobrazení v Kč. */
  rate: number
  today: string
  /** Uložená kolísavost; `undefined` = z historie. */
  volatility: number | undefined
  /** Volatilita portfolia z historie (Výkon → Riziko); `null` = málo dat. */
  historicalVolatility: number | null
  onVolatility: (v: number | undefined) => void
  /** Datum základního (deterministického) odhadu pro srovnání. */
  baseDate: string | null
  real: boolean
}

export function MonteCarloCard(props: Props): React.JSX.Element {
  const { start, monthlyEur, annualReturn, targetEur, targetCzk, rate, today } = props
  const colors = useChartColors()
  const fallback =
    props.historicalVolatility !== null
      ? Math.round(props.historicalVolatility * 200) / 200
      : DEFAULT_VOLATILITY
  const volatility = props.volatility ?? fallback

  const input = useMemo(
    () => ({
      start,
      monthly: monthlyEur,
      annualReturn,
      volatility,
      target: targetEur,
      runs: RUNS,
      seed: 1
    }),
    [start, monthlyEur, annualReturn, volatility, targetEur]
  )
  const { result, running } = useMonteCarlo(input)

  const option = useMemo(
    () => (result ? buildOption(result, today, rate, targetCzk, colors) : null),
    [result, today, rate, targetCzk, colors]
  )

  const when = (p: number): string => {
    if (!result) return '…'
    const m = monthAtProbability(result, p)
    return m === null ? 'za víc než 50 let' : formatMonthLong(addMonths(today, m))
  }
  const baseYear = props.baseDate ? Number(props.baseDate.slice(0, 4)) : null
  const baseChance =
    result && baseYear !== null ? probabilityByYearEnd(result, today, baseYear) : null
  const years = result ? tableYears(result, today) : []

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          <Tip
            text={`${RUNS.toLocaleString('cs-CZ')} možných vývojů s náhodným kolísáním trhu. Průměrný výnos a vklad jsou stejné jako v projekci výše, jen každý rok dopadne jinak.`}
          >
            Monte Carlo – rozpětí možných vývojů
          </Tip>
        </h3>
        {running && (
          <span className="flex items-center gap-1 text-xs text-muted">
            <Loader2 size={13} className="animate-spin" /> počítám…
          </span>
        )}
      </div>

      <div className={`grid grid-cols-4 gap-3 ${running ? 'opacity-70' : ''}`}>
        <Stat
          title="Polovina scénářů"
          value={when(0.5)}
          sub="medián – v 50 % scénářů jsi v cíli dřív"
        />
        <Stat
          title="S 80% jistotou"
          value={when(0.8)}
          sub="v 80 % scénářů jsi v cíli nejpozději tehdy"
        />
        <Stat
          title="Špatný scénář"
          value={when(0.9)}
          sub="v 10 % nejhorších scénářů až po tomto datu"
          tone="text-amber-500"
        />
        <Stat
          title={baseYear !== null ? `Šance do konce ${baseYear}` : 'Šance do základního odhadu'}
          value={baseChance === null ? '–' : formatPercent(baseChance, 0)}
          sub={
            props.baseDate
              ? `základní odhad (bez kolísání) je ${formatMonthLong(props.baseDate)}`
              : 'základní odhad je za víc než 50 let'
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-[3fr_2fr] gap-4">
        <div>
          {option && (
            <EChart
              option={option}
              height={280}
              ariaLabel="Graf rozpětí možných vývojů hodnoty portfolia (Monte Carlo)"
            />
          )}
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-accent/20" /> 10–90 %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-4 rounded-sm bg-accent/50" /> 25–75 %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-accent" /> medián
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-pos" /> cíl
            </span>
          </div>
        </div>

        <div className="grid content-start gap-3 text-[13px]">
          <div className="grid gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">
                <Tip text={HELP_VOL}>Kolísavost (volatilita) p.a.</Tip>
              </span>
              <b>{formatPercent(volatility, 1)}</b>
            </div>
            <input
              type="range"
              aria-label="Kolísavost ročně"
              min={0}
              max={0.35}
              step={0.005}
              value={volatility}
              onChange={(e) => props.onVolatility(Math.round(Number(e.target.value) * 1000) / 1000)}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs text-muted">
              {props.historicalVolatility !== null ? (
                <>
                  Tvoje historie: {formatPercent(props.historicalVolatility, 1)}
                  {props.volatility !== undefined && (
                    <>
                      {' · '}
                      <button
                        onClick={() => props.onVolatility(undefined)}
                        className="text-accent hover:underline"
                      >
                        použít
                      </button>
                    </>
                  )}
                </>
              ) : (
                'Na odhad z historie je málo dat – výchozí 15 %.'
              )}
            </span>
          </div>
          <p className="text-xs text-muted">
            Ostatní předpoklady (vklad {formatMoney(monthlyEur, 'EUR', 0)}, výnos{' '}
            {formatPercent(annualReturn, 1)}
            {props.real ? ' reálně' : ''}) se berou z karty Předpoklady.
          </p>
          <p className="text-xs text-muted">
            Model je zjednodušený: náhodné měsíční výnosy (log-normální rozdělení), konstantní
            parametry a kurz EUR/CZK, bez daní
            {props.real ? '; v dnešních cenách' : ' a bez inflace'}. Jde o orientaci, ne o
            předpověď.
          </p>
        </div>
      </div>

      {result && years.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-xs text-muted">
                <th className="border-b px-2 py-1.5 text-left font-semibold">Do konce roku</th>
                {years.map((y) => (
                  <th key={y} className="border-b px-2 py-1.5 text-right font-semibold">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-2 text-muted">Šance, že máš cíl</td>
                {years.map((y) => {
                  const p = probabilityByYearEnd(result, today, y) ?? 0
                  return (
                    <td
                      key={y}
                      className={`px-2 py-2 text-right font-semibold ${p >= 0.8 ? toneClass(1) : ''}`}
                    >
                      {formatPercent(p, 0)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function Stat({
  title,
  value,
  sub,
  tone = ''
}: {
  title: string
  value: string
  sub: string
  tone?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">{title}</div>
      <div className={`mt-1 text-[20px] font-bold ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  )
}
