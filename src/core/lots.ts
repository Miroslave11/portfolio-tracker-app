import type { Portfolio, Transaction } from '../shared/model'
import { addDays, addMonths } from './date'

const EPS = 1e-9

/** Nákup („lot“), ze kterého se při prodejích podle FIFO odebírají kusy. */
export interface Lot {
  /** ID nákupní transakce. */
  id: string
  /** Fond: ISIN (kotace se stejným ISIN se sdílí), jinak ticker. */
  securityKey: string
  securityId: string
  accountId: string
  date: string
  shares: number
  /** Kolik kusů z nákupu ještě zbývá. */
  remaining: number
  /** Pořizovací cena za kus (včetně poplatků zahrnutých v částce). */
  costPerShare: number
}

/** Část nákupu spotřebovaná jedním prodejem. */
export interface LotUse {
  lotId: string
  buyDate: string
  accountId: string
  securityId: string
  shares: number
  /** Pořizovací cena spotřebovaných kusů (EUR). */
  cost: number
  /** Spotřebované kusy byly drženy déle než 3 roky (časový test splněn). */
  longTerm: boolean
  /** Pořizovací cena v Kč kurzem ČNB ke dni nákupu (je-li kurz k dispozici). */
  costCzk: number | null
}

/** Jeden prodej a jeho realizovaný zisk podle FIFO. */
export interface RealizedSale {
  txId: string
  date: string
  accountId: string
  securityId: string
  securityKey: string
  shares: number
  proceeds: number
  cost: number
  gain: number
  uses: LotUse[]
  /** Kusy, u kterých byl splněn časový test. */
  exemptShares: number
  /** Podíl příjmu a zisku připadající na kusy se splněným časovým testem. */
  exemptProceeds: number
  exemptGain: number
  /** Částky v Kč: příjem kurzem ke dni prodeje, náklady kurzem ke dni nákupu. */
  proceedsCzk: number | null
  costCzk: number | null
  gainCzk: number | null
  exemptProceedsCzk: number | null
}

export interface LotsResult {
  /** Nákupy, ze kterých ještě zbývají kusy (po všech prodejích). */
  openLots: Lot[]
  sales: RealizedSale[]
  warnings: string[]
}

export interface LotsOptions {
  /** Kurz EUR/CZK k danému dni; bez něj se částky v Kč nepočítají. */
  fxAt?: (date: string) => number | null
}

/**
 * První den, kdy je prodej osvobozený časovým testem: doba držení musí „přesáhnout 3 roky“,
 * tedy den po třetím výročí nákupu (u 29. 2. se výročí bere 28. 2.).
 */
export function timeTestFreeFrom(buyDate: string): string {
  return addDays(addMonths(buyDate, 36), 1)
}

/** Je prodej v daný den po nákupu v daný den osvobozený časovým testem? */
export function passesTimeTest(buyDate: string, sellDate: string): boolean {
  return sellDate >= timeTestFreeFrom(buyDate)
}

function order(a: Transaction, b: Transaction): number {
  // Ve stejný den se nákupy započítají před prodeji (prodej ráno a nákup odpoledne nerozlišíme).
  const rank = (t: Transaction): number => (t.type === 'BUY' ? 0 : 1)
  return a.date.localeCompare(b.date) || rank(a) - rank(b) || a.id.localeCompare(b.id)
}

/**
 * Projde nákupy a prodeje a přiřadí každému prodeji nejstarší nákupy téhož fondu (FIFO).
 * Fond se určuje podle ISIN napříč všemi brokery (jak to vyžaduje daňová evidence).
 */
