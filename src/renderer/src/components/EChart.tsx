import { useEffect, useRef } from 'react'
import { BarChart, LineChart, PieChart, ScatterChart } from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent
} from 'echarts/components'
import * as echarts from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  GridComponent,
  MarkAreaComponent,
  TooltipComponent,
  DataZoomComponent,
  CanvasRenderer
])

interface Props {
  option: EChartsCoreOption
  height?: number
  ariaLabel: string
}

/** Tenký obal kolem Apache ECharts (načítá jen použité části knihovny). */
export function EChart({ option, height = 320, ariaLabel }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const instance = echarts.init(el)
    chart.current = instance
    instance.setOption(option, { notMerge: true })
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(el)
    return () => {
      observer.disconnect()
      instance.dispose()
      chart.current = null
    }
    // Instance se vytváří jen jednou; změny `option` řeší následující efekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const first = useRef(true)
  useEffect(() => {
    // Úvodní vykreslení se animuje. Při změně období/měny/motivu se nová křivka vykreslí hned:
    // jinak by se stará křivka na zlomek vteřiny „přetvářela“ na novou a graf by se deformoval.
    if (first.current) {
      first.current = false
      return
    }
    chart.current?.setOption({ ...option, animationDurationUpdate: 0 }, { notMerge: true })
  }, [option])

  return <div ref={host} role="img" aria-label={ariaLabel} style={{ height, width: '100%' }} />
}
