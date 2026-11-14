import type { Account, Portfolio, Security } from '../shared/model'
import type { PriceCache } from '../shared/prices'
import { calculatePortfolio, type Position } from './portfolio-calc'

export type AllocationGroupBy = 'index' | 'etf' | 'broker'

export interface AllocationSlice {
  key: string
  label: string
  /** Doplňující řádek (tickery ETF). */
  sublabel?: string
  color: string
  value: number
  costBasis: number
  /** Nerealizovaný zisk (hodnota − pořizovací cena zbývajících kusů). */
  unrealized: number
  /** Podíl na celku (0–1). */
  share: number
}

const EPS = 1e-9

function finish(slices: Omit<AllocationSlice, 'share'>[]): AllocationSlice[] {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return slices
    .filter((s) => s.value > EPS)
    .map((s) => ({ ...s, share: total > EPS ? s.value / total : 0 }))
    .sort((a, b) => b.value - a.value)
}

/**
 * Alokace podle ETF (sloučené přes ISIN – např. EUNL.DE a IWDA.AS jsou jeden fond)
 * nebo podle skupiny indexu. Barva skupiny je barva jejího největšího ETF.
 */
export function allocateBySecurity(
  positions: readonly Position[],
  securities: readonly Security[],
  by: 'etf' | 'index'
): AllocationSlice[] {
  const meta = new Map(securities.map((s) => [s.id, s]))
  type Acc = { slice: Omit<AllocationSlice, 'share'>; tickers: string[] }
  const groups = new Map<string, Acc>()

  for (const p of [...positions].sort((a, b) => b.value - a.value)) {
    const sec = meta.get(p.securityId)
    if (!sec) continue
    const key = by === 'index' ? sec.indexGroup : (sec.isin ?? sec.id)
    const label = by === 'index' ? sec.indexGroup : sec.name
    const found = groups.get(key)
    if (found) {
      found.slice.value += p.value
      found.slice.costBasis += p.costBasis
      found.slice.unrealized += p.unrealized
      found.tickers.push(sec.id)
    } else {
      groups.set(key, {
        slice: {
          key,
          label,
          color: sec.color,
          value: p.value,
          costBasis: p.costBasis,
          unrealized: p.unrealized
        },
        tickers: [sec.id]
      })
    }
  }
  return finish(
    [...groups.values()].map(({ slice, tickers }) => ({
      ...slice,
      sublabel: tickers.join(', ')
    }))
  )
}

/** Alokace podle brokera: hodnota ETF držených na jeho účtu. */
export function allocateByBroker(
  portfolio: Portfolio,
  prices: PriceCache,
  accountIds: ReadonlySet<string> | null
): AllocationSlice[] {
  const slices: Omit<AllocationSlice, 'share'>[] = []
  const accounts: Account[] = portfolio.accounts.filter((a) => !accountIds || accountIds.has(a.id))
  for (const account of accounts) {
    const summary = calculatePortfolio({
      portfolio,
      prices,
      accountIds: new Set([account.id])
    }).summary
    if (!summary) continue
    const value = summary.positions.reduce((s, p) => s + p.value, 0)
    const costBasis = summary.positions.reduce((s, p) => s + p.costBasis, 0)
    slices.push({
      key: account.id,
      label: account.name,
      sublabel: summary.positions.map((p) => p.securityId).join(', '),
      color: account.color,
      value,
      costBasis,
      unrealized: value - costBasis
    })
  }
  return finish(slices)
}
