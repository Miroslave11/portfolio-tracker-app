import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import { monthArticleFactsSchema, type MonthArticleFacts } from '../shared/summary'
import { annualVolatility, dailyReturns } from './summary-detail'
import { articleOutlook, buildMonthArticleFacts } from './summary-month'

/*
 * Ruční příklad:
 *  2022-11-10  vklad 1000, nákup AAA (World) 10 ks za 1000 → časový test splní 11. 11. 2025
 *  2025-10-10  vklad 500,  nákup BBB (EM) 5 ks za 500
 * Ceny: AAA 100 → 110 (31. 10.), BBB 100 → 95 (31. 10.); benchmark BEN 50 (31. 12. 2024),
 *       100 (30. 9.), 103 (31. 10.) → říjen +3 %, od začátku roku +106 %
 * Říjen 2025: World 1100, EM 475; cíl 50/50 a měsíční nákup 100 → celých 100 do EM
 */
const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'xtb', currency: 'EUR', ...t })

const sec = (id: string, indexGroup: string): Portfolio['securities'][number] => ({
  id,
  name: `${id} fond`,
  yahooTicker: id,
  currency: 'EUR',
  indexGroup,
  distributing: false,
  color: '#6366f1'
})

const portfolio: Portfolio = {
  version: 1,
  accounts: [{ id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }],
  securities: [sec('AAA', 'World'), sec('BBB', 'EM')],
  transactions: [
    tx({ id: 't1', date: '2022-11-10', type: 'DEPOSIT', amount: 1000 }),
    tx({ id: 't2', date: '2022-11-10', type: 'BUY', amount: 1000, securityId: 'AAA', shares: 10 }),
    tx({ id: 't3', date: '2025-10-10', type: 'DEPOSIT', amount: 500 }),
    tx({ id: 't4', date: '2025-10-10', type: 'BUY', amount: 500, securityId: 'BBB', shares: 5 })
  ]
}

const series = (points: PricePoint[]): PriceCache['securities'][string] => ({
  currency: 'EUR',
  fetchedAt: '2025-11-01T10:00:00.000Z',
  coveredFrom: '2022-01-01',
  prices: points
})

const prices: PriceCache = {
  version: 1,
  securities: {
    AAA: series([
      ['2022-11-10', 100],
      ['2025-09-30', 100],
      ['2025-10-31', 110]
    ]),
    BBB: series([
      ['2025-10-10', 100],
      ['2025-10-31', 95]
    ]),
    BEN: series([
      ['2024-12-31', 50],
      ['2025-09-30', 100],
      ['2025-10-31', 103]
    ])
  },
  fx: {
    [FX_EUR_CZK]: {
      fetchedAt: '2025-11-01T10:00:00.000Z',
      coveredFrom: '2022-01-01',
      rates: [['2022-01-01', 25]]
    }
  }
}

const build = (
  targets = [
    { group: 'World', share: 0.5 },
    { group: 'EM', share: 0.5 }
  ]
): MonthArticleFacts =>
  buildMonthArticleFacts({
    portfolio,
    prices,
    month: '2025-10',
    planMonthly: 100,
    targetCzk: 100_000,
    detail: { benchmark: 'BEN', targets, annualReturn: 0 }
  })!

