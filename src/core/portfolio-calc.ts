import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import { addDays } from './date'

export interface CalcInput {
  portfolio: Portfolio
  prices: PriceCache
  /** Omezení na vybrané účty (broker); `null` = všechny. */
  accountIds?: ReadonlySet<string> | null
  /** Datum, ke kterému se počítá; výchozí je poslední známý kurz. */
  asOf?: string
}

export interface SeriesPoint {
  date: string
  /** Hodnota portfolia = ETF v tržní ceně + hotovost (EUR). */
  value: number
  /** Čistě vloženo = vklady − výběry (EUR). */
  invested: number
  /** Hodnota v Kč kurzem platným v daný den; `null`, pokud chybí kurz ČNB. */
  valueCzk: number | null
  /** Vklady/výběry v Kč kurzem z dne každého pohybu; `null`, pokud chybí kurz ČNB. */
  investedCzk: number | null
}

export interface Position {
  securityId: string
  shares: number
  /** Pořizovací cena zbývajících kusů (průměrná cena). */
  costBasis: number
  price: number
  /** Datum použitého kurzu; `null`, pokud kurz chybí a použila se cena posledního obchodu. */
  priceDate: string | null
  estimated: boolean
  value: number
  unrealized: number
  unrealizedPct: number | null
}

export interface Summary {
  asOf: string
  firstDate: string
  value: number
  invested: number
  profit: number
  profitPct: number | null
  cash: number
  depositCount: number
  /** Změna hodnoty držených ETF mezi posledními dvěma obchodními dny (bez vkladů). */
  dayChange: number | null
  dayChangePct: number | null
  /** Poslední kurz EUR/CZK (ČNB), `null` pokud chybí. */
  fxRate: number | null
  valueCzk: number | null
  investedCzk: number | null
  profitCzk: number | null
  positions: Position[]
  /** ETF, které se ocenily cenou posledního obchodu, protože chybí stažený kurz. */
  missingPrices: string[]
  warnings: string[]
}

export interface CalcResult {
  summary: Summary | null
  series: SeriesPoint[]
}

const EPS = 1e-9

