import type { PricePoint } from '../../shared/prices'

export function cnbYearUrl(year: number): string {
  return (
    'https://www.cnb.cz/en/financial-markets/foreign-exchange-market/' +
    `central-bank-exchange-rate-fixing/central-bank-exchange-rate-fixing/year.txt?year=${year}`
  )
}

/**
 * Přečte roční soubor kurzů ČNB (`Date|1 AUD|1 EUR|100 HUF|…`) a vrátí kurz
 * jedné měny za 1 jednotku v Kč. Sloupce se v průběhu let mění (některé měny
 * přibývají a ubývají), proto se sloupec hledá podle názvu, ne podle pozice.
 */
export function parseCnbYear(text: string, currency: string): PricePoint[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length === 0) throw new Error('Soubor ČNB je prázdný')

  const header = lines[0].split('|').map((h) => h.trim())
  let column = -1
  let amount = 1
  header.forEach((h, i) => {
    const m = /^(\d+)\s+([A-Z]{3})$/.exec(h)
    if (m && m[2] === currency) {
      column = i
      amount = Number(m[1])
    }
  })
  if (column < 0) throw new Error(`V souboru ČNB chybí měna ${currency}`)

  const points: PricePoint[] = []
  for (const line of lines.slice(1)) {
    const cells = line.split('|')
    const date = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(cells[0]?.trim() ?? '')
    const rate = Number((cells[column] ?? '').trim().replace(',', '.'))
    if (!date || !(rate > 0)) continue
    points.push([`${date[3]}-${date[2]}-${date[1]}`, rate / amount])
  }
  return points.sort(([a], [b]) => a.localeCompare(b))
}
