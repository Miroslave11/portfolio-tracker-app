import { describe, expect, it } from 'vitest'
import { DEFAULT_AI, aiSchema, type AiSettings } from '../shared/settings'
import type { AiArticleRequest } from '../shared/ai'
import { partLimits, writeArticleTexts } from './ai-article'
import type { OllamaFetcher } from './ollama'

const FACTS = [
  'Období: Říjen 2025 (1. 10. 2025 – 31. 10. 2025).',
  'Hodnota portfolia na začátku období 1 000 €, na konci 1 575 €; změna +575 €.',
  'Výkon portfolia za měsíc bez vlivu vkladů: +5,00 %.',
  'Výhled: Plánovaný nákup 100 €.'
]
const REQUEST: AiArticleRequest = { kind: 'month', facts: FACTS }
const AI: AiSettings = { ...DEFAULT_AI, enabled: true }

/** Které části se v dotazu žádá (podle úkolu v promptu). */
const partOf = (prompt: string): 'highlights' | 'commentary' | 'outlook' =>
  prompt.includes('Napiš „V kostce“')
    ? 'highlights'
    : prompt.includes('Napiš „Výhled“')
      ? 'outlook'
      : 'commentary'

const GOOD = {
  highlights: 'Portfolio vzrostlo na 1 575 €.\nVýkon byl +5,00 %.',
  commentary: 'Hodnota portfolia vzrostla o 575 €.\n\nVýkon byl 5 %.'.replace('5 %', '+5,00 %'),
  outlook: 'Plánovaný nákup je 100 €.'
}

const reply = (response: string, status = 200): ReturnType<OllamaFetcher> =>
  Promise.resolve({ ok: status < 300, status, json: async () => ({ response }) })

/** Simulovaná Ollama: `answer(část, pořadí pokusu, prompt)` vrátí text, nebo Promise.reject. */
function ollama(
  answer: (
    part: 'highlights' | 'commentary' | 'outlook',
    attempt: number,
    prompt: string
  ) => string | Error
): { fetcher: OllamaFetcher; prompts: string[] } {
  const prompts: string[] = []
  const attempts = { highlights: 0, commentary: 0, outlook: 0 }
  const fetcher: OllamaFetcher = (_url, init) => {
    const body = JSON.parse(init.body ?? '{}') as { prompt: string }
    prompts.push(body.prompt)
    const part = partOf(body.prompt)
    const out = answer(part, ++attempts[part], body.prompt)
    return out instanceof Error ? Promise.reject(out) : reply(out)
  }
  return { fetcher, prompts }
}

