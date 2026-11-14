import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import { monthArticleFactsSchema, type MonthArticleFacts } from '../shared/summary'
import {
  articleCommentary,
  articleHighlights,
  articleTitle,
  bestWorst,
  buildMonthArticleFacts,
  buildPeriodFacts,
  dueMonths,
  latestPriceDate,
  maxDrawdown,
  missingMonths,
  monthReady,
  planShare
} from './summary-month'

/*
 * Ruční příklad (čísla spočítaná předem):
 *  2025-09-15  vklad 1000, nákup AAA 10 ks za 1000
 *  2025-10-10  vklad 500,  nákup BBB 5 ks za 500 (XTB)
 *  2025-10-20  dividenda AAA 12
 *  2025-10-25  poplatek 2
 * Ceny AAA: 100 (9/30) → 105 (10/5) → 94,5 (10/15) → 110 (10/31); BBB 100 (10/10) → 95 (10/31)
 *
 * Říjen 2025: začátek 1000, konec 1100 + 475 + hotovost 10 = 1585, vloženo +500
 *   → trh +85 = změna cen 75 + dividendy 12 − poplatky 2
 *   AAA: 1100 − 1000 + 12 = +112 (+11,2 %), BBB: 475 − 500 = −25 (−5 %)
 *   Výkon: 1,05 × 1585 / 1550 − 1; největší pokles 1445/1550 − 1 (5. 10. → 15. 10.)
 * Kurz 25 Kč/€ → 39 625 Kč (0,39625 % cíle), na konci září 25 000 Kč (0,25 %)
 */
const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'xtb', currency: 'EUR', ...t })

const portfolio: Portfolio = {
  version: 1,
  accounts: [{ id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }],
  securities: ['AAA', 'BBB'].map((id) => ({
    id,
    name: `${id} fond`,
    yahooTicker: id,
    currency: 'EUR',
    indexGroup: 'S&P 500',
    distributing: false,
    color: '#6366f1'
  })),
  transactions: [
    tx({ id: 't1', date: '2025-09-15', type: 'DEPOSIT', amount: 1000 }),
    tx({ id: 't2', date: '2025-09-15', type: 'BUY', amount: 1000, securityId: 'AAA', shares: 10 }),
    tx({ id: 't3', date: '2025-10-10', type: 'DEPOSIT', amount: 500 }),
    tx({ id: 't4', date: '2025-10-10', type: 'BUY', amount: 500, securityId: 'BBB', shares: 5 }),
    tx({ id: 't5', date: '2025-10-20', type: 'DIVIDEND', amount: 12, securityId: 'AAA' }),
    tx({ id: 't6', date: '2025-10-25', type: 'FEE', amount: 2 })
  ]
}

const series = (points: PricePoint[]): PriceCache['securities'][string] => ({
  currency: 'EUR',
  fetchedAt: '2025-11-01T10:00:00.000Z',
  coveredFrom: '2025-01-01',
  prices: points
})

const prices: PriceCache = {
  version: 1,
  securities: {
    AAA: series([
      ['2025-09-15', 100],
      ['2025-09-30', 100],
      ['2025-10-05', 105],
      ['2025-10-15', 94.5],
      ['2025-10-31', 110]
    ]),
    BBB: series([
      ['2025-10-10', 100],
      ['2025-10-31', 95]
    ])
  },
  fx: {
    [FX_EUR_CZK]: {
      fetchedAt: '2025-11-01T10:00:00.000Z',
      coveredFrom: '2025-01-01',
      rates: [['2025-09-01', 25]]
    }
  }
}

const facts = (month = '2025-10', planMonthly = 500): MonthArticleFacts =>
  buildMonthArticleFacts({ portfolio, prices, month, planMonthly, targetCzk: 5_000_000 })!

const plain = (s: string): string => s.replace(/\s/g, ' ')

