import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction, TransactionDraft } from '../shared/model'
import { formatInput, parseNumber, resolveTrade } from './trade-math'
import {
  addTransactions,
  deleteTransaction,
  findCounterpart,
  holdingsProblem,
  updateTransaction,
  validateDraft
} from './transaction-edit'

const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'xtb', currency: 'EUR', ...t })

function base(): Portfolio {
  return {
    version: 1,
    accounts: [
      { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
      { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }
    ],
    securities: [
      {
        id: 'AAA',
        name: 'Fond AAA',
        yahooTicker: 'AAA',
        currency: 'EUR',
        indexGroup: 'X',
        distributing: false,
        color: '#6366f1'
      }
    ],
    transactions: [
      tx({ id: 'd1', date: '2025-01-02', type: 'DEPOSIT', amount: 1000 }),
      tx({ id: 'b1', date: '2025-01-02', type: 'BUY', amount: 1000, securityId: 'AAA', shares: 10 })
    ]
  }
}

let counter = 0
const ids = (): string => `id${++counter}`
const TODAY = '2026-11-12'
const buyDraft = (patch: Partial<TransactionDraft> = {}): TransactionDraft => ({
  type: 'BUY',
  accountId: 'xtb',
  date: '2026-11-10',
  securityId: 'AAA',
  shares: 2,
  amount: 220.5,
  ...patch
})

describe('parseNumber / formatInput', () => {
  it('české i anglické zápisy, mezery jako tisíce', () => {
    expect(parseNumber('1 234,56')).toBe(1234.56)
    expect(parseNumber('1 234,56')).toBe(1234.56)
    expect(parseNumber('16.70')).toBe(16.7)
    expect(parseNumber(' 150 ')).toBe(150)
    expect(parseNumber('-3,5')).toBe(-3.5)
  })
  it('nesmysly → null', () => {
    for (const bad of ['', 'abc', '1,2,3', '1.234,56', '12abc', '--1', ',']) {
      expect(parseNumber(bad)).toBeNull()
    }
  })
  it('formatInput: čárka a bez zbytečných nul', () => {
    expect(formatInput(16.7, 4)).toBe('16,7')
    expect(formatInput(150, 6)).toBe('150')
    expect(formatInput(1234.56, 2)).toBe('1234,56')
    expect(formatInput(0.333333333, 6)).toBe('0,333333')
  })
})

describe('resolveTrade – ze dvou polí se dopočítá třetí', () => {
  it('kusy + cena → částka', () => {
    const r = resolveTrade({ shares: 100, price: 12.5 }, ['shares', 'price'])
    expect(r.derived).toBe('amount')
    expect(r.values.amount).toBe(1250)
  })
  it('kusy + částka → cena', () => {
    const r = resolveTrade({ shares: 100, amount: 1234.56 }, ['amount', 'shares'])
    expect(r.derived).toBe('price')
    expect(r.values.price).toBeCloseTo(12.3456, 4)
  })
  it('cena + částka → kusy', () => {
    const r = resolveTrade({ price: 40, amount: 780 }, ['price', 'amount'])
    expect(r.derived).toBe('shares')
    expect(r.values.shares).toBe(19.5)
  })
  it('třetí se mění podle toho, která dvě pole byla zadána naposledy', () => {
    // nejdřív cena a kusy (částka dopočtena), pak uživatel přepíše částku → dopočítá se cena
    const r = resolveTrade({ shares: 10, price: 100, amount: 990 }, ['price', 'shares', 'amount'])
    expect(r.derived).toBe('price')
    expect(r.values.price).toBe(99)
  })
  it('méně než dvě vyplněná pole → nic se nedopočítá; prázdná/nulová pole se ignorují', () => {
    expect(resolveTrade({ shares: 5 }, ['shares']).derived).toBeNull()
    expect(resolveTrade({ shares: 5, price: 0 }, ['shares', 'price']).derived).toBeNull()
  })
})

describe('holdingsProblem', () => {
  it('prodej víc kusů, než je drženo, je problém; ve stejný den se nákup počítá první', () => {
    const t = base().transactions
    expect(holdingsProblem(t)).toBeNull()
    expect(
      holdingsProblem([
        ...t,
        tx({ id: 's', date: '2025-02-01', type: 'SELL', amount: 1, securityId: 'AAA', shares: 11 })
      ])
    ).toMatch(/AAA/)
    expect(
      holdingsProblem([
        ...t,
        tx({ id: 's', date: '2025-01-02', type: 'SELL', amount: 1, securityId: 'AAA', shares: 10 })
      ])
    ).toBeNull()
  })

  it('kusy se hlídají u každého brokera zvlášť (u Degira nelze prodat to, co je u XTB)', () => {
    const t = base().transactions // 10 ks AAA u XTB
    const sellAtDegiro = tx({
      id: 's',
      accountId: 'degiro',
      date: '2025-02-01',
      type: 'SELL',
      amount: 100,
      securityId: 'AAA',
      shares: 1
    })
    expect(holdingsProblem([...t, sellAtDegiro], (id) => id.toUpperCase())).toMatch(
      /AAA u brokera DEGIRO/
    )
    const p = base()
    expect(
      validateDraft(
        p,
        {
          type: 'SELL',
          accountId: 'degiro',
          date: '2026-11-10',
          securityId: 'AAA',
          shares: 1,
          amount: 100
        },
        { today: TODAY }
      ).errors.join(' ')
    ).toMatch(/AAA u brokera Degiro/)
  })
})

describe('validateDraft', () => {
  const ctx = { today: TODAY, priceAt: () => 100 }
  it('platný nákup bez chyb', () => {
    const i = validateDraft(base(), buyDraft({ shares: 2, amount: 200 }), ctx)
    expect(i.errors).toEqual([])
  })
  it('chybějící údaje', () => {
    expect(validateDraft(base(), buyDraft({ securityId: undefined }), ctx).errors).toContain(
      'Vyber ETF.'
    )
    expect(validateDraft(base(), buyDraft({ shares: undefined }), ctx).errors).toContain(
      'Zadej počet kusů.'
    )
    expect(validateDraft(base(), buyDraft({ accountId: 'nikdo' }), ctx).errors).toContain(
      'Vyber broker.'
    )
    expect(validateDraft(base(), { type: 'BUY' }, ctx).errors.length).toBeGreaterThan(0)
  })
  it('vklad nemá ETF ani kusy', () => {
    const dep: TransactionDraft = {
      type: 'DEPOSIT',
      accountId: 'xtb',
      date: '2026-11-10',
      amount: 50
    }
    expect(validateDraft(base(), dep, ctx).errors).toEqual([])
    expect(validateDraft(base(), { ...dep, securityId: 'AAA' }, ctx).errors).toContain(
      'Tento typ transakce nemá ETF.'
    )
    expect(validateDraft(base(), { ...dep, shares: 1 }, ctx).errors).toContain(
      'Tento typ nemá počet kusů.'
    )
  })
  it('prodej většího počtu kusů je chyba', () => {
    const sell = buyDraft({ type: 'SELL', shares: 11 })
    expect(validateDraft(base(), sell, ctx).errors.join(' ')).toMatch(/Záporná pozice/)
    expect(validateDraft(base(), buyDraft({ type: 'SELL', shares: 10 }), ctx).errors).toEqual([])
  })
  it('upozornění na časový test u prodeje (neblokuje)', () => {
    // base: 10 ks AAA koupeno 2. 1. 2025 → test splněn až od 3. 1. 2028
    const young = validateDraft(base(), buyDraft({ type: 'SELL', shares: 2, amount: 220 }), {
      today: TODAY
    })
    expect(young.errors).toEqual([])
    expect(young.warnings.join(' ')).toMatch(/splní 3letou lhůtu žádný kus.*od 3\. 1\. 2028/)
    // starší nákup 4 ks z roku 2020: prodej 6 ks = 4 ks po testu + 2 ks mladší
    const p = base()
    p.transactions.push(
      tx({ id: 'old', date: '2020-03-01', type: 'BUY', amount: 300, securityId: 'AAA', shares: 4 })
    )
    const mixed = validateDraft(p, buyDraft({ type: 'SELL', shares: 6, amount: 660 }), {
      today: TODAY
    })
    expect(mixed.warnings.join(' ')).toMatch(/z 6 ks prodeje splní 3letou lhůtu jen 4 ks/)
    // prodej jen starých kusů → bez upozornění
    const ok = validateDraft(p, buyDraft({ type: 'SELL', shares: 4, amount: 440 }), {
      today: TODAY
    })
    expect(ok.warnings.filter((w) => w.startsWith('Časový test'))).toEqual([])
  })

  it('upozornění: budoucí datum a cena daleko od kurzu (neblokují)', () => {
    const w = validateDraft(base(), buyDraft({ date: '2027-01-01', shares: 1, amount: 140 }), ctx)
    expect(w.errors).toEqual([])
    expect(w.warnings.join(' ')).toMatch(/budoucnosti/)
    expect(w.warnings.join(' ')).toMatch(/liší od tržního kurzu/)
  })
  it('nové ETF se stejným tickerem jako existující je chyba', () => {
    const d = buyDraft({
      securityId: undefined,
      newSecurity: { yahooTicker: 'aaa', name: 'Dup', indexGroup: 'X' }
    })
    expect(validateDraft(base(), d, ctx).errors.join(' ')).toMatch(/už v seznamu/)
  })
})

describe('addTransactions', () => {
  it('nákup s vyrovnávacím vkladem: dvě propojené transakce', () => {
    const p = addTransactions(base(), [buyDraft({ withCash: true })], ids)
    expect(p.transactions).toHaveLength(4)
    const buy = p.transactions.find((t) => t.type === 'BUY' && t.date === '2026-11-10')!
    const dep = p.transactions.find((t) => t.type === 'DEPOSIT' && t.date === '2026-11-10')!
    expect(dep).toMatchObject({ amount: 220.5, accountId: 'xtb', linkedId: buy.id })
    expect(buy.linkedId).toBe(dep.id)
    expect(buy).toMatchObject({ shares: 2, amount: 220.5, securityId: 'AAA', currency: 'EUR' })
  })
  it('bez zapnutého vkladu vznikne jen nákup; původní data se nemění', () => {
    const before = base()
    const p = addTransactions(before, [buyDraft()], ids)
    expect(p.transactions).toHaveLength(3)
    expect(before.transactions).toHaveLength(2)
  })
  it('prodej s výběrem; vklad a dividenda', () => {
    const p = addTransactions(
      base(),
      [
        buyDraft({ type: 'SELL', shares: 3, amount: 330, withCash: true }),
        { type: 'DIVIDEND', accountId: 'xtb', date: '2026-11-11', securityId: 'AAA', amount: 4.2 },
        { type: 'DEPOSIT', accountId: 'degiro', date: '2026-11-11', amount: 50, note: 'ručně' }
      ],
      ids
    )
    expect(p.transactions.filter((t) => t.type === 'WITHDRAWAL')).toHaveLength(1)
    expect(p.transactions.find((t) => t.type === 'DIVIDEND')).toMatchObject({
      amount: 4.2,
      securityId: 'AAA'
    })
    expect(p.transactions.find((t) => t.note === 'ručně')).toMatchObject({
      type: 'DEPOSIT',
      accountId: 'degiro'
    })
  })
  it('nové ETF se přidá do seznamu s barvou a ID z tickeru', () => {
    const p = addTransactions(
      base(),
      [
        buyDraft({
          securityId: undefined,
          newSecurity: {
            yahooTicker: 'vwce.de',
            name: 'Vanguard FTSE All-World',
            isin: 'IE00BK5BQT80',
            indexGroup: 'All-World'
          }
        })
      ],
      ids
    )
    const s = p.securities.find((x) => x.id === 'VWCE.DE')!
    expect(s).toMatchObject({
      name: 'Vanguard FTSE All-World',
      isin: 'IE00BK5BQT80',
      indexGroup: 'All-World',
      yahooTicker: 'VWCE.DE'
    })
    expect(s.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(p.transactions.at(-1)!.securityId).toBe('VWCE.DE')
  })
  it('zaokrouhlení: částka na centy, kusy na 6 míst', () => {
    const p = addTransactions(base(), [buyDraft({ amount: 100.005, shares: 0.1234567 })], ids)
    const t = p.transactions.at(-1)!
    expect(t.amount).toBe(100.01)
    expect(t.shares).toBe(0.123457)
  })
  it('záporná pozice nebo neplatný vstup vyhodí chybu a nic nezmění', () => {
    expect(() => addTransactions(base(), [buyDraft({ type: 'SELL', shares: 99 })], ids)).toThrow(
      /Záporná pozice/
    )
    expect(() => addTransactions(base(), [{ type: 'BUY' }], ids)).toThrow()
  })
})

describe('findCounterpart / updateTransaction / deleteTransaction', () => {
  // data z importu: nákup + stejný vklad ve stejný den, bez vazby
  it('najde nespárovaný vklad podle účtu, data a částky; nejednoznačné případy ne', () => {
    const p = base()
    expect(findCounterpart(p, p.transactions[1])!.id).toBe('d1')
    p.transactions.push(tx({ id: 'd2', date: '2025-01-02', type: 'DEPOSIT', amount: 1000 }))
    expect(findCounterpart(p, p.transactions[1])).toBeNull() // dva stejné vklady
  })

  it('úprava nákupu změní i vyrovnávací vklad (datum, účet, částku) a spáruje je', () => {
    const p = updateTransaction(
      base(),
      'b1',
      {
        type: 'BUY',
        accountId: 'degiro',
        date: '2025-01-03',
        securityId: 'AAA',
        shares: 11,
        amount: 1100
      },
      true,
      ids
    )
    expect(p.transactions.find((t) => t.id === 'b1')).toMatchObject({
      accountId: 'degiro',
      date: '2025-01-03',
      shares: 11,
      amount: 1100,
      linkedId: 'd1'
    })
    expect(p.transactions.find((t) => t.id === 'd1')).toMatchObject({
      accountId: 'degiro',
      date: '2025-01-03',
      amount: 1100,
      linkedId: 'b1'
    })
  })

  it('úprava bez protějšku ponechá vklad beze změny; typ se měnit nedá', () => {
    const p = updateTransaction(
      base(),
      'b1',
      {
        type: 'BUY',
        accountId: 'xtb',
        date: '2025-01-02',
        securityId: 'AAA',
        shares: 10,
        amount: 990
      },
      false,
      ids
    )
    expect(p.transactions.find((t) => t.id === 'd1')!.amount).toBe(1000)
    expect(() =>
      updateTransaction(
        base(),
        'b1',
        {
          type: 'SELL',
          accountId: 'xtb',
          date: '2025-01-02',
          securityId: 'AAA',
          shares: 1,
          amount: 1
        },
        false,
        ids
      )
    ).toThrow(/Typ/)
    expect(() => updateTransaction(base(), 'neni', buyDraft(), false, ids)).toThrow(/neexistuje/)
  })

  it('úprava, po které by vznikla záporná pozice, se odmítne', () => {
    const p = addTransactions(base(), [buyDraft({ type: 'SELL', shares: 5, amount: 600 })], ids)
    const sellId = p.transactions.at(-1)!.id
    // snížení původního nákupu na 4 ks, ale prodáno je 5
    expect(() =>
      updateTransaction(
        p,
        'b1',
        {
          type: 'BUY',
          accountId: 'xtb',
          date: '2025-01-02',
          securityId: 'AAA',
          shares: 4,
          amount: 400
        },
        false,
        ids
      )
    ).toThrow(/Záporná pozice/)
    expect(sellId).toBeTruthy()
  })

  it('smazání nákupu s vkladem i bez něj', () => {
    const both = deleteTransaction(base(), 'b1', true)
    expect(both.transactions).toEqual([])
    const only = deleteTransaction(base(), 'b1', false)
    expect(only.transactions.map((t) => t.id)).toEqual(['d1'])
  })

  it('smazání spárované dvojice přes linkedId; zbylý protějšek ztratí vazbu', () => {
    const p = addTransactions(base(), [buyDraft({ withCash: true })], ids)
    const buy = p.transactions.find((t) => t.date === '2026-11-10' && t.type === 'BUY')!
    const kept = deleteTransaction(p, buy.id, false)
    const dep = kept.transactions.find((t) => t.date === '2026-11-10')!
    expect(dep.linkedId).toBeUndefined()
    expect(deleteTransaction(p, buy.id, true).transactions).toHaveLength(2)
  })

  it('smazání nákupu, který kryje pozdější prodej, se odmítne', () => {
    const p = addTransactions(base(), [buyDraft({ type: 'SELL', shares: 5, amount: 600 })], ids)
    expect(() => deleteTransaction(p, 'b1', false)).toThrow(/Záporná pozice/)
  })
})
