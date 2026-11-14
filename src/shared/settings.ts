import { z } from 'zod'
import { AI_LENGTHS, AI_PARTS, AI_PROVIDERS, AI_STYLES, DEFAULT_CLAUDE_MODEL } from './ai'
import { kindSections, SUMMARY_KINDS, SUMMARY_SECTIONS, type SummaryKind } from './summary'

export const THEME_IDS = ['dark', 'light', 'midnight', 'oled', 'warm'] as const
export const ACCENT_IDS = ['indigo', 'emerald', 'sky', 'amber', 'rose', 'violet'] as const
export const CURRENCIES = ['EUR', 'CZK'] as const

export type ThemeId = (typeof THEME_IDS)[number]
export type AccentId = (typeof ACCENT_IDS)[number]
export type DisplayCurrency = (typeof CURRENCIES)[number]

/** Jeden řádek měsíčního nákupu: kde a co se pravidelně kupuje (a typicky kolik). */
export const monthlyPlanItemSchema = z
  .object({
    accountId: z.string().min(1),
    securityId: z.string().min(1),
    /** Typický počet kusů; částka se při zápisu dopočítá z kurzu. */
    shares: z.number().positive().finite().optional(),
    /** Typická částka v EUR (alternativa k počtu kusů). */
    amount: z.number().positive().finite().optional()
  })
  .strict()

/** Šablona měsíčního nákupu („spořicí plán“). */
export const monthlyPlanSchema = z
  .object({
    items: z.array(monthlyPlanItemSchema).min(1).max(12),
    /** Od kterého dne v měsíci upozorňovat, že ještě nic nenakoupeno. */
    remindFromDay: z.number().int().min(1).max(28)
  })
  .strict()
export type MonthlyPlan = z.infer<typeof monthlyPlanSchema>
export type MonthlyPlanItem = z.infer<typeof monthlyPlanItemSchema>

/** Cíl a předpoklady projekce (obrazovka Cíl). Výnos je zlomek (0,07 = 7 % ročně). */
export const goalSchema = z
  .object({
    targetCzk: z.number().int().min(10_000).max(1_000_000_000),
    /** Plánovaný měsíční vklad v EUR. */
    monthlyEur: z.number().min(0).max(1_000_000),
    annualReturn: z.number().min(-0.5).max(0.5),
    /** Očekávaná budoucí inflace (pro režim „po inflaci“); chybí = výchozí 2,5 %. */
    inflation: z.number().min(0).max(0.2).optional(),
    /** Kolísavost (roční volatilita) pro Monte Carlo; chybí = z historie portfolia. */
    volatility: z.number().min(0).max(0.6).optional()
  })
  .strict()
export type Goal = z.infer<typeof goalSchema>

export const DEFAULT_FUTURE_INFLATION = 0.025

export const DEFAULT_GOAL: Goal = { targetCzk: 5_000_000, monthlyEur: 1000, annualReturn: 0.07 }

export const WITHDRAWAL_SOURCES = ['goal', 'current', 'custom'] as const
export const WITHDRAWAL_MODES = ['sell', 'dividends'] as const
export const DEFAULT_DIVIDEND_TICKER = 'SCHD'

/** Yahoo ticker (např. EUNL.DE, SCHD, ^GSPC). */
export const tickerSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .regex(/^[A-Za-z0-9.^=-]+$/)

/** Kalkulačka čerpání (obrazovka Cíl). Částky v Kč, výnos a inflace jako zlomek. */
export const withdrawalSchema = z
  .object({
    /** Z čeho se čerpá: cíl, dnešní hodnota portfolia, nebo vlastní částka. */
    source: z.enum(WITHDRAWAL_SOURCES),
    customCzk: z.number().int().min(0).max(10_000_000_000),
    /** Počáteční měsíční čerpání (každý rok se zvyšuje o inflaci). */
    monthlyCzk: z.number().min(0).max(10_000_000),
    annualReturn: z.number().min(-0.2).max(0.3),
    inflation: z.number().min(0).max(0.2),
    // --- varianta „Jen dividendy“ (P19b); výchozí hodnoty, aby šlo načíst i starší uložení ---
    /** Odprodej kapitálu, nebo čerpání jen dividend. */
    mode: z.enum(WITHDRAWAL_MODES).default('sell'),
    /** Yahoo ticker dividendového ETF. */
    dividendTicker: tickerSchema.default(DEFAULT_DIVIDEND_TICKER),
    /** Ručně zadaný dividendový výnos a růst dividend; chybí = z historie výplat. */
    dividendYield: z.number().min(0).max(0.2).optional(),
    dividendGrowth: z.number().min(-0.1).max(0.3).optional(),
    /** Daň z dividend (srážková v zahraničí + případný doplatek v ČR). */
    dividendTax: z.number().min(0).max(0.5).default(0.15)
  })
  .strict()
