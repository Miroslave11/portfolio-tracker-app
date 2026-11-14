export type ChartRange = '1R' | '3R' | '5R' | 'MAX'

export const CHART_RANGES: { id: ChartRange; label: string; years: number | null }[] = [
  { id: '1R', label: '1R', years: 1 },
  { id: '3R', label: '3R', years: 3 },
  { id: '5R', label: '5R', years: 5 },
  { id: 'MAX', label: 'Max', years: null }
]

/** Datum o `years` let dříve (29. 2. se zkrátí na 28. 2.). */
export function yearsBack(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y - years, m - 1, d))
  // Přetečení (29. 2. v nepřestupném roce) vrátí zpět na poslední den měsíce.
  if (date.getUTCMonth() !== m - 1) date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

/** Ponechá body od data (konec − rozsah) výše; `MAX` vrací všechno. */
export function sliceByRange<T extends { date: string }>(
  series: readonly T[],
  range: ChartRange
): T[] {
  const years = CHART_RANGES.find((r) => r.id === range)?.years ?? null
  if (years === null || series.length === 0) return series.slice()
  const from = yearsBack(series[series.length - 1].date, years)
  return series.filter((p) => p.date >= from)
}
