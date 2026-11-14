import { useMemo, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { todayIso } from '../../../core/date'
import {
  compareWithSelling,
  dividendStats,
  historicalTotalReturn,
  projectDividendIncome,
  type DividendIncomeYear
} from '../../../core/dividends'
import { formatMoney, formatPercent } from '../../../core/money'
import { tickerSchema, type Withdrawal } from '../../../shared/settings'
import { type ChartColors, useChartColors } from '../chartColors'
import { useApp } from '../store'
import { EChart } from './EChart'
import { Tip } from './Kpi'
import { Segmented } from './Segmented'
import { Slider, Stat } from './WithdrawalParts'

const czk = (v: number): string => formatMoney(v, 'CZK', 0)
const HORIZONS = [
  { value: '20', label: '20 let' },
  { value: '30', label: '30 let' },
  { value: '40', label: '40 let' }
] as const
type Horizon = (typeof HORIZONS)[number]['value']
const TABLE_YEARS = [0, 5, 10, 20, 30] as const
/** Když z historie nejde nic spočítat (nový fond, bez dat). */
const FALLBACK_YIELD = 0.03
const FALLBACK_GROWTH = 0.05
const AMBER = '#f59e0b'
/** Nad tímto celkovým výnosem se zobrazí upozornění, že je odhad optimistický. */
const OPTIMISTIC_RETURN = 0.1

function compactCzk(value: number): string {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. Kč`
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)} tis. Kč`
  return `${Math.round(value)} Kč`
}

function buildOption(
  rows: DividendIncomeYear[],
  sellPerpetual: number | null,
  c: ChartColors
): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { dataIndex: number }[]) => {
        const r = rows[params[0]?.dataIndex ?? 0]
        if (!r) return ''
        return (
          `<b>${r.year + 1}. rok čerpání</b>` +
          `<br/>Dividendy měsíčně: <b>${czk(r.monthly)}</b>` +
          `<br/>v dnešních cenách: ${czk(r.monthlyReal)}` +
          (sellPerpetual !== null
            ? `<br/>Prodej podílů (v dnešních cenách): ${czk(sellPerpetual)}`
            : '') +
          `<br/>Hodnota kapitálu: ${czk(r.capital)}`
        )
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: rows.map((r) => r.year),
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        interval: (i: number) => i % 5 === 0,
        formatter: (v: string) => `rok ${v}`
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { color: c.muted, formatter: compactCzk },
      splitLine: { lineStyle: { color: c.border } }
    },
    series: [
      {
        name: 'Dividendy v dnešních cenách',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.4, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: { color: `${c.accent}26` },
        data: rows.map((r) => r.monthlyReal)
      },
      {
        name: 'Dividendy nominálně',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.6, type: 'dotted', color: c.accent },
        itemStyle: { color: c.accent },
        data: rows.map((r) => r.monthly)
      },
      ...(sellPerpetual !== null
        ? [
            {
              name: 'Prodej podílů',
              type: 'line',
              showSymbol: false,
              lineStyle: { width: 1.8, type: 'dashed', color: AMBER },
              itemStyle: { color: AMBER },
              data: rows.map(() => sellPerpetual)
            }
          ]
        : [])
    ]
  }
}

interface Props {
  w: Withdrawal
  setW: React.Dispatch<React.SetStateAction<Withdrawal>>
  capital: number
  capitalSub: string
  /** Výběr zdroje kapitálu a posuvník inflace – společné s variantou Odprodej. */
  sourceControl: React.ReactNode
  inflationControl: React.ReactNode
  /** Změna tickeru (uloží se hned a stáhnou se jeho dividendy). */
  onTicker: (ticker: string) => void
}

