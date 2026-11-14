import { TX_TYPE_LABELS, type Account, type Transaction } from '../shared/model'

export const SORT_KEYS = [
  'date',
  'broker',
  'type',
  'security',
  'shares',
  'price',
  'amount',
  'profit'
] as const
export type SortKey = (typeof SORT_KEYS)[number]
export type SortDir = 'asc' | 'desc'

export interface SortState {
  key: SortKey
  dir: SortDir
}

export const DEFAULT_SORT: SortState = { key: 'date', dir: 'desc' }

const collator = new Intl.Collator('cs')

type Value = string | number | null

/** Cena za kus má smysl jen u nákupu/prodeje. */
export function unitPrice(t: Transaction): number | null {
  return (t.type === 'BUY' || t.type === 'SELL') && t.shares ? t.amount / t.shares : null
}

function valueOf(
  t: Transaction,
  key: SortKey,
  accounts: ReadonlyMap<string, Account>,
  profits: ReadonlyMap<string, number>
): Value {
  switch (key) {
    case 'date':
      return t.date
    case 'broker':
      return accounts.get(t.accountId)?.name ?? t.accountId
    case 'type':
      return TX_TYPE_LABELS[t.type]
    case 'security':
      return t.securityId ?? null
    case 'shares':
      return t.shares ?? null
    case 'price':
      return unitPrice(t)
    case 'amount':
      return t.amount
    case 'profit':
      return profits.get(t.id) ?? null
  }
}

function compareValues(a: Value, b: Value): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return collator.compare(String(a), String(b))
}

/**
 * Seřadí transakce podle sloupce. Prázdné hodnoty (např. ETF u vkladu) jsou vždy
 * na konci, bez ohledu na směr. Shody se rozhodují datem (nejnovější první) a ID.
 */
export function sortTransactions(
  transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, Account>,
  { key, dir }: SortState,
  /** Aktuální zisk nákupů podle ID transakce (pro řazení podle zisku). */
  profits: ReadonlyMap<string, number> = new Map()
): Transaction[] {
  const sign = dir === 'asc' ? 1 : -1
  return transactions.slice().sort((x, y) => {
    const a = valueOf(x, key, accounts, profits)
    const b = valueOf(y, key, accounts, profits)
    if (a === null && b !== null) return 1
    if (b === null && a !== null) return -1
    if (a !== null && b !== null) {
      const c = compareValues(a, b)
      if (c !== 0) return c * sign
    }
    if (key === 'date') return x.id.localeCompare(y.id) * sign
    return y.date.localeCompare(x.date) || y.id.localeCompare(x.id)
  })
}

/** První klik na sloupec: datum a čísla od největšího, text od A. Další klik směr obrátí. */
export function nextSort(current: SortState, key: SortKey): SortState {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return {
    key,
    dir:
      key === 'date' || key === 'shares' || key === 'price' || key === 'amount' || key === 'profit'
        ? 'desc'
        : 'asc'
  }
}
