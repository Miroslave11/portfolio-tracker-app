import { z } from 'zod'
import { AI_PARTS } from './ai'

/** Typy období shrnutí; v P24 se vytváří jen měsíc, ostatní přibudou v P26. */
export const SUMMARY_KINDS = ['month', 'quarter', 'half', 'year'] as const
export type SummaryKind = (typeof SUMMARY_KINDS)[number]

const num = z.number().finite()
const date = z.iso.date()
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
/** „2026-10“, „2026-Q3“, „2026-H1“ nebo „2026“ */
const period = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2]|Q[1-4]|H[12]))?$/)

/** Obchod v měsíci (nákup nebo prodej ETF). */
const tradeSchema = z.object({
  date,
  type: z.enum(['BUY', 'SELL']),
  broker: z.string().max(60),
  ticker: z.string().max(40),
  amount: num,
  shares: num
})

const dividendSchema = z.object({ date, ticker: z.string().max(40), amount: num })

/** Jedno ETF v měsíci: hodnota a jeho příspěvek k výsledku (bez vlivu nákupů a prodejů). */
const etfRowSchema = z.object({
  ticker: z.string().max(40),
  name: z.string().max(200),
  valueStart: num,
  valueEnd: num,
  /** Podíl na hodnotě ETF v portfoliu na konci měsíce (0–1). */
  weight: num,
  bought: num,
  sold: num,
  dividends: num,
  /** Změna hodnoty bez nákupů a prodejů, včetně dividend (EUR). */
  contribution: num,
  /** Výkon v měsíci (zlomek); `null` = příliš malý základ. */
  pct: num.nullable(),
  /** Kurz chybí a hodnota je jen odhad z ceny posledního obchodu. */
  estimated: z.boolean()
})

/** Den s výkonem (zlomek) – nejlepší / nejhorší den. */
const dayMoveSchema = z.object({ date, pct: num })

/** Údaje pro detailní sekce (P25). Starší články je nemají – zobrazí se výzva k „Vytvořit znovu“. */
export const monthDetailSchema = z.object({
  /** Srovnání s benchmarkem (obrazovka Výkon); `null` = benchmark nemá kurzy. */
  benchmark: z
    .object({
      ticker: z.string().max(40),
      name: z.string().max(200),
      periodReturn: num.nullable(),
      ytdReturn: num.nullable()
    })
    .nullable(),
  risk: z.object({
    worstDay: dayMoveSchema.nullable(),
    bestDay: dayMoveSchema.nullable(),
    /** Roční kolísavost z denních výnosů v měsíci a za posledních 12 měsíců. */
    volatility: num.nullable(),
    volatilityTypical: num.nullable()
  }),
  /** Alokace podle skupin indexu vs. cílová alokace; `null` = cíle nejsou nastavené. */
  allocation: z
    .object({
      rows: z
        .array(z.object({ group: z.string().max(60), share: num, target: num, buy: num }))
        .max(30),
      /** Částka dalšího měsíčního nákupu, která se rozděluje (EUR). */
      monthlyEur: num,
      /** Za kolik měsíců pravidelného dokupování se alokace srovná; `null` = nesrovná. */
      monthsToTarget: z.number().int().nullable()
    })
    .nullable(),
  /** Odhad dosažení cíle při předpokladech z obrazovky Cíl (±3 p. b. výnosu). */
  projection: z
    .object({
      annualReturn: num,
      monthlyEur: num,
      months: z.number().int().nullable(),
      monthsLow: z.number().int().nullable(),
      monthsHigh: z.number().int().nullable()
    })
    .nullable(),
  /** Časový test 3 roky ke konci měsíce a co se uvolní v dalším měsíci. */
  timeTest: z
    .object({
      totalValue: num,
      freeValue: num,
      /** „RRRR-MM“ následujícího měsíce. */
      nextMonth: month,
      releasing: z
        .array(z.object({ ticker: z.string().max(40), buyDate: date, freeFrom: date, value: num }))
        .max(300),
      /** Podíl hodnoty po časovém testu na konci roku (při dnešních cenách). */
      freeShareYearEnd: num
    })
    .nullable()
})
export type MonthDetail = z.infer<typeof monthDetailSchema>

/** Jeden měsíc v tabulce delšího období (kvartál, pololetí, rok). */
const monthRowSchema = z.object({
  month,
  valueEnd: num,
  netDeposits: num,
  marketChange: num,
  periodReturn: num.nullable(),
  bought: num
})

