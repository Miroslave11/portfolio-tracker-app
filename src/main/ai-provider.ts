import type { AiStatusResult } from '../shared/ai'
import type { AiSettings } from '../shared/settings'
import { checkClaudeCode, claudeGenerate, type CliRunner } from './claude-code'
import {
  defaultOllamaFetcher,
  generateText,
  ollamaStatus,
  type GenerateResult,
  type OllamaFetcher
} from './ollama'

/** Jedno volání modelu: zadání → text (nebo srozumitelná zpráva, proč to nešlo). Nevyhazuje výjimku. */
export type TextGenerator = (
  prompt: string,
  opts: { timeoutMs: number; maxTokens?: number }
) => Promise<GenerateResult>

/** Co se dá podstrčit v testech: falešná Ollama a falešný program Claude Code. */
export interface AiDeps {
  fetcher?: OllamaFetcher
  cli?: CliRunner
}

/** Název modelu podle zvoleného poskytovatele (ukládá se k textu článku). */
export function modelName(ai: AiSettings): string {
  return ai.provider === 'claudecode' ? ai.claudeModel : ai.model
}

/** Generátor textu podle nastavení: Ollama na tomto počítači, nebo Claude Code (předplatné). */
export function makeGenerator(ai: AiSettings, deps: AiDeps = {}): TextGenerator {
  if (ai.provider === 'claudecode') {
    return (prompt, { timeoutMs }) =>
      claudeGenerate(ai.claudeModel, ai.claudePath, prompt, timeoutMs, deps.cli)
  }
  const fetcher = deps.fetcher ?? defaultOllamaFetcher
  return (prompt, { timeoutMs, maxTokens }) =>
    generateText(
      ai.model,
      prompt,
      fetcher,
      timeoutMs,
      maxTokens === undefined ? {} : { num_predict: maxTokens }
    )
}

/** Stav zvolené služby: Ollama běží a má modely / Claude Code je nainstalovaný a přihlášený. */
export function aiStatus(ai: AiSettings, deps: AiDeps = {}): Promise<AiStatusResult> {
  return ai.provider === 'claudecode'
    ? checkClaudeCode(ai.claudePath, deps.cli)
    : ollamaStatus(deps.fetcher)
}
