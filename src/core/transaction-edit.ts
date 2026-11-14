import { computeLots, timeTestFreeFrom } from './lots'
import {
  portfolioSchema,
  transactionDraftSchema,
  type Portfolio,
  type Security,
  type Transaction,
  type TransactionDraft
} from '../shared/model'

const EPS = 1e-9

/** Upozornění, pokud prodej (podle FIFO) zahrne kusy držené kratší dobu než 3 roky. */
function timeTestWarning(portfolio: Portfolio, saleId: string): string | null {
  const sale = computeLots(portfolio).sales.find((s) => s.txId === saleId)
  if (!sale || sale.exemptShares >= sale.shares - EPS) return null
  const short = sale.uses.filter((u) => !u.longTerm)
  const latest = short
    .map((u) => timeTestFreeFrom(u.buyDate))
    .sort()
    .at(-1)!
  const [y, m, d] = latest.split('-')
  const exempt = round6(sale.exemptShares)
  return (
    `Časový test: z ${round6(sale.shares)} ks prodeje splní 3letou lhůtu ${exempt === 0 ? 'žádný kus' : `jen ${exempt} ks`} ` +
    `(podle FIFO se prodávají nejstarší kusy). Celý prodej by byl po testu od ${Number(d)}. ${Number(m)}. ${y}.`
  )
}
const round2 = (v: number): number => Math.round((v + Number.EPSILON) * 100) / 100
const round6 = (v: number): number => Math.round((v + Number.EPSILON) * 1e6) / 1e6

/** Barvy pro nově přidaná ETF (první nepoužitá). */
const NEW_SECURITY_COLORS = [
  '#14b8a6',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#06b6d4',
  '#a855f7',
  '#eab308',
  '#64748b'
]

export type IdGenerator = () => string
const defaultId: IdGenerator = () => crypto.randomUUID()

export interface DraftIssues {
  errors: string[]
  warnings: string[]
}

export interface ValidateContext {
  /** Dnešní datum (RRRR-MM-DD) pro upozornění na budoucí datum. */
  today: string
  /** Tržní kurz ETF k datu (pro upozornění na podezřelou cenu). */
  priceAt?: (securityId: string, date: string) => number | undefined
}

/**
 * Držené kusy u žádného brokera nesmí klesnout pod nulu (nelze prodat u XTB to, co je u Degira).
 * Vrací popis prvního problému nebo `null`.
 */
export function holdingsProblem(
  transactions: readonly Transaction[],
  accountName: (id: string) => string = (id) => id
): string | null {
  const sorted = transactions
    .filter((t) => (t.type === 'BUY' || t.type === 'SELL') && t.securityId && t.shares)
    .slice()
    // Ve stejný den se nákupy započítají před prodeji.
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (a.type === 'BUY' ? -1 : 1) - (b.type === 'BUY' ? -1 : 1)
    )
  const held = new Map<string, number>()
  for (const t of sorted) {
    const key = `${t.accountId}|${t.securityId}`
    const next = (held.get(key) ?? 0) + (t.type === 'BUY' ? t.shares! : -t.shares!)
    if (next < -EPS) {
      return `${t.securityId} u brokera ${accountName(t.accountId)}: ke dni ${t.date} by bylo drženo ${round6(next)} ks (prodej většího počtu, než je na účtu)`
    }
    held.set(key, Math.abs(next) < EPS ? 0 : next)
  }
  return null
}

function buildSecurity(
  portfolio: Portfolio,
  s: NonNullable<TransactionDraft['newSecurity']>
): Security {
  const used = new Set(portfolio.securities.map((x) => x.color.toLowerCase()))
  const color = NEW_SECURITY_COLORS.find((c) => !used.has(c)) ?? NEW_SECURITY_COLORS[0]
  return {
    id: s.yahooTicker.toUpperCase(),
    ...(s.isin ? { isin: s.isin } : {}),
    name: s.name,
    yahooTicker: s.yahooTicker.toUpperCase(),
    currency: 'EUR',
    indexGroup: s.indexGroup,
    distributing: false,
    color
  }
}

/** Typ vyrovnávací transakce: nákup → vklad, prodej → výběr. */
const COUNTER_TYPE = { BUY: 'DEPOSIT', SELL: 'WITHDRAWAL' } as const

/**
 * Sestaví z formuláře transakci (a případně vyrovnávací vklad/výběr). Nic neukládá.
 * ID nové transakce lze předat kvůli testům.
 */
