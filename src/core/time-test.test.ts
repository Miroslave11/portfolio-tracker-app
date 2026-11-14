import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { computeLots } from './lots'
import { timeTestSummary } from './time-test'

const tx = (
  id: string,
  date: string,
  type: 'BUY' | 'SELL',
  securityId: string,
  shares: number,
  amount: number,
  accountId = 'xtb'
): Transaction => ({
  id,
  accountId,
  date,
  type,
  amount,
  currency: 'EUR',
  securityId,
  shares
})
const p = (transactions: Transaction[]): Portfolio => ({
  version: 1,
  accounts: [
    { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
    { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }
  ],
  securities: [
    {
      id: 'EUNL.DE',
      isin: 'IE00B4L5Y983',
      name: 'W',
      yahooTicker: 'EUNL.DE',
      currency: 'EUR',
      indexGroup: 'W',
      distributing: false,
      color: '#000000'
    },
    {
      id: 'IWDA.AS',
      isin: 'IE00B4L5Y983',
      name: 'W',
      yahooTicker: 'IWDA.AS',
      currency: 'EUR',
      indexGroup: 'W',
      distributing: false,
      color: '#000000'
    },
    {
      id: 'SXR8.DE',
      isin: 'IE00B5BMR087',
      name: 'S',
      yahooTicker: 'SXR8.DE',
      currency: 'EUR',
      indexGroup: 'S',
      distributing: false,
      color: '#000000'
    }
  ],
  transactions
})
const PRICES: Record<string, number> = { 'EUNL.DE': 100, 'IWDA.AS': 101, 'SXR8.DE': 500 }
const TODAY = '2026-11-13'

/*
 * Ruční příklad (dnes 13. 11. 2026):
 *  IWDA 2019-05-01  4 ks (Degiro)  → volné od 2. 5. 2022      volné
 *  EUNL 2023-11-13  2 ks           → volné od 14. 11. 2026    čeká 1 den
 *  EUNL 2025-03-01  5 ks           → volné od 2. 3. 2028      čeká
 *  SXR8 2024-02-29  1 ks           → volné od 1. 3. 2027      čeká
 *  prodej 2026-01-10 1 ks EUNL → FIFO ubere 1 ks z nejstaršího (IWDA 2019) → zbývají 3 ks
 */
const r = computeLots(
  p([
    tx('a', '2019-05-01', 'BUY', 'IWDA.AS', 4, 200, 'degiro'),
    tx('b', '2023-11-13', 'BUY', 'EUNL.DE', 2, 160),
    tx('c', '2025-03-01', 'BUY', 'EUNL.DE', 5, 450),
    tx('d', '2024-02-29', 'BUY', 'SXR8.DE', 1, 450),
    tx('s', '2026-01-10', 'SELL', 'EUNL.DE', 1, 95)
  ])
)
const t = timeTestSummary(r.openLots, TODAY, { priceOf: (id) => PRICES[id] })

describe('timeTestSummary', () => {
  it('rozdělí loty na volné a čekající; den výročí ještě nestačí', () => {
    expect(t.lots.map((l) => [l.lot.id, l.lot.remaining, l.free, l.freeFrom])).toEqual([
      ['a', 3, true, '2022-05-02'],
      ['b', 2, false, '2026-11-14'],
      ['d', 1, false, '2027-03-01'],
      ['c', 5, false, '2028-03-02']
    ])
    expect(t.lots[1].daysLeft).toBe(1)
  })

  it('hodnoty: volné, čekající, do roka a celkem', () => {
    expect(t.freeValue).toBe(3 * 101)
    expect(t.waitingValue).toBe(2 * 100 + 500 + 5 * 100)
    expect(t.totalValue).toBe(t.freeValue + t.waitingValue)
    // do 13. 11. 2027: lot b (200) a d (500)
    expect(t.freeWithinYearValue).toBe(700)
    expect(t.next!.lot.id).toBe('b')
  })

  it('po fondech (ISIN): volné kusy jsou nejstarší a lze je prodat první', () => {
    const w = t.byFund.find((f) => f.securityKey === 'IE00B4L5Y983')!
    expect(w.label).toBe('EUNL.DE / IWDA.AS')
    expect(w.freeShares).toBe(3)
    expect(w.waitingShares).toBe(7)
    expect(w.nextFreeFrom).toBe('2026-11-14')
    const s = t.byFund.find((f) => f.securityKey === 'IE00B5BMR087')!
    expect(s.freeShares).toBe(0)
    expect(s.freeValue).toBe(0)
  })

  it('podle roku uvolnění; první položka je „volné dnes“', () => {
    expect(t.byYear).toEqual([
      { year: null, value: 303 },
      { year: 2026, value: 200 },
      { year: 2027, value: 500 },
      { year: 2028, value: 500 }
    ])
  })

  it('zisk a průběh lhůty', () => {
    const c = t.lots.find((l) => l.lot.id === 'c')!
    expect(c.cost).toBe(450)
    expect(c.gain).toBe(50)
    expect(c.progress).toBeGreaterThan(0.5)
    expect(c.progress).toBeLessThan(0.6)
    expect(t.lots[0].progress).toBe(1)
  })

  it('přepočet do Kč: hodnota dnešním kurzem, náklady kurzem ke dni nákupu', () => {
    const k = timeTestSummary(r.openLots, TODAY, {
      priceOf: (id) => PRICES[id],
      rateToday: 25,
      rateAt: (d) => (d.startsWith('2019') ? 26 : 24)
    })
    const a = k.lots[0]
    expect(a.value).toBe(3 * 101 * 25)
    expect(a.cost).toBeCloseTo(3 * 50 * 26, 8)
  })

  it('bez kurzu se hodnota bere z pořizovací ceny; prázdné portfolio', () => {
    const k = timeTestSummary(r.openLots, TODAY, { priceOf: () => undefined })
    expect(k.lots.find((l) => l.lot.id === 'c')!.value).toBe(450)
    const empty = timeTestSummary([], TODAY, { priceOf: () => 1 })
    expect(empty.totalValue).toBe(0)
    expect(empty.next).toBeNull()
    expect(empty.byYear).toEqual([{ year: null, value: 0 }])
  })
})