export type Withdrawal = z.infer<typeof withdrawalSchema>

export const DEFAULT_WITHDRAWAL: Withdrawal = {
  source: 'goal',
  customCzk: 5_000_000,
  monthlyCzk: 20_000,
  annualReturn: 0.05,
  inflation: 0.025,
  mode: 'sell',
  dividendTicker: DEFAULT_DIVIDEND_TICKER,
  dividendTax: 0.15
}

/** Cílová alokace podle skupiny indexu (obrazovka Alokace → Cílová alokace). */
export const rebalanceSchema = z
  .object({
    /** Cílové podíly 0–1 podle skupiny indexu (součet by měl být 1). */
    targets: z
      .array(
        z
          .object({ group: z.string().trim().min(1).max(60), share: z.number().min(0).max(1) })
          .strict()
      )
      .max(30),
    /** Částka měsíčního nákupu v EUR, která se rozděluje; chybí = měsíční vklad z Cíle. */
    monthlyEur: z.number().min(0).max(1_000_000).optional()
  })
  .strict()
export type Rebalance = z.infer<typeof rebalanceSchema>
export const DEFAULT_REBALANCE: Rebalance = { targets: [] }

export const DEFAULT_OLLAMA_MODEL = 'llama3.2'

/**
 * Lokální AI (Ollama na tomto počítači): volitelná přeformulace měsíčního shrnutí na Přehledu
 * a psaní textů článků na obrazovce Shrnutí. Pole `parts`, `monthLength`, `periodLength` a `style`
 * přibyla v P27 – starší soubor je nemá, proto mají výchozí hodnoty.
 */
export const aiSchema = z
  .object({
    enabled: z.boolean(),
    /** Název staženého modelu v Ollamě (např. llama3.2, gemma3). */
    model: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9._:/-]+$/),
    /** Kdo píše: Ollama, nebo Claude Code (předplatné). Starší soubor má Ollamu. */
    provider: z.enum(AI_PROVIDERS).default('ollama'),
    /** Model pro Claude Code (celý název nebo alias); nesmí začínat pomlčkou. */
    claudeModel: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/)
      .default(DEFAULT_CLAUDE_MODEL),
    /** Cesta ke claude.exe; prázdné = najít automaticky. */
    claudePath: z.string().trim().max(500).default(''),
    /** Které části článku píše AI (ostatní zůstávají ze šablony). */
    parts: z
      .array(z.enum(AI_PARTS))
      .max(AI_PARTS.length)
      .default([...AI_PARTS]),
    /** Délka komentáře u měsíčního článku a u kvartálu, pololetí a roku. */
    monthLength: z.enum(AI_LENGTHS).default('medium'),
    periodLength: z.enum(AI_LENGTHS).default('long'),
    style: z.enum(AI_STYLES).default('factual')
  })
  .strict()
export type AiSettings = z.infer<typeof aiSchema>
export const DEFAULT_AI: AiSettings = {
  enabled: false,
  model: DEFAULT_OLLAMA_MODEL,
  provider: 'ollama',
  claudeModel: DEFAULT_CLAUDE_MODEL,
  claudePath: '',
  parts: [...AI_PARTS],
  monthLength: 'medium',
  periodLength: 'long',
  style: 'factual'
}

/** Výběr sekcí článku pro jeden typ období (rozsah = přednastavený výběr). */
const summaryScopeSchema = z
  .object({ sections: z.array(z.enum(SUMMARY_SECTIONS)).max(SUMMARY_SECTIONS.length) })
  .strict()

const fullScope = (kind: SummaryKind): z.infer<typeof summaryScopeSchema> => ({
  sections: kindSections(kind)
})