function draftToTransactions(
  portfolio: Portfolio,
  draft: TransactionDraft,
  newId: IdGenerator,
  existing?: Transaction
): { transactions: Transaction[]; security: Security | null } {
  const security = draft.newSecurity ? buildSecurity(portfolio, draft.newSecurity) : null
  const securityId = security?.id ?? draft.securityId
  const id = existing?.id ?? newId()
  const main: Transaction = {
    id,
    accountId: draft.accountId,
    date: draft.date,
    type: draft.type,
    amount: round2(draft.amount),
    currency: 'EUR',
    ...(draft.note ? { note: draft.note } : {}),
    ...(securityId && ['BUY', 'SELL', 'DIVIDEND'].includes(draft.type) ? { securityId } : {}),
    ...(draft.shares !== undefined && (draft.type === 'BUY' || draft.type === 'SELL')
      ? { shares: round6(draft.shares) }
      : {}),
    ...(draft.fee ? { fee: round2(draft.fee) } : {}),
    ...(existing?.linkedId ? { linkedId: existing.linkedId } : {})
  }
  const transactions = [main]
  if (!existing && draft.withCash && (draft.type === 'BUY' || draft.type === 'SELL')) {
    const counter: Transaction = {
      id: newId(),
      accountId: draft.accountId,
      date: draft.date,
      type: COUNTER_TYPE[draft.type],
      amount: main.amount,
      currency: 'EUR',
      note: draft.type === 'BUY' ? 'automatický vklad k nákupu' : 'automatický výběr k prodeji',
      linkedId: id
    }
    main.linkedId = counter.id
    transactions.push(counter)
  }
  return { transactions, security }
}

