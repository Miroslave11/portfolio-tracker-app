import { buildRewritePrompt, checkRewrite } from '../core/monthly-summary'
import type { AiRewriteResult, AiStatusResult } from '../shared/ai'

/** Ollama poslouchá jen na tomto počítači; jiná adresa se nikdy nepoužije. */
export const OLLAMA_BASE_URL = 'http://127.0.0.1:11434'

/** Dotaz na seznam modelů je rychlý; generování může u prvního dotazu čekat na načtení modelu. */
export const STATUS_TIMEOUT_MS = 4_000
/** Nejdelší doba jednoho generování (přeformulování na Přehledu); článek má vlastní limity. */
export const GENERATE_TIMEOUT_MS = 300_000
/** Jak dlouho se čeká na první kousek textu (načtení modelu do paměti, zpracování zadání). */
export const START_TIMEOUT_MS = 240_000
/** Jak dlouho smí model mlčet uprostřed psaní, než se spojení považuje za zaseknuté. */
export const IDLE_TIMEOUT_MS = 90_000

export interface OllamaResponse {
  ok: boolean
  status: number
  json(): Promise<unknown>
  /** Proud odpovědi (u `stream: true` řádky JSON); chybí-li, čte se celé `json()`. */
  body?: ReadableStream<Uint8Array> | null
}
export type OllamaFetcher = (
  url: string,
  init: { method: 'GET' | 'POST'; body?: string; signal: AbortSignal }
) => Promise<OllamaResponse>

export const defaultOllamaFetcher: OllamaFetcher = (url, init) =>
  fetch(url, {
    method: init.method,
    body: init.body,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
    signal: init.signal
  })

/** Je adresa smyčka na tento počítač? (pojistka, aby se text portfolia nikdy neposlal ven) */
export function isLocalhostUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      (protocol === 'http:' || protocol === 'https:') &&
      (hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname.endsWith('.localhost'))
    )
  } catch {
    return false
  }
}

class OllamaError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
  }
}

const seconds = (ms: number): number => Math.round(ms / 1000)

const NOT_RUNNING = 'Ollama neběží (nebo není nainstalovaná). Spusť ji a zkus to znovu.'

/**
 * Srozumitelná hláška k chybě spojení. „Ollama neběží“ se hlásí jen při odmítnutém spojení
 * (nebo když příčinu neznáme); přerušené spojení má vlastní text, aby uživatele nezmátl.
 */
function connectionMessage(err: unknown): string {
  const code = (err as { cause?: { code?: unknown } } | null)?.cause?.code
  if (typeof code === 'string' && code !== 'ECONNREFUSED') {
    return `Spojení s Ollamou se přerušilo (${code}). Ollama mohla skončit nebo se restartovat, zkus to znovu.`
  }
  return NOT_RUNNING
}

/** Přečte proud řádků JSON z Ollamy; po každém přijatém kousku zavolá `onActivity`. */
async function readGenerateStream(
  body: ReadableStream<Uint8Array>,
  onActivity: () => void
): Promise<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  const take = (line: string): void => {
    if (line.trim() === '') return
    let chunk: { response?: unknown; error?: unknown }
    try {
      chunk = JSON.parse(line) as typeof chunk
    } catch {
      throw new OllamaError('Ollama poslala nečitelnou odpověď.')
    }
    if (typeof chunk.error === 'string') {
      throw new OllamaError(`Ollama hlásí chybu: ${chunk.error}`)
    }
    if (typeof chunk.response === 'string') text += chunk.response
  }
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value) {
        onActivity()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        lines.forEach(take)
      }
      if (done) break
    }
    take(buffer + decoder.decode())
  } finally {
    reader.cancel().catch(() => undefined)
  }
  return text
}

export interface StreamLimits {
  /** Čekání na první kousek textu a na ticho uprostřed psaní. */
  startMs: number
  idleMs: number
}

