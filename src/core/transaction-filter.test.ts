import { describe, expect, it } from 'vitest'
import type { Account, Security, Transaction } from '../shared/model'
import {
  buyProfit,
  EMPTY_TX_FILTER,
  filterTransactions,
  isFilterActive,
  normalizeText,
  periodBounds,
  securityKey,
  securityOptions,
  type TxFilter
} from './transaction-filter'
import { sortTransactions } from './transaction-sort'

const accounts = new Map<string, Account>([
  ['xtb', { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }],
  ['degiro', { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }]
])

const sec = (id: string, extra: Partial<Security> = {}): Security => ({
  id,
  name: `Fond ${id}`,
  yahooTicker: id,
  currency: 'EUR',
  indexGroup: 'X',
  distributing: false,
  color: '#6366f1',
  ...extra
})
const securities = [
  sec('EUNL.DE', { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World' }),
  sec('IWDA.AS', { isin: 'IE00B4L5Y983', name: 'iShares Core MSCI World' }),
  sec('SXR8.DE', { isin: 'IE00B5BMR087', name: 'iShares Core S&P 500' }),
  sec('NEPOUZITY.DE')
]

const t = (
  x: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount'>
): Transaction => ({
  accountId: 'xtb',
  currency: 'EUR',
  ...x
})
const txs: Transaction[] = [
  t({ id: '1', date: '2024-03-05', type: 'DEPOSIT', amount: 500, note: 'vklad na účet' }),
  t({ id: '2', date: '2024-03-05', type: 'BUY', amount: 500, securityId: 'EUNL.DE', shares: 5 }),
  t({
    id: '3',
    date: '2025-06-10',
    type: 'BUY',
    amount: 300,
    securityId: 'IWDA.AS',
    shares: 3,
    accountId: 'degiro'
  }),
  t({ id: '4', date: '2025-12-31', type: 'BUY', amount: 200, securityId: 'SXR8.DE', shares: 2 }),
  t({ id: '5', date: '2026-01-02', type: 'SELL', amount: 150, securityId: 'SXR8.DE', shares: 1 }),
  t({ id: '6', date: '2026-02-01', type: 'WITHDRAWAL', amount: 100, accountId: 'degiro' })
]
const TODAY = '2026-11-12'
const run = (patch: Partial<TxFilter>): string[] =>
  filterTransactions(txs, { ...EMPTY_TX_FILTER, ...patch }, accounts, securities, TODAY).map(
    (x) => x.id
  )

describe('filterTransactions', () => {
  it('bez filtru projdou všechny', () => {
    expect(run({})).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(isFilterActive(EMPTY_TX_FILTER)).toBe(false)
  })

  it('typ', () => {
    expect(run({ type: 'BUY' })).toEqual(['2', '3', '4'])
    expect(run({ type: 'SELL' })).toEqual(['5'])
    expect(run({ type: 'DIVIDEND' })).toEqual([])
  })

  it('fond se slučuje přes ISIN (EUNL.DE + IWDA.AS)', () => {
    expect(run({ securityKey: 'IE00B4L5Y983' })).toEqual(['2', '3'])
    expect(run({ securityKey: 'IE00B5BMR087' })).toEqual(['4', '5'])
    expect(securityKey(securities[3])).toBe('NEPOUZITY.DE') // bez ISIN → ticker
  })

  it('nabídka fondů obsahuje jen použité a slučuje kotace', () => {
    expect(securityOptions(securities, txs)).toEqual([
      { key: 'IE00B4L5Y983', label: 'EUNL.DE / IWDA.AS' },
      { key: 'IE00B5BMR087', label: 'SXR8.DE' }
    ])
  })

  it('období: letos, 12 měsíců, rok, vlastní (včetně krajních dnů)', () => {
    expect(run({ period: 'YTD' })).toEqual(['5', '6'])
    expect(run({ period: 'Y2025' })).toEqual(['3', '4'])
    expect(run({ period: 'CUSTOM', from: '2025-06-10', to: '2025-12-31' })).toEqual(['3', '4'])
    expect(run({ period: 'CUSTOM', from: '2025-06-11', to: '' })).toEqual(['4', '5', '6'])
    expect(run({ period: 'CUSTOM', from: '', to: '2024-03-05' })).toEqual(['1', '2'])
    // dnes 12. 11. 2026 → od 13. 11. 2025
    expect(run({ period: '12M' })).toEqual(['4', '5', '6'])
  })

  it('periodBounds: 12M začíná dnem po stejném datu před rokem', () => {
    expect(periodBounds('12M', '2026-11-12', { from: '', to: '' })).toEqual({
      from: '2025-11-13',
      to: ''
    })
    expect(periodBounds('ALL', TODAY, { from: '', to: '' })).toEqual({ from: '', to: '' })
  })

  it('hledání: bez diakritiky, bez ohledu na velikost, více slov = všechna musí sedět', () => {
    expect(run({ search: 'VKLAD' })).toEqual(['1']) // typ „Vklad“ i poznámka (výběr tam není)
    expect(run({ search: 'ucet' })).toEqual(['1']) // poznámka „účet“
    expect(run({ search: 'degiro nakup' })).toEqual(['3'])
    expect(run({ search: 'msci' })).toEqual(['2', '3']) // název fondu
    expect(run({ search: 'IE00B5BMR087' })).toEqual(['4', '5']) // ISIN
    expect(run({ search: '10. 6. 2025' })).toEqual(['3']) // datum v českém zápisu
    expect(run({ search: '2025-06' })).toEqual(['3'])
    expect(run({ search: 'neexistuje' })).toEqual([])
  })

  it('filtry se kombinují (AND)', () => {
    expect(run({ type: 'BUY', securityKey: 'IE00B4L5Y983', period: 'Y2025' })).toEqual(['3'])
    expect(run({ type: 'BUY', search: 'degiro' })).toEqual(['3'])
    expect(isFilterActive({ ...EMPTY_TX_FILTER, search: '  ' })).toBe(false)
    expect(isFilterActive({ ...EMPTY_TX_FILTER, type: 'BUY' })).toBe(true)
  })

  it('normalizeText', () => {
    expect(normalizeText('Účet ŽLUŤOUČKÝ')).toBe('ucet zlutoucky')
  })
})

describe('buyProfit', () => {
  const buy = txs[1] // 5 ks za 500 (100 €/ks)
  it('dnešní hodnota kusů − cena nákupu', () => {
    const r = buyProfit(buy, 120)!
    expect(r.profit).toBeCloseTo(100, 10)
    expect(r.pct).toBeCloseTo(0.2, 10)
    expect(buyProfit(buy, 80)!.profit).toBeCloseTo(-100, 10)
  })
  it('v Kč: dnešní kurz × hodnota − cena v kurzu ke dni nákupu', () => {
    // 5 × 120 × 24 = 14 400; cena 500 × 25 = 12 500
    const r = buyProfit(buy, 120, { today: 24, atDate: 25 })!
    expect(r.profit).toBeCloseTo(1900, 10)
    expect(r.pct).toBeCloseTo(1900 / 12500, 10)
  })
  it('jen u nákupu a se známým kurzem', () => {
    expect(buyProfit(txs[4], 120)).toBeNull() // prodej
    expect(buyProfit(txs[0], 120)).toBeNull() // vklad
    expect(buyProfit(buy, undefined)).toBeNull()
  })
})

describe('řazení podle zisku', () => {
  const profits = new Map([
    ['2', 100],
    ['3', -20],
    ['4', 5]
  ])
  it('sestupně; transakce bez zisku jsou vždy na konci', () => {
    const sorted = sortTransactions(txs, accounts, { key: 'profit', dir: 'desc' }, profits).map(
      (x) => x.id
    )
    expect(sorted.slice(0, 3)).toEqual(['2', '4', '3'])
    const asc = sortTransactions(txs, accounts, { key: 'profit', dir: 'asc' }, profits).map(
      (x) => x.id
    )
    expect(asc.slice(0, 3)).toEqual(['3', '4', '2'])
    expect(asc.slice(3).sort()).toEqual(['1', '5', '6'])
  })
})
