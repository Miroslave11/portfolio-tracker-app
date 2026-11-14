/**
 * Claude z počítače (Claude Code) jako píšící model – přes měsíční předplatné, ne přes API.
 *
 * Aplikace spustí nainstalovaný `claude.exe` jako program (`claude -p`, odpověď jako JSON) a pošle
 * mu zadání přes stdin. Nic neplatí z API: proměnné s klíčem (ANTHROPIC_*) se programu nepředávají
 * a Claude Code přihlášený přes API klíč / Console se odmítne. Program běží bez nástrojů, bez MCP,
 * bez nastavení uživatele a v prázdné složce (nenačte cizí CLAUDE.md). Předplatné má limity
 * využití – při jejich vyčerpání se ukáže srozumitelná chyba.
 *
 * Pozor na soukromí: na rozdíl od Ollamy zadání (fakta o portfoliu) odchází Anthropicu.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, delimiter, join } from 'node:path'
import type { AiStatusResult } from '../shared/ai'
import type { GenerateResult } from './ollama'

export interface CliResult {
  code: number | null
  stdout: string
  stderr: string
}
export interface CliOptions {
  env: NodeJS.ProcessEnv
  cwd: string
  timeoutMs: number
}
export type CliRunner = (
  exe: string,
  args: string[],
  input: string,
  opts: CliOptions
) => Promise<CliResult>

export class CliTimeout extends Error {}

/** Spustí program, pošle mu `input` na vstup a počká na konec (nebo na časový limit). */
export const runCli: CliRunner = (exe, args, input, { env, cwd, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env, cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    let done = false
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, timeoutMs)
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      fn()
    }
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (err += d))
    child.on('error', (e) => finish(() => reject(e)))
    child.on('close', (code) =>
      finish(() =>
        timedOut ? reject(new CliTimeout()) : resolve({ code, stdout: out, stderr: err })
      )
    )
    child.stdin.on('error', () => undefined) // program skončil dřív, než přečetl vstup
    child.stdin.end(input)
  })

/** Proměnné prostředí bez čehokoli, co by Claude Code přesměrovalo na API nebo cizí relaci. */
export function cliEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(base)) {
    if (
      /^(ANTHROPIC_|CLAUDECODE$|CLAUDE_CODE_|CLAUDE_AGENT_|CLAUDE_PREVIEW_|CLAUDE_EFFORT$|CLAUDE_PID$|AI_AGENT$|BAGGAGE$)/i.test(
        k
      )
    )
      continue
    env[k] = v
  }
  return env
}

/**
 * Cesta ke `claude.exe`: zadaná v Nastavení (musí existovat a jmenovat se claude), jinak obvyklé
 * místo a PATH. '' = nenalezen. Pojistka: v Nastavení nejde zadat libovolný program.
 */
export function findClaude(
  custom = '',
  env: NodeJS.ProcessEnv = process.env,
  home = homedir()
): string {
  const own = custom.trim()
  if (own) return /^claude(\.exe)?$/i.test(basename(own)) && existsSync(own) ? own : ''
  const candidates = [join(home, '.local', 'bin', 'claude.exe')]
  for (const dir of (env['PATH'] ?? env['Path'] ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, 'claude.exe'))
  }
  return candidates.find((p) => existsSync(p)) ?? ''
}

/** Prázdná složka, ve které Claude Code běží (aby nenačetl cizí CLAUDE.md ani nastavení projektu). */
function workDir(): string {
  const dir = join(tmpdir(), 'portfolio-tracker-claude')
  mkdirSync(dir, { recursive: true })
  return dir
}

const NOT_INSTALLED =
  'Claude Code není v počítači nainstalovaný (nebo ho aplikace nenašla). Nainstaluj ho z claude.com/claude-code, případně zadej cestu k claude.exe v Nastavení.'
const NOT_LOGGED_IN =
  'Claude Code není přihlášený. V terminálu spusť příkaz  claude auth login  a přihlaš se svým předplatným, pak to zkus znovu.'
const API_LOGIN =
  'Claude Code je přihlášený přes API klíč / Console – to by se platilo z API. Odhlas ho (claude auth logout) a přihlaš se předplatným: claude auth login.'

const cache = new Map<string, { at: number; status: AiStatusResult }>()
export const clearClaudeCodeCache = (): void => cache.clear()

