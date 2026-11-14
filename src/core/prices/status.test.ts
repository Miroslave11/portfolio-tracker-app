import { describe, expect, it } from 'vitest'
import { EMPTY_PRICE_CACHE, type PriceCache, type PriceUpdateReport } from '../../shared/prices'
import { lastFetchedAt, priceStatus } from './status'

const NOW = new Date('2026-11-12T12:00:00Z')

function cacheFetched(at: string): PriceCache {
  return {
    version: 1,
    securities: {
      'A.DE': { currency: 'EUR', fetchedAt: at, coveredFrom: '2020-01-01', prices: [] }
    },
    fx: { EURCZK: { fetchedAt: '2026-11-01T00:00:00.000Z', coveredFrom: '2020-01-01', rates: [] } }
  }
}

const okReport: PriceUpdateReport = {
  startedAt: '2026-11-12T11:00:00.000Z',
  finishedAt: '2026-11-12T11:00:05.000Z',
  securities: [{ id: 'A.DE', ok: true, added: 1, lastDate: '2026-11-12' }],
  fx: { ok: true, added: 1, lastDate: '2026-11-12' }
}

const base = { report: null, updating: false, error: null, now: NOW }

describe('priceStatus', () => {
  it('bez dat: „zatím nestaženy“', () => {
    expect(priceStatus({ ...base, cache: EMPTY_PRICE_CACHE })).toMatchObject({
      kind: 'none',
      lastFetched: null
    })
    expect(priceStatus({ ...base, cache: null }).kind).toBe('none')
  })

  it('čerstvá data: „aktuální“ s časem', () => {
    const s = priceStatus({
      ...base,
      cache: cacheFetched('2026-11-12T11:00:00.000Z'),
      report: okReport
    })
    expect(s.kind).toBe('ok')
    expect(s.text).toMatch(/^Kurzy aktuální · 12\. 11\. 2026 \d{2}:\d{2}$/)
  })

  it('starší než 24 hodin: „zastaralé“', () => {
    expect(priceStatus({ ...base, cache: cacheFetched('2026-11-10T11:00:00.000Z') }).kind).toBe(
      'stale'
    )
  })

  it('průběh stahování má přednost před vším ostatním', () => {
    expect(
      priceStatus({ ...base, cache: EMPTY_PRICE_CACHE, updating: true, error: 'x' }).kind
    ).toBe('updating')
  })

  it('chyba jednoho ETF nebo ČNB → stav chyby, ale zobrazí stáří dat', () => {
    const bad: PriceUpdateReport = {
      ...okReport,
      securities: [{ id: 'A.DE', ok: false, error: 'chyba', added: 0, lastDate: null }]
    }
    const s = priceStatus({ ...base, cache: cacheFetched('2026-11-12T11:00:00.000Z'), report: bad })
    expect(s.kind).toBe('error')
    expect(s.text).toContain('data z')
    expect(
      priceStatus({
        ...base,
        cache: cacheFetched('2026-11-12T11:00:00.000Z'),
        report: { ...okReport, fx: { ok: false, added: 0, lastDate: null } }
      }).kind
    ).toBe('error')
  })

  it('chyba bez jakýchkoli dat', () => {
    const s = priceStatus({ ...base, cache: EMPTY_PRICE_CACHE, error: 'nelze' })
    expect(s).toMatchObject({ kind: 'error', text: 'Kurzy se nepodařilo stáhnout' })
  })
})

describe('lastFetchedAt', () => {
  it('vybere nejnovější čas ze všech zdrojů', () => {
    expect(lastFetchedAt(cacheFetched('2026-11-12T11:00:00.000Z'))).toBe('2026-11-12T11:00:00.000Z')
  })
})
