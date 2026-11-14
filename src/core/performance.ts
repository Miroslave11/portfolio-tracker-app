import { addDays, addMonths, daysBetween } from './date'
import { yearsBack } from './chart-range'
import type { SeriesPoint } from './portfolio-calc'

/** Jeden den pro výpočet výkonu: hodnota portfolia na konci dne a vklad (+) / výběr (−) toho dne. */
export interface PerfPoint {
  date: string
  value: number
  flow: number
}

export interface CurvePoint {
  date: string
  /** Kumulativní TTWROR od začátku období (0,12 = +12 %). */
  pct: number
}

export interface PerfResult {
  /** Skutečné hranice období (začátek je případně zkrácen na první den dat). */
  from: string
  to: string
  days: number
  /** Hodnota portfolia na začátku období (0, pokud období začíná prvním vkladem). */
  startValue: number
  endValue: number
  /** Vklady minus výběry v období. */
  netFlow: number
  /** Absolutní zisk = konec − začátek − čisté vklady. */
  profit: number
  /** Časově vážený výnos za celé období (0,184 = +18,4 %). */
  ttwror: number | null
  /** TTWROR přepočtený na rok (jen pro období od 1 roku, jinak `null`). */
  ttwrorAnnual: number | null
  /** Peněžně vážený roční výnos (XIRR); `null`, pokud ho nelze spočítat. */
  irr: number | null
  curve: CurvePoint[]
}

const EPS = 1e-9
const DAYS_PER_YEAR = 365

/** Z řady výpočtu portfolia udělá vstup pro výkon v dané měně; `null`, chybí-li kurzy ČNB. */
export function toPerfPoints(
  series: readonly SeriesPoint[],
  currency: 'EUR' | 'CZK'
): PerfPoint[] | null {
  const out: PerfPoint[] = []
  let prevInvested = 0
  for (const p of series) {
    const value = currency === 'CZK' ? p.valueCzk : p.value
    const invested = currency === 'CZK' ? p.investedCzk : p.invested
    if (value === null || invested === null) return null
    out.push({ date: p.date, value, flow: invested - prevInvested })
    prevInvested = invested
  }
  return out
}

/**
 * Roční výnos peněžních toků (XIRR): hledá sazbu r, pro kterou je součet toků
 * diskontovaných o (dny / 365) nulový. Vrací `null`, pokud řešení neexistuje.
 */
export function xirr(flows: readonly { date: string; amount: number }[]): number | null {
  if (flows.length < 2) return null
  if (!flows.some((f) => f.amount > 0) || !flows.some((f) => f.amount < 0)) return null
  const t0 = flows[0].date
  const npv = (rate: number): number =>
    flows.reduce(
      (sum, f) => sum + f.amount / Math.pow(1 + rate, daysBetween(t0, f.date) / DAYS_PER_YEAR),
      0
    )
  let lo = -0.999999
  let hi = 1000
  let fLo = npv(lo)
  const fHi = npv(hi)
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi) || fLo * fHi > 0) return null
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2
    const fMid = npv(mid)
    if (Math.abs(fMid) < 1e-9 || hi - lo < 1e-12) return mid
    if (fLo * fMid <= 0) hi = mid
    else {
      lo = mid
      fLo = fMid
    }
  }
  return (lo + hi) / 2
}

/** Index posledního bodu s datem ≤ `date`, jinak -1. */
function lastIndexAtOrBefore(points: readonly PerfPoint[], date: string): number {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid].date <= date) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return found
}

/**
 * Výkon portfolia za období (`from`, `to`]: TTWROR, IRR, absolutní zisk a křivka.
 *
 * Konvence: vklad/výběr se bere na konci dne, takže denní výnos je
 * (hodnota dne − tok dne) / hodnota předchozího dne − 1 (stejně jako v Portfolio Performance).
 * Začíná-li období dnem prvního vkladu nebo dříve, počítá se od nuly (první vklad je tok).
 */
