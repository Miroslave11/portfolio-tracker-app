import { z } from 'zod'

export const TX_TYPES = ['BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND', 'FEE'] as const
export type TxType = (typeof TX_TYPES)[number]

export const TX_TYPE_LABELS: Record<TxType, string> = {
  BUY: 'Nákup',
  SELL: 'Prodej',
  DEPOSIT: 'Vklad',
  WITHDRAWAL: 'Výběr',
  DIVIDEND: 'Dividenda',
  FEE: 'Poplatek'
}

const currencyCode = z.string().regex(/^[A-Z]{3}$/, 'Měna musí být 3písmenný kód (např. EUR)')
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/)

/** Účet = jeden broker (hotovostní a cenný účet z Portfolio Performance jsou sloučené). */
export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  currency: currencyCode,
  color: hexColor
})
export type Account = z.infer<typeof accountSchema>

/** Cenný papír = konkrétní kotace (ticker na burze). Stejný ISIN může mít víc kotací. */
export const securitySchema = z.object({
  id: z.string().min(1),
  isin: z
    .string()
    .regex(/^[A-Z0-9]{12}$/)
    .optional(),
  name: z.string().min(1),
  yahooTicker: z.string().min(1),
  currency: currencyCode,
  indexGroup: z.string().min(1),
  distributing: z.boolean(),
  color: hexColor
})
export type Security = z.infer<typeof securitySchema>

export const transactionSchema = z
  .object({
    id: z.string().min(1),
    accountId: z.string().min(1),
    date: z.iso.date(),
    type: z.enum(TX_TYPES),
    /** Vždy kladné číslo; směr toku peněz určuje typ transakce. */
    amount: z.number().positive().finite(),
    currency: currencyCode,
    note: z.string().optional(),
    securityId: z.string().optional(),
    shares: z.number().positive().finite().optional(),
    fee: z.number().nonnegative().finite().optional(),
    tax: z.number().nonnegative().finite().optional(),
    /** Vazba nákup ↔ automaticky vytvořený vklad (použije zápis transakcí v P9). */
    linkedId: z.string().optional()
  })
  .superRefine((t, ctx) => {
    if ((t.type === 'BUY' || t.type === 'SELL') && (!t.securityId || t.shares === undefined)) {
      ctx.addIssue({ code: 'custom', message: 'Nákup/prodej vyžaduje cenný papír a počet kusů' })
    }
    if (t.type === 'DIVIDEND' && !t.securityId) {
      ctx.addIssue({ code: 'custom', message: 'Dividenda vyžaduje cenný papír' })
    }
  })
export type Transaction = z.infer<typeof transactionSchema>

export const portfolioSchema = z
  .object({
    version: z.literal(1),
    accounts: z.array(accountSchema),
    securities: z.array(securitySchema),
    transactions: z.array(transactionSchema)
  })
  .superRefine((p, ctx) => {
    const accountIds = new Set(p.accounts.map((a) => a.id))
    const securityIds = new Set(p.securities.map((s) => s.id))
    const txIds = new Set<string>()
    for (const t of p.transactions) {
      if (txIds.has(t.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicitní ID transakce ${t.id}` })
      }
      txIds.add(t.id)
      if (!accountIds.has(t.accountId)) {
        ctx.addIssue({ code: 'custom', message: `Transakce ${t.id}: neznámý účet ${t.accountId}` })
      }
      if (t.securityId && !securityIds.has(t.securityId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Transakce ${t.id}: neznámý cenný papír ${t.securityId}`
        })
      }
    }
  })
export type Portfolio = z.infer<typeof portfolioSchema>

export const EMPTY_PORTFOLIO: Portfolio = {
  version: 1,
  accounts: [],
  securities: [],
  transactions: []
}

/** Výsledek importu: co se našlo, co se upravilo a co je podezřelé. */
export interface ImportReport {
  total: number
  byType: Partial<Record<TxType, number>>
  /** Typy transakcí z Portfolio Performance, které appka (zatím) nepodporuje. */
  skippedTypes: Record<string, number>
  dateFrom: string | null
  dateTo: string | null
  accounts: { id: string; name: string; transactions: number; netDeposits: number }[]
  securities: { id: string; name: string; isin: string | null; indexGroup: string }[]
  totalNetDeposits: number
  totalBought: number
  /** Informace o provedené normalizaci dat (není to chyba). */
  notes: string[]
  /** Podezřelé věci – import jde potvrdit. */
  warnings: string[]
  /** Chyby – import nelze potvrdit. */
  errors: string[]
}

export type ImportPreviewResult =
  | { status: 'canceled' }
  | { status: 'error'; message: string }
  | {
      status: 'ok'
      previewId: string
      fileName: string
      report: ImportReport
      canCommit: boolean
      existingCount: number
      replacesExisting: boolean
    }

/** Změna údajů ETF, které si uživatel upravuje sám (skupina indexu a barva). */
export const securityMetaPatchSchema = z
  .object({
    /** Všechny kotace jednoho fondu (stejný ISIN) se mění společně. */
    ids: z.array(z.string().min(1)).min(1).max(20),
    indexGroup: z.string().trim().min(1).max(40).optional(),
    color: hexColor.optional()
  })
  .strict()
export type SecurityMetaPatch = z.infer<typeof securityMetaPatchSchema>

/** Nové ETF zadané přímo při zápisu transakce (když ještě není v seznamu). */
export const newSecuritySchema = z
  .object({
    /** Ticker pro Yahoo Finance (např. VWCE.DE); stane se i ID fondu. */
    yahooTicker: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .regex(/^[A-Za-z0-9.\-^=]+$/, 'Ticker smí obsahovat jen písmena, čísla, tečku a pomlčku'),
    name: z.string().trim().min(1).max(100),
    isin: z
      .string()
      .trim()
      .regex(/^[A-Z0-9]{12}$/, 'ISIN má 12 znaků (velká písmena a čísla)')
      .optional(),
    indexGroup: z.string().trim().min(1).max(40)
  })
  .strict()
export type NewSecurity = z.infer<typeof newSecuritySchema>

/** Zápis jedné transakce z formuláře (částky jsou vždy v EUR, kladné). */
export const transactionDraftSchema = z
  .object({
    type: z.enum(TX_TYPES),
    accountId: z.string().min(1),
    date: z.iso.date(),
    securityId: z.string().min(1).optional(),
    newSecurity: newSecuritySchema.optional(),
    shares: z.number().positive().finite().optional(),
    amount: z.number().positive().finite(),
    fee: z.number().nonnegative().finite().optional(),
    note: z.string().trim().max(200).optional(),
    /** Nákup → vytvořit i vklad na účet; prodej → vytvořit i výběr. */
    withCash: z.boolean().optional()
  })
  .strict()
export type TransactionDraft = z.infer<typeof transactionDraftSchema>

/** Požadavky na úpravu a smazání (renderer posílá jen ID a data, ne celé portfolio). */
export const updateTransactionRequestSchema = z
  .object({
    id: z.string().min(1),
    draft: transactionDraftSchema,
    withCounterpart: z.boolean()
  })
  .strict()
export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>

export const deleteTransactionRequestSchema = z
  .object({ id: z.string().min(1), withCounterpart: z.boolean() })
  .strict()
export type DeleteTransactionRequest = z.infer<typeof deleteTransactionRequestSchema>
