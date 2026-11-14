import type { Portfolio } from '../shared/model'

export interface MonthRow {
  /** „RRRR-MM“ */
  month: string
  total: number
  /** Nakoupeno podle účtu (broker). */
  byAccount: Record<string, number>
  buys: number
}

export interface YearRow {
  year: number
  total: number
  byAccount: Record<string, number>
  /** Počet měsíců roku, ve kterých proběhl nákup. */
  monthsWithBuy: number
  /** Počet měsíců roku zahrnutých do průměru (celý rok, u prvního a letošního jen jeho část). */
  monthsCounted: number
  buys: number
  sold: number
  /** Průměr za měsíc (včetně měsíců bez nákupu). */
  average: number
}

export interface InvestmentStats {
  /** Souvislá řada měsíců od prvního nákupu do `asOf` (měsíce bez nákupu mají 0). */
  months: MonthRow[]
  years: YearRow[]
  totalBought: number
  totalSold: number
  buyCount: number
  /** Průměr za měsíc za posledních 12 měsíců (bez rozpracovaného měsíce, ve kterém ještě nic nenakoupeno). */
  average12: number | null
  /** Medián částky v měsících s nákupem za týchž 12 měsíců. */
  median12: number | null
  /** Počet měsíců s nákupem za týchž 12 měsíců. */
  monthsWithBuy12: number
  /** Aktuální měsíc je bez nákupu (podklad pro upozornění v P10). */
  currentMonthEmpty: boolean
  firstMonth: string | null
  lastMonth: string | null
}

export interface InvestmentOptions {
  /** Omezení na vybrané účty (broker); `null` = všechny. */
  accountIds?: ReadonlySet<string> | null
  /** Datum „dnes“ (poslední měsíc řady); výchozí je datum poslední transakce. */
  asOf?: string
  /** Přepočet částky k datu transakce (např. EUR → Kč); výchozí je beze změny. */
  convert?: (amount: number, date: string) => number
}

function monthIndex(month: string): number {
  const [y, m] = month.split('-').map(Number)
  return y * 12 + (m - 1)
}

function monthFromIndex(i: number): string {
  const y = Math.floor(i / 12)
  return `${y}-${String((i % 12) + 1).padStart(2, '0')}`
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** Nákupy ETF po měsících a po letech, průměry a mediány. */
export function calculateInvestments(
  portfolio: Portfolio,
  options: InvestmentOptions = {}
): InvestmentStats {
  const { accountIds = null, convert = (a: number) => a } = options
  const txs = portfolio.transactions.filter((t) => !accountIds || accountIds.has(t.accountId))
  const buys = txs.filter((t) => t.type === 'BUY')
  const sells = txs.filter((t) => t.type === 'SELL')

  const empty: InvestmentStats = {
    months: [],
    years: [],
    totalBought: 0,
    totalSold: 0,
    buyCount: 0,
    average12: null,
    median12: null,
    monthsWithBuy12: 0,
    currentMonthEmpty: false,
    firstMonth: null,
    lastMonth: null
  }
  if (buys.length === 0) return empty

  const sortedDates = txs.map((t) => t.date).sort()
  const asOf = options.asOf ?? sortedDates[sortedDates.length - 1]
  const first = buys
    .map((t) => t.date)
    .sort()[0]
    .slice(0, 7)
  const lastBuy = buys
    .map((t) => t.date)
    .sort()
    .at(-1)!
    .slice(0, 7)
  const last = monthFromIndex(Math.max(monthIndex(asOf.slice(0, 7)), monthIndex(lastBuy)))

  const rows = new Map<string, MonthRow>()
  for (let i = monthIndex(first); i <= monthIndex(last); i++) {
    const month = monthFromIndex(i)
    rows.set(month, { month, total: 0, byAccount: {}, buys: 0 })
  }
  for (const t of buys) {
    const row = rows.get(t.date.slice(0, 7))!
    const amount = convert(t.amount, t.date)
    row.total += amount
    row.byAccount[t.accountId] = (row.byAccount[t.accountId] ?? 0) + amount
    row.buys += 1
  }
  const months = [...rows.values()]

  const soldByYear = new Map<number, number>()
  let totalSold = 0
  for (const t of sells) {
    const amount = convert(t.amount, t.date)
    totalSold += amount
    const y = Number(t.date.slice(0, 4))
    soldByYear.set(y, (soldByYear.get(y) ?? 0) + amount)
  }

  const years: YearRow[] = []
  const firstYear = Number(first.slice(0, 4))
  const lastYear = Number(last.slice(0, 4))
  for (let y = firstYear; y <= lastYear; y++) {
    const inYear = months.filter((m) => m.month.startsWith(String(y)))
    const byAccount: Record<string, number> = {}
    for (const m of inYear) {
      for (const [id, v] of Object.entries(m.byAccount)) byAccount[id] = (byAccount[id] ?? 0) + v
    }
    const total = inYear.reduce((s, m) => s + m.total, 0)
    years.push({
      year: y,
      total,
      byAccount,
      monthsWithBuy: inYear.filter((m) => m.buys > 0).length,
      monthsCounted: inYear.length,
      buys: inYear.reduce((s, m) => s + m.buys, 0),
      sold: soldByYear.get(y) ?? 0,
      average: inYear.length > 0 ? total / inYear.length : 0
    })
  }

  // Posledních 12 měsíců; rozpracovaný měsíc bez nákupu se nezapočítává.
  const currentMonthEmpty = rows.get(last)!.buys === 0
  const endIdx = monthIndex(last) - (currentMonthEmpty ? 1 : 0)
  const startIdx = Math.max(monthIndex(first), endIdx - 11)
  const window = months.filter(
    (m) => monthIndex(m.month) >= startIdx && monthIndex(m.month) <= endIdx
  )
  const windowTotal = window.reduce((s, m) => s + m.total, 0)
  const withBuy = window.filter((m) => m.buys > 0)

  return {
    months,
    years,
    totalBought: months.reduce((s, m) => s + m.total, 0),
    totalSold,
    buyCount: buys.length,
    average12: window.length > 0 ? windowTotal / window.length : null,
    median12: median(withBuy.map((m) => m.total)),
    monthsWithBuy12: withBuy.length,
    currentMonthEmpty,
    firstMonth: first,
    lastMonth: last
  }
}
