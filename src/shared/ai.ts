import { z } from 'zod'

/** Zdrojové shrnutí ze šablony, které se má přeformulovat (čísla jsou už v něm). */
export const aiRewriteRequestSchema = z.object({ summary: z.string().min(1).max(4000) }).strict()
export type AiRewriteRequest = z.infer<typeof aiRewriteRequestSchema>

export type AiRewriteResult =
  | { status: 'ok'; text: string; model: string }
  /** Model odpověděl, ale text neprošel kontrolou (např. změněné číslo) – použije se šablona. */
  | { status: 'rejected'; message: string }
  /** Ollama neběží, chybí model nebo vypršel časový limit. */
  | { status: 'unavailable'; message: string }

/**
 * Kdo text píše: lokální Ollama (nic neopouští počítač), nebo Claude Code z počítače přes
 * předplatné Claude (zadání se posílá Anthropicu, bez API klíče).
 */
export const AI_PROVIDERS = ['ollama', 'claudecode'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  ollama: 'Ollama (lokálně)',
  claudecode: 'Claude (předplatné)'
}

/** Doporučené modely pro Claude Code; pole v Nastavení umožní zadat i jiný název. */
export const CLAUDE_MODELS: readonly (readonly [id: string, label: string])[] = [
  ['claude-sonnet-5-5', 'Sonnet 5.5 – doporučený'],
  ['claude-haiku-5-5', 'Haiku 5.5 – nejúspornější'],
  ['claude-opus-5-5', 'Opus 5.5 – kvalitnější, víc čerpá limit'],
  ['sonnet', 'Alias sonnet – vždy nejnovější Sonnet'],
  ['opus', 'Alias opus – vždy nejnovější Opus'],
  ['haiku', 'Alias haiku – vždy nejnovější Haiku']
]
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5'

export type AiStatusResult =
  | {
      status: 'ok'
      /** Ollama: stažené modely. Claude Code: prázdné. */
      models: string[]
      /** Claude Code: s jakým účtem je přihlášený (např. „předplatné max“). */
      account?: string
    }
  | { status: 'unavailable'; message: string }

// ---------------------------------------------------------------------------
// Texty článků na obrazovce Shrnutí (P27)
// ---------------------------------------------------------------------------

/** Části článku, které může napsat lokální AI. */
export const AI_PARTS = ['highlights', 'commentary', 'outlook'] as const
export type AiPart = (typeof AI_PARTS)[number]

export const AI_PART_LABELS: Record<AiPart, string> = {
  highlights: 'V kostce',
  commentary: 'Komentář',
  outlook: 'Výhled'
}

export const AI_LENGTHS = ['short', 'medium', 'long'] as const
export type AiLength = (typeof AI_LENGTHS)[number]
export const AI_LENGTH_LABELS: Record<AiLength, string> = {
  short: 'Krátký',
  medium: 'Střední',
  long: 'Dlouhý'
}

export const AI_STYLES = ['factual', 'friendly'] as const
export type AiStyle = (typeof AI_STYLES)[number]
export const AI_STYLE_LABELS: Record<AiStyle, string> = { factual: 'Věcný', friendly: 'Přátelský' }

/** Typ období článku (stejné hodnoty jako `SUMMARY_KINDS`, tady kvůli neplynutí závislostí). */
export const AI_KINDS = ['month', 'quarter', 'half', 'year'] as const

/**
 * Žádost o texty článku: fakta jako věty (z nich model smí čerpat a čísla se proti nim ověřují).
 * Co se má psát, jak dlouho a jakým stylem, určuje vždy uložené nastavení v hlavním procesu.
 */
export const aiArticleRequestSchema = z
  .object({
    kind: z.enum(AI_KINDS),
    facts: z.array(z.string().min(1).max(1200)).min(1).max(250)
  })
  .strict()
export type AiArticleRequest = z.infer<typeof aiArticleRequestSchema>

export type AiPartResult =
  /** Text prošel kontrolou: každé číslo v něm je ve faktech. */
  | { part: AiPart; status: 'ok'; lines: string[] }
  /** Model to napsal špatně (např. změněné číslo) – u této části zůstává šablona. */
  | { part: AiPart; status: 'rejected'; message: string }

export type AiArticleResult =
  | { status: 'ok'; model: string; parts: AiPartResult[] }
  /** Ollama neběží, chybí model, nebo není nic k psaní. */
  | { status: 'unavailable'; message: string }
