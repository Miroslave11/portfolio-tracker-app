import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { daysBetween, formatDate } from '../../../core/date'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import {
  PERIOD_PRESETS,
  computePerformance,
  performanceByYear,
  resolvePeriod,
  toPerfPoints,
  type CurvePoint,
  type PeriodId,
  type PerfResult
} from '../../../core/performance'
import { type ChartColors, useChartColors } from '../chartColors'
import { Card } from '../components/Card'
import { EChart } from '../components/EChart'
import { Kpi, Tip } from '../components/Kpi'
import { BenchmarkCard } from '../components/BenchmarkCard'
import { RiskCard } from '../components/RiskCard'
import { toneClass } from '../tone'
import { useApp } from '../store'
import { useInflation, usePortfolioCalc } from '../useCalc'
import { RealModeBanner } from '../components/RealModeBanner'

const HELP_TTWROR =
  'Časově vážený výnos: výkon samotných ETF bez vlivu toho, kdy a kolik jsi přidával. Hodí se k porovnání s indexem nebo jiným portfoliem.'
const HELP_IRR =
  'Peněžně vážený roční výnos: kolik „procent ročně“ reálně vydělaly tvoje peníze, včetně toho, že jsi vkládal postupně. Odpovídá tomu, co by musel nést vklad na spořicím účtu, aby dopadl stejně.'

function monthsLabel(days: number): string {
  const months = Math.round(days / 30.44)
  if (months < 1) return `${days} dní`
  if (months < 24) return `${months} ${months === 1 ? 'měsíc' : months < 5 ? 'měsíce' : 'měsíců'}`
  const years = (months / 12).toFixed(1).replace('.', ',')
  return `${years} roku`
}

