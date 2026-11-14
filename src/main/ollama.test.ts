import { describe, expect, it } from 'vitest'
import { isLocalhostUrl, ollamaStatus, rewriteSummary, type OllamaFetcher } from './ollama'

const reply = (body: unknown, status = 200): ReturnType<OllamaFetcher> =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })

const SOURCE = 'Za říjen 2025 jsi nakoupil ETF za 500 € (1 nákup). Výkon +2,50 %.'

describe('isLocalhostUrl', () => {
  it('povolí jen smyčku na tento počítač', () => {
    expect(isLocalhostUrl('http://127.0.0.1:11434/api/tags')).toBe(true)
    expect(isLocalhostUrl('http://localhost:11434')).toBe(true)
    expect(isLocalhostUrl('http://[::1]:11434')).toBe(true)
    expect(isLocalhostUrl('http://example.com:11434')).toBe(false)
    expect(isLocalhostUrl('http://127.0.0.1.evil.com')).toBe(false)
    expect(isLocalhostUrl('ftp://localhost')).toBe(false)
    expect(isLocalhostUrl('nesmysl')).toBe(false)
  })
})

describe('ollamaStatus', () => {
  it('vrátí seřazené názvy modelů', async () => {
    const fetcher: OllamaFetcher = () =>
      reply({ models: [{ name: 'llama3.2:latest' }, { name: 'gemma3' }] })
    expect(await ollamaStatus(fetcher)).toEqual({
      status: 'ok',
      models: ['gemma3', 'llama3.2:latest']
    })
  })

  it('když Ollama neběží, vrátí srozumitelnou zprávu místo výjimky', async () => {
    const fetcher: OllamaFetcher = () => Promise.reject(new TypeError('fetch failed'))
    const r = await ollamaStatus(fetcher)
    expect(r.status).toBe('unavailable')
    expect(r).toMatchObject({ message: expect.stringContaining('Ollama neběží') })
  })

  it('časový limit skončí zprávou, ne zavěšením', async () => {
    const fetcher: OllamaFetcher = (_url, init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason))
      })
    const r = await ollamaStatus(fetcher, 20)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('neodpověděla')
    })
  })
})

describe('rewriteSummary', () => {
  it('pošle dotaz jen na lokální Ollamu a přijme text se stejnými čísly', async () => {
    let seenUrl = ''
    let seenBody: { model: string; prompt: string; stream: boolean; think?: boolean } | null = null
    const fetcher: OllamaFetcher = (url, init) => {
      seenUrl = url
      seenBody = JSON.parse(init.body ?? '{}')
      return reply({ response: 'V říjnu 2025 jsi nakoupil ETF za 500 € a výkon byl +2,5 %.' })
    }
    const r = await rewriteSummary(SOURCE, 'llama3.2', fetcher)
    expect(r).toMatchObject({ status: 'ok', model: 'llama3.2' })
    expect(seenUrl).toBe('http://127.0.0.1:11434/api/generate')
    expect(seenBody).toMatchObject({ model: 'llama3.2', stream: true, think: false })
    expect(seenBody!.prompt).toContain(SOURCE)
  })

  it('model bez podpory thinking (400) → zopakuje dotaz bez parametru think', async () => {
    const bodies: { think?: boolean }[] = []
    const fetcher: OllamaFetcher = (_url, init) => {
      const body = JSON.parse(init.body ?? '{}')
      bodies.push(body)
      return 'think' in body
        ? reply({ error: 'does not support thinking' }, 400)
        : reply({ response: 'V říjnu 2025 jsi nakoupil ETF za 500 € a výkon byl +2,5 %.' })
    }
    const r = await rewriteSummary(SOURCE, 'translategemma:4b', fetcher)
    expect(r.status).toBe('ok')
    expect(bodies).toHaveLength(2)
    expect(bodies[0].think).toBe(false)
    expect(bodies[1]).not.toHaveProperty('think')
  })

  it('jiná chyba 400 po opakování bez think se vrátí jako nedostupná', async () => {
    const r = await rewriteSummary(SOURCE, 'm', () => reply({ error: 'x' }, 400))
    expect(r).toMatchObject({ status: 'unavailable', message: expect.stringContaining('400') })
  })

  it('podvržené číslo → text se zamítne', async () => {
    const fetcher: OllamaFetcher = () =>
      reply({ response: 'V říjnu 2025 jsi nakoupil ETF za 5 000 € a výkon byl +2,5 %.' })
    const r = await rewriteSummary(SOURCE, 'llama3.2', fetcher)
    expect(r.status).toBe('rejected')
    expect(r).toMatchObject({ message: expect.stringContaining('(5000)') })
  })

  it('zamítnutí vypíše všechna sporná čísla česky, bez opakování a nejvýš pět', async () => {
    const fetcher: OllamaFetcher = () =>
      reply({ response: 'Nákup 7 € 7 € 8,5 € 9 € 11 € 12 € 13 € a 500 €.' })
    const r = await rewriteSummary(SOURCE, 'm', fetcher)
    expect(r).toMatchObject({ message: expect.stringContaining('(7; 8,5; 9; 11; 12; …)') })
  })

  it('prázdná nebo chybná odpověď modelu → zamítnuto', async () => {
    expect((await rewriteSummary(SOURCE, 'm', () => reply({ response: '  ' }))).status).toBe(
      'rejected'
    )
    expect((await rewriteSummary(SOURCE, 'm', () => reply({}))).status).toBe('rejected')
  })

  it('nestažený model (404) → návod, jak ho stáhnout', async () => {
    const r = await rewriteSummary(SOURCE, 'gemma3', () => reply({ error: 'not found' }, 404))
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('ollama pull gemma3')
    })
  })

  it('Ollama nedostupná nebo vypršel limit → unavailable', async () => {
    const down = await rewriteSummary(SOURCE, 'm', () =>
      Promise.reject(new TypeError('fetch failed'))
    )
    expect(down.status).toBe('unavailable')
    const hang: OllamaFetcher = (_u, init) =>
      new Promise((_res, rej) =>
        init.signal.addEventListener('abort', () => rej(init.signal.reason))
      )
    const slow = await rewriteSummary(SOURCE, 'm', hang, 20)
    expect(slow).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('neodpověděla')
    })
  })
})
