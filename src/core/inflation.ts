import type { CalcResult, SeriesPoint } from './portfolio-calc'
import type { CpiPoint } from './prices/hicp'

/**
 * Funkce, která převede částku z daného dne na dnešní ceny:
 * index (poslední zveřejněný měsíc) / index (měsíc dne). Měsíce po posledním zveřejněném
 * mají koeficient 1, dny před začátkem řady používají první dostupný měsíc.
 */
export type Deflator = (date: string) => number

export function makeDeflator(cpi: readonly CpiPoint[]): Deflator | null {
  if (cpi.length === 0) return null
  const latest = cpi[cpi.length - 1][1]
  const byMonth = new Map(cpi)
  const first = cpi[0]
  const lastMonth = cpi[cpi.length - 1][0]
  const cache = new Map<string, number>()
  return (date) => {
    const month = date.slice(0, 7)
    const hit = cache.get(month)
    if (hit !== undefined) return hit
    let index: number
    if (month >= lastMonth) index = latest
    else if (month < first[0]) index = first[1]
    else {
      // chybějící měsíc uprostřed → poslední dostupný před ním
      index = byMonth.get(month) ?? cpi.filter((p) => p[0] < month).at(-1)![1]
    }
    const factor = latest / index
    cache.set(month, factor)
    return factor
  }
}

/** Průměrná roční inflace mezi dvěma měsíci (z indexu); `null`, chybí-li data. */
export function averageInflation(cpi: readonly CpiPoint[], fromDate: string): number | null {
  if (cpi.length < 2) return null
  const from = fromDate.slice(0, 7)
  const start = cpi.find((p) => p[0] >= from) ?? cpi[0]
  const end = cpi[cpi.length - 1]
  const [y1, m1] = start[0].split('-').map(Number)
  const [y2, m2] = end[0].split('-').map(Number)
  const months = (y2 - y1) * 12 + (m2 - m1)
  if (months <= 0) return null
  return Math.pow(end[1] / start[1], 12 / months) - 1
}

/** Reálný výnos: (1 + nominální) / (1 + inflace) − 1. */
export function realRate(nominal: number, inflation: number): number {
  return (1 + nominal) / (1 + inflation) - 1
}

/**
 * Přepočte výsledek výpočtu portfolia na dnešní ceny: hodnota každého dne × koeficient dne,
 * vloženo = součet vkladů přepočtených koeficientem ke dni vkladu (dřívější vklady „vážily“ víc).
 * EUR se přepočítává inflací eurozóny, Kč inflací ČR. Pozice a změna za den se nemění.
 */
export function deflateCalc(
  calc: CalcResult,
  eur: Deflator | null,
  czk: Deflator | null
): CalcResult {
  if (!calc.summary || (!eur && !czk)) return calc
  let investedEur = 0
  let investedCzk = 0
  let prevEur = 0
  let prevCzk = 0
  const series: SeriesPoint[] = calc.series.map((p) => {
    const fe = eur ? eur(p.date) : 1
    const fc = czk ? czk(p.date) : 1
    investedEur += (p.invested - prevEur) * fe
    prevEur = p.invested
    let realInvestedCzk: number | null = null
    if (p.investedCzk !== null) {
      investedCzk += (p.investedCzk - prevCzk) * fc
      prevCzk = p.investedCzk
      realInvestedCzk = investedCzk
    }
    return {
      date: p.date,
      value: p.value * fe,
      invested: eur ? investedEur : p.invested,
      valueCzk: p.valueCzk === null ? null : p.valueCzk * fc,
      investedCzk: czk ? realInvestedCzk : p.investedCzk
    }
  })
  const last = series[series.length - 1]
  const s = calc.summary
  const profit = last.value - last.invested
  return {
    series,
    summary: {
      ...s,
      value: last.value,
      invested: last.invested,
      profit,
      profitPct: last.invested > 0 ? profit / last.invested : null,
      valueCzk: last.valueCzk,
      investedCzk: last.investedCzk,
      profitCzk:
        last.valueCzk !== null && last.investedCzk !== null
          ? last.valueCzk - last.investedCzk
          : null
    }
  }
}
