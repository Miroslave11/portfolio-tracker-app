import { describe, expect, it } from 'vitest'
import type { Portfolio, Security, Transaction } from '../shared/model'
import type { PriceCache } from '../shared/prices'
import { allocateByBroker, allocateBySecurity } from './allocation'
import type { Position } from './portfolio-calc'
import { applySecurityMeta } from './securities-meta'

const sec = (id: string, extra: Partial<Security> = {}): Security => ({
  id,
  name: `Fond ${id}`,
  yahooTicker: id,
  currency: 'EUR',
  indexGroup: 'MSCI World',
  distributing: false,
  color: '#0ea5e9',
  ...extra
})

const pos = (securityId: string, value: number, costBasis: number): Position => ({
  securityId,
  shares: 1,
  costBasis,
  price: value,
  priceDate: '2026-01-01',
  estimated: false,
  value,
  unrealized: value - costBasis,
  unrealizedPct: null
})

const securities = [
  sec('EUNL.DE', { isin: 'IE00B4L5Y983', name: 'World', color: '#0ea5e9' }),
  sec('IWDA.AS', { isin: 'IE00B4L5Y983', name: 'World', color: '#0ea5e9' }),
  sec('SXR8.DE', { isin: 'IE00B5BMR087', name: 'S&P', indexGroup: 'S&P 500', color: '#6366f1' }),
  sec('VUSA.DE', { isin: 'IE00B3XXRP09', name: 'S&P V', indexGroup: 'S&P 500', color: '#f43f5e' })
]

const positions = [
  pos('EUNL.DE', 6000, 5000),
  pos('IWDA.AS', 2000, 1500),
  pos('SXR8.DE', 1500, 1000),
  pos('VUSA.DE', 500, 600)
]

describe('allocateBySecurity', () => {
  it('ETF se stejným ISIN se sloučí do jednoho řádku', () => {
    const r = allocateBySecurity(positions, securities, 'etf')
    expect(r.map((x) => x.key)).toEqual(['IE00B4L5Y983', 'IE00B5BMR087', 'IE00B3XXRP09'])
    expect(r[0].value).toBe(8000)
    expect(r[0].costBasis).toBe(6500)
    expect(r[0].unrealized).toBe(1500)
    expect(r[0].sublabel).toBe('EUNL.DE, IWDA.AS')
  })

  it('podle indexu: S&P 500 = SXR8 + VUSA, barva největšího ETF', () => {
    const r = allocateBySecurity(positions, securities, 'index')
    expect(r.map((x) => [x.label, x.value])).toEqual([
      ['MSCI World', 8000],
      ['S&P 500', 2000]
    ])
    expect(r[1].color).toBe('#6366f1') // SXR8 je větší než VUSA
    expect(r[1].unrealized).toBe(400) // +500 a −100
  })

  it('součet podílů je 100 % a řádky jsou seřazené sestupně', () => {
    for (const by of ['etf', 'index'] as const) {
      const r = allocateBySecurity(positions, securities, by)
      expect(r.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12)
      for (let i = 1; i < r.length; i++) expect(r[i - 1].value).toBeGreaterThanOrEqual(r[i].value)
    }
    expect(allocateBySecurity(positions, securities, 'etf')[0].share).toBeCloseTo(0.8, 12)
  })

  it('prázdné pozice → prázdný výsledek; pozice bez metadat se přeskočí', () => {
    expect(allocateBySecurity([], securities, 'etf')).toEqual([])
    expect(allocateBySecurity([pos('NEZNAMY', 100, 90)], securities, 'etf')).toEqual([])
  })
})

