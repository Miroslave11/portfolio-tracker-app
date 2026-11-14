import { describe, expect, it } from 'vitest'
import type { Portfolio, Transaction } from '../shared/model'
import {
  DEFAULT_SETTINGS,
  settingsPatchSchema,
  settingsSchema,
  type MonthlyPlan
} from '../shared/settings'
import { formatMonthLong } from './date'
import {
  buysInMonth,
  missingMonth,
  monthOf,
  planFromLastMonth,
  planToRows,
  rowsToDrafts
} from './monthly-plan'
import { deriveTrade, editTradeField, EMPTY_TRADE_INPUT } from './trade-math'

const tx = (
  t: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({ accountId: 'f24', currency: 'EUR', ...t })
const buy = (
  id: string,
  date: string,
  securityId: string,
  shares: number,
  accountId = 'f24'
): Transaction => tx({ id, date, type: 'BUY', amount: shares * 10, securityId, shares, accountId })

const portfolio: Portfolio = {
  version: 1,
  accounts: [
    { id: 'f24', name: 'Freedom24', currency: 'EUR', color: '#f59e0b' },
    { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }
  ],
  securities: ['SPYL', 'EXUS'].map((id) => ({
    id,
    name: id,
    yahooTicker: id,
    currency: 'EUR',
    indexGroup: 'X',
    distributing: false,
    color: '#6366f1'
  })),
  transactions: [
    buy('1', '2026-09-10', 'SPYL', 100),
    buy('2', '2026-10-10', 'SPYL', 150),
    buy('3', '2026-10-10', 'EXUS', 19),
    buy('4', '2026-10-20', 'SPYL', 10), // v témže měsíci a u téhož ETF → sečte se
    buy('5', '2026-10-21', 'EXUS', 5, 'xtb'),
    tx({ id: 'd', date: '2026-11-01', type: 'DEPOSIT', amount: 50 })
  ]
}

describe('monthOf / buysInMonth', () => {
  it('počítá jen nákupy v měsíci', () => {
    expect(monthOf('2026-10-21')).toBe('2026-10')
    expect(buysInMonth(portfolio, '2026-10')).toBe(4)
    expect(buysInMonth(portfolio, '2026-11')).toBe(0) // vklad není nákup
    expect(buysInMonth(portfolio, '2026-10', new Set(['xtb']))).toBe(1)
  })
})

describe('missingMonth – upozornění „tento měsíc ještě nezainvestováno“', () => {
  it('od připomínacího dne, když v měsíci chybí nákup', () => {
    expect(missingMonth(portfolio, null, '2026-11-09')).toBeNull() // výchozí den je 10.
    expect(missingMonth(portfolio, null, '2026-11-10')).toBe('2026-11')
    expect(
      missingMonth(
        portfolio,
        { items: [{ accountId: 'f24', securityId: 'SPYL' }], remindFromDay: 3 },
        '2026-11-03'
      )
    ).toBe('2026-11')
  })
  it('po nákupu v měsíci upozornění zmizí', () => {
    const p = {
      ...portfolio,
      transactions: [...portfolio.transactions, buy('9', '2026-11-05', 'EXUS', 4)]
    }
    expect(missingMonth(p, null, '2026-11-20')).toBeNull()
  })
  it('nováček bez dřívějších nákupů se neobtěžuje', () => {
    const p = { ...portfolio, transactions: [] }
    expect(missingMonth(p, null, '2026-11-20')).toBeNull()
    const onlyThisMonth = { ...portfolio, transactions: [buy('1', '2026-11-02', 'SPYL', 1)] }
    expect(missingMonth(onlyThisMonth, null, '2026-11-28')).toBeNull()
  })
  it('měsíc se bere podle dnešního data, ne podle posledního nákupu', () => {
    expect(missingMonth(portfolio, null, '2026-12-15')).toBe('2026-12')
  })
})

describe('planToRows / rowsToDrafts', () => {
  const plan: MonthlyPlan = {
    remindFromDay: 10,
    items: [
      { accountId: 'f24', securityId: 'SPYL', shares: 150 },
      { accountId: 'f24', securityId: 'EXUS', amount: 780 },
      { accountId: 'smazany', securityId: 'SPYL', shares: 1 },
      { accountId: 'f24', securityId: 'NEEXISTUJE', shares: 1 }
    ]
  }
  it('řádky ze šablony; neexistující broker/ETF se vynechají', () => {
    const rows = planToRows(plan, portfolio, '2026-12-10')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      accountId: 'f24',
      securityId: 'SPYL',
      date: '2026-12-10',
      shares: 150
    })
    expect(rows[0].amount).toBeUndefined()
    expect(rows[1]).toMatchObject({ securityId: 'EXUS', amount: 780 })
    expect(new Set(rows.map((r) => r.key)).size).toBe(2)
  })
  it('zápisy: nákup s vkladem pro každý řádek', () => {
    const drafts = rowsToDrafts([
      { accountId: 'f24', securityId: 'SPYL', date: '2026-12-10', shares: 150, amount: 2510 },
      { accountId: 'f24', securityId: 'EXUS', date: '2026-12-10', shares: 19, amount: 780 }
    ])
    expect(drafts).toHaveLength(2)
    expect(drafts[0]).toEqual({
      type: 'BUY',
      accountId: 'f24',
      date: '2026-12-10',
      securityId: 'SPYL',
      shares: 150,
      amount: 2510,
      withCash: true
    })
    expect(
      rowsToDrafts(
        [{ accountId: 'f24', securityId: 'SPYL', date: '2026-12-10', shares: 1, amount: 1 }],
        false
      )[0].withCash
    ).toBeUndefined()
  })
})