describe('buildMonthArticleFacts', () => {
  it('rozloží změnu hodnoty na vklady, ceny, dividendy a poplatky', () => {
    const f = facts()
    expect(f.valueStart).toBe(1000)
    expect(f.valueEnd).toBe(1585)
    expect(f.netDeposits).toBe(500)
    expect(f.marketChange).toBe(85)
    expect(f.priceChange).toBe(75)
    expect(f.dividends).toBe(12)
    expect(f.fees).toBe(2)
    expect(f.valueStart + f.netDeposits + f.priceChange + f.dividends - f.fees).toBeCloseTo(
      f.valueEnd,
      6
    )
  })

  it('příspěvky ETF dají dohromady změnu trhem (po odečtení poplatků)', () => {
    const f = facts()
    const aaa = f.etfs.find((e) => e.ticker === 'AAA')!
    const bbb = f.etfs.find((e) => e.ticker === 'BBB')!
    expect(aaa.contribution).toBe(112)
    expect(aaa.pct).toBeCloseTo(0.112, 9)
    expect(aaa.dividends).toBe(12)
    expect(aaa.name).toBe('AAA fond')
    expect(bbb.contribution).toBe(-25)
    expect(bbb.pct).toBeCloseTo(-0.05, 9)
    expect(bbb.bought).toBe(500)
    expect(aaa.weight + bbb.weight).toBeCloseTo(1, 9)
    expect(f.etfs.reduce((s, e) => s + e.contribution, 0) - f.fees).toBeCloseTo(f.marketChange, 6)
    // seřazeno podle hodnoty
    expect(f.etfs.map((e) => e.ticker)).toEqual(['AAA', 'BBB'])
  })

  it('výkon bez vkladů a největší pokles v měsíci', () => {
    const f = facts()
    expect(f.periodReturn).toBeCloseTo((1.05 * 1585) / 1550 - 1, 9)
    expect(f.drawdown?.pct).toBeCloseTo(1445 / 1550 - 1, 9)
    expect(f.drawdown?.from).toBe('2025-10-05')
    expect(f.drawdown?.to).toBe('2025-10-15')
    // rok začal v září → výkon od začátku roku = celý výkon od prvního nákupu
    expect(f.ytdReturn).toBeCloseTo((1.05 * 1585) / 1550 - 1, 9)
  })

  it('nákupy, plán, dividendy a cíl', () => {
    const f = facts()
    expect(f.bought).toBe(500)
    expect(f.buyCount).toBe(1)
    expect(f.boughtPrevious).toBe(1000)
    expect(f.boughtYtd).toBe(1500)
    expect(f.monthsYtd).toBe(2)
    expect(f.planMonthly).toBe(500)
    expect(planShare(f)).toBe(1)
    expect(f.trades).toEqual([
      { date: '2025-10-10', type: 'BUY', broker: 'XTB', ticker: 'BBB', amount: 500, shares: 5 }
    ])
    expect(f.dividendList).toEqual([{ date: '2025-10-20', ticker: 'AAA', amount: 12 }])
    expect(f.dividendsYtd).toBe(12)
    expect(f.dividends12m).toBe(12)
    expect(f.goal?.valueCzk).toBe(39_625)
    expect(f.goal?.progress).toBeCloseTo(0.007925, 12)
    expect(f.goal?.progressPrev).toBeCloseTo(0.005, 12)
    expect(f.fxEnd).toBe(25)
  })

  it('denní hodnoty celého měsíce', () => {
    const f = facts()
    expect(f.daily).toHaveLength(31)
    expect(f.daily[0]).toEqual(['2025-10-01', 1000])
    expect(f.daily.at(-1)).toEqual(['2025-10-31', 1585])
  })

  it('výsledek projde schématem pro uložení', () => {
    expect(monthArticleFactsSchema.safeParse(facts()).success).toBe(true)
    expect(monthArticleFactsSchema.safeParse(facts('2025-09')).success).toBe(true)
  })

  it('první měsíc: bez předchozího měsíce, začíná od nuly', () => {
    const f = facts('2025-09')
    expect(f.valueStart).toBe(0)
    expect(f.netDeposits).toBe(1000)
    expect(f.boughtPrevious).toBeNull()
    expect(f.goal?.progressPrev).toBe(0)
    expect(f.etfs).toHaveLength(1)
  })

  it('bez plánu je plán null a měsíc mimo data vrací null', () => {
    expect(facts('2025-10', 0).planMonthly).toBeNull()
    expect(planShare(facts('2025-10', 0))).toBeNull()
    expect(
      buildMonthArticleFacts({ portfolio, prices, month: '2025-08', planMonthly: 0, targetCzk: 1 })
    ).toBeNull()
  })
})

