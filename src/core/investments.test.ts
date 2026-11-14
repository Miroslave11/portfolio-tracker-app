import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import { calculateInvestments } from './investments'

const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'xtb', currency: 'EUR', ...t })

const buy = (id: string, date: string, amount: number, accountId = 'xtb'): Transaction =>
  tx({ id, date, type: 'BUY', amount, securityId: 'AAA', shares: 1, accountId })

function portfolio(txs: Transaction[]): Portfolio {
  return {
    version: 1,
    accounts: [
      { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
      { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }
    ],
    securities: [
      {
        id: 'AAA',
        name: 'AAA',
        yahooTicker: 'AAA',
        currency: 'EUR',
        indexGroup: 'X',
        distributing: false,
        color: '#6366f1'
      }
    ],
    transactions: txs
  }
}

/*
 * Ruční příklad:
 *  2025-01  XTB 100 + XTB 50 + Degiro 200      = 350   (3 nákupy)
 *  2025-02  bez nákupu                          = 0
 *  2025-03  XTB 400                             = 400
 *  2025-04  Degiro 100                          = 100
 *  2026-01  XTB 600 (prodej 50 v 2026)          = 600
 */
const base = portfolio([
  tx({ id: 'd', date: '2025-01-01', type: 'DEPOSIT', amount: 5000 }), // vklad se nepočítá
  buy('1', '2025-01-05', 100),
  buy('2', '2025-01-20', 50),
  buy('3', '2025-01-25', 200, 'degiro'),
  buy('4', '2025-03-10', 400),
  buy('5', '2025-04-02', 100, 'degiro'),
  buy('6', '2026-01-15', 600),
  tx({ id: 's', date: '2026-01-20', type: 'SELL', amount: 50, securityId: 'AAA', shares: 1 })
])

describe('calculateInvestments', () => {
  const r = calculateInvestments(base, { asOf: '2026-01-31' })

  it('souvislá řada měsíců včetně měsíců bez nákupu', () => {
    expect(r.months).toHaveLength(13) // 2025-01 … 2026-01
    expect(r.months[0].month).toBe('2025-01')
    expect(r.months.at(-1)!.month).toBe('2026-01')
    expect(r.months[1]).toMatchObject({ month: '2025-02', total: 0, buys: 0 })
  })

  it('součty po měsících a podle brokera; vklady se nepočítají', () => {
    expect(r.months[0]).toMatchObject({ total: 350, buys: 3, byAccount: { xtb: 150, degiro: 200 } })
    expect(r.months[2].total).toBe(400)
    expect(r.months[12].total).toBe(600)
    expect(r.totalBought).toBe(1450)
    expect(r.buyCount).toBe(6)
  })

  it('součty po letech: měsíce s nákupem, průměr, prodeje', () => {
    expect(r.years.map((y) => y.year)).toEqual([2025, 2026])
    const y25 = r.years[0]
    expect(y25.total).toBe(850)
    expect(y25.monthsWithBuy).toBe(3)
    expect(y25.monthsCounted).toBe(12)
    expect(y25.average).toBeCloseTo(850 / 12, 10)
    expect(y25.byAccount).toEqual({ xtb: 550, degiro: 300 })
    const y26 = r.years[1]
    expect(y26.total).toBe(600)
    expect(y26.monthsCounted).toBe(1)
    expect(y26.sold).toBe(50)
    expect(r.totalSold).toBe(50)
  })

  it('průměr a medián za posledních 12 měsíců (2025-02 … 2026-01)', () => {
    // okno: 12 měsíců končící 2026-01 → 2025-02 … 2026-01: 0 + 400 + 100 + 0×8 + 600 = 1100
    expect(r.average12).toBeCloseTo(1100 / 12, 10)
    expect(r.monthsWithBuy12).toBe(3)
    expect(r.median12).toBe(400) // 100, 400, 600
    expect(r.currentMonthEmpty).toBe(false)
  })

  it('rozpracovaný měsíc bez nákupu se do průměru nezapočítá a je označen', () => {
    const x = calculateInvestments(base, { asOf: '2026-02-10' })
    expect(x.lastMonth).toBe('2026-02')
    expect(x.currentMonthEmpty).toBe(true)
    // okno 2025-02 … 2026-01 (stejné jako výše)
    expect(x.average12).toBeCloseTo(1100 / 12, 10)
    expect(x.months.at(-1)).toMatchObject({ month: '2026-02', total: 0 })
  })

  it('krátká historie: průměr se dělí počtem existujících měsíců', () => {
    const p = portfolio([buy('1', '2025-01-05', 100), buy('2', '2025-03-05', 200)])
    const x = calculateInvestments(p, { asOf: '2025-03-20' })
    expect(x.months).toHaveLength(3)
    expect(x.average12).toBe(100)
  })

  it('filtr brokera omezí účty', () => {
    const x = calculateInvestments(base, { asOf: '2026-01-31', accountIds: new Set(['degiro']) })
    expect(x.totalBought).toBe(300)
    expect(x.buyCount).toBe(2)
    expect(x.months[0].byAccount).toEqual({ degiro: 200 })
    expect(x.firstMonth).toBe('2025-01')
  })

  it('přepočet měny se použije k datu každého nákupu', () => {
    const x = calculateInvestments(base, {
      asOf: '2026-01-31',
      convert: (amount, date) => amount * (date.startsWith('2025') ? 25 : 24)
    })
    expect(x.years[0].total).toBe(850 * 25)
    expect(x.years[1].total).toBe(600 * 24)
  })

  it('bez nákupů → prázdný výsledek', () => {
    const x = calculateInvestments(
      portfolio([tx({ id: 'd', date: '2025-01-01', type: 'DEPOSIT', amount: 10 })])
    )
    expect(x.months).toEqual([])
    expect(x.average12).toBeNull()
    expect(x.firstMonth).toBeNull()
  })
})
