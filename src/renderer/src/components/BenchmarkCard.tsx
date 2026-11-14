import { useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { benchmarkInCzk, simulateBenchmark } from '../../../core/benchmark'
import { formatDate } from '../../../core/date'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import type { Deflator } from '../../../core/inflation'
import { computePerformance, toPerfPoints, type PerfPoint } from '../../../core/performance'
import { valueAtOrBefore, type SeriesPoint } from '../../../core/portfolio-calc'
import { FX_EUR_CZK } from '../../../shared/prices'
import { benchmarkTickerSchema } from '../../../shared/settings'
import { type ChartColors, useChartColors } from '../chartColors'
import { useApp } from '../store'
import { toneClass } from '../tone'
import { Card } from './Card'
import { EChart } from './EChart'
import { Tip } from './Kpi'

const CUSTOM = '__custom__'
/** Stálý prázdný seznam – selektor ve store nesmí vracet pokaždé nové pole. */
const NO_SECURITIES: never[] = []

function compact(value: number, currency: MoneyCurrency): string {
  const unit = currency === 'CZK' ? 'Kč' : '€'
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. ${unit}`
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)} tis. ${unit}`
  return `${Math.round(value)} ${unit}`
}

interface Line {
  date: string
  portfolio: number
  benchmark: number
  invested: number
}

function buildOption(
  lines: Line[],
  label: string,
  currency: MoneyCurrency,
  c: ChartColors
): EChartsCoreOption {
  const byDate = new Map(lines.map((l) => [l.date, l]))
  const money = (v: number): string => formatMoney(v, currency, 0)
  return {
    animationDuration: 600,
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        // Hodnoty z vlastních dat podle data (viz tooltip grafu na Přehledu).
        const l = byDate.get(params[0]?.data[0] ?? '')
        if (!l) return ''
        const diff = l.portfolio - l.benchmark
        return (
          `<b>${formatDate(l.date)}</b><br/>Tvoje portfolio: <b>${money(l.portfolio)}</b>` +
          `<br/>${label}: ${money(l.benchmark)}<br/>Vloženo: ${money(l.invested)}` +
          `<br/>Rozdíl: <b style="color:${diff >= 0 ? c.pos : c.neg}">${formatSignedMoney(diff, currency, 0)}</b>`
        )
      }
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        hideOverlap: true,
        formatter: (ms: number) => {
          const d = new Date(ms)
          return `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
        }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (v: number) => compact(v, currency) },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        name: 'Vloženo',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.4, type: 'dashed', color: c.muted },
        itemStyle: { color: c.muted },
        data: lines.map((l) => [l.date, l.invested])
      },
      {
        name: label,
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2, color: '#f59e0b' },
        itemStyle: { color: '#f59e0b' },
        data: lines.map((l) => [l.date, l.benchmark])
      },
      {
        name: 'Portfolio',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.4, color: c.accent },
        itemStyle: { color: c.accent },
        data: lines.map((l) => [l.date, l.portfolio])
      }
    ]
  }
}

interface Props {
  /** Řada pro zobrazení (v režimu po inflaci už přepočtená). */
  series: SeriesPoint[]
  /** Nominální řada – z ní se simuluje benchmark (kurzy jsou nominální). */
  nominalSeries: SeriesPoint[]
  /** Přepočet na dnešní ceny v měně zobrazení; `null` = nominálně. */
  deflate: Deflator | null
  currency: MoneyCurrency
  from: string
  to: string
}

/** „Kdybys každý vklad dal do jednoho ETF“ – srovnání skutečného portfolia s benchmarkem. */
export function BenchmarkCard({
  series,
  nominalSeries,
  deflate,
  currency,
  from,
  to
}: Props): React.JSX.Element {
  const colors = useChartColors()
  const benchmark = useApp((s) => s.settings.benchmark)
  const securities = useApp((s) => s.portfolio?.securities ?? NO_SECURITIES)
  const prices = useApp((s) => s.prices)
  const report = useApp((s) => s.priceReport)
  const updating = useApp((s) => s.priceUpdating)
  const updateSettings = useApp((s) => s.updateSettings)
  const refreshPrices = useApp((s) => s.refreshPrices)
  const [customOpen, setCustomOpen] = useState(false)
  const [customText, setCustomText] = useState('')

  const known = securities.find((s) => s.id === benchmark)
  const label = known ? `${known.id} – ${known.name}` : benchmark
  const shortLabel = `Vše v ${benchmark}`
  const benchPrices = prices.securities[benchmark]?.prices
  const benchError = report?.securities.find((s) => s.id === benchmark && !s.ok)?.error

  const data = useMemo(() => {
    if (!benchPrices || benchPrices.length === 0) return null
    const eur = toPerfPoints(nominalSeries, 'EUR')
    if (!eur) return null
    const sim = simulateBenchmark(eur, benchPrices)
    let portfolioPoints = eur
    let benchPoints = sim.points
    if (currency === 'CZK') {
      const czk = toPerfPoints(nominalSeries, 'CZK')
      const fx = prices.fx[FX_EUR_CZK]?.rates
      if (!czk || !fx || fx.length === 0) return null
      portfolioPoints = czk
      benchPoints = benchmarkInCzk(sim.points, czk, (d) => valueAtOrBefore(fx, d) ?? fx[0][1])
    }
    if (deflate) {
      // Po inflaci: obě strany stejným koeficientem dne (hodnoty i toky).
      const real = (p: PerfPoint): PerfPoint => ({
        date: p.date,
        value: p.value * deflate(p.date),
        flow: p.flow * deflate(p.date)
      })
      portfolioPoints = portfolioPoints.map(real)
      benchPoints = benchPoints.map(real)
    }
    const mine = computePerformance(portfolioPoints, from, to)
    const theirs = computePerformance(benchPoints, from, to)
    if (!mine || !theirs) return null
    const invested = new Map(
      series.map((p) => [p.date, currency === 'CZK' ? (p.investedCzk ?? 0) : p.invested])
    )
    const lines: Line[] = portfolioPoints
      .map((p, i) => ({
        date: p.date,
        portfolio: p.value,
        benchmark: benchPoints[i].value,
        invested: invested.get(p.date) ?? 0
      }))
      .filter((l) => l.date >= mine.from && l.date <= mine.to)
    return { mine, theirs, lines, sim }
  }, [series, nominalSeries, deflate, benchPrices, currency, prices.fx, from, to])

  const option = useMemo(
    () => (data ? buildOption(data.lines, shortLabel, currency, colors) : null),
    [data, shortLabel, currency, colors]
  )

  const choose = async (ticker: string): Promise<void> => {
    await updateSettings({ benchmark: ticker })
    void refreshPrices()
  }
  const customValid = benchmarkTickerSchema.safeParse(customText).success

  const money = (v: number): string => formatMoney(v, currency, 0)
  const profitDiff = data ? data.mine.profit - data.theirs.profit : 0
  // Upozornit jen tehdy, když benchmark neměl kurz ještě během zvoleného období.
  const cashBeforePrices =
    !!data &&
    data.sim.daysWithoutPrice > 0 &&
    !!data.sim.firstPriceDate &&
    data.sim.firstPriceDate > data.mine.from
  const irrDiff =
    data && data.mine.irr !== null && data.theirs.irr !== null
      ? data.mine.irr - data.theirs.irr
      : null

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          <Tip text="Hypotetické portfolio: každý tvůj vklad (a výběr) ve stejný den a ve stejné výši nakoupený jen v jednom ETF. Ukáže, jestli tvůj výběr ETF byl lepší než prostý index.">
            Srovnání s benchmarkem
          </Tip>
        </h3>
        <span className="text-[13px] text-muted">Srovnat s:</span>
        <select
          aria-label="Benchmark"
          value={customOpen ? CUSTOM : benchmark}
          onChange={(e) => {
            if (e.target.value === CUSTOM) setCustomOpen(true)
            else {
              setCustomOpen(false)
              void choose(e.target.value)
            }
          }}
          className="rounded-[8px] border bg-surface-2 px-2.5 py-[6px] text-[13px]"
        >
          {securities.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id} – {s.name}
            </option>
          ))}
          {!known && <option value={benchmark}>{benchmark}</option>}
          <option value={CUSTOM}>Vlastní Yahoo ticker…</option>
        </select>
        {customOpen && (
          <>
            <input
              aria-label="Vlastní ticker benchmarku"
              placeholder="např. VWCE.DE"
              value={customText}
              onChange={(e) => setCustomText(e.target.value.toUpperCase())}
              className={`w-[130px] rounded-[8px] border bg-surface-2 px-2.5 py-[6px] text-[13px] ${
                customText && !customValid ? 'border-neg' : ''
              }`}
            />
            <button
              disabled={!customValid}
              onClick={() => {
                setCustomOpen(false)
                void choose(customText.trim())
              }}
              className="rounded-[8px] bg-accent px-3 py-[6px] text-[13px] font-semibold text-white disabled:opacity-40"
            >
              Použít
            </button>
          </>
        )}
      </div>

      {!data ? (
        <div className="grid justify-items-center gap-2 py-8 text-center text-[13px] text-muted">
          {benchError ? (
            <span className="text-neg">{benchError}</span>
          ) : (
            <span>Kurzy benchmarku {benchmark} zatím nejsou stažené.</span>
          )}
          <button
            onClick={() => void refreshPrices()}
            disabled={updating}
            className="flex items-center gap-1.5 rounded-[9px] border bg-surface-2 px-3 py-[6px] hover:brightness-110 disabled:opacity-60"
          >
            <RefreshCw size={14} className={updating ? 'animate-spin' : ''} />
            {updating ? 'Stahuji…' : 'Stáhnout kurzy'}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">
                Tvoje portfolio
              </div>
              <div className="mt-1 text-[22px] font-bold">{money(data.mine.endValue)}</div>
              <div className="text-xs text-muted">
                TTWROR {formatPercent(data.mine.ttwror ?? 0, 1, true)} · IRR{' '}
                {data.mine.irr === null ? '–' : formatPercent(data.mine.irr, 1)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div
                className="text-xs font-semibold tracking-[.04em] text-muted uppercase"
                title={label}
              >
                {shortLabel}
              </div>
              <div className="mt-1 text-[22px] font-bold">{money(data.theirs.endValue)}</div>
              <div className="text-xs text-muted">
                TTWROR {formatPercent(data.theirs.ttwror ?? 0, 1, true)} · IRR{' '}
                {data.theirs.irr === null ? '–' : formatPercent(data.theirs.irr, 1)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">
                <Tip text="Stejné vklady ve stejné dny – rozdíl toho, kolik se v období vydělalo. U „Max“ je to rozdíl dnešní hodnoty.">
                  Rozdíl zisku za období
                </Tip>
              </div>
              <div className={`mt-1 text-[22px] font-bold ${toneClass(profitDiff)}`}>
                {formatSignedMoney(profitDiff, currency, 0)}
              </div>
              <div className="text-xs text-muted">
                zisk {formatSignedMoney(data.mine.profit, currency, 0)} vs{' '}
                {formatSignedMoney(data.theirs.profit, currency, 0)}
              </div>
            </div>
            <div className="rounded-xl bg-surface-2 px-4 py-3">
              <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">
                Rozdíl výnosu p.a.
              </div>
              <div className={`mt-1 text-[22px] font-bold ${toneClass(irrDiff ?? 0)}`}>
                {irrDiff === null
                  ? '–'
                  : `${irrDiff >= 0 ? '+' : '−'}${(Math.abs(irrDiff) * 100).toFixed(1).replace('.', ',')} p. b.`}
              </div>
              <div className="text-xs text-muted">rozdíl IRR (peněžně vážený)</div>
            </div>
          </div>

          {option && (
            <div className="mt-3">
              <EChart
                option={option}
                height={260}
                ariaLabel="Graf hodnoty portfolia a benchmarku"
              />
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-accent" /> tvoje portfolio
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-4 border-t-2"
                    style={{ borderColor: '#f59e0b' }}
                  />{' '}
                  {shortLabel}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed border-muted" />{' '}
                  vloženo
                </span>
              </div>
            </div>
          )}

          {(cashBeforePrices || known?.distributing) && (
            <div className="mt-3 grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
              {cashBeforePrices && data.sim.firstPriceDate && (
                <div className="flex gap-2">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  Benchmark má kurzy až od {formatDate(data.sim.firstPriceDate)}; dřívější vklady se
                  do té doby počítají jako hotovost.
                </div>
              )}
              {known?.distributing && (
                <div className="flex gap-2">
                  <AlertTriangle size={14} className="mt-px shrink-0" />
                  {benchmark} vyplácí dividendy, které kurz nezahrnuje – benchmark je proto mírně
                  podhodnocený. Pro férové srovnání vyber akumulační ETF.
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-xs text-muted">
            Poplatky a daně se nezohledňují. Kurzy benchmarku se stahují spolu s ostatními.
          </p>
        </>
      )}
    </Card>
  )
}