/** Je Claude Code nainstalovaný a přihlášený předplatným? (Výsledek se na chvíli pamatuje.) */
export async function checkClaudeCode(
  custom: string,
  run: CliRunner = runCli,
  now: () => number = Date.now
): Promise<AiStatusResult> {
  const exe = findClaude(custom)
  if (!exe) return { status: 'unavailable', message: NOT_INSTALLED }
  const hit = cache.get(exe)
  if (hit && now() - hit.at < (hit.status.status === 'ok' ? 60_000 : 3_000)) return hit.status

  let status: AiStatusResult
  try {
    const r = await run(exe, ['auth', 'status'], '', {
      env: cliEnv(),
      cwd: workDir(),
      timeoutMs: 30_000
    })
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) as {
      loggedIn?: boolean
      authMethod?: string
      apiProvider?: string
      subscriptionType?: string
    }
    const method = String(j.authMethod ?? '')
    if (!j.loggedIn) status = { status: 'unavailable', message: NOT_LOGGED_IN }
    else if (
      /api[_ -]?key|console|bedrock|vertex|foundry/i.test(method) ||
      (j.apiProvider && j.apiProvider !== 'firstParty')
    ) {
      status = { status: 'unavailable', message: API_LOGIN }
    } else {
      status = {
        status: 'ok',
        models: [],
        account: j.subscriptionType ? `předplatné ${j.subscriptionType}` : 'předplatné'
      }
    }
  } catch (err) {
    status = {
      status: 'unavailable',
      message:
        err instanceof CliTimeout
          ? 'Claude Code neodpověděl (zkontroluj ho v terminálu).'
          : `Claude Code se nepodařilo spustit: ${(err as Error).message}`
    }
  }
  cache.set(exe, { at: now(), status })
  return status
}

/** Chyba hlášená Claude Code (text z `result`) → srozumitelná zpráva. */
export function cliErrorMessage(text: string, status: number | null): string {
  if (/not logged in|\/login|please run .*login|invalid api key|authentication/i.test(text)) {
    return NOT_LOGGED_IN
  }
  if (
    status === 429 ||
    /usage limit|rate limit|limit reached|too many requests|overloaded|resets? at/i.test(text)
  ) {
    return `Předplatné Claude dosáhlo limitu využití (${text.slice(0, 120) || 'HTTP 429'}). Zkus to později – limit se obnovuje po několika hodinách – nebo přepni na Ollamu.`
  }
  if (/credit balance|billing/i.test(text)) {
    return 'Claude Code hlásí problém s účtem (kredit / platba). Zkontroluj přihlášení: claude auth status.'
  }
  return `Claude Code vrátil chybu: ${text.slice(0, 200) || `HTTP ${status ?? '?'}`}`
}

interface CliAnswer {
  is_error?: boolean
  result?: string
  stop_reason?: string
  api_error_status?: number | null
}

/** Nejdelší doba čekání na odpověď Claude Code (běžně jde o desítky sekund). */
export const CLAUDE_TIMEOUT_MS = 180_000

const SYSTEM_PROMPT =
  'You write short Czech texts for a personal investment-portfolio app. Follow the instructions in the user message exactly and reply with ONLY the requested text, without any preface or explanation.'

/**
 * Jedno volání Claude Code: pošle `prompt` a vrátí text odpovědi. Nikdy nevyhazuje výjimku.
 * `maxTokens` se nepoužije (program ho nemá) – délku určuje zadání.
 */
export async function claudeGenerate(
  model: string,
  customPath: string,
  prompt: string,
  timeoutMs: number = CLAUDE_TIMEOUT_MS,
  run: CliRunner = runCli
): Promise<GenerateResult> {
  const status = await checkClaudeCode(customPath, run)
  if (status.status === 'unavailable') return status
  const exe = findClaude(customPath)
  const args = [
    '-p',
    '--output-format',
    'json',
    '--tools',
    '', // žádné nástroje: jen odpověď
    '--strict-mcp-config',
    '--disable-slash-commands',
    '--no-session-persistence',
    '--setting-sources',
    'project', // bez nastavení a háčků uživatele
    '--system-prompt',
    SYSTEM_PROMPT,
    '--model',
    model,
    '--effort',
    'low'
  ]
  let r: CliResult
  try {
    r = await run(exe, args, prompt, {
      env: cliEnv(),
      cwd: workDir(),
      timeoutMs: Math.min(timeoutMs, CLAUDE_TIMEOUT_MS)
    })
  } catch (err) {
    return {
      status: 'unavailable',
      message:
        err instanceof CliTimeout
          ? `Claude Code ${Math.round(Math.min(timeoutMs, CLAUDE_TIMEOUT_MS) / 60_000)} min neodpověděl. Zkus to znovu.`
          : `Claude Code se nepodařilo spustit: ${(err as Error).message}`
    }
  }
  let a: CliAnswer
  try {
    a = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))) as CliAnswer
  } catch {
    const detail = r.stderr ? `: ${r.stderr.trim().slice(0, 200)}` : ` (kód ${r.code})`
    return { status: 'unavailable', message: `Claude Code vrátil nečekanou odpověď${detail}.` }
  }
  if (a.is_error) {
    return {
      status: 'unavailable',
      message: cliErrorMessage(a.result ?? '', a.api_error_status ?? null)
    }
  }
  if (a.stop_reason === 'max_tokens') {
    return { status: 'unavailable', message: 'Odpověď Claude byla příliš dlouhá a byla useknuta.' }
  }
  const text = (a.result ?? '').trim()
  if (!text) return { status: 'unavailable', message: 'Claude Code vrátil prázdnou odpověď.' }
  return { status: 'ok', text }
}