async function call(
  fetcher: OllamaFetcher,
  path: string,
  method: 'GET' | 'POST',
  body: unknown,
  timeoutMs: number,
  streaming?: StreamLimits
): Promise<unknown> {
  const url = `${OLLAMA_BASE_URL}${path}`
  if (!isLocalhostUrl(url))
    throw new OllamaError('Lokální AI smí komunikovat jen s tímto počítačem.')

  const controller = new AbortController()
  let received = false
  let timedOut: OllamaError | null = null
  const noAnswer = (ms: number): string =>
    `Ollama neodpověděla do ${seconds(ms)} s. Zkus to znovu, nebo zvol menší model.`
  const abortWith = (message: string): void => {
    timedOut = new OllamaError(message)
    controller.abort(timedOut)
  }
  const totalTimer = setTimeout(
    () =>
      abortWith(
        received
          ? `Psaní trvalo déle než ${seconds(timeoutMs)} s a bylo přerušeno. Zkus kratší text nebo menší model.`
          : noAnswer(streaming?.startMs ?? timeoutMs)
      ),
    timeoutMs
  )
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const armIdle = (): void => {
    if (!streaming) return
    clearTimeout(idleTimer)
    const ms = received ? streaming.idleMs : streaming.startMs
    idleTimer = setTimeout(
      () =>
        abortWith(
          received
            ? `Ollama přestala psát (${seconds(ms)} s bez nového textu). Zkus to znovu.`
            : noAnswer(ms)
        ),
      ms
    )
  }
  armIdle()

  try {
    let response: OllamaResponse
    try {
      response = await fetcher(url, {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
    } catch (err) {
      if (timedOut) throw timedOut
      const name = err instanceof Error ? err.name : ''
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new OllamaError(noAnswer(timeoutMs))
      }
      throw new OllamaError(connectionMessage(err))
    }
    if (response.status === 404) throw new OllamaError('NOT_FOUND')
    if (!response.ok)
      throw new OllamaError(`Ollama vrátila chybu ${response.status}.`, response.status)

    if (streaming && response.body) {
      try {
        const text = await readGenerateStream(response.body, () => {
          received = true
          armIdle()
        })
        return { response: text }
      } catch (err) {
        if (timedOut) throw timedOut
        if (err instanceof OllamaError) throw err
        throw new OllamaError(
          'Spojení s Ollamou se uprostřed psaní přerušilo (Ollama mohla skončit nebo se restartovat). Zkus to znovu.'
        )
      }
    }
    try {
      return await response.json()
    } catch {
      if (timedOut) throw timedOut
      throw new OllamaError('Ollama poslala nečitelnou odpověď.')
    }
  } finally {
    clearTimeout(totalTimer)
    clearTimeout(idleTimer)
  }
}

/** Zjistí, zda Ollama běží, a vrátí názvy stažených modelů. */
export async function ollamaStatus(
  fetcher: OllamaFetcher = defaultOllamaFetcher,
  timeoutMs = STATUS_TIMEOUT_MS
): Promise<AiStatusResult> {
  try {
    const data = (await call(fetcher, '/api/tags', 'GET', undefined, timeoutMs)) as {
      models?: { name?: unknown }[]
    }
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === 'string')
      .sort((a, b) => a.localeCompare(b))
    return { status: 'ok', models }
  } catch (err) {
    return { status: 'unavailable', message: errorText(err) }
  }
}

function errorText(err: unknown): string {
  return err instanceof OllamaError && err.message !== 'NOT_FOUND'
    ? err.message
    : 'Ollama neodpověděla.'
}

export type GenerateResult =
  | { status: 'ok'; text: string }
  /** Ollama neběží, chybí model, vypršel limit … (srozumitelná zpráva). */
  | { status: 'unavailable'; message: string }

