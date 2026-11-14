import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, PartyPopper } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import { addMonths, formatDate, formatMonthLong, todayIso } from '../../../core/date'
import {
  formatDuration,
  projectSeries,
  scenarios,
  type GoalScenario
} from '../../../core/goal-projection'
import { calculateInvestments } from '../../../core/investments'
import { formatMoney, formatPercent } from '../../../core/money'
import { computePerformance, toPerfPoints } from '../../../core/performance'
import { deflateCalc, realRate } from '../../../core/inflation'
import { calculatePortfolio } from '../../../core/portfolio-calc'
import { computeRisk } from '../../../core/risk'
import { parseNumber } from '../../../core/trade-math'
import { DEFAULT_FUTURE_INFLATION, type Goal } from '../../../shared/settings'
import { type ChartColors, useChartColors } from '../chartColors'
import { Card } from '../components/Card'
import { EChart } from '../components/EChart'
import { Kpi } from '../components/Kpi'
import { MonteCarloCard } from '../components/MonteCarloCard'
import { RealModeBanner } from '../components/RealModeBanner'
import { WithdrawalCard } from '../components/WithdrawalCard'
import { useApp } from '../store'
import { useInflation } from '../useCalc'

const SAVE_DELAY_MS = 500

/** 5000000 → „5 000 000“ (s nezlomitelnými mezerami; `parseNumber` je zvládne přečíst). */
function formatThousands(n: number): string {
  return n.toLocaleString('cs-CZ')
}

