import { MAX_MONTHS, monthlyRate } from './goal-projection'

/**
 * Monte Carlo projekce k cíli: tisíce možných vývojů s náhodným kolísáním trhu.
 *
 * Model: měsíční růstový faktor je log-normální, G = exp(N(m, s²)), kde s = roční
 * volatilita / √12 a m je zvolené tak, aby střední hodnota E[G] = 1 + měsíční výnos.
 * Průměr všech scénářů tak odpovídá deterministické projekci (P11) a při nulové
 * kolísavosti s ní splývá přesně. Vklad se přičítá na konci měsíce (stejně jako v P11).
 */

export interface MonteCarloInput {
  /** Dnešní hodnota. */
  start: number
  /** Měsíční vklad. */
  monthly: number
  /** Očekávaný (průměrný) roční výnos, 0,07 = 7 %. */
  annualReturn: number
  /** Roční volatilita (směrodatná odchylka), 0,15 = 15 %. */
  volatility: number
  target: number
  /** Počet simulací. */
  runs?: number
  /** Semínko generátoru – stejné vstupy dají vždy stejný výsledek. */
  seed?: number
  /** Nejdelší sledovaný horizont v měsících. */
  maxMonths?: number
}

export const PERCENTILES = [0.1, 0.25, 0.5, 0.75, 0.9] as const
export type PercentileBand = Record<'p10' | 'p25' | 'p50' | 'p75' | 'p90', number[]>

export interface MonteCarloResult {
  runs: number
  /** Kolik měsíců simulace pokrývá (index 0 = dnešek). */
  months: number
  /** Percentily hodnoty pro každý měsíc 0…months. */
  bands: PercentileBand
  /** Průměrná hodnota pro každý měsíc 0…months. */
  mean: number[]
  /**
   * Podíl scénářů, které cíle dosáhly nejpozději v daném měsíci (index = měsíc,
   * délka `months + 1`). Neklesající.
   */
  reachedBy: number[]
  /** Podíl scénářů, které cíle nedosáhly do konce simulace. */
  neverReached: number
}

/** Malý rychlý generátor (mulberry32) – opakovatelný podle semínka. */
export function makeRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Normální rozdělení N(0, 1) Box–Mullerem (bere obě hodnoty z dvojice). */
function makeNormal(random: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const s = spare
      spare = null
      return s
    }
    let u = 0
    while (u <= Number.EPSILON) u = random()
    const v = random()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
}

/** Hodnota percentilu `q` z vzestupně seřazeného pole (lineární interpolace). */
export function quantileSorted(sorted: ArrayLike<number>, q: number): number {
  const n = sorted.length
  if (n === 0) return NaN
  const pos = (n - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.min(n - 1, lo + 1)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function simulateGoal(input: MonteCarloInput): MonteCarloResult {
  const runs = Math.max(1, Math.round(input.runs ?? 5000))
  const maxMonths = Math.max(1, Math.round(input.maxMonths ?? MAX_MONTHS))
  const { start, monthly, target } = input
  const s = Math.max(0, input.volatility) / Math.sqrt(12)
  const m = Math.log(1 + monthlyRate(input.annualReturn)) - (s * s) / 2
  const normal = makeNormal(makeRandom(input.seed ?? 1))

  // Simuluje se po měsících pro všechny běhy naráz; skončí se 2 roky poté, co cíle dosáhlo
  // 90 % scénářů (dál už graf ani tabulka nic nového neukážou), nejpozději po `maxMonths`.
  const current = new Float64Array(runs).fill(start)
  const reached = new Uint8Array(runs)
  const column = new Float64Array(runs)
  const bands: PercentileBand = { p10: [], p25: [], p50: [], p75: [], p90: [] }
  const mean: number[] = []
  const reachedBy: number[] = []
  let hits = 0
  let at90 = -1
  let months = 0
  for (let i = 0; i <= maxMonths; i++) {
    let sum = 0
    for (let k = 0; k < runs; k++) {
      let v = current[k]
      if (i > 0) {
        v = v * Math.exp(m + s * normal()) + monthly
        current[k] = v
      }
      if (!reached[k] && v >= target) {
        reached[k] = 1
        hits++
      }
      sum += v
    }
    reachedBy.push(hits / runs)
    mean.push(sum / runs)
    column.set(current)
    column.sort()
    bands.p10.push(quantileSorted(column, 0.1))
    bands.p25.push(quantileSorted(column, 0.25))
    bands.p50.push(quantileSorted(column, 0.5))
    bands.p75.push(quantileSorted(column, 0.75))
    bands.p90.push(quantileSorted(column, 0.9))
    months = i
    if (at90 === -1 && hits / runs >= 0.9) at90 = i
    if (at90 !== -1 && i >= at90 + 24) break
  }
  const never = runs - hits

  return { runs, months, bands, mean, reachedBy, neverReached: never / runs }
}

/**
 * Index měsíce simulace, který připadá na konec roku `year` (měsíc i = dnešek + i měsíců).
 * Dnes 13. 11. 2026 → konec 2026 = 1 (13. 12.), konec 2027 = 13. Záporné = rok už skončil.
 */
export function monthIndexAtYearEnd(today: string, year: number): number {
  const [y, m] = today.split('-').map(Number)
  return (year - y) * 12 + (12 - m)
}

/** Šance, že je cíl splněný do konce roku; `null`, když rok leží mimo simulovaný horizont. */
export function probabilityByYearEnd(
  result: MonteCarloResult,
  today: string,
  year: number
): number | null {
  const i = monthIndexAtYearEnd(today, year)
  if (i < 0 || i >= result.reachedBy.length) return null
  return result.reachedBy[i]
}

/** První měsíc, kdy je cíl dosažený s pravděpodobností aspoň `p`; `null` = ani za horizont. */
export function monthAtProbability(result: MonteCarloResult, p: number): number | null {
  const i = result.reachedBy.findIndex((x) => x >= p - 1e-12)
  return i === -1 ? null : i
}