describe('detailní údaje článku', () => {
  it('bez předpokladů článek detail nemá (starší články)', () => {
    const f = buildMonthArticleFacts({
      portfolio,
      prices,
      month: '2025-10',
      planMonthly: 0,
      targetCzk: 1
    })!
    expect(f.detail).toBeUndefined()
  })

  it('srovnání s benchmarkem za měsíc a od začátku roku', () => {
    const b = build().detail!.benchmark!
    expect(b.ticker).toBe('BEN')
    expect(b.periodReturn).toBeCloseTo(0.03, 9)
    expect(b.ytdReturn).toBeCloseTo(1.06, 9)
  })

  it('benchmark bez kurzů = null', () => {
    const f = buildMonthArticleFacts({
      portfolio,
      prices,
      month: '2025-10',
      planMonthly: 100,
      targetCzk: 100_000,
      detail: { benchmark: 'NIC', targets: [], annualReturn: 0 }
    })!
    expect(f.detail!.benchmark).toBeNull()
    expect(f.detail!.allocation).toBeNull()
  })

  it('riziko: nejlepší den, bez propadu a s málo dny bez kolísavosti', () => {
    const r = build().detail!.risk
    expect(r.bestDay?.date).toBe('2025-10-31')
    expect(r.bestDay?.pct).toBeCloseTo((1100 + 475) / 1500 - 1, 9)
    expect(r.worstDay).toBeNull()
    expect(r.volatility).toBeNull()
  })

  it('alokace: měsíční nákup jde celý do skupiny pod cílem', () => {
    const a = build().detail!.allocation!
    const em = a.rows.find((r) => r.group === 'EM')!
    const world = a.rows.find((r) => r.group === 'World')!
    expect(em.share).toBeCloseTo(475 / 1575, 9)
    expect(em.target).toBe(0.5)
    expect(em.buy).toBeCloseTo(100, 6)
    expect(world.buy).toBeCloseTo(0, 6)
    expect(a.monthlyEur).toBe(100)
  })

  it('odhad cíle: vyšší výnos = dřív', () => {
    const p = build().detail!.projection!
    expect(p.months).not.toBeNull()
    expect(p.monthsLow!).toBeLessThanOrEqual(p.months!)
    expect(p.monthsHigh!).toBeGreaterThanOrEqual(p.months!)
    // bez výnosu: (100 000 − 39 375) / 2 500 Kč měsíčně = 24,25 → 25 měsíců
    expect(p.months).toBe(25)
  })

  it('časový test: AAA se uvolní v listopadu, do konce roku je volné celé AAA', () => {
    const tt = build().detail!.timeTest!
    expect(tt.nextMonth).toBe('2025-11')
    expect(tt.freeValue).toBe(0)
    expect(tt.totalValue).toBe(1575)
    expect(tt.releasing).toEqual([
      { ticker: 'AAA', buyDate: '2022-11-10', freeFrom: '2025-11-11', value: 1100 }
    ])
    expect(tt.freeShareYearEnd).toBeCloseTo(1100 / 1575, 9)
  })

  it('výsledek projde schématem pro uložení', () => {
    expect(monthArticleFactsSchema.safeParse(build()).success).toBe(true)
  })
})

describe('výhled', () => {
  it('plánovaný nákup, rozdělení podle alokace a časový test', () => {
    const text = articleOutlook(build()).map((s) => s.replace(/\s/g, ' '))
    expect(text[0]).toBe(
      'Plánovaný nákup 100 €. Podle cílové alokace (100 €) jen dokupováním: EM 100 €.'
    )
    expect(text[1]).toMatch(/^World je 19,8 p\. b\. nad cílem; jen dokupováním se alokace/)
    expect(text[2]).toBe(
      'Příští měsíc (listopad 2025) splní časový test 1× nákup v dnešní hodnotě 1 100 €.'
    )
  })

  it('bez dat nic zvláštního', () => {
    const f = { ...build(), planMonthly: null, detail: undefined }
    expect(articleOutlook(f)).toEqual(['Na další měsíc z dat nic zvláštního nevychází.'])
  })
})

describe('pomocné výpočty rizika', () => {
  it('denní výnosy vynechají dny beze změny', () => {
    expect(
      dailyReturns([
        { date: 'a', pct: 0 },
        { date: 'b', pct: 0 },
        { date: 'c', pct: 0.1 },
        { date: 'd', pct: -0.01 }
      ]).map((r) => [r.date, Number(r.pct.toFixed(6))])
    ).toEqual([
      ['c', 0.1],
      ['d', Number((0.99 / 1.1 - 1).toFixed(6))]
    ])
  })

  it('roční kolísavost = směrodatná odchylka × √252', () => {
    const r = [0.01, -0.01, 0.01, -0.01, 0.01]
    const mean = 0.002
    const sd = Math.sqrt(r.reduce((s, x) => s + (x - mean) ** 2, 0) / 4)
    expect(annualVolatility(r)).toBeCloseTo(sd * Math.sqrt(252), 12)
    expect(annualVolatility([0.01, 0.02])).toBeNull()
  })
})
