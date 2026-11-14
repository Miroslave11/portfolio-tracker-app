import { useMemo } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { formatDate, formatMonth } from '../../../core/date'
import { formatDuration } from '../../../core/goal-projection'
import { formatPercent } from '../../../core/money'
import type { CurvePoint } from '../../../core/performance'
import { computeRisk, type DrawdownEpisode } from '../../../core/risk'
import { type ChartColors, useChartColors } from '../chartColors'
import { Card } from './Card'
import { EChart } from './EChart'
import { Tip } from './Kpi'

const HELP_DD =
  'Největší propad: o kolik procent kleslo portfolio (bez vlivu vkladů) z nejvyššího bodu, než se znovu zvedlo.'
const HELP_REC = 'Doba zotavení: jak dlouho trvalo, než se výkon ze dna vrátil na předchozí vrchol.'
const HELP_VOL =
  'Volatilita: typická roční kolísavost výkonu (směrodatná odchylka měsíčních výnosů přepočtená na rok). Čím vyšší, tím divočejší jízda.'

function duration(days: number | null): string {
  if (days === null) return '–'
  if (days < 31) return `${days} ${days === 1 ? 'den' : days <= 4 ? 'dny' : 'dní'}`
  return formatDuration(Math.max(1, Math.round(days / 30.44)))
}

function buildOption(points: { date: string; dd: number }[], c: ChartColors): EChartsCoreOption {
  const byDate = new Map(points.map((p) => [p.date, p.dd]))
  const min = Math.min(...points.map((p) => p.dd))
  return {
    animationDuration: 600,
    grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        // Hodnota z vlastních dat podle data (viz tooltip grafu na Přehledu).
        const date = params[0]?.data[0] ?? ''
        const dd = byDate.get(date)
        if (dd === undefined) return ''
        return `<b>${formatDate(date)}</b><br/>Pod vrcholem: <b style="color:${dd < 0 ? c.neg : c.text}">${formatPercent(dd, 1)}</b>`
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
      max: 0,
      // Spodní hranice zaokrouhlená na 5 %.
      min: Math.min(-0.05, Math.floor(min * 1.1 * 20) / 20),
      axisLabel: { color: c.muted, formatter: (v: number) => `${Math.round(v * 100)} %` },
      splitLine: { lineStyle: { color: c.border } }
    },
    dataZoom: [{ type: 'inside', filterMode: 'none' }],
    series: [
      {
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 1.6, color: c.neg },
        itemStyle: { color: c.neg },
        areaStyle: { color: `${c.neg}40`, origin: 'auto' },
        data: points.map((p) => [p.date, p.dd])
      }
    ]
  }
}

function Metric({
  title,
  value,
  sub,
  tone = ''
}: {
  title: React.ReactNode
  value: string
  sub: string
  tone?: string
}): React.JSX.Element {
  return (
    <div className="rounded-xl bg-surface-2 px-4 py-3">
      <div className="text-xs font-semibold tracking-[.04em] text-muted uppercase">{title}</div>
      <div className={`mt-1 text-[22px] font-bold tracking-tight ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  )
}

function episodeLabel(e: DrawdownEpisode): string {
  return `${formatMonth(e.peakDate)} → ${formatMonth(e.troughDate)}`
}

/** Karta „Riziko“ na obrazovce Výkon – počítá se z křivky výkonu zvoleného období. */
export function RiskCard({ curve }: { curve: CurvePoint[] }): React.JSX.Element {
  const colors = useChartColors()
  const risk = useMemo(() => computeRisk(curve), [curve])
  const option = useMemo(
    () => (risk.drawdown.length > 1 ? buildOption(risk.drawdown, colors) : null),
    [risk, colors]
  )
  const max = risk.maxDrawdown

  return (
    <Card title="Riziko ve zvoleném období">
      <div className="grid grid-cols-4 gap-3">
        <Metric
          title={<Tip text={HELP_DD}>Největší propad</Tip>}
          value={max ? formatPercent(max.depth, 1) : '0 %'}
          tone={max ? 'text-neg' : ''}
          sub={max ? episodeLabel(max) : 'v období žádný pokles'}
        />
        <Metric
          title={<Tip text={HELP_REC}>Doba zotavení</Tip>}
          value={max ? (max.recoveryDate ? duration(max.recoveryDays) : 'zatím ne') : '–'}
          sub={
            max
              ? max.recoveryDate
                ? `dno ${formatMonth(max.troughDate)} → vrchol ${formatMonth(max.recoveryDate)}`
                : `teď ${formatPercent(risk.currentDrawdown, 1)} pod vrcholem`
              : '–'
          }
        />
        <Metric
          title={<Tip text={HELP_VOL}>Volatilita (roční)</Tip>}
          value={risk.volatility === null ? '–' : formatPercent(risk.volatility, 1)}
          sub={
            risk.volatility === null
              ? 'málo dat (aspoň 3 měsíce)'
              : `z ${risk.months} měsíčních výnosů`
          }
        />
        <Metric
          title="Nejhorší měsíc / rok"
          value={risk.worstMonth ? formatPercent(risk.worstMonth.ret, 1) : '–'}
          tone={risk.worstMonth && risk.worstMonth.ret < 0 ? 'text-neg' : ''}
          sub={
            risk.worstMonth
              ? `${formatMonth(risk.worstMonth.key)}${
                  risk.worstYear
                    ? ` · rok ${risk.worstYear.key}: ${formatPercent(risk.worstYear.ret, 1)}`
                    : ''
                }`
              : '–'
          }
        />
      </div>

      <div className="mt-4 grid grid-cols-[3fr_2fr] gap-4">
        <div>
          <div className="mb-1 text-xs text-muted">Propad od vrcholu (bez vlivu vkladů)</div>
          {option ? (
            <EChart option={option} height={220} ariaLabel="Graf propadu výkonu od vrcholu" />
          ) : (
            <p className="py-8 text-center text-muted">Málo dat.</p>
          )}
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">Největší propady</div>
          {risk.episodes.length === 0 ? (
            <p className="py-6 text-center text-muted">Žádný propad větší než 2 %.</p>
          ) : (
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="border-b px-2 py-1.5 font-semibold">Vrchol</th>
                  <th className="border-b px-2 py-1.5 font-semibold">Dno</th>
                  <th className="border-b px-2 py-1.5 text-right font-semibold">Propad</th>
                  <th className="border-b px-2 py-1.5 text-right font-semibold">Zotavení</th>
                </tr>
              </thead>
              <tbody>
                {risk.episodes.map((e) => (
                  <tr key={e.peakDate} className="hover:bg-surface-2">
                    <td className="border-b px-2 py-2">{formatMonth(e.peakDate)}</td>
                    <td className="border-b px-2 py-2">{formatMonth(e.troughDate)}</td>
                    <td className="border-b px-2 py-2 text-right text-neg">
                      {formatPercent(e.depth, 1)}
                    </td>
                    <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                      {e.recoveryDate ? duration(e.recoveryDays) : 'probíhá'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Card>
  )
}
