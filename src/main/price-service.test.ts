import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Portfolio } from '../shared/model'
import { FX_EUR_CZK } from '../shared/prices'
import {
  loadPriceCache,
  PRICES_FILE,
  updatePrices,
  type Fetcher,
  type HttpResponse
} from './price-service'

const NOW = new Date('2026-01-15T10:00:00Z')

function portfolio(firstTx = '2025-12-20'): Portfolio {
  const account = { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }
  const sec = (id: string): Portfolio['securities'][number] => ({
    id,
    name: id,
    yahooTicker: id,
    currency: 'EUR',
    indexGroup: 'S&P 500',
    distributing: false,
    color: '#6366f1'
  })
  return {
    version: 1,
    accounts: [account],
    securities: [sec('AAA.DE'), sec('BBB.DE')],
    transactions: [
      {
        id: 't1',
        accountId: 'xtb',
        date: firstTx,
        type: 'BUY',
        amount: 100,
        currency: 'EUR',
        securityId: 'AAA.DE',
        shares: 1
      },
      {
        id: 't2',
        accountId: 'xtb',
        date: '2026-01-05',
        type: 'BUY',
        amount: 100,
        currency: 'EUR',
        securityId: 'BBB.DE',
        shares: 1
      }
    ]
  }
}

function yahooJson(points: [string, number][], currency = 'EUR'): string {
  return JSON.stringify({
    chart: {
      result: [
        {
          meta: {
            currency,
            gmtoffset: 3600,
            regularMarketPrice: points.at(-1)?.[1],
            regularMarketTime: 1768471200
          },
          timestamp: points.map(
            ([d]) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 8) / 1000
          ),
          indicators: { quote: [{ close: points.map(([, c]) => c) }] }
        }
      ],
      error: null
    }
  })
}

const ok = (body: string): HttpResponse => ({ ok: true, status: 200, text: async () => body })
const fail = (status: number): HttpResponse => ({ ok: false, status, text: async () => '{}' })

// Řádek „datum|EUR“ se doplní o sloupec AUD, aby seděl s hlavičkou souboru ČNB.
const cnb = (rows: string[]): string =>
  `Date|1 AUD|1 EUR\n${rows.map((r) => r.replace('|', '|15|')).join('\n')}\n`