describe('planFromLastMonth', () => {
  it('sečte nákupy posledního měsíce podle brokera a ETF', () => {
    const plan = planFromLastMonth(portfolio)!
    expect(plan.remindFromDay).toBe(10)
    const byKey = Object.fromEntries(
      plan.items.map((i) => [`${i.accountId}|${i.securityId}`, i.shares])
    )
    expect(byKey).toEqual({ 'f24|SPYL': 160, 'f24|EXUS': 19, 'xtb|EXUS': 5 })
  })
  it('bez nákupů → null', () => {
    expect(planFromLastMonth({ ...portfolio, transactions: [] })).toBeNull()
  })
})

describe('nastavení: šablona se ukládá a validuje', () => {
  it('výchozí nastavení nemá šablonu; poškozená se tiše zahodí', () => {
    expect(DEFAULT_SETTINGS.monthlyPlan).toBeNull()
    expect(settingsSchema.parse({ monthlyPlan: { items: [] } }).monthlyPlan).toBeNull()
    const plan: MonthlyPlan = {
      remindFromDay: 5,
      items: [{ accountId: 'f24', securityId: 'SPYL', shares: 150 }]
    }
    expect(settingsSchema.parse({ monthlyPlan: plan }).monthlyPlan).toEqual(plan)
  })
  it('patch přijme šablonu i null; odmítne nesmysly', () => {
    expect(settingsPatchSchema.parse({ monthlyPlan: null })).toEqual({ monthlyPlan: null })
    expect(() =>
      settingsPatchSchema.parse({ monthlyPlan: { items: [], remindFromDay: 5 } })
    ).toThrow()
    expect(() =>
      settingsPatchSchema.parse({
        monthlyPlan: { items: [{ accountId: 'a', securityId: 'b', shares: -1 }], remindFromDay: 5 }
      })
    ).toThrow()
    expect(() =>
      settingsPatchSchema.parse({
        monthlyPlan: { items: [{ accountId: 'a', securityId: 'b' }], remindFromDay: 40 }
      })
    ).toThrow()
  })
})

describe('formatMonthLong', () => {
  it('české názvy měsíců', () => {
    expect(formatMonthLong('2026-11')).toBe('listopad 2026')
    expect(formatMonthLong('2026-12-10')).toBe('prosinec 2026')
    expect(formatMonthLong('2026-01')).toBe('leden 2026')
  })
})

describe('deriveTrade – řádek s předvyplněným kurzem', () => {
  it('šablona s kusy: částka = kusy × kurz', () => {
    const s = editTradeField(EMPTY_TRADE_INPUT, 'shares', '150')
    const r = deriveTrade(s, 16.7)
    expect(r.prefilled).toBe(true)
    expect(r.derived).toBe('amount')
    expect(r.values.amount).toBe(2505)
    expect(r.shown('price')).toBe('16,7')
    expect(r.shown('amount')).toBe('2505')
  })
  it('šablona s částkou: kusy = částka / kurz; po zadání ceny se kurz nepoužívá', () => {
    const s = editTradeField(EMPTY_TRADE_INPUT, 'amount', '780')
    expect(deriveTrade(s, 40).values.shares).toBe(19.5)
    const withPrice = editTradeField(editTradeField(s, 'price', '39'), 'amount', '780')
    const r = deriveTrade(withPrice, 40)
    expect(r.prefilled).toBe(false)
    expect(r.values.shares).toBe(20)
  })
  it('uživatel přepíše částku po kusech → dopočítá se cena', () => {
    const s = editTradeField(editTradeField(EMPTY_TRADE_INPUT, 'shares', '10'), 'amount', '990')
    const r = deriveTrade(s, 100)
    expect(r.derived).toBe('price')
    expect(r.values.price).toBe(99)
  })
  it('bez kurzu a bez zadaných polí nic nedopočítá; neplatný text je označen', () => {
    expect(deriveTrade(EMPTY_TRADE_INPUT, null).derived).toBeNull()
    const bad = editTradeField(EMPTY_TRADE_INPUT, 'shares', 'abc')
    expect(deriveTrade(bad, 10).invalid).toEqual(['shares'])
  })
})