function compactCzk(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. Kč`
  if (abs >= 1e3) return `${Math.round(value / 1e3)} tis. Kč`
  return `${Math.round(value)} Kč`
}

interface ChartInput {
  actual: [string, number][]
  /** Projekce pro tři scénáře (měsíční body od dneška, v Kč). */
  projections: { scenario: GoalScenario; points: [string, number][] }[]
  target: number
  today: string
}

function buildOption(input: ChartInput, c: ChartColors): EChartsCoreOption {
  const { actual, projections, target, today } = input
  const actualByDate = new Map(actual)
  const base = projections.find((p) => p.scenario.id === 'base')!
  const endDate = projections.reduce(
    (max, p) => (p.points[p.points.length - 1][0] > max ? p.points[p.points.length - 1][0] : max),
    base.points[base.points.length - 1][0]
  )
  const startDate = actual[0]?.[0] ?? today
  const money = (v: number): string => formatMoney(v, 'CZK', 0)

  /** Hodnota projekce nejbližší danému dni (body jsou po měsících), jinak `null`. */
  const nearest = (points: [string, number][], iso: string): number | null => {
    const t = Date.parse(iso)
    let best: [string, number] | null = null
    let bestDiff = Infinity
    for (const p of points) {
      const diff = Math.abs(Date.parse(p[0]) - t)
      if (diff < bestDiff) {
        bestDiff = diff
        best = p
      }
    }
    return best && bestDiff <= 16 * 86_400_000 ? best[1] : null
  }

  return {
    animationDuration: 700,
    grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { axisValue: number }[]) => {
        // Hodnoty se berou z vlastních dat podle data (viz tooltip grafu na Přehledu).
        const iso = new Date(params[0]?.axisValue ?? 0).toISOString().slice(0, 10)
        const lines: string[] = [`<b>${formatDate(iso)}</b>`]
        const real = actualByDate.get(iso)
        if (real !== undefined) lines.push(`Skutečnost: <b>${money(real)}</b>`)
        for (const p of projections) {
          if (iso < today) continue
          const v = nearest(p.points, iso)
          if (v !== null) {
            lines.push(
              `${p.scenario.label} (${formatPercent(p.scenario.annualReturn, 1)}): ${money(v)}`
            )
          }
        }
        lines.push(`Cíl: ${money(target)}`)
        return lines.join('<br/>')
      }
    },
    xAxis: {
      type: 'time',
      min: startDate,
      max: endDate,
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
      max: Math.max(target * 1.1, 0),
      axisLabel: { color: c.muted, formatter: compactCzk },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        name: 'Skutečnost',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.4, color: c.accent },
        itemStyle: { color: c.accent },
        areaStyle: { color: `${c.accent}26` },
        data: actual
      },
      ...projections.map((p) => ({
        name: p.scenario.label,
        type: 'line',
        showSymbol: false,
        silent: true,
        lineStyle:
          p.scenario.id === 'base'
            ? { width: 2.2, type: 'dashed', color: c.accent }
            : { width: 1.3, type: 'dotted', color: c.muted },
        itemStyle: { color: p.scenario.id === 'base' ? c.accent : c.muted },
        data: p.points
      })),
      {
        name: 'Cíl',
        type: 'line',
        showSymbol: false,
        silent: true,
        lineStyle: { width: 1.6, color: c.pos },
        itemStyle: { color: c.pos },
        data: [
          [startDate, target],
          [endDate, target]
        ]
      }
    ]
  }
}

function positiveNumber(text: string): number | null {
  const n = parseNumber(text)
  return n === null || n <= 0 ? null : n
}

export function GoalScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const savedGoal = useApp((s) => s.settings.goal)
  const updateSettings = useApp((s) => s.updateSettings)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const setScreen = useApp((s) => s.setScreen)
  const colors = useChartColors()

  // Posuvníky se mění okamžitě, na disk se ukládá až po chvíli klidu.
  const [goal, setGoal] = useState<Goal>(savedGoal)
  const [targetText, setTargetText] = useState(formatThousands(savedGoal.targetCzk))
  const lastSaved = useRef(savedGoal)
  useEffect(() => {
    if (JSON.stringify(goal) === JSON.stringify(lastSaved.current)) return
    const id = setTimeout(() => {
      lastSaved.current = goal
      void updateSettings({ goal })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [goal, updateSettings])

  // Cíl se počítá z celého portfolia, bez ohledu na filtr brokera nahoře.
  // V režimu „po inflaci“ je historie v dnešních cenách a projekce počítá s reálným výnosem.
  const inflation = useInflation()
  const real = inflation.active
  const calc = useMemo(() => {
    if (!portfolio) return null
    const nominal = calculatePortfolio({ portfolio, prices, accountIds: null })
    return real ? deflateCalc(nominal, inflation.eur, inflation.czk) : nominal
  }, [portfolio, prices, real, inflation.eur, inflation.czk])
  const futureInflation = goal.inflation ?? DEFAULT_FUTURE_INFLATION
  const effectiveReturn = real ? realRate(goal.annualReturn, futureInflation) : goal.annualReturn
  const summary = calc?.summary ?? null
  const today = todayIso()
  const rate = summary?.fxRate ?? null
  const valueEur = summary?.value ?? 0
  const valueCzk = summary?.valueCzk ?? null
  const targetEur = rate ? goal.targetCzk / rate : null

  const average12 = useMemo(
    () => (portfolio ? (calculateInvestments(portfolio, { asOf: today }).average12 ?? null) : null),
    [portfolio, today]
  )
  // Historický IRR a kolísavost (stejná jako na Výkonu → Riziko, za celé období).
  const history = useMemo(() => {
    if (!calc?.summary) return null
    const points = toPerfPoints(calc.series, 'EUR')
    return points ? computePerformance(points, calc.summary.firstDate, calc.summary.asOf) : null
  }, [calc])
  const irr = history?.irr ?? null
  const historicalVolatility = useMemo(
    () => (history ? computeRisk(history.curve).volatility : null),
    [history]
  )

  const result = useMemo(() => {
    if (!summary || rate === null || targetEur === null) return null
    const sc = scenarios(valueEur, goal.monthlyEur, effectiveReturn, targetEur, today)
    const base = sc.find((s) => s.id === 'base')!
    // Osa sahá do nejpozdějšího dosažitelného scénáře; každá křivka končí krátce po dosažení cíle.
    const reachable = sc.map((x) => x.months).filter((m): m is number => m !== null)
    const horizon = reachable.length > 0 ? Math.min(600, Math.max(...reachable) + 6) : 360
    const projections = sc.map((scenario) => {
      const values = projectSeries(valueEur, goal.monthlyEur, scenario.annualReturn, horizon)
      const hit = values.findIndex((v) => v >= targetEur)
      const end = hit === -1 ? values.length : Math.min(values.length, hit + 4)
      return {
        scenario,
        points: values
          .slice(0, end)
          .map((v, i): [string, number] => [addMonths(today, i), v * rate])
      }
    })
    const actual = (calc?.series ?? [])
      .filter((p) => p.valueCzk !== null)
      .map((p): [string, number] => [p.date, p.valueCzk!])
    return { sc, base, projections, actual }
  }, [summary, rate, targetEur, valueEur, goal.monthlyEur, effectiveReturn, today, calc])

  const option = useMemo(
    () =>
      result
        ? buildOption(
            {
              actual: result.actual,
              projections: result.projections,
              target: goal.targetCzk,
              today
            },
            colors
          )
        : null,
    [result, goal.targetCzk, today, colors]
  )

  if (!portfolio || !summary) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="text-lg font-semibold">Zatím není z čeho počítat</div>
          <p className="max-w-md text-muted">Naimportuj historii transakcí na obrazovce Obchody.</p>
          <button
            onClick={() => setScreen('transactions')}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          >
            Přejít na Obchody
          </button>
        </div>
      </Card>
    )
  }
  if (rate === null || valueCzk === null || !result) {
    return (
      <Card>
        <div className="py-10 text-center text-muted">
          Cíl je v Kč, ale kurz EUR/CZK z ČNB zatím není stažený. Počkej na stažení kurzů nebo je
          aktualizuj na obrazovce ETF a kurzy.
        </div>
      </Card>
    )
  }

  const progress = Math.min(1, valueCzk / goal.targetCzk)
  const reached = valueCzk >= goal.targetCzk
  const { base, sc } = result
  const tNum = positiveNumber(targetText)

  const commitTarget = (): void => {
    const n = parseNumber(targetText)
    if (n !== null && n >= 10_000 && n <= 1_000_000_000) {
      setGoal((g) => ({ ...g, targetCzk: Math.round(n) }))
      setTargetText(formatThousands(Math.round(n)))
    } else {
      setTargetText(formatThousands(goal.targetCzk))
    }
  }

  return (
    <div className="grid gap-4">
      <RealModeBanner firstDate={summary.firstDate} />
      {brokerFilter !== 'all' && (
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Cíl se počítá z celého portfolia, filtr brokera se tu neuplatňuje.
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <Kpi
          title="Aktuálně"
          value={formatMoney(valueCzk, 'CZK', 0)}
          sub={`${formatMoney(valueEur, 'EUR', 0)} · kurz ČNB ${rate.toFixed(2).replace('.', ',')}`}
        />
        <Kpi
          title="Cíl"
          value={formatMoney(goal.targetCzk, 'CZK', 0)}
          sub={`≈ ${formatMoney(targetEur!, 'EUR', 0)} při dnešním kurzu${real ? ' · v dnešních cenách' : ''}`}
        />
        <Kpi
          title="Odhad dosažení"
          value={
            reached ? 'Cíl splněn' : base.date ? formatMonthLong(base.date) : 'Za víc než 50 let'
          }
          tone={reached ? 'text-pos' : ''}
          sub={
            reached ? (
              <span className="flex items-center gap-1">
                <PartyPopper size={14} /> hodnota už cíl překonala
              </span>
            ) : base.months !== null ? (
              `za ${formatDuration(base.months)} (při ${formatPercent(effectiveReturn, 1)} ročně${real ? ' reálně' : ''})`
            ) : (
              'zvyš měsíční vklad nebo očekávaný výnos'
            )
          }
        />
      </div>

      <Card title="Postup k cíli">
        <div
          className="h-3.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 1000) / 10}
          aria-label="Postup k cíli"
        >
          <div
            className="h-full rounded-full bg-accent transition-all duration-700"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-muted">
          <b className="text-fg">{formatPercent(valueCzk / goal.targetCzk, 1)}</b> cíle · chybí{' '}
          {formatMoney(Math.max(0, goal.targetCzk - valueCzk), 'CZK', 0)}
        </div>
      </Card>

      <div className="grid grid-cols-[3fr_2fr] gap-4">
        <Card title="Projekce">
          {option && (
            <EChart
              option={option}
              height={340}
              ariaLabel="Graf skutečné hodnoty portfolia a projekce k cíli"
            />
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-accent" /> skutečnost
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-accent" /> projekce
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dotted border-muted" /> opatrně /
              optimisticky (±3 p. b.)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-pos" /> cíl
            </span>
          </div>
        </Card>

        <Card title="Předpoklady">
          <div className="grid gap-4 text-[13px]">
            <label className="grid gap-1 text-xs text-muted">
              Cíl (Kč)
              <input
                aria-label="Cíl v Kč"
                inputMode="numeric"
                value={targetText}
                onChange={(e) => setTargetText(e.target.value)}
                onBlur={commitTarget}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                className={`rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg ${
                  tNum === null ? 'border-neg' : ''
                }`}
              />
            </label>

            <div className="grid gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Měsíční vklad</span>
                <b>
                  {formatMoney(goal.monthlyEur, 'EUR', 0)}
                  <span className="ml-1 text-xs font-normal text-muted">
                    ≈ {formatMoney(goal.monthlyEur * rate, 'CZK', 0)}
                  </span>
                </b>
              </div>
              <input
                type="range"
                aria-label="Měsíční vklad"
                min={0}
                max={Math.max(10_000, Math.ceil(goal.monthlyEur / 1000) * 1000)}
                step={100}
                value={goal.monthlyEur}
                onChange={(e) => setGoal((g) => ({ ...g, monthlyEur: Number(e.target.value) }))}
                className="accent-[var(--accent)]"
              />
              {average12 !== null && average12 > 0 && (
                <button
                  onClick={() =>
                    setGoal((g) => ({ ...g, monthlyEur: Math.round(average12 / 10) * 10 }))
                  }
                  className="justify-self-start text-xs text-accent hover:underline"
                >
                  použít můj průměr za 12 měsíců ({formatMoney(average12, 'EUR', 0)})
                </button>
              )}
            </div>

            <div className="grid gap-1">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-muted">Očekávaný výnos p.a.</span>
                <b>{formatPercent(goal.annualReturn, 1)}</b>
              </div>
              <input
                type="range"
                aria-label="Očekávaný výnos ročně"
                min={0}
                max={0.15}
                step={0.005}
                value={goal.annualReturn}
                onChange={(e) =>
                  setGoal((g) => ({
                    ...g,
                    annualReturn: Math.round(Number(e.target.value) * 1000) / 1000
                  }))
                }
                className="accent-[var(--accent)]"
              />
            </div>

            {real && (
              <div className="grid gap-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-muted">Budoucí inflace p.a.</span>
                  <b>{formatPercent(futureInflation, 1)}</b>
                </div>
                <input
                  type="range"
                  aria-label="Budoucí inflace ročně"
                  min={0}
                  max={0.08}
                  step={0.005}
                  value={futureInflation}
                  onChange={(e) =>
                    setGoal((g) => ({
                      ...g,
                      inflation: Math.round(Number(e.target.value) * 1000) / 1000
                    }))
                  }
                  className="accent-[var(--accent)]"
                />
                <span className="text-xs text-muted">
                  Reálný výnos = (1 + {formatPercent(goal.annualReturn, 1)}) / (1 +{' '}
                  {formatPercent(futureInflation, 1)}) − 1 ={' '}
                  <b className="text-fg">{formatPercent(effectiveReturn, 1)}</b>
                </span>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Odhad podle výnosu
              </div>
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {sc.map((s) => (
                    <tr key={s.id} className={s.id === 'base' ? 'font-semibold' : 'text-muted'}>
                      <td className="border-b py-1.5">{s.label}</td>
                      <td className="border-b py-1.5 text-right">
                        {formatPercent(s.annualReturn, 1)}
                      </td>
                      <td className="border-b py-1.5 text-right whitespace-nowrap">
                        {s.date ? formatMonthLong(s.date) : '> 50 let'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted">
              {real
                ? 'V dnešních cenách: cíl i měsíční vklad mají dnešní kupní sílu, výnos je reálný (po odečtení inflace). Kurz EUR/CZK konstantní, bez daní; vklad se přičítá na konci měsíce.'
                : 'Zjednodušeno: konstantní výnos a kurz EUR/CZK, bez inflace a daní; vklad se přičítá na konci měsíce.'}
              {irr !== null && (
                <>
                  {' '}
                  Tvůj historický{real ? ' reálný' : ''} IRR je{' '}
                  <b className="text-fg">{formatPercent(irr, 1)}</b> – pro plánování doporučuji
                  konzervativnější odhad.
                </>
              )}
            </p>
          </div>
        </Card>
      </div>

      {!reached && targetEur !== null && (
        <MonteCarloCard
          start={valueEur}
          monthlyEur={goal.monthlyEur}
          annualReturn={effectiveReturn}
          targetEur={targetEur}
          targetCzk={goal.targetCzk}
          rate={rate}
          today={today}
          volatility={goal.volatility}
          historicalVolatility={historicalVolatility}
          onVolatility={(v) =>
            setGoal((g) => {
              const next = { ...g }
              if (v === undefined) delete next.volatility
              else next.volatility = v
              return next
            })
          }
          baseDate={base.date}
          real={real}
        />
      )}

      <WithdrawalCard goalCzk={goal.targetCzk} currentCzk={valueCzk} real={real} />
    </div>
  )
}