/** Falešný server: směruje podle adresy a eviduje všechna volání. */
function fakeServer(handlers: {
  yahoo?: (ticker: string, url: URL) => HttpResponse | Error
  cnb?: (year: number) => HttpResponse
}): { fetcher: Fetcher; calls: string[] } {
  const calls: string[] = []
  const fetcher: Fetcher = async (url) => {
    calls.push(url)
    const u = new URL(url)
    if (u.hostname.includes('yahoo')) {
      const ticker = decodeURIComponent(u.pathname.split('/').pop()!)
      const res = handlers.yahoo?.(ticker, u) ?? fail(500)
      if (res instanceof Error) throw res
      return res
    }
    return handlers.cnb?.(Number(u.searchParams.get('year'))) ?? fail(500)
  }
  return { fetcher, calls }
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pt-prices-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const happy = {
  yahoo: (ticker: string): HttpResponse =>
    ok(
      yahooJson(
        ticker === 'AAA.DE'
          ? [
              ['2025-12-19', 10],
              ['2025-12-22', 11],
              ['2026-01-14', 12]
            ]
          : [
              ['2025-12-30', 20],
              ['2026-01-14', 21]
            ]
      )
    ),
  cnb: (year: number): HttpResponse =>
    ok(cnb(year === 2025 ? ['22.12.2025|24.2'] : ['14.01.2026|24.3']))
}

describe('updatePrices – první stažení', () => {
  it('stáhne ETF i kurz EUR/CZK a uloží cache', async () => {
    const { fetcher } = fakeServer(happy)
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher,
      now: NOW,
      retryDelayMs: 0
    })

    expect(report.securities.map((s) => [s.id, s.ok, s.added, s.lastDate])).toEqual([
      ['AAA.DE', true, 3, '2026-01-14'],
      ['BBB.DE', true, 2, '2026-01-14']
    ])
    expect(report.fx).toMatchObject({ ok: true, added: 2, lastDate: '2026-01-14' })
    expect(cache.securities['AAA.DE'].prices).toHaveLength(3)
    expect(cache.fx[FX_EUR_CZK].rates).toEqual([
      ['2025-12-22', 24.2],
      ['2026-01-14', 24.3]
    ])
    // uloženo na disk a po načtení stejné
    expect(await loadPriceCache(dir)).toEqual(cache)
  })

  it('stáhne i benchmark mimo portfolio (od prvního obchodu); ticker z portfolia neduplikuje', async () => {
    const { fetcher, calls } = fakeServer({
      ...happy,
      yahoo: (t) => (t === 'BENCH.DE' ? ok(yahooJson([['2025-12-15', 50]])) : happy.yahoo(t))
    })
    const { cache, report } = await updatePrices(dir, portfolio('2025-12-20'), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      extraTickers: ['BENCH.DE', 'AAA.DE']
    })
    expect(report.securities.map((s) => s.id)).toEqual(['AAA.DE', 'BBB.DE', 'BENCH.DE'])
    expect(cache.securities['BENCH.DE'].prices).toEqual([['2025-12-15', 50]])
    expect(calls.filter((c) => c.includes('AAA.DE'))).toHaveLength(1)
    // od prvního obchodu (20. 12.) minus rezerva 10 dní = 10. 12. 2025
    const bench = new URL(calls.find((c) => c.includes('BENCH.DE'))!)
    expect(Number(bench.searchParams.get('period1'))).toBe(Date.UTC(2025, 11, 10) / 1000)
  })

  it('ETF z portfolia zvolené jako benchmark se stáhne od prvního obchodu celého portfolia', async () => {
    const { fetcher, calls } = fakeServer(happy)
    // BBB.DE se poprvé kupuje 5. 1. 2026, první obchod portfolia je ale 20. 12. 2025
    await updatePrices(dir, portfolio('2025-12-20'), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      extraTickers: ['BBB.DE']
    })
    const bbb = new URL(calls.find((c) => c.includes('BBB.DE'))!)
    expect(Number(bbb.searchParams.get('period1'))).toBe(Date.UTC(2025, 11, 10) / 1000)
  })

  it('inflace: stáhne eurozónu i Česko z Eurostatu a příště do 12 hodin nestahuje znovu', async () => {
    const hicp = (v: number): string =>
      JSON.stringify({
        id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
        size: [1, 1, 1, 1, 2],
        value: { '0': v, '1': v + 1 },
        dimension: { time: { category: { index: { '2025-11': 0, '2025-12': 1 } } } }
      })
    const calls: string[] = []
    const base = fakeServer(happy)
    const fetcher: Fetcher = async (url, headers) => {
      calls.push(url)
      const u = new URL(url)
      if (u.hostname === 'ec.europa.eu')
        return ok(hicp(u.searchParams.get('geo') === 'CZ' ? 150 : 120))
      return base.fetcher(url, headers)
    }
    const first = await updatePrices(dir, portfolio('2025-12-20'), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      inflation: true
    })
    expect(first.cache.inflation?.EA?.points).toEqual([
      ['2025-11', 120],
      ['2025-12', 121]
    ])
    expect(first.cache.inflation?.CZ?.points.at(-1)).toEqual(['2025-12', 151])
    expect(first.report.inflation).toMatchObject({ ok: true, added: 4, lastDate: '2025-12' })
    const eurostat = calls.filter((c) => c.includes('ec.europa.eu'))
    expect(eurostat).toHaveLength(2)
    expect(new URL(eurostat[0]).searchParams.get('sinceTimePeriod')).toBe('2025-01')
    // za hodinu: inflace se nestahuje znovu
    await updatePrices(dir, portfolio('2025-12-20'), {
      fetcher,
      now: new Date(NOW.getTime() + 3600_000),
      retryDelayMs: 0,
      inflation: true
    })
    expect(calls.filter((c) => c.includes('ec.europa.eu'))).toHaveLength(2)
  })

  it('inflace: chyba Eurostatu nezastaví kurzy a stará data zůstanou', async () => {
    const base = fakeServer(happy)
    const fetcher: Fetcher = async (url, headers) =>
      new URL(url).hostname === 'ec.europa.eu' ? fail(503) : base.fetcher(url, headers)
    const r = await updatePrices(dir, portfolio(), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      inflation: true
    })
    expect(r.report.inflation?.ok).toBe(false)
    expect(r.report.inflation?.error).toMatch(/Inflace \(eurozóna\)/)
    expect(r.cache.securities['AAA.DE'].prices.length).toBeGreaterThan(0)
    expect(r.cache.inflation).toBeUndefined()
  })

  it('dividendy: stáhne historii výplat zvoleného ETF a příště do 24 hodin nestahuje znovu', async () => {
    const divJson = JSON.stringify({
      chart: {
        result: [
          {
            meta: { currency: 'USD', gmtoffset: -18000, regularMarketPrice: 30 },
            events: {
              dividends: {
                a: { amount: 0.25, date: Date.UTC(2025, 8, 24, 13, 30) / 1000 },
                b: { amount: 0.27, date: Date.UTC(2025, 11, 10, 14, 30) / 1000 }
              }
            }
          }
        ],
        error: null
      }
    })
    const { fetcher, calls } = fakeServer({
      ...happy,
      yahoo: (t, u) =>
        t === 'SCHD'
          ? ok(divJson)
          : u.searchParams.get('interval') === '1d'
            ? happy.yahoo(t)
            : fail(404)
    })
    const first = await updatePrices(dir, portfolio(), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      dividendTicker: 'SCHD'
    })
    expect(first.cache.dividends?.SCHD).toMatchObject({
      currency: 'USD',
      price: 30,
      events: [
        ['2025-09-24', 0.25],
        ['2025-12-10', 0.27]
      ]
    })
    expect(first.report.dividends).toMatchObject({ id: 'SCHD', ok: true, added: 2 })
    const url = new URL(calls.find((c) => c.includes('/SCHD?'))!)
    expect(url.searchParams.get('events')).toBe('div')
    expect(url.searchParams.get('interval')).toBe('1mo')
    // ETF z portfolia se kvůli dividendám nestahují znovu a druhé spuštění do 24 h nic nestáhne
    await updatePrices(dir, portfolio(), {
      fetcher,
      now: new Date(NOW.getTime() + 3600_000),
      retryDelayMs: 0,
      dividendTicker: 'SCHD'
    })
    expect(calls.filter((c) => c.includes('/SCHD?'))).toHaveLength(1)
  })

  it('dividendy: fond bez výplat nebo chyba → hlášení, kurzy se uloží', async () => {
    const noDiv = JSON.stringify({
      chart: { result: [{ meta: { currency: 'EUR', regularMarketPrice: 100 } }], error: null }
    })
    const { fetcher } = fakeServer({
      ...happy,
      yahoo: (t) => (t === 'SXR8.DE' ? ok(noDiv) : happy.yahoo(t))
    })
    const r = await updatePrices(dir, portfolio(), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      dividendTicker: 'SXR8.DE'
    })
    expect(r.report.dividends).toMatchObject({ ok: false })
    expect(r.report.dividends?.error).toMatch(/nevyplácí dividendy/)
    expect(r.cache.dividends).toBeUndefined()
    expect(r.cache.securities['AAA.DE'].prices.length).toBeGreaterThan(0)
  })

  it('benchmark v jiné měně než EUR se neuloží', async () => {
    const { fetcher } = fakeServer({
      ...happy,
      yahoo: (t) => (t === 'SPY' ? ok(yahooJson([['2026-01-14', 600]], 'USD')) : happy.yahoo(t))
    })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher,
      now: NOW,
      retryDelayMs: 0,
      extraTickers: ['SPY']
    })
    expect(report.securities.find((s) => s.id === 'SPY')).toMatchObject({ ok: false })
    expect(cache.securities['SPY']).toBeUndefined()
  })

  it('stahuje od data prvního obchodu minus rezerva a ČNB po letech 2025 a 2026', async () => {
    const { fetcher, calls } = fakeServer(happy)
    await updatePrices(dir, portfolio('2025-12-20'), { fetcher, now: NOW, retryDelayMs: 0 })

    const aaa = new URL(calls.find((c) => c.includes('AAA.DE'))!)
    // 2025-12-20 − 10 dní = 2025-12-10
    expect(Number(aaa.searchParams.get('period1'))).toBe(Date.UTC(2025, 11, 10) / 1000)
    const bbb = new URL(calls.find((c) => c.includes('BBB.DE'))!)
    expect(Number(bbb.searchParams.get('period1'))).toBe(Date.UTC(2025, 11, 26) / 1000)
    expect(
      calls.filter((c) => c.includes('cnb.cz')).map((c) => new URL(c).searchParams.get('year'))
    ).toEqual(['2025', '2026'])
  })

  it('posílá hlavičku User-Agent (Yahoo bez ní odmítá požadavky)', async () => {
    const headers: Record<string, string>[] = []
    const base = fakeServer(happy).fetcher
    await updatePrices(dir, portfolio(), {
      fetcher: (url, h) => (headers.push(h), base(url, h)),
      now: NOW,
      retryDelayMs: 0
    })
    expect(headers.every((h) => /Mozilla/.test(h['User-Agent']))).toBe(true)
  })
})

