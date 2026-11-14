import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import { calculatePortfolio, valueAtOrBefore } from './portfolio-calc'

/*
 * Ruční příklad (všechna čísla jsou spočítaná předem):
 *  2025-01-02  vklad 1000, nákup AAA 10 ks za 1000 (100 €/ks)
 *  2025-01-10  vklad 500,  nákup BBB 5 ks za 500   (100 €/ks)
 *  2025-01-20  prodej AAA 2 ks za 240 (120 €/ks), výběr 240
 *
 * Konec 2025-01-21: AAA 8 ks × 125 = 1000, BBB 5 ks × 102 = 510 → hodnota 1510, hotovost 0
 * Vloženo 1000 + 500 − 240 = 1260 → zisk 250
 *   (AAA: realizováno +40 a nerealizováno +200, BBB +10)
 */
const base = { currency: 'EUR' as const }
const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({
  accountId: 'xtb',
  ...base,
  ...t
})

function portfolio(extra: Transaction[] = []): Portfolio {
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
    accounts: [
      { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
      { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }
    ],
    securities: [sec('AAA'), sec('BBB')],
    transactions: [
      tx({ id: 't1', date: '2025-01-02', type: 'DEPOSIT', amount: 1000 }),
      tx({
        id: 't2',
        date: '2025-01-02',
        type: 'BUY',
        amount: 1000,
        securityId: 'AAA',
        shares: 10
      }),
      tx({ id: 't3', date: '2025-01-10', type: 'DEPOSIT', amount: 500 }),
      tx({ id: 't4', date: '2025-01-10', type: 'BUY', amount: 500, securityId: 'BBB', shares: 5 }),
      tx({ id: 't5', date: '2025-01-20', type: 'SELL', amount: 240, securityId: 'AAA', shares: 2 }),
      tx({ id: 't6', date: '2025-01-20', type: 'WITHDRAWAL', amount: 240 }),
      ...extra
    ]
  }
}

const series = (points: PricePoint[]): PriceCache['securities'][string] => ({
  currency: 'EUR',
  fetchedAt: '2025-01-21T10:00:00.000Z',
  coveredFrom: '2024-12-01',
  prices: points
})

function prices(withFx = true): PriceCache {
  return {
    version: 1,
    securities: {
      AAA: series([
        ['2025-01-02', 100],
        ['2025-01-03', 102],
        ['2025-01-06', 104],
        ['2025-01-10', 110],
        ['2025-01-20', 120],
        ['2025-01-21', 125]
      ]),
      BBB: series([
        ['2025-01-10', 100],
        ['2025-01-21', 102]
      ])
    },
    fx: withFx
      ? {
          [FX_EUR_CZK]: {
            fetchedAt: '2025-01-21T10:00:00.000Z',
            coveredFrom: '2024-01-01',
            rates: [
              ['2025-01-02', 25],
              ['2025-01-15', 26]
            ]
          }
        }
      : {}
  }
}

const calc = (p = portfolio(), c = prices(), extra = {}): ReturnType<typeof calculatePortfolio> =>
  calculatePortfolio({ portfolio: p, prices: c, ...extra })
const at = (r: ReturnType<typeof calculatePortfolio>, date: string): (typeof r.series)[number] =>
  r.series.find((s) => s.date === date)!