describe('delší období (P26)', () => {
  const year = (p: Portfolio = portfolio): MonthArticleFacts =>
    buildPeriodFacts({
      portfolio: p,
      prices,
      kind: 'year',
      period: '2025',
      planMonthly: 500,
      targetCzk: 5_000_000
    })!

  it('rok: tabulka po měsících a plán za měsíce s daty', () => {
    const f = year()
    expect(f.kind).toBe('year')
    expect(f.from).toBe('2025-01-01')
    expect(f.partial).toBe(true)
    expect(f.periodMonths).toBe(2)
    expect(planShare(f)).toBe(1.5) // 1500 z 2 × 500
    expect(f.months).toEqual([
      {
        month: '2025-09',
        valueEnd: 1000,
        netDeposits: 1000,
        marketChange: 0,
        periodReturn: 0,
        bought: 1000
      },
      {
        month: '2025-10',
        valueEnd: 1585,
        netDeposits: 500,
        marketChange: 85,
        periodReturn: expect.closeTo((1.05 * 1585) / 1550 - 1, 9),
        bought: 500
      }
    ])
    // předchozí rok (2024) ještě neměl data
    expect(f.boughtPrevious).toBeNull()
    expect(f.prevPeriodReturn).toBeNull()
    expect(f.realized).toBeNull()
    expect(monthArticleFactsSchema.safeParse(f).success).toBe(true)
  })

  it('realizovaný zisk z prodeje v období', () => {
    const sold: Portfolio = {
      ...portfolio,
      transactions: [
        ...portfolio.transactions,
        tx({
          id: 't7',
          date: '2025-10-28',
          type: 'SELL',
          amount: 485,
          securityId: 'BBB',
          shares: 5
        })
      ]
    }
    expect(year(sold).realized).toEqual({ count: 1, proceeds: 485, gain: -15, exemptGain: 0 })
  })

  it('texty: název, předchozí období a nejlepší/nejhorší měsíc', () => {
    const f = year()
    expect(articleTitle(f)).toBe('Rok 2025')
    const text = articleCommentary(f).join(' ')
    expect(text).toContain('V tomto roce jsi nakoupil za')
    expect(text.replace(/\s/g, ' ')).toContain('Nejlepší měsíc byl říjen 2025')
    expect(articleHighlights(f).join(' ').replace(/\s/g, ' ')).toContain(
      'Plán nákupů za rok (1 000 €) splněn na 150 %.'
    )
  })

  it('měsíc z P24 bez typu se bere jako měsíc', () => {
    const old = { ...facts(), kind: undefined }
    expect(articleTitle(old)).toBe('Říjen 2025')
  })
})

describe('maxDrawdown', () => {
  it('najde největší pokles od vrcholu', () => {
    const dd = maxDrawdown([
      { date: 'a', pct: 0 },
      { date: 'b', pct: 0.1 },
      { date: 'c', pct: -0.01 },
      { date: 'd', pct: 0.2 },
      { date: 'e', pct: 0.14 }
    ])!
    expect(dd.pct).toBeCloseTo(0.99 / 1.1 - 1, 9)
    expect(dd.from).toBe('b')
    expect(dd.to).toBe('c')
  })
  it('bez poklesu je 0', () => {
    expect(
      maxDrawdown([
        { date: 'a', pct: 0 },
        { date: 'b', pct: 0.1 }
      ])!.pct
    ).toBe(0)
  })
})

