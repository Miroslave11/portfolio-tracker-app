import {
  TX_TYPE_LABELS,
  type Account,
  type Security,
  type Transaction,
  type TxType
} from '../shared/model'
import { addMonths, formatDate } from './date'

/** `ALL`, `YTD` (letos), `12M` (posledních 12 měsíců), `Y2025` (kalendářní rok) nebo `CUSTOM`. */
export type TxPeriod = string

export interface TxFilter {
  /** Typ transakce; `null` = všechny. */
  type: TxType | null
  /** Klíč fondu (ISIN, jinak ticker); `null` = všechny. */
  securityKey: string | null
  period: TxPeriod
  /** Hranice pro `CUSTOM` (včetně obou dnů); prázdný řetězec = bez omezení. */
  from: string
  to: string
  search: string
}

export const EMPTY_TX_FILTER: TxFilter = {
  type: null,
  securityKey: null,
  period: 'ALL',
  from: '',
  to: '',
  search: ''
}

/** Je nějaký filtr zapnutý? */
export function isFilterActive(f: TxFilter): boolean {
  return f.type !== null || f.securityKey !== null || f.period !== 'ALL' || f.search.trim() !== ''
}

/** Klíč fondu pro filtr: kotace se stejným ISIN se slučují (EUNL.DE + IWDA.AS). */
export function securityKey(s: Pick<Security, 'id' | 'isin'>): string {
  return s.isin ?? s.id
}

export interface SecurityOption {
  key: string
  label: string
}

/** Nabídka fondů pro filtr (jen ty, které mají nějakou transakci), seřazená podle názvu. */
export function securityOptions(
  securities: readonly Security[],
  transactions: readonly Transaction[]
): SecurityOption[] {
  const used = new Set(transactions.map((t) => t.securityId).filter((id): id is string => !!id))
  const groups = new Map<string, string[]>()
  for (const s of securities) {
    if (!used.has(s.id)) continue
    const key = securityKey(s)
    groups.set(key, [...(groups.get(key) ?? []), s.id])
  }
  return [...groups.entries()]
    .map(([key, ids]) => ({ key, label: ids.join(' / ') }))
    .sort((a, b) => a.label.localeCompare(b.label, 'cs'))
}

/** Dolní a horní hranice období (včetně obou dnů); prázdný řetězec = bez omezení. */
export function periodBounds(
  period: TxPeriod,
  today: string,
  custom: { from: string; to: string }
): { from: string; to: string } {
  if (period === 'YTD') return { from: `${today.slice(0, 4)}-01-01`, to: '' }
  if (period === '12M') {
    const [y, m, d] = addMonths(today, -12).split('-').map(Number)
    // „Posledních 12 měsíců“ = od následujícího dne po stejném datu před rokem.
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
    return { from: next, to: '' }
  }
  if (period === 'CUSTOM') return { from: custom.from, to: custom.to }
  const year = /^Y(\d{4})$/.exec(period)
  if (year) return { from: `${year[1]}-01-01`, to: `${year[1]}-12-31` }
  return { from: '', to: '' }
}

/** Malá písmena bez diakritiky, aby „etf“ našlo „ETF“ a „zaloha“ našlo „záloha“. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function searchText(
  t: Transaction,
  accounts: ReadonlyMap<string, Account>,
  securities: ReadonlyMap<string, Security>
): string {
  const sec = t.securityId ? securities.get(t.securityId) : undefined
  return normalizeText(
    [
      t.date,
      formatDate(t.date),
      accounts.get(t.accountId)?.name ?? '',
      TX_TYPE_LABELS[t.type],
      t.securityId ?? '',
      sec?.name ?? '',
      sec?.isin ?? '',
      t.note ?? '',
      String(t.amount),
      t.shares !== undefined ? String(t.shares) : ''
    ].join(' ')
  )
}

/** Použije filtry (typ, fond, období, hledání) na transakce; pořadí se zachovává. */
export function filterTransactions(
  transactions: readonly Transaction[],
  filter: TxFilter,
  accounts: ReadonlyMap<string, Account>,
  securities: readonly Security[],
  today: string
): Transaction[] {
  const secById = new Map(securities.map((s) => [s.id, s]))
  const { from, to } = periodBounds(filter.period, today, filter)
  const tokens = normalizeText(filter.search).split(/\s+/).filter(Boolean)

  return transactions.filter((t) => {
    if (filter.type && t.type !== filter.type) return false
    if (filter.securityKey) {
      const sec = t.securityId ? secById.get(t.securityId) : undefined
      if (!sec || securityKey(sec) !== filter.securityKey) return false
    }
    if (from && t.date < from) return false
    if (to && t.date > to) return false
    if (tokens.length > 0) {
      const text = searchText(t, accounts, secById)
      if (!tokens.every((token) => text.includes(token))) return false
    }
    return true
  })
}

export interface BuyProfit {
  /** Dnešní hodnota nakoupených kusů − pořizovací částka (v měně zobrazení). */
  profit: number
  /** Zisk vůči pořizovací částce (0,12 = +12 %). */
  pct: number
}

/**
 * Aktuální zisk u nákupu: kolik by dnes měly kusy z tohoto nákupu minus kolik stály.
 * `null`, pokud nejde o nákup nebo chybí kurz.
 */
export function buyProfit(
  t: Transaction,
  latestPrice: number | undefined,
  /** Kurz platný dnes a v den nákupu (pro přepočet do Kč); 1 a 1 = EUR. */
  rates: { today: number; atDate: number } = { today: 1, atDate: 1 }
): BuyProfit | null {
  if (t.type !== 'BUY' || !t.shares || latestPrice === undefined) return null
  const cost = t.amount * rates.atDate
  if (cost <= 0) return null
  const profit = t.shares * latestPrice * rates.today - cost
  return { profit, pct: profit / cost }
}
