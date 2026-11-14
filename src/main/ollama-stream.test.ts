import { describe, expect, it } from 'vitest'
import { generateText, type OllamaFetcher } from './ollama'

/** Odpověď jako proud řádků JSON; `feed` posílá kousky, při zrušení spojení proud spadne. */
function streamReply(
  feed: (push: (text: string) => void, close: () => void, fail: (e: Error) => void) => void,
  signal?: AbortSignal
): ReturnType<OllamaFetcher> {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      signal?.addEventListener('abort', () => controller.error(signal.reason))
      feed(
        (text) => controller.enqueue(encoder.encode(text)),
        () => controller.close(),
        (e) => controller.error(e)
      )
    }
  })
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('u streamu se json() nevolá')
    },
    body
  })
}

describe('streamované čtení (generateText)', () => {
  it('složí text z kousků rozdělených i uprostřed řádku', async () => {
    const fetcher: OllamaFetcher = () =>
      streamReply((push, close) => {
        push('{"response":"V říj')
        push('nu jsi nakoupil "}\n{"response":"za 500 €.","done":false}\n')
        push('{"response":"","done":true}\n')
        close()
      })
    expect(await generateText('m', 'p', fetcher)).toEqual({
      status: 'ok',
      text: 'V říjnu jsi nakoupil za 500 €.'
    })
  })

  it('poslední řádek bez zalomení se také přečte', async () => {
    const fetcher: OllamaFetcher = () =>
      streamReply((push, close) => {
        push('{"response":"ahoj"}')
        close()
      })
    expect(await generateText('m', 'p', fetcher)).toEqual({ status: 'ok', text: 'ahoj' })
  })

  it('plynulé psaní nezastaví hlídání ticha, zastaví ho až celkový limit', async () => {
    const fetcher: OllamaFetcher = (_u, init) =>
      streamReply((push) => {
        const timer = setInterval(() => push('{"response":"x"}\n'), 10)
        init.signal.addEventListener('abort', () => clearInterval(timer))
      }, init.signal)
    const r = await generateText('m', 'p', fetcher, 120, {}, { idleMs: 60 })
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('Psaní trvalo déle')
    })
  })

  it('model, který uprostřed psaní zmlkne, se přeruší hlášením o tichu', async () => {
    const fetcher: OllamaFetcher = (_u, init) =>
      streamReply((push) => push('{"response":"začátek"}\n'), init.signal)
    const r = await generateText('m', 'p', fetcher, 5_000, {}, { idleMs: 40 })
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('přestala psát')
    })
  })

  it('Ollama, která nezačne psát, skončí hláškou o neodpovědi', async () => {
    const fetcher: OllamaFetcher = (_u, init) => streamReply(() => undefined, init.signal)
    const r = await generateText('m', 'p', fetcher, 5_000, {}, { startMs: 40 })
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('neodpověděla')
    })
  })

  it('chyba hlášená Ollamou uprostřed proudu se předá česky', async () => {
    const fetcher: OllamaFetcher = () =>
      streamReply((push, close) => {
        push('{"response":"a"}\n{"error":"model runner has unexpectedly stopped"}\n')
        close()
      })
    expect(await generateText('m', 'p', fetcher)).toMatchObject({
      status: 'unavailable',
      message: 'Ollama hlásí chybu: model runner has unexpectedly stopped'
    })
  })

  it('přerušené spojení uprostřed psaní nehlásí, že Ollama neběží', async () => {
    const fetcher: OllamaFetcher = () =>
      streamReply((push, _close, fail) => {
        push('{"response":"a"}\n')
        setTimeout(() => fail(new TypeError('terminated')), 5)
      })
    const r = await generateText('m', 'p', fetcher)
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('uprostřed psaní')
    })
    expect((r as { message: string }).message).not.toContain('neběží')
  })

  it('nečitelný řádek → nečitelná odpověď', async () => {
    const fetcher: OllamaFetcher = () =>
      streamReply((push, close) => {
        push('to není json\n')
        close()
      })
    expect(await generateText('m', 'p', fetcher)).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('nečitelnou')
    })
  })
})

describe('hlášky o chybě spojení', () => {
  const failWith =
    (code?: string): OllamaFetcher =>
    () =>
      Promise.reject(Object.assign(new TypeError('fetch failed'), code ? { cause: { code } } : {}))

  it('odmítnuté spojení (nebo neznámá příčina) = Ollama neběží', async () => {
    for (const fetcher of [failWith('ECONNREFUSED'), failWith()]) {
      expect(await generateText('m', 'p', fetcher)).toMatchObject({
        message: expect.stringContaining('Ollama neběží')
      })
    }
  })

  it('jiná chyba spojení (např. limit čekání na hlavičky) se jako „neběží“ nehlásí', async () => {
    const r = await generateText('m', 'p', failWith('UND_ERR_HEADERS_TIMEOUT'))
    expect(r).toMatchObject({
      status: 'unavailable',
      message: expect.stringContaining('Spojení s Ollamou se přerušilo (UND_ERR_HEADERS_TIMEOUT)')
    })
    expect((r as { message: string }).message).not.toContain('neběží')
  })
})