/** Zkontroluje formulář proti současným datům (chyby blokují uložení, upozornění ne). */
export function validateDraft(
  portfolio: Portfolio,
  draftInput: unknown,
  ctx: ValidateContext,
  editingId?: string
): DraftIssues {
  const issues: DraftIssues = { errors: [], warnings: [] }
  const parsed = transactionDraftSchema.safeParse(draftInput)
  if (!parsed.success) {
    issues.errors.push(
      ...parsed.error.issues.map((i) => `${i.path.join('.') || 'formulář'}: ${i.message}`)
    )
    return issues
  }
  const draft = parsed.data

  if (!portfolio.accounts.some((a) => a.id === draft.accountId)) {
    issues.errors.push('Vyber broker.')
  }
  const needsSecurity = draft.type === 'BUY' || draft.type === 'SELL' || draft.type === 'DIVIDEND'
  const needsShares = draft.type === 'BUY' || draft.type === 'SELL'
  if (needsSecurity) {
    if (!draft.securityId && !draft.newSecurity) issues.errors.push('Vyber ETF.')
    if (draft.securityId && !portfolio.securities.some((s) => s.id === draft.securityId)) {
      issues.errors.push(`ETF ${draft.securityId} neexistuje.`)
    }
    if (draft.newSecurity) {
      const id = draft.newSecurity.yahooTicker.toUpperCase()
      if (portfolio.securities.some((s) => s.id === id)) {
        issues.errors.push(`ETF ${id} už v seznamu je – vyber ho ze seznamu.`)
      }
    }
  } else if (draft.securityId || draft.newSecurity) {
    issues.errors.push('Tento typ transakce nemá ETF.')
  }
  if (needsShares && draft.shares === undefined) issues.errors.push('Zadej počet kusů.')
  if (!needsShares && draft.shares !== undefined) issues.errors.push('Tento typ nemá počet kusů.')
  if (draft.date > ctx.today) {
    issues.warnings.push('Datum je v budoucnosti – zkontroluj, že je správně.')
  }

  // Dopad na držené kusy: nikdy nesmí vyjít záporná pozice.
  if (issues.errors.length === 0) {
    try {
      const existing = editingId
        ? portfolio.transactions.find((t) => t.id === editingId)
        : undefined
      const { transactions } = draftToTransactions(portfolio, draft, () => 'validace', existing)
      const rest = portfolio.transactions.filter((t) => t.id !== editingId)
      const problem = holdingsProblem([...rest, ...transactions], nameOf(portfolio))
      if (problem) issues.errors.push(`Záporná pozice: ${problem}.`)
      else if (draft.type === 'SELL') {
        const warning = timeTestWarning(
          { ...portfolio, transactions: [...rest, ...transactions] },
          transactions[0].id
        )
        if (warning) issues.warnings.push(warning)
      }
    } catch (err) {
      issues.errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  // Cena velmi vzdálená tržnímu kurzu je nejčastěji překlep.
  if (
    draft.shares &&
    (draft.type === 'BUY' || draft.type === 'SELL') &&
    draft.securityId &&
    ctx.priceAt
  ) {
    const market = ctx.priceAt(draft.securityId, draft.date)
    if (market && market > 0) {
      const unit = draft.amount / draft.shares
      const diff = unit / market - 1
      if (Math.abs(diff) > 0.15) {
        issues.warnings.push(
          `Cena za kus ${unit.toFixed(2).replace('.', ',')} € se liší od tržního kurzu ${market
            .toFixed(2)
            .replace('.', ',')} € o ${Math.round(Math.abs(diff) * 100)} % – překlep?`
        )
      }
    }
  }
  return issues
}

function nameOf(portfolio: Portfolio): (id: string) => string {
  const names = new Map(portfolio.accounts.map((a) => [a.id, a.name]))
  return (id) => names.get(id) ?? id
}

function finish(portfolio: Portfolio): Portfolio {
  const problem = holdingsProblem(portfolio.transactions, nameOf(portfolio))
  if (problem) throw new Error(`Záporná pozice: ${problem}.`)
  return portfolioSchema.parse(portfolio)
}

/** Přidá transakce z formuláře (s vyrovnávacím vkladem/výběrem, je-li zapnutý). */
export function addTransactions(
  portfolio: Portfolio,
  draftsInput: unknown[],
  newId: IdGenerator = defaultId
): Portfolio {
  let current = portfolio
  for (const input of draftsInput) {
    const draft = transactionDraftSchema.parse(input)
    const { transactions, security } = draftToTransactions(current, draft, newId)
    current = {
      ...current,
      securities: security ? [...current.securities, security] : current.securities,
      transactions: [...current.transactions, ...transactions]
    }
  }
  return finish(current)
}

/**
 * Najde vyrovnávací vklad/výběr k nákupu/prodeji: nejdřív podle `linkedId`, jinak pokud je
 * v ten den na stejném účtu právě jeden nespárovaný vklad (výběr) o stejné částce
 * (tak vypadají data z importu).
 */
export function findCounterpart(portfolio: Portfolio, tx: Transaction): Transaction | null {
  const byId = new Map(portfolio.transactions.map((t) => [t.id, t]))
  if (tx.linkedId) {
    const linked = byId.get(tx.linkedId)
    if (linked && linked.linkedId === tx.id) return linked
  }
  if (tx.type !== 'BUY' && tx.type !== 'SELL') {
    return portfolio.transactions.find((t) => t.linkedId === tx.id) ?? null
  }
  const wanted = COUNTER_TYPE[tx.type]
  const candidates = portfolio.transactions.filter(
    (t) =>
      t.type === wanted &&
      !t.linkedId &&
      t.accountId === tx.accountId &&
      t.date === tx.date &&
      Math.abs(t.amount - tx.amount) < 0.005
  )
  return candidates.length === 1 ? candidates[0] : null
}

/** Upraví transakci (typ se měnit nesmí); volitelně změní i vyrovnávací vklad/výběr. */
export function updateTransaction(
  portfolio: Portfolio,
  id: string,
  draftInput: unknown,
  withCounterpart: boolean,
  newId: IdGenerator = defaultId
): Portfolio {
  const draft = transactionDraftSchema.parse(draftInput)
  const existing = portfolio.transactions.find((t) => t.id === id)
  if (!existing) throw new Error('Transakce už neexistuje.')
  if (existing.type !== draft.type)
    throw new Error('Typ transakce se nedá změnit – smaž ji a zapiš znovu.')

  const counterpart = withCounterpart ? findCounterpart(portfolio, existing) : null
  const { transactions, security } = draftToTransactions(
    portfolio,
    { ...draft, withCash: false },
    newId,
    existing
  )
  const [updated] = transactions
  if (counterpart) {
    updated.linkedId = counterpart.id
  }
  const next = portfolio.transactions.map((t) => {
    if (t.id === id) return updated
    if (counterpart && t.id === counterpart.id) {
      return {
        ...t,
        accountId: updated.accountId,
        date: updated.date,
        amount: updated.amount,
        linkedId: id
      }
    }
    return t
  })
  return finish({
    ...portfolio,
    securities: security ? [...portfolio.securities, security] : portfolio.securities,
    transactions: next
  })
}

/** Smaže transakci (volitelně i vyrovnávací vklad/výběr). */
export function deleteTransaction(
  portfolio: Portfolio,
  id: string,
  withCounterpart: boolean
): Portfolio {
  const existing = portfolio.transactions.find((t) => t.id === id)
  if (!existing) throw new Error('Transakce už neexistuje.')
  const counterpart = findCounterpart(portfolio, existing)
  const removed = new Set([id])
  if (withCounterpart && counterpart) removed.add(counterpart.id)
  const transactions = portfolio.transactions
    .filter((t) => !removed.has(t.id))
    // Zůstane-li protějšek, ztratí vazbu na smazanou transakci.
    .map((t) => (t.linkedId && removed.has(t.linkedId) ? omitLink(t) : t))
  return finish({ ...portfolio, transactions })
}

function omitLink(t: Transaction): Transaction {
  const copy = { ...t }
  delete copy.linkedId
  return copy
}
