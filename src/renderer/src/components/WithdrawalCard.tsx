import { useEffect, useMemo, useRef, useState } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { formatDuration } from '../../../core/goal-projection'
import { formatMoney, formatPercent } from '../../../core/money'
import { parseNumber } from '../../../core/trade-math'
import {
  maxMonthlyWithdrawal,
  perpetualMonthlyWithdrawal,
  simulateWithdrawal
} from '../../../core/withdrawal'
import type { Withdrawal } from '../../../shared/settings'
import { type ChartColors, useChartColors } from '../chartColors'
import { useApp } from '../store'
import { Card } from './Card'
import { EChart } from './EChart'
import { Tip } from './Kpi'
import { Segmented } from './Segmented'
import { DividendWithdrawal } from './DividendWithdrawal'
import { Slider, Stat } from './WithdrawalParts'

const SAVE_DELAY_MS = 500
const TABLE_YEARS = [20, 25, 30, 40, 50] as const
const HORIZONS = [
  { value: '30', label: '30 let' },
  { value: '40', label: '40 let' },
  { value: '50', label: '50 let' }
] as const
type Horizon = (typeof HORIZONS)[number]['value']
const MODES = [
  { value: 'sell', label: 'Odprodej' },
  { value: 'dividends', label: 'Jen dividendy' }
] as const
const SOURCES = [
  { value: 'goal', label: 'Cíl' },
  { value: 'current', label: 'Dnešní hodnota' },
  { value: 'custom', label: 'Vlastní' }
] as const

const czk = (v: number): string => formatMoney(v, 'CZK', 0)