describe('allocateByBroker', () => {
  const tx = (
    t: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount'>
  ): Transaction => ({
    accountId: 'xtb',
    date: '2025-01-02',
    currency: 'EUR',
    ...t
  })
  const portfolio: Portfolio = {
    version: 1,
    accounts: [
      { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
      { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' },
      { id: 'prazdny', name: 'Prázdný', currency: 'EUR', color: '#10b981' }
    ],
    securities: [sec('AAA'), sec('BBB')],
    transactions: [
      tx({ id: '1', type: 'DEPOSIT', amount: 1000 }),
      tx({ id: '2', type: 'BUY', amount: 1000, securityId: 'AAA', shares: 10 }),
      tx({ id: '3', accountId: 'degiro', type: 'DEPOSIT', amount: 600 }),
      tx({ id: '4', accountId: 'degiro', type: 'BUY', amount: 500, securityId: 'BBB', shares: 5 }),
      tx({ id: '5', accountId: 'degiro', type: 'BUY', amount: 100, securityId: 'AAA', shares: 1 })
    ]
  }
  const series = (last: number): PriceCache['securities'][string] => ({
    currency: 'EUR',
    prices: [
      ['2025-01-01', 100],
      ['2025-01-10', last]
    ],
    coveredFrom: '2025-01-01',
    fetchedAt: '2025-01-10T00:00:00Z'
  })
  const prices: PriceCache = {
    ...({ version: 1, fx: {} } as unknown as PriceCache),
    securities: { AAA: series(120), BBB: series(110) }
  }

  it('hodnota ETF podle účtu; účty bez pozic se vynechají', () => {
    const r = allocateByBroker(portfolio, prices, null)
    // XTB: 10 × 120 = 1200; Degiro: 5 × 110 + 1 × 120 = 670
    expect(r.map((x) => [x.label, x.value])).toEqual([
      ['XTB', 1200],
      ['Degiro', 670]
    ])
    expect(r.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12)
    expect(r[0].share).toBeCloseTo(1200 / 1870, 12)
  })

  it('filtr účtů omezí výsledek', () => {
    const r = allocateByBroker(portfolio, prices, new Set(['xtb']))
    expect(r).toHaveLength(1)
    expect(r[0].key).toBe('xtb')
    expect(r[0].share).toBe(1)
  })
})

describe('applySecurityMeta', () => {
  const p: Portfolio = { version: 1, accounts: [], securities, transactions: [] }

  it('změní skupinu a barvu jen vybraným kotacím', () => {
    const out = applySecurityMeta(p, {
      ids: ['EUNL.DE', 'IWDA.AS'],
      indexGroup: 'Svět',
      color: '#112233'
    })
    expect(out.securities.filter((s) => s.indexGroup === 'Svět').map((s) => s.id)).toEqual([
      'EUNL.DE',
      'IWDA.AS'
    ])
    expect(out.securities.find((s) => s.id === 'SXR8.DE')!.indexGroup).toBe('S&P 500')
    expect(out.securities.find((s) => s.id === 'IWDA.AS')!.color).toBe('#112233')
    expect(p.securities[0].indexGroup).toBe('MSCI World') // původní data se nemění
  })

  it('částečná změna ponechá ostatní údaje', () => {
    const out = applySecurityMeta(p, { ids: ['SXR8.DE'], color: '#abcdef' })
    expect(out.securities[2].indexGroup).toBe('S&P 500')
    expect(out.securities[2].color).toBe('#abcdef')
  })

  it('odmítne neplatný vstup', () => {
    expect(() => applySecurityMeta(p, { ids: ['NEEXISTUJE'], indexGroup: 'X' })).toThrow(
      /Neznámé ETF/
    )
    expect(() => applySecurityMeta(p, { ids: ['EUNL.DE'], color: 'červená' })).toThrow()
    expect(() => applySecurityMeta(p, { ids: ['EUNL.DE'], indexGroup: '   ' })).toThrow()
    expect(() => applySecurityMeta(p, { ids: [], color: '#112233' })).toThrow()
    expect(() => applySecurityMeta(p, { ids: ['EUNL.DE'], isin: 'x' })).toThrow() // neznámé pole
  })
})