export function computeLots(portfolio: Portfolio, options: LotsOptions = {}): LotsResult {
  const fxAt = options.fxAt ?? (() => null)
  const secById = new Map(portfolio.securities.map((s) => [s.id, s]))
  const keyOf = (securityId: string): string => secById.get(securityId)?.isin ?? securityId
  const queues = new Map<string, Lot[]>()
  const allLots: Lot[] = []
  const sales: RealizedSale[] = []
  const warnings: string[] = []

  const trades = portfolio.transactions
    .filter((t) => (t.type === 'BUY' || t.type === 'SELL') && t.securityId && t.shares)
    .sort(order)

  for (const t of trades) {
    const securityKey = keyOf(t.securityId!)
    const queue = queues.get(securityKey) ?? []
    queues.set(securityKey, queue)

    if (t.type === 'BUY') {
      const lot: Lot = {
        id: t.id,
        securityKey,
        securityId: t.securityId!,
        accountId: t.accountId,
        date: t.date,
        shares: t.shares!,
        remaining: t.shares!,
        costPerShare: t.amount / t.shares!
      }
      queue.push(lot)
      allLots.push(lot)
      continue
    }

    // Prodej: odebírá kusy od nejstaršího nákupu.
    let left = t.shares!
    const uses: LotUse[] = []
    for (const lot of queue) {
      if (left <= EPS) break
      if (lot.remaining <= EPS) continue
      const take = Math.min(lot.remaining, left)
      lot.remaining -= take
      left -= take
      const cost = take * lot.costPerShare
      const fx = fxAt(lot.date)
      uses.push({
        lotId: lot.id,
        buyDate: lot.date,
        accountId: lot.accountId,
        securityId: lot.securityId,
        shares: take,
        cost,
        longTerm: passesTimeTest(lot.date, t.date),
        costCzk: fx === null ? null : cost * fx
      })
    }
    if (left > EPS) {
      warnings.push(
        `Prodej ${t.securityId} z ${t.date}: chybí nákupy pro ${Math.round(left * 1e6) / 1e6} ks – zisk je neúplný.`
      )
    }

    const sold = t.shares! - Math.max(0, left)
    const cost = uses.reduce((s, u) => s + u.cost, 0)
    const exemptShares = uses.filter((u) => u.longTerm).reduce((s, u) => s + u.shares, 0)
    const exemptCost = uses.filter((u) => u.longTerm).reduce((s, u) => s + u.cost, 0)
    const share = sold > EPS ? exemptShares / sold : 0
    const proceeds = t.amount
    const exemptProceeds = proceeds * share
    const fxSale = fxAt(t.date)
    const costCzk = uses.every((u) => u.costCzk !== null)
      ? uses.reduce((s, u) => s + (u.costCzk ?? 0), 0)
      : null
    const proceedsCzk = fxSale === null ? null : proceeds * fxSale
    sales.push({
      txId: t.id,
      date: t.date,
      accountId: t.accountId,
      securityId: t.securityId!,
      securityKey,
      shares: t.shares!,
      proceeds,
      cost,
      gain: proceeds - cost,
      uses,
      exemptShares,
      exemptProceeds,
      exemptGain: exemptProceeds - exemptCost,
      proceedsCzk,
      costCzk,
      gainCzk: proceedsCzk !== null && costCzk !== null ? proceedsCzk - costCzk : null,
      exemptProceedsCzk: proceedsCzk === null ? null : proceedsCzk * share
    })
  }

  return {
    openLots: allLots.filter((l) => l.remaining > EPS),
    sales,
    warnings
  }
}

export interface RealizedYear {
  year: number
  sales: number
  proceeds: number
  cost: number
  gain: number
  /** Příjmy a zisk z kusů se splněným časovým testem. */
  exemptProceeds: number
  exemptGain: number
  /** Příjmy bez splněného časového testu (k posouzení, např. limit osvobození). */
  otherProceeds: number
}

/** Součty realizovaných zisků po kalendářních letech (podle data prodeje), v EUR nebo v Kč. */
export function realizedByYear(
  sales: readonly RealizedSale[],
  currency: 'EUR' | 'CZK' = 'EUR'
): RealizedYear[] {
  const byYear = new Map<number, RealizedYear>()
  for (const s of sales) {
    const year = Number(s.date.slice(0, 4))
    const czk = currency === 'CZK'
    const proceeds = czk ? (s.proceedsCzk ?? 0) : s.proceeds
    const cost = czk ? (s.costCzk ?? 0) : s.cost
    const exemptProceeds = czk ? (s.exemptProceedsCzk ?? 0) : s.exemptProceeds
    // Zisk osvobozených kusů v Kč: jejich příjem − jejich náklady v Kč.
    const exemptCost = czk
      ? s.uses.filter((u) => u.longTerm).reduce((sum, u) => sum + (u.costCzk ?? 0), 0)
      : s.uses.filter((u) => u.longTerm).reduce((sum, u) => sum + u.cost, 0)
    const row = byYear.get(year) ?? {
      year,
      sales: 0,
      proceeds: 0,
      cost: 0,
      gain: 0,
      exemptProceeds: 0,
      exemptGain: 0,
      otherProceeds: 0
    }
    row.sales += 1
    row.proceeds += proceeds
    row.cost += cost
    row.gain += proceeds - cost
    row.exemptProceeds += exemptProceeds
    row.exemptGain += exemptProceeds - exemptCost
    row.otherProceeds += proceeds - exemptProceeds
    byYear.set(year, row)
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}
