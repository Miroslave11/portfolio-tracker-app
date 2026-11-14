import { z } from 'zod'
import {
  portfolioSchema,
  type Account,
  type ImportReport,
  type Portfolio,
  type Security,
  type Transaction,
  type TxType
} from '../shared/model'
import { roundMoney } from './money'
import { CATALOG, FALLBACK_SECURITY_COLOR, UNKNOWN_INDEX_GROUP } from './securities-catalog'

/** Mapování typů transakcí z Portfolio Performance na typy naší appky. */
const TYPE_MAP: Record<string, TxType> = {
  PURCHASE: 'BUY',
  SALE: 'SELL',
  DEPOSIT: 'DEPOSIT',
  REMOVAL: 'WITHDRAWAL',
  DIVIDEND: 'DIVIDEND',
  DIVIDENDS: 'DIVIDEND',
  FEE: 'FEE',
  FEES: 'FEE'
}

const BROKER_COLORS: Record<string, string> = {
  Freedom24: '#f59e0b',
  XTB: '#6366f1',
  Degiro: '#0ea5e9'
}
const FALLBACK_ACCOUNT_COLOR = '#8b92a5'

const ppFileSchema = z.object({
  version: z.number().optional(),
  transactions: z.array(z.unknown())
})

const ppTransactionSchema = z.object({
  type: z.string(),
  account: z.string().min(1),
  portfolio: z.string().optional(),
  date: z.iso.date(),
  currency: z.string(),
  amount: z.number().positive().finite(),
  shares: z.number().positive().finite().optional(),
  note: z.string().optional(),
  security: z
    .object({
      name: z.string().optional(),
      isin: z.string().optional(),
      ticker: z.string().optional(),
      currency: z.string().optional()
    })
    .optional()
})

export interface ImportResult {
  /** `null`, pokud se při importu našly chyby. */
  portfolio: Portfolio | null
  report: ImportReport
}

type Draft = Omit<Transaction, 'id'> & { order: number }

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** „XTB - EUR cash“ i „XTB - EUR portfolio“ → „XTB“. */
function brokerName(accountName: string): string {
  return accountName.split(' - ')[0].trim()
}

function emptyReport(): ImportReport {
  return {
    total: 0,
    byType: {},
    skippedTypes: {},
    dateFrom: null,
    dateTo: null,
    accounts: [],
    securities: [],
    totalNetDeposits: 0,
    totalBought: 0,
    notes: [],
    warnings: [],
    errors: []
  }
}

/**
 * Převede JSON export z Portfolio Performance na náš datový model
 * a vyhlásí, co se při tom upravilo nebo zdá podezřelé.
 */