/**
 * Nastavení → Shrnutí portfolia: sekce pro každý typ období a které typy se vytvářejí
 * automaticky. Kvartál, pololetí, rok a `auto` přibyly v P26 – starší soubor je nemá,
 * proto mají výchozí hodnoty.
 */
export const summarySettingsSchema = z
  .object({
    month: summaryScopeSchema,
    quarter: summaryScopeSchema.default(fullScope('quarter')),
    half: summaryScopeSchema.default(fullScope('half')),
    year: summaryScopeSchema.default(fullScope('year')),
    /** Typy období, které se po skončení vytvoří samy. */
    auto: z
      .array(z.enum(SUMMARY_KINDS))
      .max(SUMMARY_KINDS.length)
      .default([...SUMMARY_KINDS])
  })
  .strict()
export type SummarySettings = z.infer<typeof summarySettingsSchema>
export const DEFAULT_SUMMARY_SETTINGS: SummarySettings = {
  month: fullScope('month'),
  quarter: fullScope('quarter'),
  half: fullScope('half'),
  year: fullScope('year'),
  auto: [...SUMMARY_KINDS]
}

/** Yahoo ticker benchmarku pro srovnání výkonu (např. EUNL.DE = MSCI World). */
export const benchmarkTickerSchema = tickerSchema
export const DEFAULT_BENCHMARK = 'EUNL.DE'

/**
 * Nastavení aplikace. Každé pole má `.catch()` – poškozená nebo neznámá
 * hodnota v souboru se tiše nahradí výchozí, místo aby appka spadla.
 */
export const settingsSchema = z.object({
  version: z.literal(1).catch(1),
  theme: z.enum(THEME_IDS).catch('dark'),
  accent: z.enum(ACCENT_IDS).catch('indigo'),
  followSystemTheme: z.boolean().catch(false),
  displayCurrency: z.enum(CURRENCIES).catch('EUR'),
  /** Stahovat kurzy automaticky při spuštění a každou hodinu. */
  autoRefreshPrices: z.boolean().catch(true),
  /** Šablona měsíčního nákupu; `null` = ještě nenastavena. */
  monthlyPlan: monthlyPlanSchema.nullable().catch(null),
  /** Cíl a předpoklady projekce. */
  goal: goalSchema.catch(DEFAULT_GOAL),
  /** Kalkulačka čerpání. */
  withdrawal: withdrawalSchema.catch(DEFAULT_WITHDRAWAL),
  /** Cílová alokace (rebalancing dokupováním). */
  rebalance: rebalanceSchema.catch(DEFAULT_REBALANCE),
  /** Benchmark pro srovnání na obrazovce Výkon. */
  benchmark: benchmarkTickerSchema.catch(DEFAULT_BENCHMARK),
  /** Zobrazovat hodnoty v dnešních cenách (po inflaci). */
  realValues: z.boolean().catch(false),
  /** Automaticky hledat a stahovat nové verze aplikace (GitHub Releases). */
  autoUpdate: z.boolean().catch(true),
  /** Verze aplikace, která byla naposledy spuštěná (pro hlášku po aktualizaci); prázdné = ještě žádná. */
  lastVersion: z.string().max(40).catch(''),
  /** Lokální AI pro měsíční shrnutí (výchozí vypnuto). */
  ai: aiSchema.catch(DEFAULT_AI),
  /** Rozsah článků na obrazovce Shrnutí portfolia. */
  summary: summarySettingsSchema.catch(DEFAULT_SUMMARY_SETTINGS)
})

export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({})

/** Částečná změna nastavení posílaná z UI – validuje se striktně (bez tichých náhrad). */
export const settingsPatchSchema = z
  .object({
    theme: z.enum(THEME_IDS),
    accent: z.enum(ACCENT_IDS),
    followSystemTheme: z.boolean(),
    displayCurrency: z.enum(CURRENCIES),
    autoRefreshPrices: z.boolean(),
    monthlyPlan: monthlyPlanSchema.nullable(),
    goal: goalSchema,
    withdrawal: withdrawalSchema,
    rebalance: rebalanceSchema,
    benchmark: benchmarkTickerSchema,
    realValues: z.boolean(),
    autoUpdate: z.boolean(),
    lastVersion: z.string().max(40),
    ai: aiSchema,
    summary: summarySettingsSchema
  })
  .partial()
  .strict()

export type SettingsPatch = z.infer<typeof settingsPatchSchema>
