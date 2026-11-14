import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { FX_EUR_CZK, type PriceCache, type PricePoint } from '../shared/prices'
import type { MonthArticleFacts } from '../shared/summary'
import { unknownNumbers } from './monthly-summary'
import { articleFactSheet, buildPartPrompt, checkPartOutput, parsePartOutput } from './summary-ai'
import {
  articleCommentary,
  articleHighlights,
  articleOutlook,
  buildPeriodFacts
} from './summary-month'

/* Stejný příklad jako summary-detail.test: říjen 2025, AAA (World) a BBB (EM), benchmark BEN. */
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

const month = (): MonthArticleFacts =>
  buildPeriodFacts({
    portfolio,
    prices,
    kind: 'month',
    period: '2025-10',
    planMonthly: 100,
    targetCzk: 100_000,
    detail: {
      benchmark: 'BEN',
      targets: [
        { group: 'World', share: 0.5 },
        { group: 'EM', share: 0.5 }
      ],
      annualReturn: 0
    }
  })!

const year = (): MonthArticleFacts =>
  buildPeriodFacts({
    portfolio,
    prices,
    kind: 'year',
    period: '2025',
    planMonthly: 100,
    targetCzk: 100_000
  })!

const flat = (s: string): string => s.replace(/\s/g, ' ')

describe('soupis faktů článku', () => {
  it('obsahuje hodnoty, výkon, nákupy, ETF, srovnání, alokaci a výhled', () => {
    const sheet = articleFactSheet(month()).map(flat)
    expect(sheet[0]).toBe(
      'Období: Říjen 2025 (1. 10. 2025 – 31. 10. 2025), hodnoty jsou k 31. 10. 2025.'
    )
    expect(sheet).toContain(
      'Hodnota portfolia na začátku období 1 000 €, na konci 1 575 €; změna +575 €.'
    )
    expect(sheet).toContain(
      'Výkon portfolia za měsíc bez vlivu vkladů: +5,00 %. Od začátku roku +5,0 %.'
    )
    expect(sheet).toContain(
      'V tomto měsíci se nakoupilo za 500 € (nákupů: 1). Za předchozí měsíc to bylo 0 €.'
    )
    expect(sheet).toContain(
      'ETF AAA (AAA fond): hodnota 1 100 €, váha 69,8 %, výkon +10,0 %, příspěvek +100 €.'
    )
    expect(sheet).toContain('Srovnání s BEN: portfolio +5,00 %, BEN +3,00 % za měsíc.')
    expect(sheet).toContain('Alokace EM: 30,2 %, cíl 50 %.')
    expect(sheet.some((l) => l.startsWith('Výhled: Plánovaný nákup 100 €.'))).toBe(true)
    // kurz se nezměnil → věta o kurzu se vynechá
    expect(sheet.some((l) => l.startsWith('Kurz ČNB'))).toBe(false)
  })

  it('delší období má měsíce a nejlepší/nejhorší měsíc', () => {
    const sheet = articleFactSheet(year()).map(flat)
    expect(sheet).toContain(
      'říjen 2025: výkon +5,0 %, změna trhem +75 €, vklady +500 €, nakoupeno 500 €.'
    )
    expect(sheet).toContain('Nejlepší měsíc byl říjen 2025 (+5,0 %), nejhorší září 2025 (0,0 %).')
    expect(sheet[0]).toContain('Rok 2025')
    expect(sheet[0]).toContain('Období ještě neskončilo.')
  })

  it('všechna čísla ze šablonových textů jsou v soupisu (AI je smí použít)', () => {
    for (const f of [month(), year()]) {
      const sheet = articleFactSheet(f).join('\n')
      const templates = [
        ...articleHighlights(f),
        ...articleCommentary(f),
        ...articleOutlook(f)
      ].join('\n')
      expect(unknownNumbers(sheet, templates)).toEqual([])
    }
  })
})