describe('writeArticleTexts', () => {
  it('napíše všechny vybrané části a ověří je', async () => {
    const { fetcher, prompts } = ollama((part) => GOOD[part])
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    expect(r).toEqual({
      status: 'ok',
      model: 'llama3.2',
      parts: [
        {
          part: 'highlights',
          status: 'ok',
          lines: ['Portfolio vzrostlo na 1 575 €.', 'Výkon byl +5,00 %.']
        },
        {
          part: 'commentary',
          status: 'ok',
          lines: ['Hodnota portfolia vzrostla o 575 €.', 'Výkon byl +5,00 %.']
        },
        { part: 'outlook', status: 'ok', lines: ['Plánovaný nákup je 100 €.'] }
      ]
    })
    expect(prompts).toHaveLength(3)
    expect(prompts.every((p) => p.includes('- Hodnota portfolia na začátku období 1 000 €'))).toBe(
      true
    )
  })

  it('píše jen části z nastavení a délku bere podle typu období', async () => {
    const settings: AiSettings = {
      ...AI,
      parts: ['commentary'],
      monthLength: 'short',
      periodLength: 'long',
      style: 'friendly'
    }
    const month = ollama((part) => GOOD[part])
    await writeArticleTexts(REQUEST, settings, month.fetcher)
    expect(month.prompts).toHaveLength(1)
    expect(month.prompts[0]).toContain('1 odstavec')
    expect(month.prompts[0]).toContain('přátelsky')

    const quarter = ollama((part) => GOOD[part])
    await writeArticleTexts({ ...REQUEST, kind: 'quarter' }, settings, quarter.fetcher)
    expect(quarter.prompts[0]).toContain('4 až 6 odstavců')
  })

  it('bez vybraných částí nic nepíše', async () => {
    const { fetcher, prompts } = ollama((part) => GOOD[part])
    const r = await writeArticleTexts(REQUEST, { ...AI, parts: [] }, fetcher)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('není vybráno')
    })
    expect(prompts).toHaveLength(0)
  })

  it('změněné číslo: model dostane druhý pokus s upozorněním a opraví se', async () => {
    const { fetcher, prompts } = ollama((part, attempt) =>
      part === 'highlights' && attempt === 1
        ? 'Portfolio vzrostlo na 1 600 €.\nVýkon byl +5,00 %.'
        : GOOD[part]
    )
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    expect(r).toMatchObject({ status: 'ok' })
    const highlights = (r as { parts: { part: string; status: string }[] }).parts[0]
    expect(highlights).toMatchObject({ part: 'highlights', status: 'ok' })
    expect(prompts).toHaveLength(4)
    expect(prompts[1]).toContain('ve faktech nejsou: 1600')
  })

  it('dvakrát špatné číslo: část se zahodí, ostatní zůstanou', async () => {
    const { fetcher } = ollama((part) =>
      part === 'commentary' ? 'Výkon byl +9,99 %.' : GOOD[part]
    )
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    expect(r.status).toBe('ok')
    const parts = (r as { parts: { part: string; status: string; message?: string }[] }).parts
    expect(parts.map((p) => `${p.part}:${p.status}`)).toEqual([
      'highlights:ok',
      'commentary:rejected',
      'outlook:ok'
    ])
    expect(parts[1].message).toContain('9,99')
    expect(parts[1].message).toContain('zůstává šablona')
  })

  it('rada v textu a nepoužitelný tvar se zamítnou bez druhého pokusu', async () => {
    const { fetcher, prompts } = ollama((part) =>
      part === 'commentary'
        ? 'Doporučuji dokoupit víc ETF.'
        : part === 'highlights'
          ? 'Jen jeden bod.'
          : GOOD.outlook
    )
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    const parts = (r as { parts: { part: string; status: string; message?: string }[] }).parts
    expect(parts.map((p) => p.status)).toEqual(['rejected', 'rejected', 'ok'])
    expect(parts[0].message).toContain('nepoužitelném tvaru')
    expect(parts[1].message).toContain('radu')
    expect(prompts).toHaveLength(3)
  })

  it('Ollama neběží: celý článek zůstane na šabloně (jediný pokus)', async () => {
    const { fetcher, prompts } = ollama(() => new TypeError('fetch failed'))
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('Ollama neběží')
    })
    expect(prompts).toHaveLength(1)
  })

  it('výpadek po první části: hotová část se ponechá, zbylé zůstanou šablona', async () => {
    const { fetcher } = ollama((part) =>
      part === 'highlights' ? GOOD.highlights : new TypeError('fetch failed')
    )
    const r = await writeArticleTexts(REQUEST, AI, fetcher)
    const parts = (r as { parts: { part: string; status: string }[] }).parts
    expect(parts.map((p) => `${p.part}:${p.status}`)).toEqual([
      'highlights:ok',
      'commentary:rejected',
      'outlook:rejected'
    ])
  })
})

describe('limity psaní', () => {
  it('delší komentář má delší limit i mez délky; ostatní části jsou krátké', () => {
    const short = partLimits('commentary', 'short')
    const medium = partLimits('commentary', 'medium')
    const long = partLimits('commentary', 'long')
    expect(short.timeoutMs).toBeLessThan(medium.timeoutMs)
    expect(medium.timeoutMs).toBeLessThan(long.timeoutMs)
    expect(short.maxTokens).toBeLessThan(medium.maxTokens)
    expect(medium.maxTokens).toBeLessThan(long.maxTokens)
    // pomalý model (~3 tokeny/s) musí u každé délky stihnout celý text
    for (const l of [short, medium, long])
      expect(l.timeoutMs / 1000).toBeGreaterThan(l.maxTokens / 3 - 1)
    expect(partLimits('highlights', 'long')).toEqual(partLimits('outlook', 'short'))
  })
})

describe('nastavení AI', () => {
  it('starší nastavení bez nových polí dostane výchozí hodnoty', () => {
    const old = aiSchema.parse({ enabled: true, model: 'gemma3' })
    expect(old).toEqual({
      enabled: true,
      model: 'gemma3',
      provider: 'ollama',
      claudeModel: 'claude-sonnet-5-5',
      claudePath: '',
      parts: ['highlights', 'commentary', 'outlook'],
      monthLength: 'medium',
      periodLength: 'long',
      style: 'factual'
    })
    expect(aiSchema.safeParse({ ...old, parts: ['nesmysl'] }).success).toBe(false)
    expect(aiSchema.safeParse({ ...old, style: 'zlobivý' }).success).toBe(false)
  })
})