/**
 * Jedno volání modelu: pošle `prompt` a vrátí text odpovědi. Nikdy nevyhazuje výjimku.
 * Odpověď se čte průběžně (stream), takže delší psaní nenarazí na limit čekání na celou
 * odpověď: `timeoutMs` je nejdelší doba psaní, kromě toho se hlídá, že model nemlčí
 * (první text do `START_TIMEOUT_MS`, pak nejvýš `IDLE_TIMEOUT_MS` ticha).
 * Myslící modely se přepnou do režimu bez „přemýšlení“; modely, které parametr neznají, se
 * zkusí znovu bez něj.
 */
export async function generateText(
  model: string,
  prompt: string,
  fetcher: OllamaFetcher = defaultOllamaFetcher,
  timeoutMs = GENERATE_TIMEOUT_MS,
  options: Record<string, number> = {},
  /** Přebije hlídání ticha (pro testy). */
  limits: Partial<StreamLimits> = {}
): Promise<GenerateResult> {
  const streaming: StreamLimits = {
    startMs: limits.startMs ?? Math.min(timeoutMs, START_TIMEOUT_MS),
    idleMs: limits.idleMs ?? Math.min(timeoutMs, IDLE_TIMEOUT_MS)
  }
  const generate = (withThinkOff: boolean): Promise<unknown> =>
    call(
      fetcher,
      '/api/generate',
      'POST',
      {
        model,
        prompt,
        stream: true,
        // Myslící modely (gemma4, qwen3…) by jinak desítky sekund jen „přemýšlely“ a nestihly text.
        ...(withThinkOff ? { think: false } : {}),
        options: { temperature: 0.2, ...options }
      },
      timeoutMs,
      streaming
    )

  let data: { response?: unknown }
  try {
    try {
      data = (await generate(true)) as { response?: unknown }
    } catch (err) {
      // Modely bez podpory thinking odmítnou parametr think (400) – zkusí se znovu bez něj.
      if (err instanceof OllamaError && err.status === 400) {
        data = (await generate(false)) as { response?: unknown }
      } else {
        throw err
      }
    }
  } catch (err) {
    if (err instanceof OllamaError && err.message === 'NOT_FOUND') {
      return {
        status: 'unavailable',
        message: `Model „${model}“ není v Ollamě stažený (stáhneš ho příkazem: ollama pull ${model}).`
      }
    }
    return { status: 'unavailable', message: errorText(err) }
  }
  return { status: 'ok', text: typeof data.response === 'string' ? data.response : '' }
}

/**
 * Přeformuluje shrnutí lokálním modelem a výsledek zkontroluje: nesedí-li jakékoli číslo,
 * text se zahodí. Nikdy nevyhazuje výjimku – chyby vrací jako výsledek.
 */
export async function rewriteSummary(
  summary: string,
  model: string,
  fetcher: OllamaFetcher = defaultOllamaFetcher,
  timeoutMs = GENERATE_TIMEOUT_MS,
  /** Jiný zdroj textu než Ollama (např. Claude Code); `model` je pak jen název do výsledku. */
  generate?: (prompt: string) => Promise<GenerateResult>
): Promise<AiRewriteResult> {
  const prompt = buildRewritePrompt(summary)
  const result = generate
    ? await generate(prompt)
    : await generateText(model, prompt, fetcher, timeoutMs)
  if (result.status === 'unavailable') return result

  const check = checkRewrite(summary, result.text)
  if (check.ok) return { status: 'ok', text: check.text, model }
  return {
    status: 'rejected',
    message:
      check.reason === 'numbers'
        ? `Model v textu změnil nebo přidal číslo (${listNumbers(check.unknown)}), proto ho nepoužívám. Zůstává strohé shrnutí.`
        : 'Model vrátil nepoužitelný text. Zůstává strohé shrnutí.'
  }
}

/** Sporná čísla česky a bez opakování (nejvýš 5), ať je v hlášce vidět, co model pokazil. */
export function listNumbers(numbers: readonly number[]): string {
  const unique = [...new Set(numbers)]
  const shown = unique.slice(0, 5).map((n) => String(n).replace('.', ','))
  return shown.join('; ') + (unique.length > shown.length ? '; …' : '')
}
