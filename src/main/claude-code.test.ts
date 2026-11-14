import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AiArticleRequest } from '../shared/ai'
import { DEFAULT_AI, aiSchema, settingsSchema, type AiSettings } from '../shared/settings'
import { writeArticleTexts } from './ai-article'
import { aiStatus, makeGenerator, modelName } from './ai-provider'
import {
  checkClaudeCode,
  claudeGenerate,
  clearClaudeCodeCache,
  CliTimeout,
  cliEnv,
  cliErrorMessage,
  findClaude,
  type CliResult,
  type CliRunner
} from './claude-code'

/** Falešný claude.exe v dočasné složce (aplikace ověřuje, že soubor existuje). */
function fakeExe(name = 'claude.exe'): string {
  const dir = mkdtempSync(join(tmpdir(), 'pt-claude-'))
  const exe = join(dir, name)
  writeFileSync(exe, '')
  return exe
}

const json = (o: unknown): CliResult => ({ code: 0, stdout: JSON.stringify(o), stderr: '' })
const LOGGED_IN = json({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'max' })

/** Falešný program: `auth status` vrátí přihlášení, ostatní volání předá `answer`. */
function cli(answer: (args: string[], input: string) => CliResult | Error): {
  run: CliRunner
  calls: { args: string[]; input: string; env: NodeJS.ProcessEnv }[]
} {
  const calls: { args: string[]; input: string; env: NodeJS.ProcessEnv }[] = []
  const run: CliRunner = async (_exe, args, input, { env }) => {
    if (args[0] === 'auth') return LOGGED_IN
    calls.push({ args, input, env })
    const out = answer(args, input)
    if (out instanceof Error) throw out
    return out
  }
  return { run, calls }
}

beforeEach(() => clearClaudeCodeCache())

describe('findClaude', () => {
  it('vlastní cesta musí existovat a jmenovat se claude', () => {
    expect(findClaude(fakeExe())).toMatch(/claude\.exe$/)
    expect(findClaude(join(tmpdir(), 'neexistuje', 'claude.exe'))).toBe('')
    // Libovolný program zadat nejde (jen claude / claude.exe)
    expect(findClaude(fakeExe('calc.exe'))).toBe('')
  })
})

describe('cliEnv', () => {
  it('nepředá klíče ani relaci jiného Claude Code', () => {
    const env = cliEnv({
      PATH: 'x',
      ANTHROPIC_API_KEY: 'k',
      ANTHROPIC_AUTH_TOKEN: 't',
      CLAUDECODE: '1',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      HOME: 'h'
    })
    expect(env).toEqual({ PATH: 'x', HOME: 'h' })
  })
})

describe('checkClaudeCode', () => {
  it('nenainstalovaný → srozumitelná zpráva', async () => {
    const r = await checkClaudeCode(join(tmpdir(), 'neexistuje', 'claude.exe'))
    expect(r).toMatchObject({ status: 'unavailable', message: expect.stringContaining('není') })
  })

  it('přihlášený předplatným → ok s účtem', async () => {
    const { run } = cli(() => new Error('nemá se volat'))
    expect(await checkClaudeCode(fakeExe(), run)).toEqual({
      status: 'ok',
      models: [],
      account: 'předplatné max'
    })
  })

  it('nepřihlášený → návod na přihlášení', async () => {
    const run: CliRunner = async () => json({ loggedIn: false })
    const r = await checkClaudeCode(fakeExe(), run)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('auth login')
    })
  })

  it('přihlášený přes API klíč se odmítne (platilo by se z API)', async () => {
    const run: CliRunner = async () => json({ loggedIn: true, authMethod: 'api_key' })
    const r = await checkClaudeCode(fakeExe(), run)
    expect(r).toMatchObject({ status: 'unavailable', message: expect.stringContaining('API') })
  })

  it('program neodpoví → zpráva místo výjimky', async () => {
    const run: CliRunner = async () => {
      throw new CliTimeout()
    }
    const r = await checkClaudeCode(fakeExe(), run)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('neodpověděl')
    })
  })

  it('výsledek se krátce pamatuje (druhé volání program nespustí)', async () => {
    let n = 0
    const run: CliRunner = async () => (n++, LOGGED_IN)
    const exe = fakeExe()
    await checkClaudeCode(exe, run)
    await checkClaudeCode(exe, run)
    expect(n).toBe(1)
  })
})