function buildCurveOption(curve: CurvePoint[], c: ChartColors): EChartsCoreOption {
  const byDate = new Map(curve.map((p) => [p.date, p.pct]))
  const shortSpan =
    curve.length > 1 && daysBetween(curve[0].date, curve[curve.length - 1].date) < 400
  const pct = (v: number): string => formatPercent(v, 1, true)
  return {
    animationDuration: 700,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        // Hodnota se bere z vlastních dat podle data (viz tooltip grafu na Přehledu).
        const date = params[0]?.data[0] ?? ''
        const v = byDate.get(date)
        if (v === undefined) return ''
        return `<b>${formatDate(date)}</b><br/>Kumulativní výkon: <b style="color:${
          v >= 0 ? c.pos : c.neg
        }">${pct(v)}</b>`
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
          // Krátká období: den a měsíc; dlouhá: měsíc a rok.
          return shortSpan
            ? `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`
            : `${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`
        }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (v: number) => `${Math.round(v * 100)} %` },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        name: 'Kumulativní výkon',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.2, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: {
          origin: 'start',
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${c.accent}40` },
              { offset: 1, color: `${c.accent}00` }
            ]
          }
        },
        data: curve.map((p) => [p.date, p.pct])
      }
    ]
  }
}

const chipClass = (on: boolean): string =>
  `rounded-[7px] border px-2.5 py-[5px] text-[13px] transition-all ${
    on
      ? 'border-accent bg-accent/15 font-semibold text-fg'
      : 'border-transparent bg-surface-2 text-muted hover:text-fg'
  }`

export function PerformanceScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const setScreen = useApp((s) => s.setScreen)
  const calc = usePortfolioCalc()
  const inflation = useInflation()
  const colors = useChartColors()

  const [periodId, setPeriodId] = useState<PeriodId>('MAX')
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null)

  const summary = calc?.summary ?? null
  const czkAvailable = !!calc && toPerfPoints(calc.series, 'CZK') !== null
  const currency: MoneyCurrency = displayCurrency === 'CZK' && czkAvailable ? 'CZK' : 'EUR'

  const points = useMemo(
    () => (calc ? toPerfPoints(calc.series, currency) : null),
    [calc, currency]
  )
  const yearRows = useMemo(() => (points ? performanceByYear(points) : []), [points])

  const first = summary?.firstDate ?? ''
  const last = summary?.asOf ?? ''
  const period = useMemo(
    () => (first ? resolvePeriod(periodId, first, last, custom ?? undefined) : null),
    [periodId, first, last, custom]
  )
  const result: PerfResult | null = useMemo(
    () => (points && period ? computePerformance(points, period.from, period.to) : null),
    [points, period]
  )
  const total = useMemo(
    () => (points && first ? computePerformance(points, first, last) : null),
    [points, first, last]
  )
  const option = useMemo(
    () => (result ? buildCurveOption(result.curve, colors) : null),
    [result, colors]
  )

  if (!portfolio || portfolio.transactions.length === 0 || !summary || !points || !period) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="text-lg font-semibold">Zatím není z čeho počítat</div>
          <p className="max-w-md text-muted">
            {portfolio && portfolio.transactions.length > 0
              ? `Pro ${brokerFilter === 'all' ? 'vybraný výběr' : brokerFilter} nejsou žádné transakce.`
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

  const years = yearRows.map((r) => r.year)
  const money = (v: number): string => formatMoney(v, currency, 0)
  const signed = (v: number): string => formatSignedMoney(v, currency, 0)
  const pctFmt = (v: number | null, digits = 1): string =>
    v === null ? '–' : formatPercent(v, digits, true)

  const notes: string[] = []
  if (displayCurrency === 'CZK' && currency === 'EUR') {
    notes.push('Kurz EUR/CZK z ČNB zatím není stažený – zobrazuji EUR.')
  }
  if (currency === 'CZK') {
    notes.push(
      'V Kč výkon zahrnuje i změnu kurzu koruny k euru (hodnota se přepočítává kurzem platným v daný den).'
    )
  }

  const setCustomFrom = (value: string): void => {
    if (!value) return
    setCustom({ from: value, to: custom?.to ?? last })
    setPeriodId('CUSTOM')
  }
  const setCustomTo = (value: string): void => {
    if (!value) return
    setCustom({ from: custom?.from ?? first, to: value })
    setPeriodId('CUSTOM')
  }

  return (
    <div className="grid gap-4">
      <RealModeBanner firstDate={summary.firstDate} />
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

      <Card>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Období">
          <span className="mr-1 text-muted">Období:</span>
          {PERIOD_PRESETS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={periodId === p.id}
              onClick={() => setPeriodId(p.id)}
              className={chipClass(periodId === p.id)}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-border" />
          {years.map((y) => (
            <button
              key={y}
              role="radio"
              aria-checked={periodId === `Y${y}`}
              onClick={() => setPeriodId(`Y${y}`)}
              className={chipClass(periodId === `Y${y}`)}
            >
              {y}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Vlastní:</span>
          <input
            type="date"
            aria-label="Od data"
            value={
              periodId === 'CUSTOM' ? (custom?.from ?? period.from) : (result?.from ?? period.from)
            }
            min={first}
            max={last}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-[7px] border bg-surface-2 px-2 py-1"
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            aria-label="Do data"
            value={periodId === 'CUSTOM' ? (custom?.to ?? period.to) : (result?.to ?? period.to)}
            min={first}
            max={last}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-[7px] border bg-surface-2 px-2 py-1"
          />
          {result && (
            <span className="ml-auto text-muted">
              Počítáno {formatDate(result.from)} – {formatDate(result.to)} (
              {monthsLabel(result.days)})
            </span>
          )}
        </div>
      </Card>

      {!result ? (
        <Card>
          <div className="py-8 text-center text-muted">
            Pro toto období nejsou data (vyber delší období nebo jiné datum).
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4">
            <Kpi
              title={<Tip text={HELP_TTWROR}>TTWROR</Tip>}
              value={pctFmt(result.ttwror)}
              tone={toneClass(result.ttwror ?? 0)}
              sub={
                result.ttwrorAnnual !== null
                  ? `ročně ≈ ${formatPercent(result.ttwrorAnnual, 1)}`
                  : `za ${monthsLabel(result.days)}`
              }
            />
            <Kpi
              title={<Tip text={HELP_IRR}>IRR p.a.</Tip>}
              value={result.irr === null ? '–' : formatPercent(result.irr, 1)}
              tone={toneClass(result.irr ?? 0)}
              sub={
                result.days < 365
                  ? 'přepočet na rok – u krátkých období zavádějící'
                  : 'peněžně vážený'
              }
            />
            <Kpi
              title="Absolutní zisk"
              value={signed(result.profit)}
              tone={toneClass(result.profit)}
              sub="za období"
            />
            <Kpi
              title="Vloženo za období"
              value={money(result.netFlow)}
              sub={
                result.startValue > 0
                  ? `na začátku už ${money(result.startValue)}`
                  : `od ${formatDate(result.from)}`
              }
            />
          </div>

          <div className="grid grid-cols-[3fr_2fr] gap-4">
            <Card title="Kumulativní výkon (TTWROR)">
              {option && (
                <EChart
                  option={option}
                  height={300}
                  ariaLabel="Graf kumulativního výkonu portfolia v čase"
                />
              )}
            </Card>
            <Card title="Po letech" className="!pb-2">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    {['Rok', 'Zisk', 'TTWROR', 'IRR'].map((h, i) => (
                      <th
                        key={h}
                        className={`border-b px-2 py-1.5 font-semibold ${i ? 'text-right' : ''}`}
                      >
                        {h === 'TTWROR' ? (
                          <Tip text={HELP_TTWROR}>{h}</Tip>
                        ) : h === 'IRR' ? (
                          <Tip text={HELP_IRR}>{h}</Tip>
                        ) : (
                          h
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {yearRows.map(({ year, result: r }) => (
                    <tr
                      key={year}
                      onClick={() => setPeriodId(`Y${year}`)}
                      className={`cursor-pointer hover:bg-surface-2 ${periodId === `Y${year}` ? 'bg-surface-2' : ''}`}
                    >
                      <td className="border-b px-2 py-2 font-semibold">
                        {year}
                        {r && r.from.slice(0, 4) === String(year) && r.startValue === 0 && (
                          <span className="block text-xs font-normal whitespace-nowrap text-muted">
                            od {formatDate(r.from)}
                          </span>
                        )}
                      </td>
                      <td
                        className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(r?.profit ?? 0)}`}
                      >
                        {r ? signed(r.profit) : '–'}
                      </td>
                      <td className={`border-b px-2 py-2 text-right ${toneClass(r?.ttwror ?? 0)}`}>
                        {pctFmt(r?.ttwror ?? null)}
                      </td>
                      <td className={`border-b px-2 py-2 text-right ${toneClass(r?.irr ?? 0)}`}>
                        {r?.irr == null ? '–' : formatPercent(r.irr, 1, true)}
                      </td>
                    </tr>
                  ))}
                  {total && (
                    <tr
                      onClick={() => setPeriodId('MAX')}
                      className="cursor-pointer font-semibold hover:bg-surface-2"
                    >
                      <td className="px-2 py-2">Celkem</td>
                      <td
                        className={`px-2 py-2 text-right whitespace-nowrap ${toneClass(total.profit)}`}
                      >
                        {signed(total.profit)}
                      </td>
                      <td className={`px-2 py-2 text-right ${toneClass(total.ttwror ?? 0)}`}>
                        {pctFmt(total.ttwror)}
                      </td>
                      <td className={`px-2 py-2 text-right ${toneClass(total.irr ?? 0)}`}>
                        {total.irr == null ? '–' : formatPercent(total.irr, 1, true)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">
                Kliknutím na řádek se zvolí dané období. IRR u neúplného roku je přepočtené na rok.
              </p>
            </Card>
          </div>

          <RiskCard curve={result.curve} />

          {calc && (
            <BenchmarkCard
              series={calc.series}
              nominalSeries={calc.nominalSeries}
              deflate={calc.real ? (currency === 'CZK' ? inflation.czk : inflation.eur) : null}
              currency={currency}
              from={period.from}
              to={period.to}
            />
          )}

          <Card title="Jak to číst">
            <div className="grid grid-cols-3 gap-6 text-[13px] leading-relaxed text-muted">
              <p>
                <b className="text-fg">TTWROR</b> ukazuje, jak si vedla samotná investice, bez
                ohledu na to, kdy jsi přidával peníze. Dává stejný výsledek, ať vložíš všechno naráz
                nebo po částech.
              </p>
              <p>
                <b className="text-fg">IRR p.a.</b> ukazuje, kolik % ročně vydělaly tvoje skutečné
                peníze. Pokud jsi investoval těsně před růstem, vyjde víc než TTWROR, pokud těsně
                před propadem, méně.
              </p>
              <p>
                <b className="text-fg">Absolutní zisk</b> je konečná hodnota − hodnota na začátku −
                čisté vklady za období. Dividendy z VUSA zatím v datech chybí, zisk je proto mírně
                podhodnocený.
              </p>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
