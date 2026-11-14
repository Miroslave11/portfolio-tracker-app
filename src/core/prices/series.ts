import type { PricePoint, PriceSeries } from '../../shared/prices'

/** Sloučí staré a nové body podle data (nové mají přednost) a seřadí je. */
export function mergePoints(
  existing: readonly PricePoint[],
  incoming: readonly PricePoint[]
): PricePoint[] {
  const byDate = new Map<string, number>(existing)
  for (const [date, value] of incoming) byDate.set(date, value)
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export interface LatestQuote {
  price: number
  date: string
  previousPrice: number | null
  /** Změna proti předchozímu obchodnímu dni v procentech. */
  changePct: number | null
}

/** Poslední známý kurz a jeho změna proti předchozímu dni. */
export function latestQuote(series: Pick<PriceSeries, 'prices'> | undefined): LatestQuote | null {
  const prices = series?.prices
  if (!prices || prices.length === 0) return null
  const [date, price] = prices[prices.length - 1]
  const previous = prices.length > 1 ? prices[prices.length - 2][1] : null
  return {
    price,
    date,
    previousPrice: previous,
    changePct: previous ? (price / previous - 1) * 100 : null
  }
}