describe('calculatePortfolio – souhrn', () => {
  const { summary } = calc()

  it('hodnota, vloženo a zisk sedí s ručním výpočtem', () => {
    expect(summary!.asOf).toBe('2025-01-21')
    expect(summary!.value).toBeCloseTo(1510, 9)
    expect(summary!.invested).toBe(1260)
    expect(summary!.profit).toBeCloseTo(250, 9)
    expect(summary!.profitPct).toBeCloseTo(250 / 1260, 9)
    expect(summary!.cash).toBeCloseTo(0, 9)
    expect(summary!.depositCount).toBe(2)
    expect(summary!.firstDate).toBe('2025-01-02')
  })

  it('pozice: kusy, pořizovací cena (průměrná cena po prodeji) a nerealizovaný zisk', () => {
    const [aaa, bbb] = summary!.positions
    expect(aaa).toMatchObject({ securityId: 'AAA', shares: 8, price: 125, priceDate: '2025-01-21' })
    expect(aaa.costBasis).toBeCloseTo(800, 9)
    expect(aaa.value).toBeCloseTo(1000, 9)
    expect(aaa.unrealized).toBeCloseTo(200, 9)
    expect(aaa.unrealizedPct).toBeCloseTo(0.25, 9)
    expect(bbb).toMatchObject({ securityId: 'BBB', shares: 5, costBasis: 500, estimated: false })
    expect(bbb.unrealized).toBeCloseTo(10, 9)
  })

  it('změna za den = držené kusy × změna kurzu mezi posledními dvěma obchodními dny', () => {
    // 20. → 21. 1.: AAA 8 × (125 − 120) = 40, BBB 5 × (102 − 100) = 10
    expect(summary!.dayChange).toBeCloseTo(50, 9)
    expect(summary!.dayChangePct).toBeCloseTo(50 / (8 * 120 + 5 * 100), 9)
  })

  it('přepočet na Kč: hodnota dnešním kurzem, vklady kurzem ze dne vkladu', () => {
    // kurz 25 do 14. 1., od 15. 1. 26
    expect(summary!.fxRate).toBe(26)
    expect(summary!.valueCzk).toBeCloseTo(1510 * 26, 6)
    // 1000×25 + 500×25 − 240×26
    expect(summary!.investedCzk).toBeCloseTo(31260, 6)
    expect(summary!.profitCzk).toBeCloseTo(1510 * 26 - 31260, 6)
  })
})

describe('calculatePortfolio – denní řada', () => {
  const r = calc()

  it('začíná dnem prvního obchodu a končí posledním kurzem, každý den jednou', () => {
    expect(r.series[0].date).toBe('2025-01-02')
    expect(r.series.at(-1)!.date).toBe('2025-01-21')
    expect(r.series).toHaveLength(20)
  })

  it('hodnoty vybraných dnů', () => {
    expect(at(r, '2025-01-02')).toMatchObject({ value: 1000, invested: 1000 })
    // víkend 4. 1. přenáší kurz z pátku 3. 1. (102): 10 × 102
    expect(at(r, '2025-01-04').value).toBeCloseTo(1020, 9)
    // 10. 1.: AAA 10 × 110 + BBB 5 × 100
    expect(at(r, '2025-01-10')).toMatchObject({ invested: 1500 })
    expect(at(r, '2025-01-10').value).toBeCloseTo(1600, 9)
    // 20. 1. po prodeji a výběru: 8 × 120 + 5 × 100 (BBB přenesen z 10. 1.), vloženo 1260
    expect(at(r, '2025-01-20').value).toBeCloseTo(1460, 9)
    expect(at(r, '2025-01-20').invested).toBe(1260)
  })

  it('vložený kapitál v Kč se mezi vklady nemění s kurzem', () => {
    expect(at(r, '2025-01-14').investedCzk).toBeCloseTo(37500, 6)
    expect(at(r, '2025-01-16').investedCzk).toBeCloseTo(37500, 6)
    expect(at(r, '2025-01-14').valueCzk).toBeCloseTo(at(r, '2025-01-14').value * 25, 6)
    expect(at(r, '2025-01-16').valueCzk).toBeCloseTo(at(r, '2025-01-16').value * 26, 6)
  })
})