/** Varianta „Jen dividendy“: kapitál v dividendovém ETF, čerpají se jen čisté dividendy. */
export function DividendWithdrawal(props: Props): React.JSX.Element {
  const { w, setW, capital } = props
  const colors = useChartColors()
  const series = useApp((s) => s.prices.dividends?.[w.dividendTicker])
  const report = useApp((s) => s.priceReport?.dividends)
  const updating = useApp((s) => s.priceUpdating)
  const refreshPrices = useApp((s) => s.refreshPrices)
  const [horizon, setHorizon] = useState<Horizon>('30')
  const [tickerText, setTickerText] = useState(w.dividendTicker)

  const today = todayIso()
  const stats = useMemo(
    () => (series ? dividendStats(series.events, series.price, today) : null),
    [series, today]
  )
  const total5 = useMemo(
    () => (series?.adjMonthly ? historicalTotalReturn(series.adjMonthly, 5) : null),
    [series]
  )
  const total10 = useMemo(
    () => (series?.adjMonthly ? historicalTotalReturn(series.adjMonthly, 10) : null),
    [series]
  )
  const historyYield = stats?.yield ?? null
  const historyGrowth = stats?.growth5 ?? stats?.growth10 ?? null
  const dividendYield = w.dividendYield ?? historyYield ?? FALLBACK_YIELD
  const growth = w.dividendGrowth ?? historyGrowth ?? FALLBACK_GROWTH
  const manual = w.dividendYield !== undefined || w.dividendGrowth !== undefined

  const input = useMemo(
    () => ({ capital, dividendYield, growth, tax: w.dividendTax, inflation: w.inflation }),
    [capital, dividendYield, growth, w.dividendTax, w.inflation]
  )
  const rows = useMemo(() => projectDividendIncome(input, 40), [input])
  const cmp = useMemo(() => compareWithSelling(input), [input])
  const chartRows = useMemo(() => rows.slice(0, Number(horizon) + 1), [rows, horizon])
  const option = useMemo(
    () => buildOption(chartRows, cmp.sellPerpetual, colors),
    [chartRows, cmp.sellPerpetual, colors]
  )

  const error = report && report.id === w.dividendTicker && !report.ok ? report.error : undefined
  const tickerValid = tickerSchema.safeParse(tickerText).success
  const usListed = !!series && series.currency === 'USD' && !w.dividendTicker.includes('.')
  const first = rows[0]

  const cmpVerdict =
    cmp.dividendsAheadFrom === 0
      ? 'dividendy jsou víc hned od začátku'
      : cmp.dividendsAheadFrom !== null
        ? `dividendy ho doženou v ${cmp.dividendsAheadFrom + 1}. roce`
        : 'dividendy ho nedoženou'

  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <Stat
          title="Kapitál v ETF"
          value={czk(capital)}
          sub={`${props.capitalSub} · celý převeden do ${w.dividendTicker}`}
        />
        <Stat
          title="Čistá dividenda měsíčně"
          value={czk(first.monthly)}
          sub={`1. rok · ${czk(first.monthly * 12)} ročně po dani ${formatPercent(w.dividendTax, 0)}`}
          tone="text-pos"
        />
        <Stat
          title="Za 10 let"
          value={czk(rows[10].monthly)}
          sub={`v dnešních cenách ${czk(rows[10].monthlyReal)}`}
        />
        <Stat
          title={
            <Tip text="Kdybys peníze nechal ve stejném ETF a místo dividend si každý měsíc prodal část podílů: částka se každý rok zvýší o inflaci a je spočítaná tak, aby kapitál nikdy nedošel (drží si kupní sílu). Stejný kapitál i celkový výnos (dividenda + růst). Daň se u prodeje nepočítá (po 3 letech je osvobozený), u dividend ano.">
              Kdybys prodával podíly
            </Tip>
          }
          value={cmp.sellPerpetual === null ? '–' : czk(cmp.sellPerpetual)}
          sub={
            cmp.sellPerpetual === null
              ? 'celkový výnos nepřevyšuje inflaci – prodejem by kapitál časem došel'
              : `měsíčně, každý rok + inflace; kapitál nedojde (při ${formatPercent(cmp.totalReturn, 1)} ročně) · ${cmpVerdict}`
          }
        />
      </div>

      <div className="mt-3 grid grid-cols-[3fr_2fr] gap-4">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted">Měsíční příjem v čase (v dnešních cenách)</span>
            <Segmented<Horizon>
              ariaLabel="Délka grafu dividend"
              options={HORIZONS}
              value={horizon}
              onChange={setHorizon}
            />
          </div>
          <EChart option={option} height={260} ariaLabel="Graf měsíčního příjmu z dividend" />
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-accent" /> dividendy (v dnešních
              cenách)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dotted border-accent" /> dividendy
              nominálně
            </span>
            {cmp.sellPerpetual !== null && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-4 border-t-2 border-dashed"
                  style={{ borderColor: AMBER }}
                />{' '}
                prodej podílů (kapitál nedojde)
              </span>
            )}
          </div>
          {cmp.sellPerpetual !== null && (
            <p className="mt-1 text-xs text-muted">
              Oranžová čára: kolik bys mohl měsíčně čerpat prodejem podílů ze stejného ETF, aby
              kapitál nikdy nedošel.
            </p>
          )}
        </div>

        <div className="grid content-start gap-4 text-[13px]">
          {props.sourceControl}

          <div className="grid gap-1.5">
            <span className="text-xs text-muted">Dividendové ETF (Yahoo ticker)</span>
            <div className="flex items-center gap-2">
              <input
                aria-label="Ticker dividendového ETF"
                value={tickerText}
                onChange={(e) => setTickerText(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tickerValid) props.onTicker(tickerText.trim())
                }}
                className={`w-[110px] rounded-[8px] border bg-surface-2 px-2.5 py-[6px] text-[13px] ${
                  tickerText && !tickerValid ? 'border-neg' : ''
                }`}
              />
              {tickerText.trim() !== w.dividendTicker && (
                <button
                  disabled={!tickerValid}
                  onClick={() => props.onTicker(tickerText.trim())}
                  className="rounded-[8px] bg-accent px-3 py-[6px] text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  Použít
                </button>
              )}
              {series && <span className="text-xs text-muted">{series.currency}</span>}
            </div>
            <DataHint
              loading={!series && !error}
              updating={updating}
              error={error}
              ticker={w.dividendTicker}
              yieldText={historyYield !== null ? formatPercent(historyYield, 1) : null}
              growth5={stats?.growth5 ?? null}
              growth10={stats?.growth10 ?? null}
              total5={total5?.annual ?? null}
              total10={total10?.annual ?? null}
              currency={series?.currency ?? ''}
              manual={manual}
              onUseHistory={() =>
                setW((x) => ({ ...x, dividendYield: undefined, dividendGrowth: undefined }))
              }
              onRetry={() => void refreshPrices()}
            />
          </div>

          <Slider
            label="Dividendový výnos p.a."
            aria="Dividendový výnos ročně"
            value={formatPercent(dividendYield, 1)}
            min={0}
            max={0.08}
            step={0.001}
            current={dividendYield}
            onChange={(v) => setW((x) => ({ ...x, dividendYield: Math.round(v * 1000) / 1000 }))}
          />
          <Slider
            label="Růst dividend p.a."
            aria="Růst dividend ročně"
            value={formatPercent(growth, 1)}
            min={-0.02}
            max={0.12}
            step={0.005}
            current={growth}
            onChange={(v) => setW((x) => ({ ...x, dividendGrowth: Math.round(v * 1000) / 1000 }))}
          />
          <span className="-mt-2 text-xs text-muted">
            Celkový výnos = dividenda {formatPercent(dividendYield, 1)} + růst{' '}
            {formatPercent(growth, 1)} ≈{' '}
            <b className="text-fg">{formatPercent(cmp.totalReturn, 1)}</b> ročně (před daní)
            {cmp.totalReturn > OPTIMISTIC_RETURN && (
              <span className="text-amber-500">
                {' '}
                – spíš optimistické, dlouhodobé průměry akcií bývají kolem {'7–10 %'}
              </span>
            )}
          </span>
          <Slider
            label="Daň z dividend"
            aria="Daň z dividend"
            value={formatPercent(w.dividendTax, 0)}
            min={0}
            max={0.35}
            step={0.01}
            current={w.dividendTax}
            onChange={(v) => setW((x) => ({ ...x, dividendTax: Math.round(v * 100) / 100 }))}
          />
          {props.inflationControl}

          {usListed && (
            <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                {w.dividendTicker} je fond kotovaný v USA – retailový investor z EU takové fondy u
                většiny brokerů kvůli pravidlům PRIIPs nekoupí. Můžeš zadat UCITS alternativu
                (ticker z Yahoo). Kurz USD/CZK se neřeší.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-xs text-muted">
              <th className="border-b px-2 py-1.5 text-left font-semibold">Rok čerpání</th>
              {TABLE_YEARS.map((k) => (
                <th key={k} className="border-b px-2 py-1.5 text-right font-semibold">
                  {k + 1}.
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border-b px-2 py-2">Čistá dividenda měsíčně</td>
              {TABLE_YEARS.map((k) => (
                <td
                  key={k}
                  className="border-b px-2 py-2 text-right font-semibold whitespace-nowrap"
                >
                  {czk(rows[k].monthly)}
                </td>
              ))}
            </tr>
            <tr className="text-muted">
              <td className="border-b px-2 py-2">v dnešních cenách</td>
              {TABLE_YEARS.map((k) => (
                <td key={k} className="border-b px-2 py-2 text-right whitespace-nowrap">
                  {czk(rows[k].monthlyReal)}
                </td>
              ))}
            </tr>
            <tr className="text-muted">
              <td className="border-b px-2 py-2">Hodnota kapitálu (neprodává se)</td>
              {TABLE_YEARS.map((k) => (
                <td key={k} className="border-b px-2 py-2 text-right whitespace-nowrap">
                  {czk(rows[k].capital)}
                </td>
              ))}
            </tr>
            {cmp.sellPerpetual !== null && (
              <tr className="text-muted">
                <td className="px-2 py-2">Prodej podílů měsíčně (kapitál nedojde)</td>
                {TABLE_YEARS.map((k) => (
                  <td key={k} className="px-2 py-2 text-right whitespace-nowrap">
                    {czk(cmp.sellPerpetual! * Math.pow(1 + w.inflation, k))}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted">
          Zjednodušeně: stálý dividendový výnos (kurz roste stejně jako dividendy), dividendy se
          vyplácejí čtvrtletně – měsíční částka je průměr. Daň 15 % odpovídá srážce v USA s
          formulářem W-8BEN započtené v ČR. Srovnání s prodejem podílů používá stejný celkový výnos
          ({formatPercent(cmp.totalReturn, 1)}). Minulý růst dividend nezaručuje budoucí; jde o
          orientační výpočet, ne doporučení.
        </p>
      </div>
    </>
  )
}

function DataHint(props: {
  loading: boolean
  updating: boolean
  error: string | undefined
  ticker: string
  yieldText: string | null
  growth5: number | null
  growth10: number | null
  total5: number | null
  total10: number | null
  currency: string
  manual: boolean
  onUseHistory: () => void
  onRetry: () => void
}): React.JSX.Element {
  if (props.error || props.loading) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
        {props.error ? (
          <span className="text-neg">{props.error}</span>
        ) : (
          <span>Historie dividend {props.ticker} zatím není stažená.</span>
        )}
        <button
          onClick={props.onRetry}
          disabled={props.updating}
          className="flex items-center gap-1 text-accent hover:underline disabled:opacity-60"
        >
          <RefreshCw size={12} className={props.updating ? 'animate-spin' : ''} />
          {props.updating ? 'Stahuji…' : 'Stáhnout'}
        </button>
      </span>
    )
  }
  const pct = (v: number | null): string => (v === null ? '–' : formatPercent(v, 1))
  return (
    <span className="grid gap-0.5 text-xs text-muted">
      <span>
        Z historie výplat: výnos za 12 měs. <b className="text-fg">{props.yieldText ?? '–'}</b> ·
        růst dividend <b className="text-fg">{pct(props.growth5)}</b> (5 let),{' '}
        <b className="text-fg">{pct(props.growth10)}</b> (10 let)
        {props.manual && (
          <>
            {' · '}
            <button onClick={props.onUseHistory} className="text-accent hover:underline">
              použít
            </button>
          </>
        )}
      </span>
      {(props.total5 !== null || props.total10 !== null) && (
        <span>
          <Tip text="Skutečný průměrný roční výnos fondu včetně reinvestovaných dividend (z kurzů upravených o dividendy). Ve měně fondu – v Kč se liší o pohyb kurzu koruny.">
            Skutečný celkový výnos
          </Tip>{' '}
          (vč. dividend, v {props.currency}): <b className="text-fg">{pct(props.total5)}</b> (5
          let), <b className="text-fg">{pct(props.total10)}</b> (10 let)
        </span>
      )}
    </span>
  )
}