/**
 * Ověřená čísla článku za období (měsíc, kvartál, pololetí, rok). Vše v EUR (měna kurzů);
 * Kč jen tam, kde je uvedeno. Ukládá se tak, jak se vytvořilo, aby se starší shrnutí samo
 * neměnilo. Pole označená „P26“ starší (měsíční) články nemají.
 */
export const monthArticleFactsSchema = z.object({
  /** Typ období (P26); chybí = měsíc. */
  kind: z.enum(SUMMARY_KINDS).optional(),
  period,
  /** První a poslední den měsíce. */
  from: date,
  to: date,
  /** Den, ke kterému jsou hodnoty (poslední den měsíce, nebo poslední známý kurz). */
  asOf: date,
  partial: z.boolean(),
  valueStart: num,
  valueEnd: num,
  valueEndCzk: num.nullable(),
  /** Kurz ČNB Kč/€ na konci předchozího a tohoto měsíce. */
  fxStart: num.nullable(),
  fxEnd: num.nullable(),
  /** Vklady minus výběry v měsíci. */
  netDeposits: num,
  /** Změna hodnoty bez vkladů a výběrů = změna cen + dividendy − poplatky. */
  marketChange: num,
  priceChange: num,
  dividends: num,
  fees: num,
  /** Výkon za měsíc bez vlivu vkladů (TTWROR); `null` = nejde spočítat. */
  periodReturn: num.nullable(),
  /** Výkon od začátku roku do konce měsíce. */
  ytdReturn: num.nullable(),
  /** Výkon předchozího období stejného typu (P26). */
  prevPeriodReturn: num.nullable().optional(),
  /** Největší pokles během měsíce (z výkonu bez vkladů). */
  drawdown: z.object({ pct: num, from: date, to: date }).nullable(),
  bought: num,
  buyCount: z.number().int().min(0),
  /** Nakoupeno v předchozím měsíci; `null` = žádný předchozí měsíc dat. */
  boughtPrevious: num.nullable(),
  /** Plánovaný měsíční vklad v EUR (z Cíle); `null` = není nastaven. */
  planMonthly: num.nullable(),
  /** Počet měsíců období s daty – plán za období = měsíční plán × tento počet (P26). */
  periodMonths: z.number().int().min(1).max(12).optional(),
  /** Nakoupeno od začátku roku a počet měsíců roku s daty (pro porovnání s plánem). */
  boughtYtd: num,
  monthsYtd: z.number().int().min(1).max(12),
  /** Denní hodnota portfolia v měsíci [datum, EUR]. */
  daily: z.array(z.tuple([date, num])).max(366),
  trades: z.array(tradeSchema).max(500),
  dividendList: z.array(dividendSchema).max(500),
  dividendsYtd: num,
  /** Dividendy za posledních 12 měsíců do konce tohoto měsíce. */
  dividends12m: num,
  etfs: z.array(etfRowSchema).max(100),
  goal: z
    .object({
      targetCzk: num,
      valueCzk: num,
      progress: num,
      /** Postup na konci předchozího měsíce; `null` bez kurzu nebo dat. */
      progressPrev: num.nullable()
    })
    .nullable(),
  /** Tabulka po měsících u delších období (P26). */
  months: z.array(monthRowSchema).max(12).optional(),
  /** Realizovaný zisk z prodejů v období (P26, informativně); `null` = žádný prodej. */
  realized: z
    .object({ count: z.number().int().min(1), proceeds: num, gain: num, exemptGain: num })
    .nullable()
    .optional(),
  detail: monthDetailSchema.optional()
})
export type MonthArticleFacts = z.infer<typeof monthArticleFactsSchema>
export type EtfRow = MonthArticleFacts['etfs'][number]
export type ArticleTrade = MonthArticleFacts['trades'][number]

/**
 * Texty, které pro článek napsala lokální AI (P27). Každá část prošla kontrolou čísel proti
 * faktům článku; části, které model napsal špatně, zůstaly ze šablony (`rejected`).
 */
export const articleAiTextsSchema = z.object({
  model: z.string().max(100),
  /** Kdy AI text napsala (ISO čas). */
  createdAt: z.iso.datetime(),
  highlights: z.array(z.string().max(1500)).max(8).optional(),
  commentary: z.array(z.string().max(3000)).max(10).optional(),
  outlook: z.array(z.string().max(1500)).max(8).optional(),
  rejected: z
    .array(z.object({ part: z.enum(AI_PARTS), message: z.string().max(400) }))
    .max(AI_PARTS.length)
    .default([])
})
export type ArticleAiTexts = z.infer<typeof articleAiTextsSchema>