describe('calculatePortfolio – filtr brokera a okrajové případy', () => {
  const degiro = [
    tx({ id: 't7', accountId: 'degiro', date: '2025-01-05', type: 'DEPOSIT', amount: 100 }),
    tx({
      id: 't8',
      accountId: 'degiro',
      date: '2025-01-05',
      type: 'BUY',
      amount: 100,
      securityId: 'AAA',
      shares: 1
    })
  ]

  it('bez filtru se sečtou všechny účty, s filtrem jen vybraný', () => {
    const p = portfolio(degiro)
    const all = calc(p).summary!
    const xtb = calc(p, prices(), { accountIds: new Set(['xtb']) }).summary!
    const dg = calc(p, prices(), { accountIds: new Set(['degiro']) }).summary!
    expect(all.invested).toBe(1360)
    expect(xtb.invested).toBe(1260)
    expect(dg.invested).toBe(100)
    // Degiro: 1 ks AAA × 125
    expect(dg.value).toBeCloseTo(125, 9)
    expect(all.value).toBeCloseTo(1510 + 125, 9)
    expect(dg.positions).toHaveLength(1)
  })

  it('bez transakcí (např. broker bez obchodů) → žádný souhrn', () => {
    const r = calc(portfolio(), prices(), { accountIds: new Set(['neexistuje']) })
    expect(r.summary).toBeNull()
    expect(r.series).toEqual([])
  })

  it('chybějící kurzy: ocenění cenou posledního obchodu a upozornění', () => {
    const noPrices: PriceCache = { version: 1, securities: {}, fx: {} }
    const { summary } = calc(portfolio(), noPrices)
    expect(summary!.missingPrices.sort()).toEqual(['AAA', 'BBB'])
    expect(summary!.positions.every((p) => p.estimated && p.priceDate === null)).toBe(true)
    // AAA: poslední cena obchodu 120, BBB 100 → 8×120 + 5×100
    expect(summary!.value).toBeCloseTo(1460, 9)
    expect(summary!.warnings.join(' ')).toContain('Chybí stažený kurz')
    expect(summary!.dayChange).toBeNull()
    expect(summary!.asOf).toBe('2025-01-20')
  })

  it('bez kurzu ČNB jsou hodnoty v Kč null, hodnoty v EUR zůstanou', () => {
    const { summary, series } = calc(portfolio(), prices(false))
    expect(summary!.fxRate).toBeNull()
    expect(summary!.valueCzk).toBeNull()
    expect(summary!.investedCzk).toBeNull()
    expect(summary!.profitCzk).toBeNull()
    expect(series.every((s) => s.valueCzk === null)).toBe(true)
    expect(summary!.value).toBeCloseTo(1510, 9)
  })

  it('asOf: stav k dřívějšímu datu ignoruje pozdější obchody i kurzy', () => {
    const { summary } = calc(portfolio(), prices(), { asOf: '2025-01-10' })
    expect(summary!.invested).toBe(1500)
    expect(summary!.value).toBeCloseTo(1600, 9)
    expect(summary!.positions.find((p) => p.securityId === 'AAA')!.shares).toBe(10)
    expect(calc(portfolio(), prices(), { asOf: '2024-12-31' }).summary).toBeNull()
  })

  it('úplný prodej pozice ji z tabulky odstraní', () => {
    const p = portfolio([
      tx({ id: 't9', date: '2025-01-21', type: 'SELL', amount: 1000, securityId: 'AAA', shares: 8 })
    ])
    const { summary } = calc(p)
    expect(summary!.positions.map((x) => x.securityId)).toEqual(['BBB'])
  })

  it('dividenda a poplatek mění hotovost, ne vložený kapitál', () => {
    const p = portfolio([
      tx({ id: 't9', date: '2025-01-21', type: 'DIVIDEND', amount: 10, securityId: 'AAA' }),
      tx({ id: 't10', date: '2025-01-21', type: 'FEE', amount: 3 })
    ])
    const { summary } = calc(p)
    expect(summary!.cash).toBeCloseTo(7, 9)
    expect(summary!.invested).toBe(1260)
    expect(summary!.value).toBeCloseTo(1517, 9)
  })

  it('transakce v jiné měně než EUR vyvolá upozornění', () => {
    const p = portfolio([
      tx({ id: 't9', date: '2025-01-21', type: 'DEPOSIT', amount: 5, currency: 'USD' })
    ])
    expect(calc(p).summary!.warnings.join(' ')).toContain('není v EUR')
  })
})

describe('valueAtOrBefore', () => {
  const pts: PricePoint[] = [
    ['2025-01-02', 1],
    ['2025-01-10', 2]
  ]
  it('vrací poslední hodnotu k danému datu', () => {
    expect(valueAtOrBefore(pts, '2025-01-01')).toBeNull()
    expect(valueAtOrBefore(pts, '2025-01-02')).toBe(1)
    expect(valueAtOrBefore(pts, '2025-01-09')).toBe(1)
    expect(valueAtOrBefore(pts, '2025-01-10')).toBe(2)
    expect(valueAtOrBefore(pts, '2030-01-01')).toBe(2)
    expect(valueAtOrBefore([], '2025-01-01')).toBeNull()
  })
})
