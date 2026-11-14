import { addDays, addMonths, daysBetween } from './date'
import { perpetualMonthlyWithdrawal } from './withdrawal'

/** Výplata dividendy: [datum (ex-date), částka na 1 kus v měně fondu]. */
export type DividendEvent = [string, number]

export interface DividendStats {
  /** Součet výplat za posledních 12 měsíců (od poslední výplaty zpět). */
  ttm: number
  /** Dividendový výnos = ttm / dnešní kurz; `null` bez kurzu. */
  yield: number | null
  /** Průměrný roční růst dividend za 5 a 10 let (celé kalendářní roky); `null` = málo dat. */
  growth5: number | null
  growth10: number | null
  /** Poslední celý rok, ze kterého se růst počítá. */
  lastFullYear: number | null
  lastPayment: string | null
  /** Součty výplat po celých kalendářních letech. */
  years: { year: number; total: number }[]
}

/**
 * Okno „posledních 12 měsíců“: výplaty novější než poslední výplata − 350 dní.
 * U čtvrtletních výplat zachytí 4, u měsíčních 12, u ročních 1 (o rok starší už ne).
 */
const TTM_WINDOW_DAYS = 350

/** Statistiky z historie výplat; `asOf` určuje, který rok je ještě neúplný (dnes). */
export function dividendStats(
  events: readonly DividendEvent[],
  price: number | null,
  asOf: string
): DividendStats {
  const sorted = events.filter((e) => e[1] > 0).sort((a, b) => a[0].localeCompare(b[0]))
  const empty: DividendStats = {
    ttm: 0,
    yield: null,
    growth5: null,
    growth10: null,
    lastFullYear: null,
    lastPayment: null,
    years: []
  }
  if (sorted.length === 0) return empty

  const lastPayment = sorted[sorted.length - 1][0]
  const from = addDays(lastPayment, -TTM_WINDOW_DAYS)
  const ttm = sorted.filter((e) => e[0] > from).reduce((s, e) => s + e[1], 0)

  // Celé roky: první rok výplat bývá neúplný (fond vznikl v průběhu roku), letošní taky.
  const firstYear = Number(sorted[0][0].slice(0, 4)) + 1
  const currentYear = Number(asOf.slice(0, 4))
  const totals = new Map<number, number>()
  for (const [date, amount] of sorted) {
    const y = Number(date.slice(0, 4))
    if (y >= firstYear && y < currentYear) totals.set(y, (totals.get(y) ?? 0) + amount)
  }
  const years = [...totals.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, total]) => ({ year, total }))
  const lastFullYear = years.length > 0 ? years[years.length - 1].year : null
  const growth = (n: number): number | null => {
    if (lastFullYear === null) return null
    const end = totals.get(lastFullYear)
    const start = totals.get(lastFullYear - n)
    if (!end || !start) return null
    return Math.pow(end / start, 1 / n) - 1
  }

  return {
    ttm,
    yield: price !== null && price > 0 ? ttm / price : null,
    growth5: growth(5),
    growth10: growth(10),
    lastFullYear,
    lastPayment,
    years
  }
}

export interface DividendIncomeInput {
  capital: number
  /** Dividendový výnos v prvním roce (0,03 = 3 %). */
  dividendYield: number
  /** Roční růst dividend; hodnota kapitálu roste stejně (stálý dividendový výnos). */
  growth: number
  /** Daň z dividend (0,15 = 15 %). */
  tax: number
  inflation: number
}

export interface DividendIncomeYear {
  /** Rok čerpání od 0 (0 = první rok). */
  year: number
  /** Čistá dividenda měsíčně (průměr, výplaty bývají čtvrtletní). */
  monthly: number
  /** Totéž v dnešních cenách. */
  monthlyReal: number
  /** Hodnota kapitálu na začátku roku (neprodává se). */
  capital: number
}

/** Příjem z dividend po letech 0…`years`. */
export function projectDividendIncome(
  input: DividendIncomeInput,
  years: number
): DividendIncomeYear[] {
  const { capital, dividendYield, growth, tax, inflation } = input
  const out: DividendIncomeYear[] = []
  for (let k = 0; k <= years; k++) {
    const g = Math.pow(1 + growth, k)
    const monthly = (capital * dividendYield * g * (1 - tax)) / 12
    out.push({
      year: k,
      monthly,
      monthlyReal: monthly / Math.pow(1 + inflation, k),
      capital: capital * g
    })
  }
  return out
}

/** Celkový roční výnos dividendového ETF v modelu: dividenda + růst kurzu (= růst dividend). */
export function dividendTotalReturn(dividendYield: number, growth: number): number {
  return (1 + dividendYield) * (1 + growth) - 1
}

export interface DividendComparison {
  /** Odprodej „navždy“ se stejným celkovým výnosem: měsíčně v 1. roce (= v dnešních cenách stále). */
  sellPerpetual: number | null
  totalReturn: number
  /** První rok (od 0), kdy čisté dividendy v dnešních cenách dosáhnou odprodeje; `null` = v horizontu ne. */
  dividendsAheadFrom: number | null
}

/**
 * Férové srovnání s odprodejem: stejný kapitál, stejný celkový výnos, stejná inflace.
 * Odprodej „navždy“ drží kupní sílu kapitálu, dividendy začínají níž a rostou.
 * Daň: u dividend se odečítá, u odprodeje ne (prodej po časovém testu je osvobozený).
 */
export function compareWithSelling(input: DividendIncomeInput, horizon = 60): DividendComparison {
  const totalReturn = dividendTotalReturn(input.dividendYield, input.growth)
  const sellPerpetual = perpetualMonthlyWithdrawal(input.capital, totalReturn, input.inflation)
  let dividendsAheadFrom: number | null = null
  if (sellPerpetual !== null) {
    const rows = projectDividendIncome(input, horizon)
    dividendsAheadFrom = rows.find((r) => r.monthlyReal >= sellPerpetual)?.year ?? null
  }
  return { sellPerpetual, totalReturn, dividendsAheadFrom }
}

export interface HistoricalReturn {
  /** Průměrný roční celkový výnos (kurz + reinvestované dividendy). */
  annual: number
  from: string
  to: string
}

/**
 * Skutečný celkový výnos fondu za posledních `years` let z měsíčních kurzů upravených
 * o dividendy (adjclose). `null`, když historie tak daleko nesahá.
 */
export function historicalTotalReturn(
  adjMonthly: readonly [string, number][],
  years: number
): HistoricalReturn | null {
  if (adjMonthly.length < 2) return null
  const [to, end] = adjMonthly[adjMonthly.length - 1]
  const target = addMonths(to, -12 * years)
  let start: [string, number] | null = null
  for (const p of adjMonthly) {
    if (p[0] <= target) start = p
    else break
  }
  // Počáteční bod musí ležet blízko cílového data (jinak historie nesahá dost daleko).
  if (!start || daysBetween(start[0], target) > 45) return null
  const days = daysBetween(start[0], to)
  return { annual: Math.pow(end / start[1], 365.25 / days) - 1, from: start[0], to }
}
