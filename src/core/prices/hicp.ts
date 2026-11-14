/** Oblast pro inflaci: eurozóna (pro hodnoty v EUR) a Česko (pro hodnoty v Kč). */
export type InflationArea = 'EA' | 'CZ'
export const INFLATION_AREAS: readonly InflationArea[] = ['EA', 'CZ']

/** Měsíční index spotřebitelských cen: [„RRRR-MM“, hodnota indexu]. */
export type CpiPoint = [string, number]

/**
 * Adresa Eurostatu – harmonizovaný index spotřebitelských cen (HICP), celkový koš,
 * index 2015 = 100, měsíčně (datová sada prc_hicp_minr, ECOICOP 2).
 */
export function hicpUrl(area: InflationArea, sinceMonth: string): string {
  const params = new URLSearchParams({
    format: 'JSON',
    lang: 'EN',
    geo: area,
    coicop18: 'TOTAL',
    unit: 'I15',
    sinceTimePeriod: sinceMonth
  })
  return `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?${params}`
}

interface JsonStat {
  id?: unknown
  size?: unknown
  value?: unknown
  dimension?: Record<string, { category?: { index?: Record<string, number> } }>
}

/**
 * Převede odpověď Eurostatu (JSON-stat 2.0) na řadu [měsíc, index]. Všechny dimenze kromě
 * času musí mít jedinou hodnotu (jinak by šlo o jiný dotaz). Měsíce bez hodnoty se vynechají.
 */
export function parseHicp(json: unknown): CpiPoint[] {
  const j = json as JsonStat
  if (!j || !Array.isArray(j.id) || !Array.isArray(j.size) || !j.dimension || !j.value) {
    throw new Error('Inflace: neočekávaný formát odpovědi Eurostatu')
  }
  const ids = j.id as string[]
  const sizes = j.size as number[]
  const timePos = ids.indexOf('time')
  if (timePos === -1) throw new Error('Inflace: v odpovědi chybí časová osa')
  if (sizes.some((s, i) => i !== timePos && s !== 1)) {
    throw new Error('Inflace: odpověď obsahuje víc řad, než se čekalo')
  }
  const timeIndex = j.dimension.time?.category?.index
  if (!timeIndex) throw new Error('Inflace: v odpovědi chybí měsíce')
  const values = j.value as Record<string, unknown>
  const out: CpiPoint[] = []
  for (const [month, position] of Object.entries(timeIndex)) {
    const v = values[String(position)]
    if (typeof v === 'number' && Number.isFinite(v) && v > 0 && /^\d{4}-\d{2}$/.test(month)) {
      out.push([month, v])
    }
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}
