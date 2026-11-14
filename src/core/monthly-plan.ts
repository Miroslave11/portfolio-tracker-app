import type { Portfolio, TransactionDraft } from '../shared/model'
import type { MonthlyPlan, MonthlyPlanItem } from '../shared/settings'

/** Výchozí den v měsíci, od kterého se upozorňuje na chybějící nákup. */
export const DEFAULT_REMIND_FROM_DAY = 10

/** Řádek hromadného formuláře měsíčního nákupu (texty se dopočítávají ve formuláři). */
export interface PlanRow {
  key: string
  accountId: string
  securityId: string
  date: string
  shares?: number
  amount?: number
}

/** „2026-11-10“ → „2026-11“. */
export const monthOf = (date: string): string => date.slice(0, 7)

/** Počet nákupů v daném měsíci (RRRR-MM), případně jen na vybraných účtech. */
export function buysInMonth(
  portfolio: Portfolio,
  month: string,
  accountIds?: ReadonlySet<string> | null
): number {
  return portfolio.transactions.filter(
    (t) =>
      t.type === 'BUY' && monthOf(t.date) === month && (!accountIds || accountIds.has(t.accountId))
  ).length
}

/**
 * Má se upozornit „tento měsíc ještě nezainvestováno“? Ano, pokud v aktuálním měsíci není
 * žádný nákup, už je den, od kterého se připomíná, a v historii nákupy jsou (nováček není
 * obtěžován). Vrací měsíc, kterého se upozornění týká, jinak `null`.
 */
export function missingMonth(
  portfolio: Portfolio,
  plan: MonthlyPlan | null,
  today: string
): string | null {
  const month = monthOf(today)
  const hasHistory = portfolio.transactions.some((t) => t.type === 'BUY' && monthOf(t.date) < month)
  if (!hasHistory) return null
  if (buysInMonth(portfolio, month) > 0) return null
  const day = Number(today.slice(8, 10))
  return day >= (plan?.remindFromDay ?? DEFAULT_REMIND_FROM_DAY) ? month : null
}

/** Řádky formuláře ze šablony; položky, jejichž broker nebo ETF už neexistují, se vynechají. */
export function planToRows(plan: MonthlyPlan, portfolio: Portfolio, date: string): PlanRow[] {
  const accounts = new Set(portfolio.accounts.map((a) => a.id))
  const securities = new Set(portfolio.securities.map((s) => s.id))
  return plan.items
    .filter((i) => accounts.has(i.accountId) && securities.has(i.securityId))
    .map((i, n) => ({
      key: `plan-${n}`,
      accountId: i.accountId,
      securityId: i.securityId,
      date,
      ...(i.shares !== undefined ? { shares: i.shares } : {}),
      ...(i.amount !== undefined ? { amount: i.amount } : {})
    }))
}

/** Zápisy nákupů (každý s vkladem na účet) z vyplněných řádků formuláře. */
export function rowsToDrafts(
  rows: ReadonlyArray<{
    accountId: string
    securityId: string
    date: string
    shares: number
    amount: number
  }>,
  withCash = true
): TransactionDraft[] {
  return rows.map((r) => ({
    type: 'BUY' as const,
    accountId: r.accountId,
    date: r.date,
    securityId: r.securityId,
    shares: r.shares,
    amount: r.amount,
    ...(withCash ? { withCash: true } : {})
  }))
}

/**
 * Návrh šablony z historie: nákupy z posledního měsíce, ve kterém se nakupovalo
 * (stejný broker a ETF se sečtou). Prázdný výsledek, pokud nejsou žádné nákupy.
 */
export function planFromLastMonth(portfolio: Portfolio): MonthlyPlan | null {
  const buys = portfolio.transactions.filter((t) => t.type === 'BUY' && t.securityId && t.shares)
  if (buys.length === 0) return null
  const lastMonth = buys
    .map((t) => monthOf(t.date))
    .sort()
    .at(-1)!
  const sums = new Map<string, MonthlyPlanItem>()
  for (const t of buys.filter((b) => monthOf(b.date) === lastMonth)) {
    const key = `${t.accountId}|${t.securityId}`
    const cur = sums.get(key)
    sums.set(key, {
      accountId: t.accountId,
      securityId: t.securityId!,
      shares: Math.round(((cur?.shares ?? 0) + t.shares!) * 1e6) / 1e6
    })
  }
  const items = [...sums.values()].slice(0, 12)
  return { items, remindFromDay: DEFAULT_REMIND_FROM_DAY }
}
