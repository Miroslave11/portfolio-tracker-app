import {
  AI_PARTS,
  type AiArticleRequest,
  type AiArticleResult,
  type AiLength,
  type AiPart,
  type AiPartResult
} from '../shared/ai'
import type { AiSettings } from '../shared/settings'
import { buildPartPrompt, checkPartOutput, parsePartOutput } from '../core/summary-ai'
import { makeGenerator, modelName, type TextGenerator } from './ai-provider'
import { defaultOllamaFetcher, listNumbers, type OllamaFetcher } from './ollama'

/**
 * Limit čekání a horní mez délky odpovědi (tokeny) pro jednu část. Lokální modely na běžném
 * počítači píšou jen jednotky tokenů za sekundu (12B model naměřených ~3), takže delší komentář
 * trvá minuty; mez tokenů navíc brání tomu, aby se model rozepsal do nekonečna.
 */
export function partLimits(
  part: AiPart,
  length: AiLength
): { timeoutMs: number; maxTokens: number } {
  if (part !== 'commentary') return { timeoutMs: 480_000, maxTokens: 450 }
  return {
    short: { timeoutMs: 480_000, maxTokens: 450 },
    medium: { timeoutMs: 720_000, maxTokens: 800 },
    long: { timeoutMs: 900_000, maxTokens: 1200 }
  }[length]
}

const REJECTED_TEXT = {
  empty: 'Model nevrátil žádný text.',
  shape: 'Model napsal text v nepoužitelném tvaru (málo nebo příliš mnoho bodů či odstavců).',
  advice: 'Model přidal radu nebo doporučení, což aplikace nechce.'
} as const

type PartOutcome = AiPartResult | { part: AiPart; status: 'down'; message: string }

/** Napíše jednu část: u změněného čísla se model jednou opraví, pak se část zahodí. */
async function writePart(
  part: AiPart,
  request: AiArticleRequest,
  ai: AiSettings,
  length: AiLength,
  generate: TextGenerator,
  timeoutOverrideMs?: number
): Promise<PartOutcome> {
  const limits = partLimits(part, length)
  let badNumbers: number[] = []
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildPartPrompt({
      part,
      kind: request.kind,
      length,
      style: ai.style,
      facts: request.facts,
      badNumbers
    })
    const result = await generate(prompt, {
      timeoutMs: timeoutOverrideMs ?? limits.timeoutMs,
      maxTokens: limits.maxTokens
    })
    if (result.status === 'unavailable') return { part, status: 'down', message: result.message }

    const lines = parsePartOutput(part, result.text)
    const check = checkPartOutput(part, request.facts, lines)
    if (check.ok) return { part, status: 'ok', lines }
    if (check.reason !== 'numbers') {
      return {
        part,
        status: 'rejected',
        message: `${REJECTED_TEXT[check.reason]} Zůstává šablona.`
      }
    }
    badNumbers = check.unknown
  }
  return {
    part,
    status: 'rejected',
    message: `Model změnil nebo přidal číslo (${listNumbers(badNumbers)}), proto zůstává šablona.`
  }
}

/**
 * Napíše modelem (Ollama, nebo Claude Code podle nastavení) vybrané části článku z uvedených
 * faktů. Každá část se kontroluje zvlášť: změněné nebo přidané číslo = jeden druhý pokus
 * s upozorněním, pak se část zahodí a u ní zůstane šablona. Když model není dostupný (Ollama
 * neběží, Claude Code nepřihlášený nebo bez limitu), celý článek zůstane na šabloně.
 * Nikdy nevyhazuje výjimku.
 */
export async function writeArticleTexts(
  request: AiArticleRequest,
  ai: AiSettings,
  fetcher: OllamaFetcher = defaultOllamaFetcher,
  /** Přebije limity všech částí (pro testy). */
  timeoutMs?: number,
  /** Přebije volbu poskytovatele (pro testy). */
  generator?: TextGenerator
): Promise<AiArticleResult> {
  const generate = generator ?? makeGenerator(ai, { fetcher })
  const wanted = AI_PARTS.filter((p) => ai.parts.includes(p))
  if (wanted.length === 0) {
    return {
      status: 'unavailable',
      message: 'V Nastavení → Umělá inteligence není vybráno, co má AI psát.'
    }
  }
  const length = request.kind === 'month' ? ai.monthLength : ai.periodLength
  const parts: AiPartResult[] = []

  for (const part of wanted) {
    const outcome = await writePart(part, request, ai, length, generate, timeoutMs)
    if (outcome.status !== 'down') {
      parts.push(outcome)
      continue
    }
    // Model není dostupný (neběží, chybí, vypršel limit): nic dalšího se nezkouší.
    if (parts.length === 0) return { status: 'unavailable', message: outcome.message }
    const done = new Set(parts.map((r) => r.part))
    for (const rest of wanted.filter((p) => !done.has(p))) {
      parts.push({ part: rest, status: 'rejected', message: `${outcome.message} Zůstává šablona.` })
    }
    break
  }
  return { status: 'ok', model: modelName(ai), parts }
}