describe('updatePrices – průběžná aktualizace', () => {
  it('podruhé stáhne jen poslední dny (rezerva 7 dní) a započítá jen nové dny', async () => {
    await updatePrices(dir, portfolio(), {
      fetcher: fakeServer(happy).fetcher,
      now: NOW,
      retryDelayMs: 0
    })

    const later = new Date('2026-01-16T10:00:00Z')
    const server = fakeServer({
      yahoo: (ticker) =>
        ok(
          yahooJson(
            ticker === 'AAA.DE'
              ? [
                  ['2026-01-14', 12.5],
                  ['2026-01-15', 13]
                ]
              : [['2026-01-15', 22]]
          )
        ),
      cnb: () => ok(cnb(['15.01.2026|24.4']))
    })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: later,
      retryDelayMs: 0
    })

    const aaa = new URL(server.calls.find((c) => c.includes('AAA.DE'))!)
    // poslední známý den 2026-01-14 − 7 = 2026-01-07
    expect(Number(aaa.searchParams.get('period1'))).toBe(Date.UTC(2026, 0, 7) / 1000)
    expect(report.securities[0]).toMatchObject({ ok: true, added: 1, lastDate: '2026-01-15' })
    // opravený kurz za 14. 1. přepsal starý, starší data zůstala
    expect(cache.securities['AAA.DE'].prices).toEqual([
      ['2025-12-19', 10],
      ['2025-12-22', 11],
      ['2026-01-14', 12.5],
      ['2026-01-15', 13]
    ])
    // jen rok 2026 (rok 2025 už je kompletní)
    expect(server.calls.filter((c) => c.includes('cnb.cz'))).toHaveLength(1)
    expect(cache.fx[FX_EUR_CZK].rates.at(-1)).toEqual(['2026-01-15', 24.4])
  })

  it('přibyl starší obchod → historie se stáhne znovu od nového data', async () => {
    await updatePrices(dir, portfolio('2025-12-20'), {
      fetcher: fakeServer(happy).fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    const server = fakeServer(happy)
    await updatePrices(dir, portfolio('2024-03-01'), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    const aaa = new URL(server.calls.find((c) => c.includes('AAA.DE'))!)
    expect(Number(aaa.searchParams.get('period1'))).toBe(Date.UTC(2024, 1, 20) / 1000)
    expect(
      server.calls
        .filter((c) => c.includes('cnb.cz'))
        .map((c) => new URL(c).searchParams.get('year'))
    ).toEqual(['2024', '2025', '2026'])
  })
})

describe('updatePrices – chyby', () => {
  it('chyba jednoho ETF nezastaví ostatní a stará data zůstanou', async () => {
    await updatePrices(dir, portfolio(), {
      fetcher: fakeServer(happy).fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    const server = fakeServer({
      yahoo: (t) => (t === 'AAA.DE' ? fail(404) : ok(yahooJson([['2026-01-15', 22]]))),
      cnb: happy.cnb
    })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })

    expect(report.securities[0]).toMatchObject({ id: 'AAA.DE', ok: false })
    expect(report.securities[0].error).toContain('nenalezeno (404)')
    expect(report.securities[1]).toMatchObject({ id: 'BBB.DE', ok: true, added: 1 })
    expect(cache.securities['AAA.DE'].prices).toHaveLength(3)
  })

  it('404 se neopakuje, ale 429 se zkusí ještě jednou', async () => {
    let attempts = 0
    const server = fakeServer({
      yahoo: (t) => {
        if (t === 'AAA.DE') return fail(404)
        attempts++
        return attempts === 1 ? fail(429) : ok(yahooJson([['2026-01-14', 21]]))
      },
      cnb: happy.cnb
    })
    const { report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(server.calls.filter((c) => c.includes('AAA.DE'))).toHaveLength(1)
    expect(server.calls.filter((c) => c.includes('BBB.DE'))).toHaveLength(2)
    expect(report.securities[1].ok).toBe(true)
  })

  it('trvalé 429 skončí srozumitelnou chybou', async () => {
    const server = fakeServer({ yahoo: () => fail(429), cnb: happy.cnb })
    const { report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(report.securities[0].error).toContain('429')
    expect(report.securities[0].error).toContain('zkus to později')
  })

  it('bez internetu (výjimka při stahování) → chyby v hlášení, nic se nezapíše', async () => {
    const server = fakeServer({
      yahoo: () => new Error('getaddrinfo ENOTFOUND'),
      cnb: () => fail(500)
    })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(report.securities.every((s) => !s.ok && s.error?.includes('nelze se připojit'))).toBe(
      true
    )
    expect(report.fx.ok).toBe(false)
    expect(cache.securities).toEqual({})
    await expect(readFile(join(dir, PRICES_FILE))).rejects.toThrow()
  })

  it('výpadek spojení: hláška říká příčinu a zbylá ETF se už nezkouší, ČNB ano', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    const server = fakeServer({
      yahoo: () => new TypeError('fetch failed', { cause }),
      cnb: happy.cnb
    })
    const { report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    // jen první ETF se zkusilo (2 pokusy), druhé bylo přeskočeno
    expect(server.calls.filter((c) => c.includes('yahoo'))).toHaveLength(2)
    expect(report.securities.map((s) => s.error)).toEqual([
      'AAA.DE: nelze se připojit k internetu (nebo je server nedostupný)',
      'BBB.DE: nelze se připojit k internetu (nebo je server nedostupný)'
    ])
    // ČNB je jiný server – zkusila se samostatně a uspěla
    expect(report.fx.ok).toBe(true)
  })

  it('certifikát (antivir) → hláška radí, co zkontrolovat', async () => {
    const cause = Object.assign(new Error('x'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' })
    const server = fakeServer({
      yahoo: () => new TypeError('fetch failed', { cause }),
      cnb: happy.cnb
    })
    const { report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(report.securities[0].error).toContain('antivir')
  })

  it('měna kurzu neodpovídá měně ETF → chyba, kurz se neuloží', async () => {
    const server = fakeServer({
      yahoo: () => ok(yahooJson([['2026-01-14', 1200]], 'GBp')),
      cnb: happy.cnb
    })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(report.securities[0].error).toContain('GBp')
    expect(cache.securities['AAA.DE']).toBeUndefined()
  })

  it('selhání ČNB nezabrání uložení kurzů ETF', async () => {
    const server = fakeServer({ yahoo: happy.yahoo, cnb: () => fail(503) })
    const { cache, report } = await updatePrices(dir, portfolio(), {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(report.fx.ok).toBe(false)
    expect(report.securities.every((s) => s.ok)).toBe(true)
    expect(Object.keys(cache.securities)).toHaveLength(2)
    expect(cache.fx[FX_EUR_CZK]).toBeUndefined()
  })

  it('částečné selhání ČNB (rok 2026) ponechá stažený rok 2025 a příště stáhne vše znovu', async () => {
    const first = fakeServer({
      yahoo: happy.yahoo,
      cnb: (y) => (y === 2025 ? happy.cnb(2025) : fail(503))
    })
    const r1 = await updatePrices(dir, portfolio(), {
      fetcher: first.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(r1.report.fx.ok).toBe(false)
    expect(r1.cache.fx[FX_EUR_CZK].rates).toEqual([['2025-12-22', 24.2]])

    const second = fakeServer(happy)
    await updatePrices(dir, portfolio(), { fetcher: second.fetcher, now: NOW, retryDelayMs: 0 })
    expect(second.calls.filter((c) => c.includes('cnb.cz'))).toHaveLength(2)
  })

  it('poškozená cache se zahodí a stáhne se znovu; bez portfolia se nic nestahuje', async () => {
    await writeFile(join(dir, PRICES_FILE), '{ rozbité', 'utf-8')
    expect((await loadPriceCache(dir)).securities).toEqual({})
    const server = fakeServer(happy)
    const { report } = await updatePrices(dir, null, {
      fetcher: server.fetcher,
      now: NOW,
      retryDelayMs: 0
    })
    expect(server.calls).toHaveLength(0)
    expect(report.securities).toEqual([])
  })
})

describe('loadPriceCache – dividendy', () => {
  it('poškozená data dividend se zahodí, kurzy zůstanou; měna „GBp“ projde', async () => {
    const base = {
      version: 1,
      securities: {
        'AAA.DE': {
          currency: 'EUR',
          fetchedAt: '2026-01-15T10:00:00.000Z',
          coveredFrom: '2025-12-10',
          prices: [['2026-01-14', 12]]
        }
      },
      fx: {}
    }
    await writeFile(
      join(dir, PRICES_FILE),
      JSON.stringify({ ...base, dividends: { X: { currency: 'USD', events: 'nesmysl' } } })
    )
    const broken = await loadPriceCache(dir)
    expect(broken.securities['AAA.DE'].prices).toHaveLength(1)
    expect(broken.dividends).toBeUndefined()

    const gbp = {
      currency: 'GBp',
      fetchedAt: '2026-01-15T10:00:00.000Z',
      price: 6500,
      events: [['2025-12-11', 45.2]]
    }
    await writeFile(
      join(dir, PRICES_FILE),
      JSON.stringify({ ...base, dividends: { 'VHYL.L': gbp } })
    )
    expect((await loadPriceCache(dir)).dividends?.['VHYL.L']).toEqual(gbp)
  })
})