describe('claudeGenerate', () => {
  it('pošle zadání na vstup, model a bezpečné přepínače, vrátí text', async () => {
    const { run, calls } = cli(() => json({ result: '  Ahoj světe  ', is_error: false }))
    const r = await claudeGenerate('claude-sonnet-5-5', fakeExe(), 'Napiš pozdrav', 1000, run)
    expect(r).toEqual({ status: 'ok', text: 'Ahoj světe' })
    expect(calls).toHaveLength(1)
    const { args, input, env } = calls[0]
    expect(input).toBe('Napiš pozdrav')
    expect(args).toEqual(expect.arrayContaining(['-p', '--model', 'claude-sonnet-5-5']))
    expect(args[args.indexOf('--tools') + 1]).toBe('') // žádné nástroje
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--no-session-persistence')
    expect(Object.keys(env).some((k) => k.startsWith('ANTHROPIC_'))).toBe(false)
  })

  it('limit využití → srozumitelná zpráva s návrhem přepnout', async () => {
    const { run } = cli(() =>
      json({ is_error: true, result: 'Claude usage limit reached', api_error_status: 429 })
    )
    const r = await claudeGenerate('sonnet', fakeExe(), 'x', 1000, run)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('limitu využití')
    })
  })

  it('časový limit, nečitelná a prázdná odpověď → unavailable, nikdy výjimka', async () => {
    const exe = fakeExe()
    const slow = cli(() => new CliTimeout())
    expect((await claudeGenerate('sonnet', exe, 'x', 1000, slow.run)).status).toBe('unavailable')
    const junk = cli(() => ({ code: 1, stdout: 'chyba', stderr: 'boom' }))
    expect(await claudeGenerate('sonnet', exe, 'x', 1000, junk.run)).toMatchObject({
      message: expect.stringContaining('nečekanou odpověď')
    })
    const empty = cli(() => json({ result: '  ' }))
    expect(await claudeGenerate('sonnet', exe, 'x', 1000, empty.run)).toMatchObject({
      message: expect.stringContaining('prázdnou')
    })
  })

  it('cliErrorMessage rozpozná odhlášení a problém s účtem', () => {
    expect(cliErrorMessage('Not logged in · Please run /login', null)).toContain('auth login')
    expect(cliErrorMessage('Credit balance is too low', null)).toContain('kredit')
  })
})

describe('výběr poskytovatele', () => {
  const claudeAi = (path: string): AiSettings => ({
    ...DEFAULT_AI,
    enabled: true,
    provider: 'claudecode',
    claudePath: path
  })

  it('starý soubor nastavení bez poskytovatele = Ollama', () => {
    const old = aiSchema.parse({ enabled: true, model: 'llama3.2' })
    expect(old).toMatchObject({
      provider: 'ollama',
      claudeModel: 'claude-sonnet-5-5',
      claudePath: ''
    })
    expect(settingsSchema.parse({}).ai).toEqual(DEFAULT_AI)
  })

  it('název modelu pro Claude nesmí začínat pomlčkou (nebyl by to model, ale přepínač)', () => {
    expect(aiSchema.shape.claudeModel.safeParse('--dangerous').success).toBe(false)
    expect(aiSchema.shape.claudeModel.safeParse('claude-opus-5-5').success).toBe(true)
  })

  it('modelName a stav odpovídají zvolené službě', async () => {
    const exe = fakeExe()
    expect(modelName({ ...DEFAULT_AI })).toBe('llama3.2')
    expect(modelName(claudeAi(exe))).toBe('claude-sonnet-5-5')
    const { run } = cli(() => new Error('x'))
    expect(await aiStatus(claudeAi(exe), { cli: run })).toMatchObject({
      status: 'ok',
      account: 'předplatné max'
    })
  })

  it('článek přes Claude Code: části se napíšou a čísla ověří', async () => {
    const exe = fakeExe()
    const request: AiArticleRequest = {
      kind: 'month',
      facts: ['Hodnota portfolia na konci 1 575 €.', 'Výkon portfolia za měsíc: +5,00 %.']
    }
    const { run, calls } = cli(() =>
      json({ result: 'Portfolio mělo na konci 1 575 €.\nVýkon za měsíc byl +5,00 %.' })
    )
    const ai = { ...claudeAi(exe), parts: ['highlights' as const] }
    const r = await writeArticleTexts(
      request,
      ai,
      undefined,
      undefined,
      makeGenerator(ai, { cli: run })
    )
    expect(r).toMatchObject({
      status: 'ok',
      model: 'claude-sonnet-5-5',
      parts: [{ part: 'highlights', status: 'ok' }]
    })
    expect(calls).toHaveLength(1)
  })

  it('změněné číslo od Claude: jeden opravný pokus, pak zůstane šablona', async () => {
    const exe = fakeExe()
    const request: AiArticleRequest = { kind: 'month', facts: ['Hodnota portfolia 1 575 €.'] }
    const { run, calls } = cli(() => json({ result: 'Portfolio mělo 9 999 €.\nTo je hodně.' }))
    const ai = { ...claudeAi(exe), parts: ['highlights' as const] }
    const r = await writeArticleTexts(
      request,
      ai,
      undefined,
      undefined,
      makeGenerator(ai, { cli: run })
    )
    expect(r).toMatchObject({ status: 'ok', parts: [{ part: 'highlights', status: 'rejected' }] })
    expect(calls).toHaveLength(2)
  })

  it('Claude Code nepřihlášený → celý článek zůstane na šabloně', async () => {
    const exe = fakeExe()
    const run: CliRunner = async () => json({ loggedIn: false })
    const ai = claudeAi(exe)
    const r = await writeArticleTexts(
      { kind: 'month', facts: ['Hodnota 1 €.'] },
      ai,
      undefined,
      undefined,
      makeGenerator(ai, { cli: run })
    )
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('auth login')
    })
  })
})
