import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import {
  buildMonthFacts,
  buildRewritePrompt,
  checkRewrite,
  extractNumbers,
  templateSummary,
  unknownNumbers,
  type MonthFacts
} from './monthly-summary'

/*
 * Ruční příklad (čísla spočítaná předem):
 *  2025-09-15  vklad 1000, nákup AAA 10 ks za 1000
 *  2025-10-10  vklad 500,  nákup BBB 5 ks za 500
 * Ceny: AAA 100 (9/30) → 110 (10/31), BBB 100 (10/10) → 95 (10/31)
 *
 * Říjen 2025: hodnota 1100 + 475 = 1575, na začátku 1000, vloženo +500
 *   → změna 575, z toho trh 75; nákup 500 (1×), v září 1000
 *   AAA +10 % (100 / 1000), BBB −5 % (−25 / 500)
 * Kurz 25 Kč/€ → hodnota 39 375 Kč, 0,7875 % cíle 5 mil. Kč
 */
const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'xtb', currency: 'EUR', ...t })

const portfolio: Portfolio = {
  version: 1,
  accounts: [{ id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }],
  securities: ['AAA', 'BBB'].map((id) => ({
    id,
    name: id,
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
    tx({ id: 't4', date: '2025-10-10', type: 'BUY', amount: 500, securityId: 'BBB', shares: 5 })
  ]
}

const series = (points: PricePoint[]): PriceCache['securities'][string] => ({
  currency: 'EUR',
  fetchedAt: '2025-11-01T10:00:00.000Z',
  coveredFrom: '2025-01-01',
  prices: points
})

function prices(extraAaa: PricePoint[] = [], withFx = true): PriceCache {
  return {
    version: 1,
    securities: {
      AAA: series([['2025-09-15', 100], ['2025-09-30', 100], ['2025-10-31', 110], ...extraAaa]),
      BBB: series([
        ['2025-10-10', 100],
        ['2025-10-31', 95]
      ])
    },
    fx: withFx
      ? {
          [FX_EUR_CZK]: {
            fetchedAt: '2025-11-01T10:00:00.000Z',
            coveredFrom: '2025-01-01',
            rates: [['2025-09-01', 25]]
          }
        }
      : {}
  }
}

const facts = (
  month = '2025-10',
  currency: 'EUR' | 'CZK' = 'EUR',
  p = prices()
): MonthFacts | null =>
  buildMonthFacts({ portfolio, prices: p, month, currency, targetCzk: 5_000_000 })

describe('buildMonthFacts', () => {
  it('spočítá nákup, změnu hodnoty a vliv trhu', () => {
    const f = facts()!
    expect(f.asOf).toBe('2025-10-31')
    expect(f.partial).toBe(false)
    expect(f.bought).toBe(500)
    expect(f.buyCount).toBe(1)
    expect(f.boughtPrevious).toBe(1000)
    expect(f.value).toBeCloseTo(1575, 6)
    expect(f.valueChange).toBeCloseTo(575, 6)
    expect(f.marketChange).toBeCloseTo(75, 6)
    expect(typeof f.monthReturn).toBe('number')
  })

  it('najde nejlepší a nejhorší ETF bez vlivu nákupů', () => {
    const f = facts()!
    expect(f.best?.ticker).toBe('AAA')
    expect(f.best?.pct).toBeCloseTo(0.1, 6)
    expect(f.worst?.ticker).toBe('BBB')
    expect(f.worst?.pct).toBeCloseTo(-0.05, 6)
  })

  it('postup k cíli v Kč', () => {
    const f = facts()!
    expect(f.goal?.valueCzk).toBeCloseTo(39_375, 6)
    expect(f.goal?.progress).toBeCloseTo(0.007875, 9)
  })

  it('v Kč přepočítá částky kurzem platným v daný den', () => {
    const f = facts('2025-10', 'CZK')!
    expect(f.currency).toBe('CZK')
    expect(f.bought).toBeCloseTo(12_500, 6)
    expect(f.value).toBeCloseTo(39_375, 6)
    expect(f.valueChange).toBeCloseTo(14_375, 6)
    expect(f.marketChange).toBeCloseTo(1875, 6)
  })

  it('bez kurzu ČNB zůstane EUR a cíl chybí', () => {
    const f = facts('2025-10', 'CZK', prices([], false))!
    expect(f.currency).toBe('EUR')
    expect(f.goal).toBeNull()
  })

  it('první měsíc nemá předchozí měsíc ani začáteční hodnotu', () => {
    const f = facts('2025-09')!
    expect(f.boughtPrevious).toBeNull()
    expect(f.bought).toBe(1000)
    expect(f.valueChange).toBeCloseTo(1000, 6)
  })

  it('rozpracovaný měsíc: hodnoty k poslednímu známému dni', () => {
    const f = facts('2025-11', 'EUR', prices([['2025-11-12', 120]]))!
    expect(f.partial).toBe(true)
    expect(f.asOf).toBe('2025-11-12')
    expect(f.buyCount).toBe(0)
  })

  it('měsíc bez dat (před prvním obchodem nebo po posledním kurzu) vrátí null', () => {
    expect(facts('2025-08')).toBeNull()
    expect(facts('2025-11')).toBeNull()
  })
})

describe('templateSummary', () => {
  const text = (f: MonthFacts): string => templateSummary(f).join(' ')

  it('obsahuje měsíc, nákup, změnu hodnoty a nejlepší i nejhorší ETF', () => {
    const t = text(facts()!)
    expect(t).toContain('říjen 2025')
    expect(t).toMatch(/nakoupil ETF za 500\s€/)
    expect(t).toContain('vzrostla')
    expect(t).toContain('AAA')
    expect(t).toContain('BBB')
    expect(t).toContain('K cíli')
  })

  it('bez nákupu řekne, že se nenakupovalo; pokles hodnoty zní jako pokles', () => {
    const base = facts()!
    const t = text({ ...base, buyCount: 0, bought: 0, valueChange: -50, marketChange: -50 })
    expect(t).toContain('nenakoupil žádné ETF')
    expect(t).toContain('klesla')
    expect(t).toContain('Samotný trh ji snížil')
  })

  it('každé číslo ze šablony projde ověřením proti sobě samé', () => {
    const t = text(facts()!)
    expect(unknownNumbers(t, t)).toEqual([])
  })
})

describe('ověření čísel', () => {
  it('rozpozná česky zapsaná čísla', () => {
    expect(extractNumbers('Hodnota 1 234,50 € a 12,3 % k 31. 10. 2025')).toEqual([
      1234.5, 12.3, 31, 10, 2025
    ])
    expect(extractNumbers('39 375 Kč')).toEqual([39375])
  })

  const source = 'Nakoupil jsi za 500 € (1 nákup). Výkon +2,50 % k 31. 10. 2025.'

  it('přijme přeformulování se stejnými čísly (i jiný zápis desetin)', () => {
    const r = checkRewrite(
      source,
      'V říjnu 2025 (k 31. 10. 2025) jsi nakoupil za 500 € a výkon byl 2,5 %.'
    )
    expect(r.ok).toBe(true)
  })

  it('zamítne podvržené nebo zaokrouhlené číslo', () => {
    const r = checkRewrite(source, 'Nakoupil jsi za 5 000 € a výkon byl 2,5 %.')
    expect(r).toMatchObject({ ok: false, reason: 'numbers' })
    expect(checkRewrite(source, 'Nakoupil jsi za 500 € a výkon byl 2,6 %.').ok).toBe(false)
    expect(checkRewrite(source, 'Nakoupil jsi za 500 € a výkon byl 3 %.').ok).toBe(false)
  })

  it('zamítne přidané nové číslo i prázdný a přehnaně dlouhý text', () => {
    expect(checkRewrite(source, 'Nakoupil jsi za 500 € už po 3. do měsíce.').ok).toBe(false)
    expect(checkRewrite(source, '   ')).toMatchObject({ ok: false, reason: 'empty' })
    expect(checkRewrite(source, 'a '.repeat(500))).toMatchObject({ ok: false, reason: 'too-long' })
  })

  it('text bez čísel je v pořádku', () => {
    expect(checkRewrite(source, 'Dobrý měsíc.').ok).toBe(true)
  })

  it('pokyn pro model obsahuje shrnutí i zákaz měnit čísla', () => {
    const prompt = buildRewritePrompt(source)
    expect(prompt).toContain(source)
    expect(prompt).toContain('neměň')
  })
})