describe('které měsíce vytvořit', () => {
  it('kurzy jsou kompletní do dne, kam sahají u všech držených ETF', () => {
    expect(latestPriceDate(portfolio, prices)).toBe('2025-10-31')
    const lagging: PriceCache = {
      ...prices,
      securities: {
        ...prices.securities,
        BBB: series([
          ['2025-10-10', 100],
          ['2025-10-24', 97]
        ])
      }
    }
    expect(latestPriceDate(portfolio, lagging)).toBe('2025-10-24')
    // prodané ETF s dávno posledním kurzem nevadí
    const sold: Portfolio = {
      ...portfolio,
      transactions: [
        ...portfolio.transactions,
        tx({
          id: 't7',
          date: '2025-10-24',
          type: 'SELL',
          amount: 485,
          securityId: 'BBB',
          shares: 5
        })
      ]
    }
    expect(latestPriceDate(sold, lagging)).toBe('2025-10-31')
    expect(latestPriceDate(portfolio, { ...prices, securities: {} })).toBeNull()
  })

  it('měsíc musí skončit a kurzy musí pokrýt jeho konec (rezerva na víkend)', () => {
    expect(monthReady('2025-10', '2025-10-31', '2025-10-31')).toBe(false)
    expect(monthReady('2025-10', '2025-10-31', '2025-11-01')).toBe(true)
    // říjen 2026 končí v sobotu, poslední kurz je z pátku
    expect(monthReady('2026-10', '2026-10-30', '2026-11-01')).toBe(true)
    expect(monthReady('2025-10', '2025-10-20', '2025-11-13')).toBe(false)
    expect(monthReady('2025-10', null, '2025-11-13')).toBe(false)
  })

  it('chybějící měsíce od prvního obchodu', () => {
    expect(missingMonths(new Set(), '2025-09-15', '2025-10-31', '2025-11-13')).toEqual([
      '2025-09',
      '2025-10'
    ])
    expect(missingMonths(new Set(['2025-09']), '2025-09-15', '2025-10-31', '2025-11-13')).toEqual([
      '2025-10'
    ])
    // říjen ještě nemá kurzy ke konci měsíce
    expect(missingMonths(new Set(), '2025-09-15', '2025-10-20', '2025-11-13')).toEqual(['2025-09'])
  })

  it('dohnání: bez článků jen poslední měsíc, jinak měsíce po posledním článku', () => {
    expect(dueMonths(new Set(), '2025-09-15', '2025-10-31', '2025-11-13')).toEqual(['2025-10'])
    expect(dueMonths(new Set(['2025-09']), '2025-09-15', '2025-11-28', '2025-12-02')).toEqual([
      '2025-10',
      '2025-11'
    ])
    // starší chybějící měsíc se automaticky nedoplňuje a nic se nevytváří dvakrát
    expect(dueMonths(new Set(['2025-10']), '2025-09-15', '2025-10-31', '2025-11-13')).toEqual([])
  })
})

describe('šablonový text', () => {
  it('V kostce: hodnota, vklady, trh, výkon, cíl a plán', () => {
    const lines = articleHighlights(facts()).map(plain)
    expect(lines[0]).toBe(
      'Portfolio vzrostlo na 1 585 € (+585 €). Z toho 500 € jsi vložil a trh přidal 85 €.'
    )
    expect(lines[1]).toMatch(/^Výkon samotných investic \(bez vkladů\) byl \+7,37 %/)
    expect(lines[2]).toBe(
      'K cíli 5 000 000 Kč máš 0,8 % (+0,3 p. b. za měsíc). Měsíční plán nákupů splněn na 100 %.'
    )
  })

  it('Komentář: nákupy, pokles, nejlepší a nejhorší ETF, bez dividend', () => {
    const text = plain(articleCommentary(facts()).join('\n'))
    expect(text).toContain('nakoupil za 500 €: BBB 500 € (10. 10.)')
    expect(text).toContain('Největší pokles během měsíce byl -6,8 % (5. 10. až 15. 10.)')
    expect(text).toContain('Nejlépe si vedlo AAA (+11,2 %), nejhůře BBB (-5,0 %).')
    expect(text).toContain('Nejvíc přidalo AAA: +112 €.')
    expect(text).not.toContain('ividend')
  })

  it('nejlepší a nejhorší ETF', () => {
    const { best, worst } = bestWorst(facts())
    expect(best?.ticker).toBe('AAA')
    expect(worst?.ticker).toBe('BBB')
  })
})