/** Index posledního bodu s datem ≤ `date` (binární hledání v seřazených datech), jinak -1. */
function indexAtOrBefore(points: readonly PricePoint[], date: string): number {
  let lo = 0
  let hi = points.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (points[mid][0] <= date) {
      found = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return found
}

/** Poslední hodnota k danému datu nebo dříve. */
export function valueAtOrBefore(points: readonly PricePoint[], date: string): number | null {
  const i = indexAtOrBefore(points, date)
  return i >= 0 ? points[i][1] : null
}

function dateAtOrBefore(points: readonly PricePoint[], date: string): string | null {
  const i = indexAtOrBefore(points, date)
  return i >= 0 ? points[i][0] : null
}

function sortTransactions(txs: Transaction[]): Transaction[] {
  return txs.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}

/**
 * Spočítá pozice, denní hodnotu portfolia, vložený kapitál a zisk.
 *
 * - Hodnota = ETF (počet kusů × poslední známý kurz) + hotovost na účtech.
 * - Víkendy a dny bez obchodování přenášejí poslední známý kurz.
 * - Chybí-li kurz, použije se cena posledního obchodu (a ETF se označí jako odhad).
 */
export function calculatePortfolio(input: CalcInput): CalcResult {
  const { portfolio, prices } = input
  const txs = sortTransactions(
    portfolio.transactions.filter((t) => !input.accountIds || input.accountIds.has(t.accountId))
  )
  if (txs.length === 0) return { summary: null, series: [] }

  const warnings: string[] = []
  const foreign = txs.filter((t) => t.currency !== 'EUR').length
  if (foreign > 0) {
    warnings.push(
      `${foreign} transakcí není v EUR – počítají se bez přepočtu měny (zatím nepodporováno).`
    )
  }

  const fxRates = prices.fx[FX_EUR_CZK]?.rates ?? []
  const fxAt = (date: string): number | null =>
    fxRates.length ? (valueAtOrBefore(fxRates, date) ?? fxRates[0][1]) : null

  const heldIds = [...new Set(txs.map((t) => t.securityId).filter((id): id is string => !!id))]
  const seriesOf = (id: string): readonly PricePoint[] => prices.securities[id]?.prices ?? []

  const lastTxDate = txs[txs.length - 1].date
  const latestPriceDate = heldIds
    .map((id) => seriesOf(id).at(-1)?.[0])
    .filter((d): d is string => !!d)
    .sort()
    .at(-1)
  const end =
    input.asOf ?? (latestPriceDate && latestPriceDate > lastTxDate ? latestPriceDate : lastTxDate)
  if (end < txs[0].date) return { summary: null, series: [] }

  // --- stav účtu, postupně aplikovaný po dnech ---
  const shares = new Map<string, number>()
  const cost = new Map<string, number>()
  const lastTxPrice = new Map<string, number>()
  let cash = 0
  let invested = 0
  let investedCzk: number | null = fxRates.length ? 0 : null
  let depositCount = 0

  const apply = (t: Transaction): void => {
    const id = t.securityId
    switch (t.type) {
      case 'BUY': {
        if (!id || t.shares === undefined) return
        shares.set(id, (shares.get(id) ?? 0) + t.shares)
        cost.set(id, (cost.get(id) ?? 0) + t.amount)
        lastTxPrice.set(id, t.amount / t.shares)
        cash -= t.amount
        return
      }
      case 'SELL': {
        if (!id || t.shares === undefined) return
        const before = shares.get(id) ?? 0
        const avg = before > EPS ? (cost.get(id) ?? 0) / before : 0
        const left = before - t.shares
        shares.set(id, Math.abs(left) < EPS ? 0 : left)
        cost.set(id, left > EPS ? (cost.get(id) ?? 0) - avg * t.shares : 0)
        lastTxPrice.set(id, t.amount / t.shares)
        cash += t.amount
        return
      }
      case 'DEPOSIT':
        cash += t.amount
        invested += t.amount
        if (investedCzk !== null) investedCzk += t.amount * (fxAt(t.date) ?? 0)
        depositCount++
        return
      case 'WITHDRAWAL':
        cash -= t.amount
        invested -= t.amount
        if (investedCzk !== null) investedCzk -= t.amount * (fxAt(t.date) ?? 0)
        return
      case 'DIVIDEND':
        cash += t.amount
        return
      case 'FEE':
        cash -= t.amount
        return
    }
  }

  const priceFor = (id: string, date: string): number =>
    valueAtOrBefore(seriesOf(id), date) ?? lastTxPrice.get(id) ?? 0
  const holdingsValue = (date: string): number => {
    let sum = 0
    for (const [id, count] of shares) if (count > EPS) sum += count * priceFor(id, date)
    return sum
  }

  const series: SeriesPoint[] = []
  let idx = 0
  const firstDate = txs[0].date
  for (let day = firstDate; day <= end; day = addDays(day, 1)) {
    while (idx < txs.length && txs[idx].date <= day) apply(txs[idx++])
    const value = cash + holdingsValue(day)
    const fx = fxAt(day)
    series.push({
      date: day,
      value,
      invested,
      valueCzk: fx === null ? null : value * fx,
      investedCzk
    })
  }

  // --- pozice ke dni `end` ---
  const missingPrices: string[] = []
  const positions: Position[] = []
  for (const [id, count] of shares) {
    if (count <= EPS) continue
    const points = seriesOf(id)
    const priceDate = dateAtOrBefore(points, end)
    const estimated = priceDate === null
    if (estimated) missingPrices.push(id)
    const price = priceFor(id, end)
    const value = count * price
    const costBasis = cost.get(id) ?? 0
    positions.push({
      securityId: id,
      shares: count,
      costBasis,
      price,
      priceDate,
      estimated,
      value,
      unrealized: value - costBasis,
      unrealizedPct: costBasis > EPS ? (value - costBasis) / costBasis : null
    })
  }
  positions.sort((a, b) => b.value - a.value)
  if (missingPrices.length > 0) {
    warnings.push(
      `Chybí stažený kurz pro ${missingPrices.join(', ')} – použita cena posledního obchodu.`
    )
  }

  // --- změna za den: držené kusy × rozdíl kurzů mezi posledními dvěma obchodními dny ---
  const tradingDays = [
    ...new Set(
      heldIds.flatMap((id) =>
        seriesOf(id)
          .map((p) => p[0])
          .filter((d) => d <= end)
      )
    )
  ].sort()
  let dayChange: number | null = null
  let dayChangePct: number | null = null
  if (tradingDays.length >= 2) {
    const last = tradingDays[tradingDays.length - 1]
    const prev = tradingDays[tradingDays.length - 2]
    const sharesAtPrev = new Map<string, number>()
    for (const t of txs) {
      if (t.date > prev || !t.securityId || t.shares === undefined) continue
      if (t.type === 'BUY' || t.type === 'SELL') {
        const d = t.type === 'BUY' ? t.shares : -t.shares
        sharesAtPrev.set(t.securityId, (sharesAtPrev.get(t.securityId) ?? 0) + d)
      }
    }
    let change = 0
    let base = 0
    for (const [id, count] of sharesAtPrev) {
      if (count <= EPS) continue
      const p0 = valueAtOrBefore(seriesOf(id), prev)
      const p1 = valueAtOrBefore(seriesOf(id), last)
      if (p0 === null || p1 === null) continue
      change += count * (p1 - p0)
      base += count * p0
    }
    dayChange = change
    dayChangePct = base > EPS ? change / base : null
  }

  const lastPoint = series[series.length - 1]
  const fxRate = fxRates.length ? (fxAt(end) ?? null) : null
  const profit = lastPoint.value - lastPoint.invested

  return {
    series,
    summary: {
      asOf: end,
      firstDate,
      value: lastPoint.value,
      invested: lastPoint.invested,
      profit,
      profitPct: lastPoint.invested > EPS ? profit / lastPoint.invested : null,
      cash,
      depositCount,
      dayChange,
      dayChangePct,
      fxRate,
      valueCzk: lastPoint.valueCzk,
      investedCzk: lastPoint.investedCzk,
      profitCzk:
        lastPoint.valueCzk !== null && lastPoint.investedCzk !== null
          ? lastPoint.valueCzk - lastPoint.investedCzk
          : null,
      positions,
      missingPrices,
      warnings
    }
  }
}