describe('prompt', () => {
  const base = {
    kind: 'month' as const,
    length: 'medium' as const,
    style: 'factual' as const,
    facts: ['Hodnota portfolia na konci 1 585 €.']
  }

  it('obsahuje pravidla, úkol části, styl a fakta', () => {
    const p = buildPartPrompt({ ...base, part: 'commentary' })
    expect(p).toContain('měsíčního shrnutí')
    expect(p).toContain('přepiš přesně')
    expect(p).toContain('Nepřidávej rady')
    expect(p).toContain('2 až 3 odstavce')
    expect(p).toContain('věcně a neutrálně')
    expect(p).toContain('Fakta:\n- Hodnota portfolia na konci 1 585 €.')
    expect(p).not.toContain('předchozí pokus')
  })

  it('délka komentáře, styl a část se promítnou do úkolu', () => {
    expect(buildPartPrompt({ ...base, part: 'commentary', length: 'short' })).toContain(
      '1 odstavec'
    )
    expect(buildPartPrompt({ ...base, part: 'commentary', length: 'long' })).toContain(
      '4 až 6 odstavců'
    )
    expect(buildPartPrompt({ ...base, part: 'highlights', style: 'friendly' })).toContain(
      'přátelsky'
    )
    expect(buildPartPrompt({ ...base, part: 'highlights' })).toContain('„V kostce“')
    expect(buildPartPrompt({ ...base, part: 'outlook' })).toContain('„Výhled“')
    expect(buildPartPrompt({ ...base, part: 'outlook', kind: 'year' })).toContain('souhrnného')
  })

  it('druhý pokus uvede čísla, která model vymyslel', () => {
    const p = buildPartPrompt({ ...base, part: 'commentary', badNumbers: [7.5, 42] })
    expect(p).toContain('ve faktech nejsou: 7,5; 42')
  })
})

describe('zpracování výstupu modelu', () => {
  it('body: odstraní odrážky, markdown a nadpis', () => {
    expect(
      parsePartOutput('highlights', '**V kostce:**\n- První bod.\n• Druhý bod.\n\n* Třetí bod.')
    ).toEqual(['První bod.', 'Druhý bod.', 'Třetí bod.'])
  })

  it('číslování odstraní jen u opravdového seznamu 1, 2, 3', () => {
    expect(parsePartOutput('highlights', '1. První.\n2. Druhá.\n3. Třetí.')).toEqual([
      'První.',
      'Druhá.',
      'Třetí.'
    ])
    // věta začínající „3. kvartál“ se nesmí poškodit
    expect(parsePartOutput('highlights', '3. kvartál byl dobrý.\nDruhý bod.')).toEqual([
      '3. kvartál byl dobrý.',
      'Druhý bod.'
    ])
  })

  it('komentář: odstavce oddělené prázdným řádkem, zalomení uvnitř se spojí', () => {
    expect(
      parsePartOutput('commentary', '# Komentář\n\nPrvní odstavec\npokračuje.\n\nDruhý odstavec.')
    ).toEqual(['První odstavec pokračuje.', 'Druhý odstavec.'])
    expect(parsePartOutput('commentary', '   ')).toEqual([])
  })
})

describe('kontrola výstupu', () => {
  const facts = ['Hodnota portfolia na konci 1 585 €.', 'Výkon +7,37 %.', 'Říjen 2025.']

  it('přijme text jen s čísly z faktů (zápis 7,37 = 7,370)', () => {
    expect(
      checkPartOutput('highlights', facts, ['Portfolio má 1 585 €.', 'Výkon byl 7,370 %.'])
    ).toEqual({ ok: true })
  })

  it('zamítne změněné číslo a vrátí je', () => {
    expect(
      checkPartOutput('highlights', facts, ['Portfolio má 1 600 €.', 'Výkon byl 7,37 %.'])
    ).toEqual({ ok: false, reason: 'numbers', unknown: [1600] })
  })

  it('zamítne prázdný text, špatný počet bodů a rady', () => {
    expect(checkPartOutput('commentary', facts, [])).toMatchObject({ reason: 'empty' })
    expect(checkPartOutput('highlights', facts, ['Jen jeden bod.'])).toMatchObject({
      reason: 'shape'
    })
    expect(checkPartOutput('commentary', facts, ['Doporučuji dokoupit víc ETF.'])).toMatchObject({
      reason: 'advice'
    })
  })
})
