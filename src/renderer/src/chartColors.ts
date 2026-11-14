import { useEffect, useState } from 'react'

export interface ChartColors {
  text: string
  muted: string
  border: string
  surface: string
  accent: string
  pos: string
  neg: string
}

function readColors(): ChartColors {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string): string => css.getPropertyValue(name).trim()
  return {
    text: v('--text'),
    muted: v('--muted'),
    border: v('--border'),
    surface: v('--surface'),
    accent: v('--accent'),
    pos: v('--pos'),
    neg: v('--neg')
  }
}

/**
 * Barvy motivu pro grafy. Motiv se nastavuje atributem/stylem na <html> až po prvním
 * vykreslení, proto se jeho změny sledují a barvy se po nich načtou znovu.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readColors)
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style']
    })
    return () => observer.disconnect()
  }, [])
  return colors
}