export const summaryArticleSchema = z.object({
  /** „month-2026-10“ */
  id: z.string().regex(/^[a-z]+-[0-9A-Z-]+$/),
  kind: z.enum(SUMMARY_KINDS),
  /** „2026-10“ (měsíc) */
  period: z.string().min(4).max(10),
  /** Kdy byl článek vytvořen (ISO čas). */
  createdAt: z.iso.datetime(),
  facts: monthArticleFactsSchema,
  /** Text od lokální AI; chybí = celý text je ze šablony. */
  ai: articleAiTextsSchema.optional()
})
export type SummaryArticle = z.infer<typeof summaryArticleSchema>

export const summaryFileSchema = z.object({
  version: z.literal(1),
  articles: z.array(summaryArticleSchema)
})

/** Uložení článků z rendereru: nové nahradí stávající se stejným `id`. */
export const summarySaveRequestSchema = z.array(summaryArticleSchema).min(1).max(600)

export const monthArticleId = (p: string): string => `month-${p}`
export const articleId = (kind: SummaryKind, p: string): string => `${kind}-${p}`

// ---------------------------------------------------------------------------
// Rozsah článku (Nastavení → Shrnutí portfolia)
// ---------------------------------------------------------------------------

/** Volitelné sekce článku v pořadí zobrazení („V kostce“ a hlavní čísla jsou vždy). */
export const SUMMARY_SECTIONS = [
  'commentary',
  'course',
  'waterfall',
  'etfs',
  'months',
  'purchases',
  'benchmark',
  'risk',
  'allocation',
  'goal',
  'yearReview',
  'fx',
  'taxes',
  'outlook'
] as const
export type SummarySection = (typeof SUMMARY_SECTIONS)[number]

export const SECTION_LABELS: Record<SummarySection, string> = {
  commentary: 'Komentář',
  course: 'Průběh období',
  waterfall: 'Odkud se vzala změna',
  etfs: 'Jednotlivá ETF',
  months: 'Po měsících',
  purchases: 'Nákupy vs. plán',
  benchmark: 'Srovnání s trhem',
  risk: 'Riziko',
  allocation: 'Alokace vs. cíl',
  goal: 'Cesta k cíli',
  yearReview: 'Rok v číslech',
  fx: 'Kurz EUR/CZK',
  taxes: 'Daně – časový test',
  outlook: 'Výhled'
}

/** Sekce, které potřebují údaje z P25 (`facts.detail`). */
export const DETAIL_SECTIONS: readonly SummarySection[] = [
  'benchmark',
  'risk',
  'allocation',
  'taxes',
  'outlook'
]

export const SUMMARY_LEVELS = ['short', 'standard', 'detail'] as const
export type SummaryLevel = (typeof SUMMARY_LEVELS)[number]

export const LEVEL_LABELS: Record<SummaryLevel | 'custom', string> = {
  short: 'Stručný',
  standard: 'Standardní',
  detail: 'Detailní',
  custom: 'Vlastní'
}

/** Které sekce obsahuje každá úroveň rozsahu (u typu období jen ty, které pro něj dávají smysl). */
export const LEVEL_SECTIONS: Record<SummaryLevel, readonly SummarySection[]> = {
  short: ['goal', 'yearReview'],
  standard: [
    'commentary',
    'course',
    'waterfall',
    'etfs',
    'months',
    'purchases',
    'goal',
    'yearReview'
  ],
  detail: SUMMARY_SECTIONS
}

/** Sekce, které u typu období dávají smysl („Po měsících“ ne u měsíce, „Rok v číslech“ jen u roku). */
export function kindSections(kind: SummaryKind): SummarySection[] {
  return SUMMARY_SECTIONS.filter(
    (s) => (s !== 'months' || kind !== 'month') && (s !== 'yearReview' || kind === 'year')
  )
}

/** Sekce úrovně rozsahu pro daný typ období. */
export function levelSections(level: SummaryLevel, kind: SummaryKind): SummarySection[] {
  const allowed = new Set(kindSections(kind))
  return LEVEL_SECTIONS[level].filter((s) => allowed.has(s))
}

/** Úroveň, které odpovídá výběr sekcí; jinak „vlastní“. */
export function levelOf(
  sections: readonly SummarySection[],
  kind: SummaryKind = 'month'
): SummaryLevel | 'custom' {
  const allowed = new Set(kindSections(kind))
  const set = new Set(sections.filter((s) => allowed.has(s)))
  for (const level of SUMMARY_LEVELS) {
    const want = levelSections(level, kind)
    if (want.length === set.size && want.every((s) => set.has(s))) return level
  }
  return 'custom'
}
