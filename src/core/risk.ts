import { daysBetween } from './date'
import type { CurvePoint } from './performance'

/** Jeden propad: od vrcholu přes dno až po návrat na původní vrchol. */
export interface DrawdownEpisode {
  peakDate: string
  troughDate: string
  /** Den, kdy výkon poprvé znovu dosáhl vrcholu; `null` = ještě se nezotavil. */
  recoveryDate: string | null
  /** Hloubka propadu (−0,246 = −24,6 %). */
  depth: number
  /** Dní ode dna do zotavení; `null` = ještě se nezotavil. */
  recoveryDays: number | null
}

export interface PeriodReturn {
  /** „RRRR-MM“ u měsíce, „RRRR“ u roku. */
  key: string
  ret: number
}

export interface RiskResult {
  /** Propad od dosavadního vrcholu pro každý den (0 = na vrcholu). */
  drawdown: { date: string; dd: number }[]
  maxDrawdown: DrawdownEpisode | null
  /** Největší propady (nejhlubší první). */
  episodes: DrawdownEpisode[]
  /** Současný propad od vrcholu (0 = právě na vrcholu). */
  currentDrawdown: number
  /** Roční volatilita z měsíčních výnosů (směrodatná odchylka × √12); `null` = málo dat. */
  volatility: number | null
  worstMonth: PeriodReturn | null
  bestMonth: PeriodReturn | null
  worstYear: PeriodReturn | null
  months: number
}

export interface RiskOptions {
  /** Kolik největších propadů vrátit. */
  topN?: number
  /** Menší propady se do seznamu nezapočítávají (0,02 = 2 %). */
  minDepth?: number
}

/**
 * Riziková čísla z křivky kumulativního výkonu (TTWROR – bez vlivu vkladů).
 * Hodnota indexu v daný den = 1 + kumulativní výkon.
 */
export function computeRisk(curve: readonly CurvePoint[], options: RiskOptions = {}): RiskResult {
  const topN = options.topN ?? 4
  const minDepth = options.minDepth ?? 0.02
  const empty: RiskResult = {
    drawdown: [],
    maxDrawdown: null,
    episodes: [],
    currentDrawdown: 0,
    volatility: null,
    worstMonth: null,
    bestMonth: null,
    worstYear: null,
    months: 0
  }
  if (curve.length < 2) return empty

  const index = curve.map((p) => ({ date: p.date, v: 1 + p.pct }))

  // --- propady ---
  const drawdown: { date: string; dd: number }[] = []
  const episodes: DrawdownEpisode[] = []
  let peak = index[0]
  let trough = index[0]
  for (const p of index) {
    if (p.v >= peak.v) {
      if (trough.v < peak.v) {
        episodes.push({
          peakDate: peak.date,
          troughDate: trough.date,
          recoveryDate: p.date,
          depth: trough.v / peak.v - 1,
          recoveryDays: daysBetween(trough.date, p.date)
        })
      }
      peak = p
      trough = p
    } else if (p.v < trough.v) {
      trough = p
    }
    drawdown.push({ date: p.date, dd: p.v / peak.v - 1 })
  }
  if (trough.v < peak.v) {
    episodes.push({
      peakDate: peak.date,
      troughDate: trough.date,
      recoveryDate: null,
      depth: trough.v / peak.v - 1,
      recoveryDays: null
    })
  }
  const sorted = episodes.slice().sort((a, b) => a.depth - b.depth)

  // --- měsíční výnosy: poslední hodnota v měsíci vůči poslední hodnotě předchozího měsíce ---
  const monthEnd = new Map<string, number>()
  for (const p of index) monthEnd.set(p.date.slice(0, 7), p.v)
  const monthKeys = [...monthEnd.keys()]
  const monthly: PeriodReturn[] = []
  let prev = index[0].v // výchozí hodnota období
  for (const key of monthKeys) {
    const v = monthEnd.get(key)!
    if (prev > 0) monthly.push({ key, ret: v / prev - 1 })
    prev = v
  }
  // První měsíc je jen částečný (období začíná uprostřed měsíce), do statistik se nepočítá.
  const usable = monthly.length > 1 ? monthly.slice(1) : monthly
  let volatility: number | null = null
  if (usable.length >= 3) {
    const mean = usable.reduce((s, m) => s + m.ret, 0) / usable.length
    const variance = usable.reduce((s, m) => s + (m.ret - mean) ** 2, 0) / (usable.length - 1)
    volatility = Math.sqrt(variance) * Math.sqrt(12)
  }
  const byRet = usable.slice().sort((a, b) => a.ret - b.ret)

  // --- roky: poslední hodnota v roce vůči poslední hodnotě předchozího roku ---
  // Počítají se jen roky, které v období začínají už od 1. ledna (jinak by šlo o zlomek roku).
  const yearEnd = new Map<string, number>()
  for (const p of index) yearEnd.set(p.date.slice(0, 4), p.v)
  const yearly: PeriodReturn[] = []
  let prevY = index[0].v
  for (const [key, v] of yearEnd) {
    if (prevY > 0 && index[0].date <= `${Number(key) - 1}-12-31`)
      yearly.push({ key, ret: v / prevY - 1 })
    prevY = v
  }

  return {
    drawdown,
    maxDrawdown: sorted[0] ?? null,
    episodes: sorted.filter((e) => e.depth <= -minDepth).slice(0, topN),
    currentDrawdown: drawdown[drawdown.length - 1].dd,
    volatility,
    worstMonth: byRet[0] ?? null,
    bestMonth: byRet[byRet.length - 1] ?? null,
    worstYear: yearly.slice().sort((a, b) => a.ret - b.ret)[0] ?? null,
    months: usable.length
  }
}