export function importPortfolioPerformance(input: unknown): ImportResult {
  const report = emptyReport()
  const file = ppFileSchema.safeParse(input)
  if (!file.success) {
    report.errors.push(
      'Soubor nemá očekávaný formát Portfolio Performance (chybí seznam „transactions“).'
    )
    return { portfolio: null, report }
  }
  if (file.data.version !== undefined && file.data.version !== 1) {
    report.warnings.push(
      `Verze exportu je ${file.data.version}, appka počítá s verzí 1 – zkontroluj výsledek.`
    )
  }

  const accounts = new Map<string, Account>()
  const accountRawNames = new Map<string, Set<string>>()
  const securities = new Map<string, Security>()
  const trimmedNames = new Set<string>()
  const drafts: Draft[] = []

  file.data.transactions.forEach((raw, index) => {
    const label = `Transakce č. ${index + 1}`
    const parsed = ppTransactionSchema.safeParse(raw)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      report.errors.push(`${label}: neplatný záznam (${issue.path.join('.')}: ${issue.message})`)
      return
    }
    const t = parsed.data

    const type = TYPE_MAP[t.type]
    if (!type) {
      report.skippedTypes[t.type] = (report.skippedTypes[t.type] ?? 0) + 1
      return
    }

    // --- účet (broker) ---
    const broker = brokerName(t.account)
    const accountId = slug(broker)
    if (!accounts.has(accountId)) {
      accounts.set(accountId, {
        id: accountId,
        name: broker,
        currency: t.currency,
        color: BROKER_COLORS[broker] ?? FALLBACK_ACCOUNT_COLOR
      })
    }
    const rawNames = accountRawNames.get(accountId) ?? new Set<string>()
    rawNames.add(t.account)
    if (t.portfolio) {
      rawNames.add(t.portfolio)
      if (brokerName(t.portfolio) !== broker) {
        report.warnings.push(
          `${label}: účet „${t.account}“ a portfolio „${t.portfolio}“ patří k různým brokerům – použit je broker z účtu.`
        )
      }
    }
    accountRawNames.set(accountId, rawNames)

    // --- cenný papír ---
    let securityId: string | undefined
    if (t.security) {
      const ticker = (t.security.ticker ?? t.security.name ?? '').trim()
      if (!ticker) {
        report.errors.push(`${label}: cenný papír nemá ticker ani název`)
        return
      }
      if (t.security.name && t.security.name !== t.security.name.trim()) trimmedNames.add(ticker)
      securityId = ticker
      const isin = t.security.isin?.trim() || undefined
      const existing = securities.get(ticker)
      if (existing) {
        if (isin && existing.isin && isin !== existing.isin) {
          report.warnings.push(
            `${ticker}: v exportu jsou dva různé ISIN (${existing.isin} a ${isin}), použit je první.`
          )
        } else if (isin && !existing.isin) {
          existing.isin = isin
        }
      } else {
        const cat = CATALOG[ticker]
        securities.set(ticker, {
          id: ticker,
          isin,
          name: cat?.name ?? (t.security.name?.trim() || ticker),
          yahooTicker: ticker,
          currency: t.security.currency?.trim() || t.currency,
          indexGroup: cat?.indexGroup ?? UNKNOWN_INDEX_GROUP,
          distributing: cat?.distributing ?? false,
          color: cat?.color ?? FALLBACK_SECURITY_COLOR
        })
      }
    }

    const draft: Draft = {
      order: index,
      accountId,
      date: t.date,
      type,
      amount: t.amount,
      currency: t.currency
    }
    if (securityId) draft.securityId = securityId
    if (t.shares !== undefined) draft.shares = t.shares
    if (t.note?.trim()) draft.note = t.note.trim()
    drafts.push(draft)
  })

  for (const [type, count] of Object.entries(report.skippedTypes)) {
    report.warnings.push(
      `Přeskočeno ${count}× transakce typu „${type}“ (appka ji zatím nepodporuje).`
    )
  }

  // --- doplnění ISIN z katalogu ---
  const filledIsin: string[] = []
  for (const sec of securities.values()) {
    if (!sec.isin) {
      const cat = CATALOG[sec.id]
      if (cat) {
        sec.isin = cat.isin
        filledIsin.push(sec.id)
      }
    }
  }
  if (filledIsin.length) report.notes.push(`ISIN doplněn z katalogu: ${filledIsin.join(', ')}.`)
  const noIsin = [...securities.values()].filter((s) => !s.isin).map((s) => s.id)
  if (noIsin.length) {
    report.warnings.push(`Bez ISIN (alokace je nebude umět sloučit): ${noIsin.join(', ')}.`)
  }
  if (trimmedNames.size) {
    report.notes.push(`Odstraněny přebytečné mezery v názvech: ${[...trimmedNames].join(', ')}.`)
  }

  // --- sloučení účtů ---
  for (const [id, names] of accountRawNames) {
    if (names.size > 1) {
      report.notes.push(
        `Účty ${[...names].map((n) => `„${n}“`).join(' a ')} sloučeny do jednoho účtu ${accounts.get(id)!.name}.`
      )
    }
  }

  // --- stejný fond na více burzách ---
  const byIsin = new Map<string, string[]>()
  for (const sec of securities.values()) {
    if (sec.isin) byIsin.set(sec.isin, [...(byIsin.get(sec.isin) ?? []), sec.id])
  }
  for (const [isin, ids] of byIsin) {
    if (ids.length > 1) {
      report.notes.push(`${ids.join(' a ')} jsou tentýž fond (${isin}) – v alokaci se sloučí.`)
    }
  }

  // --- seřazení a přidělení ID ---
  drafts.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
  const transactions: Transaction[] = drafts.map((d, i) => {
    const { order: _order, ...rest } = d
    void _order
    return { id: `t${String(i + 1).padStart(5, '0')}`, ...rest }
  })

  // --- kontrola záporných pozic (prodej více kusů, než je drženo) ---
  const held = new Map<string, number>()
  const warned = new Set<string>()
  const ordered = [...transactions].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.type === 'SELL') - Number(b.type === 'SELL') ||
      a.id.localeCompare(b.id)
  )
  for (const t of ordered) {
    if ((t.type !== 'BUY' && t.type !== 'SELL') || !t.securityId || t.shares === undefined) continue
    const key = `${t.accountId}|${t.securityId}`
    const next = (held.get(key) ?? 0) + (t.type === 'BUY' ? t.shares : -t.shares)
    held.set(key, next)
    if (next < -1e-9 && !warned.has(key)) {
      warned.add(key)
      report.warnings.push(
        `${t.date}: prodej ${t.shares} ks ${t.securityId} na ${accounts.get(t.accountId)!.name} překračuje držený počet (chybí starší nákup?).`
      )
    }
  }

  // --- souhrn ---
  const netByAccount = new Map<string, number>()
  const countByAccount = new Map<string, number>()
  for (const t of transactions) {
    report.byType[t.type] = (report.byType[t.type] ?? 0) + 1
    countByAccount.set(t.accountId, (countByAccount.get(t.accountId) ?? 0) + 1)
    if (t.type === 'DEPOSIT') {
      netByAccount.set(t.accountId, (netByAccount.get(t.accountId) ?? 0) + t.amount)
    } else if (t.type === 'WITHDRAWAL') {
      netByAccount.set(t.accountId, (netByAccount.get(t.accountId) ?? 0) - t.amount)
    } else if (t.type === 'BUY') {
      report.totalBought += t.amount
    }
  }
  report.total = transactions.length
  report.totalBought = roundMoney(report.totalBought)
  report.dateFrom = transactions[0]?.date ?? null
  report.dateTo = transactions.at(-1)?.date ?? null
  report.accounts = [...accounts.values()].map((a) => ({
    id: a.id,
    name: a.name,
    transactions: countByAccount.get(a.id) ?? 0,
    netDeposits: roundMoney(netByAccount.get(a.id) ?? 0)
  }))
  report.totalNetDeposits = roundMoney(report.accounts.reduce((s, a) => s + a.netDeposits, 0))
  report.securities = [...securities.values()].map((s) => ({
    id: s.id,
    name: s.name,
    isin: s.isin ?? null,
    indexGroup: s.indexGroup
  }))

  if (report.total === 0 && report.errors.length === 0) {
    report.errors.push('V souboru nejsou žádné použitelné transakce.')
  }
  if (report.errors.length > 0) return { portfolio: null, report }

  const result = portfolioSchema.safeParse({
    version: 1,
    accounts: [...accounts.values()],
    securities: [...securities.values()],
    transactions
  })
  if (!result.success) {
    report.errors.push(`Interní kontrola dat selhala: ${result.error.issues[0].message}`)
    return { portfolio: null, report }
  }
  return { portfolio: result.data, report }
}
