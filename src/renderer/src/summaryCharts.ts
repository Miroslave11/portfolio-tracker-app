import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import { formatDate } from '../../core/date'
import { formatMoney, formatPercent, formatSignedMoney } from '../../core/money'
import { kindOf } from '../../core/summary-month'
import type { MonthArticleFacts } from '../../shared/summary'
import type { ChartColors } from './chartColors'

/* Grafy článku Shrnutí portfolia: nastavení pro obrazovku i pro PDF (P28). */

const eur = (v: number, digits = 0): string => formatMoney(v, 'EUR', digits)
const signed = (v: number, digits = 0): string => formatSignedMoney(v, 'EUR', digits)
const SKY = '#0ea5e9'

// Grafy pro PDF se kreslí bez okna (SSR) jako SVG; ostatní součásti registruje EChart.tsx.
echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  SVGRenderer
])

export function courseOption(f: MonthArticleFacts, c: ChartColors): EChartsCoreOption {
  const valueOn = new Map(f.daily)
  const buysByDate = new Map<string, number>()
  for (const t of f.trades) {
    if (t.type === 'BUY') buysByDate.set(t.date, (buysByDate.get(t.date) ?? 0) + t.amount)
  }
  const buyPoints = [...buysByDate]
    .filter(([d]) => valueOn.has(d))
    .map(([d, amount]) => [d, valueOn.get(d)!, amount])
  const dd = f.drawdown && f.drawdown.pct <= -0.01 ? f.drawdown : null

  return {
    animationDuration: 600,
    grid: { left: 8, right: 20, top: 30, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { data: [string, number] }[]) => {
        const d = params[0]?.data[0]
        if (!d) return ''
        const bought = buysByDate.get(d)
        return (
          `<b>${formatDate(d)}</b><br/>Hodnota: <b>${eur(valueOn.get(d) ?? 0)}</b>` +
          (bought ? `<br/>Nákup: ${eur(bought)}` : '')
        )
      }
    },
    xAxis: {
      type: 'time',
      min: f.from,
      max: f.to,
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: {
        color: c.muted,
        formatter: (ms: number) => {
          const d = new Date(ms)
          // ECharts čte „2026-07-01“ jako místní půlnoc, proto místní (ne UTC) den a měsíc.
          return `${d.getDate()}. ${d.getMonth() + 1}.`
        }
      },
      splitLine: { show: false }
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: c.muted, formatter: (v: number) => eur(v) },
      splitLine: { lineStyle: { color: c.border } }
    },
    series: [
      {
        name: 'Hodnota',
        type: 'line',
        showSymbol: false,
        lineStyle: { width: 2.2, color: c.accent },
        itemStyle: { color: c.accent },
        data: f.daily,
        markArea: dd
          ? {
              silent: true,
              itemStyle: { color: `${c.neg}1f` },
              label: {
                show: true,
                position: 'insideTop',
                color: c.muted,
                formatter: `pokles ${formatPercent(dd.pct, 1, true)}`
              },
              data: [[{ xAxis: dd.from }, { xAxis: dd.to }]]
            }
          : undefined
      },
      {
        name: 'Nákupy',
        type: 'scatter',
        symbolSize: 11,
        itemStyle: { color: c.pos },
        // U delších období by popisky nákupů splývaly – částku ukáže tooltip.
        label: {
          show: kindOf(f) === 'month',
          position: 'top',
          color: c.muted,
          formatter: (p: { data: [string, number, number] }) => `nákup ${eur(p.data[2])}`
        },
        tooltip: { show: false },
        data: buyPoints
      }
    ]
  }
}

interface Step {
  label: string
  delta: number
  color: string
  total?: boolean
}