function compactCzk(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. Kč`
  if (abs >= 1e3) return `${Math.round(value / 1e3)} tis. Kč`
  return `${Math.round(value)} Kč`
}

/** Čerpání zaokrouhlené na stovky DOLŮ – aby nastavená částka vydržela aspoň uvedenou dobu. */
const floor100 = (v: number): number => Math.floor(v / 100 + 1e-9) * 100

function buildOption(
  capital: number[],
  monthly: number,
  inflation: number,
  months: number,
  c: ChartColors
): EChartsCoreOption {
  // Body po měsících; když kapitál dojde dřív, dál zůstává na nule.
  const nominal = Array.from({ length: months + 1 }, (_, i) => capital[i] ?? 0)
  const real = nominal.map((v, i) => v / Math.pow(1 + inflation, Math.floor(i / 12)))
  const withdrawalAt = (i: number): number =>
    monthly * Math.pow(1 + inflation, Math.floor(Math.max(0, i - 1) / 12))
  const label = (i: number): string => {
    const y = Math.floor(i / 12)
    const m = i % 12
    return m === 0 ? `rok ${y}` : `rok ${y}, měsíc ${m}`
  }
  return {
    animation: false,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { dataIndex: number }[]) => {
        const i = params[0]?.dataIndex ?? 0
        return (
          `<b>${label(i)}</b>` +
          `<br/>Kapitál: <b>${czk(nominal[i])}</b>` +
          `<br/>V dnešních cenách: ${czk(real[i])}` +
          (i > 0 && nominal[i] > 0 ? `<br/>Čerpání: ${czk(withdrawalAt(i))} měsíčně` : '')
        )
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: nominal.map((_, i) => i),
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        interval: (i: number) => i % 60 === 0,
        formatter: (v: string) => `rok ${Number(v) / 12}`
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
        name: 'Kapitál',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.4, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: { color: `${c.accent}26` },
        data: nominal
      },
      {
        name: 'V dnešních cenách',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.5, type: 'dashed', color: c.muted },
        itemStyle: { color: c.muted },
        data: real
      }
    ]
  }
}

interface Props {
  goalCzk: number
  currentCzk: number
  /** Režim „po inflaci“ – cíl a dnešní hodnota jsou v dnešních cenách. */
  real: boolean
}

/** Kalkulačka čerpání: kolik lze měsíčně vybírat a jak dlouho kapitál vydrží. */
export function WithdrawalCard({ goalCzk, currentCzk, real }: Props): React.JSX.Element {
  const saved = useApp((s) => s.settings.withdrawal)
  const updateSettings = useApp((s) => s.updateSettings)
  const refreshPrices = useApp((s) => s.refreshPrices)
  const colors = useChartColors()

  // Posuvníky se mění okamžitě, na disk se ukládá až po chvíli klidu.
  const [w, setW] = useState<Withdrawal>(saved)
  const [customText, setCustomText] = useState(saved.customCzk.toLocaleString('cs-CZ'))
  const [horizon, setHorizon] = useState<Horizon>('40')
  const lastSaved = useRef(saved)
  useEffect(() => {
    if (JSON.stringify(w) === JSON.stringify(lastSaved.current)) return
    const id = setTimeout(() => {
      lastSaved.current = w
      void updateSettings({ withdrawal: w })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [w, updateSettings])

  const capital = w.source === 'goal' ? goalCzk : w.source === 'current' ? currentCzk : w.customCzk
  const months = Number(horizon) * 12

  const sim = useMemo(
    () => simulateWithdrawal(capital, w.monthlyCzk, w.annualReturn, w.inflation),
    [capital, w.monthlyCzk, w.annualReturn, w.inflation]
  )
  const perpetual = perpetualMonthlyWithdrawal(capital, w.annualReturn, w.inflation)
  const rule4 = (capital * 0.04) / 12
  const option = useMemo(
    () => buildOption(sim.capital, w.monthlyCzk, w.inflation, months, colors),
    [sim, w.monthlyCzk, w.inflation, months, colors]
  )

  const lastingText = sim.forever
    ? 'navždy'
    : sim.monthsLasting === null
      ? 'přes 100 let'
      : `vydrží ${formatDuration(sim.monthsLasting)}`
  const sliderMax = Math.max(200_000, Math.ceil(w.monthlyCzk / 50_000) * 50_000)

  /** Uloží hned (ne až po zpoždění) a stáhne dividendy – hlavní proces čte nastavení z disku. */
  const saveNowAndRefresh = async (next: Withdrawal): Promise<void> => {
    setW(next)
    lastSaved.current = next
    await updateSettings({ withdrawal: next })
    if (next.mode === 'dividends') void refreshPrices()
  }

  const capitalSub =
    w.source === 'goal'
      ? `cíl${real ? ' v dnešních cenách' : ''}`
      : w.source === 'current'
        ? 'dnešní hodnota portfolia'
        : 'vlastní částka'

  const commitCustom = (): void => {
    const n = parseNumber(customText)
    if (n !== null && n >= 0 && n <= 10_000_000_000) {
      setW((x) => ({ ...x, customCzk: Math.round(n) }))
      setCustomText(Math.round(n).toLocaleString('cs-CZ'))
    } else {
      setCustomText(w.customCzk.toLocaleString('cs-CZ'))
    }
  }

  const sourceControl = (
    <div className="grid justify-items-start gap-1.5">
      <span className="text-xs text-muted">Kapitál</span>
      <Segmented
        ariaLabel="Zdroj kapitálu"
        options={SOURCES}
        value={w.source}
        onChange={(source) => setW((x) => ({ ...x, source }))}
      />
      {w.source === 'custom' && (
        <input
          aria-label="Vlastní kapitál v Kč"
          inputMode="numeric"
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
        />
      )}
    </div>
  )
  const inflationControl = (
    <Slider
      label="Inflace (čerpání se zvyšuje) p.a."
      aria="Inflace během čerpání ročně"
      value={formatPercent(w.inflation, 1)}
      min={0}
      max={0.08}
      step={0.005}
      current={w.inflation}
      onChange={(v) => setW((x) => ({ ...x, inflation: Math.round(v * 1000) / 1000 }))}
    />
  )

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          <Tip text="Kolik můžeš měsíčně čerpat, až budeš mít kapitál, a jak dlouho vydrží. Čerpání se každý rok zvýší o inflaci, aby si udrželo kupní sílu.">
            Kalkulačka čerpání
          </Tip>
        </h3>
        <span className="text-[13px] text-muted">Způsob čerpání:</span>
        <Segmented
          ariaLabel="Způsob čerpání"
          options={MODES}
          value={w.mode}
          onChange={(mode) => void saveNowAndRefresh({ ...w, mode })}
        />
      </div>

      {w.mode === 'dividends' ? (
        <DividendWithdrawal
          w={w}
          setW={setW}
          capital={capital}
          capitalSub={capitalSub}
          sourceControl={sourceControl}
          inflationControl={inflationControl}
          onTicker={(dividendTicker) =>
            void saveNowAndRefresh({
              ...w,
              dividendTicker,
              dividendYield: undefined,
              dividendGrowth: undefined
            })
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat title="Začáteční kapitál" value={czk(capital)} sub={capitalSub} />
            <Stat
              title={
                <Tip text="Pravidlo 4 %: první rok vybereš 4 % kapitálu, pak částku zvyšuješ o inflaci. Historicky vydrželo ~30 let i v horších obdobích (studie Trinity, USA).">
                  Měsíčně při 4 % ročně
                </Tip>
              }
              value={czk(rule4)}
              sub={`${czk(rule4 * 12)} ročně · před daněmi`}
              tone="text-pos"
            />
            <Stat
              title={`Při čerpání ${czk(w.monthlyCzk)} měsíčně`}
              value={lastingText}
              sub={`při výnosu ${formatPercent(w.annualReturn, 1)} a inflaci ${formatPercent(w.inflation, 1)}`}
              tone={sim.forever ? 'text-pos' : ''}
            />
          </div>

          <div className="mt-3 grid grid-cols-[3fr_2fr] gap-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">Vývoj kapitálu při čerpání</span>
                <Segmented<Horizon>
                  ariaLabel="Délka grafu čerpání"
                  options={HORIZONS}
                  value={horizon}
                  onChange={setHorizon}
                />
              </div>
              <EChart option={option} height={260} ariaLabel="Graf vývoje kapitálu při čerpání" />
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-accent" /> kapitál
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 border-t-2 border-dashed border-muted" /> v
                  dnešních cenách (kupní síla)
                </span>
              </div>
            </div>

            <div className="grid content-start gap-4 text-[13px]">
              {sourceControl}

              <Slider
                label="Čerpání měsíčně"
                aria="Čerpání měsíčně"
                value={czk(w.monthlyCzk)}
                min={0}
                max={sliderMax}
                step={1000}
                current={w.monthlyCzk}
                onChange={(v) => setW((x) => ({ ...x, monthlyCzk: v }))}
              />
              <Slider
                label="Výnos během čerpání p.a."
                aria="Výnos během čerpání ročně"
                value={formatPercent(w.annualReturn, 1)}
                min={0}
                max={0.1}
                step={0.005}
                current={w.annualReturn}
                onChange={(v) => setW((x) => ({ ...x, annualReturn: Math.round(v * 1000) / 1000 }))}
              />
              {inflationControl}
              <p className="text-xs text-muted">
                Zjednodušeně: konstantní výnos, výběr na konci měsíce, čerpání se každý rok zvedne o
                inflaci; daně se nezohledňují. Během čerpání bývá rozumné počítat s nižším výnosem
                (konzervativnější portfolio).
              </p>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-xs text-muted">
                  <th className="border-b px-2 py-1.5 text-left font-semibold">Má vydržet</th>
                  {TABLE_YEARS.map((y) => (
                    <th key={y} className="border-b px-2 py-1.5 text-right font-semibold">
                      {y} let
                    </th>
                  ))}
                  <th className="border-b px-2 py-1.5 text-right font-semibold">
                    <Tip text="Kapitál si drží kupní sílu – čerpá se jen reálný výnos (výnos nad inflaci).">
                      navždy
                    </Tip>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-2 text-muted">
                    Měsíční čerpání (z {compactCzk(capital)})
                  </td>
                  {TABLE_YEARS.map((y) => {
                    const v = maxMonthlyWithdrawal(capital, w.annualReturn, w.inflation, y)
                    return (
                      <td key={y} className="px-2 py-2 text-right font-semibold whitespace-nowrap">
                        <button
                          title="Použít tuto částku"
                          onClick={() => setW((x) => ({ ...x, monthlyCzk: floor100(v) }))}
                          className="hover:text-accent hover:underline"
                        >
                          {czk(floor100(v))}
                        </button>
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-right font-semibold whitespace-nowrap text-pos">
                    {perpetual === null ? (
                      <span className="text-muted" title="Výnos nepřevyšuje inflaci.">
                        –
                      </span>
                    ) : (
                      <button
                        title="Použít tuto částku"
                        onClick={() => setW((x) => ({ ...x, monthlyCzk: floor100(perpetual) }))}
                        className="hover:underline"
                      >
                        {czk(floor100(perpetual))}
                      </button>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-xs text-muted">
              Částka je čerpání v prvním roce; každý další rok se zvýší o inflaci. Kliknutím ji
              použiješ v kalkulačce.
            </p>
          </div>
        </>
      )}
    </Card>
  )
}