export function computePerformance(
  points: readonly PerfPoint[],
  fromDate: string,
  toDate: string
): PerfResult | null {
  if (points.length === 0) return null
  const first = points[0].date
  const last = points[points.length - 1].date
  const to = toDate > last ? last : toDate
  const sinceStart = fromDate < first || fromDate === first
  const from = sinceStart ? first : fromDate
  if (to < from) return null

  // Hodnota na začátku období: poslední bod ≤ from (u „od začátku“ nula).
  let startValue = 0
  let startIdx = 0 // první den, jehož změna se do výkonu počítá
  if (!sinceStart) {
    const i = lastIndexAtOrBefore(points, from)
    if (i < 0) return null
    startValue = points[i].value
    startIdx = i + 1
  }

  let index = 1
  let prevValue = startValue
  let netFlow = 0
  let endValue = startValue
  const curve: CurvePoint[] = [{ date: from, pct: 0 }]
  const cashFlows: { date: string; amount: number }[] = []
  if (startValue > EPS) cashFlows.push({ date: from, amount: -startValue })

  for (let i = startIdx; i < points.length; i++) {
    const p = points[i]
    if (p.date > to) break
    if (prevValue > EPS) index *= (p.value - p.flow) / prevValue
    netFlow += p.flow
    if (Math.abs(p.flow) > EPS) cashFlows.push({ date: p.date, amount: -p.flow })
    prevValue = p.value
    endValue = p.value
    // U „od začátku“ je první den (index 1) výchozí bod křivky.
    if (curve.length === 1 && curve[0].date === p.date) curve[0] = { date: p.date, pct: index - 1 }
    else curve.push({ date: p.date, pct: index - 1 })
  }
  if (curve.length < 2) return null

  const toEff = curve[curve.length - 1].date
  const days = daysBetween(from, toEff)
  const profit = endValue - startValue - netFlow
  const ttwror = index - 1
  const ttwrorAnnual = days >= DAYS_PER_YEAR ? Math.pow(index, DAYS_PER_YEAR / days) - 1 : null

  cashFlows.push({ date: toEff, amount: endValue })
  cashFlows.sort((a, b) => a.date.localeCompare(b.date))
  const irr = days > 0 ? xirr(cashFlows) : null

  return {
    from,
    to: toEff,
    days,
    startValue,
    endValue,
    netFlow,
    profit,
    ttwror,
    ttwrorAnnual,
    irr,
    curve
  }
}

// ---------------------------------------------------------------------------
// Volba období
// ---------------------------------------------------------------------------

export const PERIOD_PRESETS = [
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1R', label: '1R' },
  { id: '3R', label: '3R' },
  { id: '5R', label: '5R' },
  { id: 'MAX', label: 'Max' }
] as const

/** `1M`, `3M`, `YTD`, `1R`, `3R`, `5R`, `MAX`, `Y2025` (kalendářní rok) nebo `CUSTOM`. */
export type PeriodId = string

export interface Period {
  from: string
  to: string
}

/** Převede volbu období na hranice `from` (konec předchozího dne) – `to`. */
export function resolvePeriod(
  id: PeriodId,
  firstDate: string,
  lastDate: string,
  custom?: { from: string; to: string }
): Period {
  const year = Number(lastDate.slice(0, 4))
  switch (id) {
    case '1M':
      return { from: addMonths(lastDate, -1), to: lastDate }
    case '3M':
      return { from: addMonths(lastDate, -3), to: lastDate }
    case 'YTD':
      return { from: `${year - 1}-12-31`, to: lastDate }
    case '1R':
      return { from: yearsBack(lastDate, 1), to: lastDate }
    case '3R':
      return { from: yearsBack(lastDate, 3), to: lastDate }
    case '5R':
      return { from: yearsBack(lastDate, 5), to: lastDate }
    case 'CUSTOM':
      return custom ? { from: custom.from, to: custom.to } : { from: firstDate, to: lastDate }
    default: {
      const m = /^Y(\d{4})$/.exec(id)
      if (m) {
        const y = Number(m[1])
        const end = `${y}-12-31`
        return { from: `${y - 1}-12-31`, to: end < lastDate ? end : lastDate }
      }
      return { from: addDays(firstDate, -1), to: lastDate }
    }
  }
}

export interface YearRow {
  year: number
  result: PerfResult | null
}

/** Výkon po kalendářních letech od prvního roku dat do posledního. */
export function performanceByYear(points: readonly PerfPoint[]): YearRow[] {
  if (points.length === 0) return []
  const first = Number(points[0].date.slice(0, 4))
  const last = Number(points[points.length - 1].date.slice(0, 4))
  const rows: YearRow[] = []
  for (let y = first; y <= last; y++) {
    const p = resolvePeriod(`Y${y}`, points[0].date, points[points.length - 1].date)
    rows.push({ year: y, result: computePerformance(points, p.from, p.to) })
  }
  return rows
}