export function waterfallOption(f: MonthArticleFacts, c: ChartColors): EChartsCoreOption {
  const steps: Step[] = [{ label: 'Začátek', delta: f.valueStart, color: c.muted, total: true }]
  if (Math.abs(f.netDeposits) >= 0.5) {
    steps.push({
      label: f.netDeposits >= 0 ? 'Vklady' : 'Výběry',
      delta: f.netDeposits,
      color: SKY
    })
  }
  // Případné dividendy se nezobrazují zvlášť, jsou součástí změny cen.
  const prices = f.priceChange + f.dividends
  steps.push({ label: 'Změna cen', delta: prices, color: prices >= 0 ? c.pos : c.neg })
  if (f.fees > 0) steps.push({ label: 'Poplatky', delta: -f.fees, color: c.neg })
  steps.push({ label: 'Konec', delta: f.valueEnd, color: c.accent, total: true })

  let running = 0
  const bases: number[] = []
  const bars: { value: number; itemStyle: { color: string }; text: string }[] = []
  for (const s of steps) {
    if (s.total) {
      bases.push(0)
      bars.push({ value: s.delta, itemStyle: { color: s.color }, text: eur(s.delta) })
      running = s.delta
    } else {
      const next = running + s.delta
      bases.push(Math.min(running, next))
      bars.push({ value: Math.abs(s.delta), itemStyle: { color: s.color }, text: signed(s.delta) })
      running = next
    }
  }
  // Osa začíná kousek pod nejnižší úrovní, aby byly i malé změny vidět (první měsíc od nuly).
  const deltas = steps.map((s, i) => (s.total ? -1 : i)).filter((i) => i >= 0)
  const low = Math.min(f.valueStart, f.valueEnd, ...deltas.map((i) => bases[i]))
  const high = Math.max(f.valueStart, f.valueEnd, ...deltas.map((i) => bases[i] + bars[i].value))
  const span = Math.max(high - low, 1)
  // Zaokrouhlit na „hezké“ číslo podle velikosti rozdílů (např. 78 000 místo 78 496).
  const step = Math.pow(10, Math.floor(Math.log10(span)))
  const min = f.valueStart <= 0 ? 0 : Math.max(0, Math.floor((low - span * 0.6) / step) * step)

  return {
    animationDuration: 600,
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: steps.map((s) => s.label),
      axisLine: { lineStyle: { color: c.border } },
      axisLabel: { color: c.muted },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'value',
      min,
      axisLabel: { color: c.muted, formatter: (v: number) => eur(v) },
      splitLine: { lineStyle: { color: c.border } }
    },
    series: [
      {
        type: 'bar',
        stack: 'w',
        silent: true,
        itemStyle: { color: 'transparent' },
        data: bases
      },
      {
        type: 'bar',
        stack: 'w',
        barMaxWidth: 70,
        // Velmi malá změna (např. poplatek) by nebyla vidět – sloupek má aspoň tenkou čárku.
        barMinHeight: 2,
        itemStyle: { borderRadius: 4 },
        label: {
          show: true,
          position: 'top',
          color: c.text,
          fontWeight: 600,
          formatter: (p: { dataIndex: number }) => bars[p.dataIndex].text
        },
        data: bars.map(({ value, itemStyle }) => ({ value, itemStyle }))
      }
    ]
  }
}

/** Barvy grafů v PDF: vždy světlé (tiskne se na bílý papír), bez ohledu na motiv aplikace. */
export const PDF_CHART_COLORS: ChartColors = {
  text: '#1a1f36',
  muted: '#5b6485',
  border: '#d9deef',
  surface: '#ffffff',
  accent: '#6366f1',
  pos: '#15803d',
  neg: '#b91c1c'
}

/** Vykreslí graf bez okna do SVG a vrátí ho jako `data:` adresu obrázku pro PDF. */
function svgDataUri(option: EChartsCoreOption, width: number, height: number): string {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width, height })
  try {
    chart.setOption({ ...option, animation: false, backgroundColor: '#ffffff' })
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(chart.renderToSVGString())}`
  } finally {
    chart.dispose()
  }
}

/** Grafy článku (průběh období, rozklad změny) jako obrázky do PDF. */
export function articleChartImages(f: MonthArticleFacts): { course: string; waterfall: string } {
  return {
    course: svgDataUri(courseOption(f, PDF_CHART_COLORS), 900, 300),
    waterfall: svgDataUri(waterfallOption(f, PDF_CHART_COLORS), 900, 310)
  }
}
