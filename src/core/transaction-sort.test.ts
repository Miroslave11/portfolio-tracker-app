import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '../shared/model'
import { DEFAULT_SORT, nextSort, sortTransactions, unitPrice } from './transaction-sort'

const accounts = new Map<string, Account>([
  ['xtb', { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' }],
  ['degiro', { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }],
  ['freedom24', { id: 'freedom24', name: 'Freedom24', currency: 'EUR', color: '#f59e0b' }]
])

function tx(p: Partial<Transaction> & Pick<Transaction, 'id'>): Transaction {
  return {
    accountId: 'xtb',
    date: '2025-01-01',
    type: 'DEPOSIT',
    amount: 100,
    currency: 'EUR',
    ...p
  }
}

const data: Transaction[] = [
  tx({
    id: 't1',
    date: '2024-03-01',
    accountId: 'degiro',
    type: 'BUY',
    securityId: 'SXR8.DE',
    shares: 4,
    amount: 400
  }),
  tx({ id: 't2', date: '2025-06-01', accountId: 'xtb', type: 'DEPOSIT', amount: 50 }),
  tx({
    id: 't3',
    date: '2025-06-01',
    accountId: 'freedom24',
    type: 'BUY',
    securityId: 'EXUS.DE',
    shares: 10,
    amount: 300
  }),
  tx({
    id: 't4',
    date: '2023-01-01',
    accountId: 'degiro',
    type: 'SELL',
    securityId: 'IWDA.AS',
    shares: 2,
    amount: 220
  }),
  tx({ id: 't5', date: '2022-01-01', accountId: 'xtb', type: 'WITHDRAWAL', amount: 999 })
]

const ids = (rows: Transaction[]): string[] => rows.map((t) => t.id)
const sort = (key: Parameters<typeof nextSort>[1], dir: 'asc' | 'desc'): string[] =>
  ids(sortTransactions(data, accounts, { key, dir }))

describe('sortTransactions', () => {
  it('výchozí řazení: nejnovější datum nahoře, shody podle ID sestupně', () => {
    expect(ids(sortTransactions(data, accounts, DEFAULT_SORT))).toEqual([
      't3',
      't2',
      't1',
      't4',
      't5'
    ])
  })

  it('podle data vzestupně', () => {
    expect(sort('date', 'asc')).toEqual(['t5', 't4', 't1', 't2', 't3'])
  })

  it('podle brokera (česká abecedně, shody nejnovější první)', () => {
    expect(sort('broker', 'asc')).toEqual(['t1', 't4', 't3', 't2', 't5'])
    expect(sort('broker', 'desc')).toEqual(['t2', 't5', 't3', 't1', 't4'])
  })

  it('podle typu podle českého popisku', () => {
    // Nákup, Prodej, Vklad, Výběr
    expect(sort('type', 'asc')).toEqual(['t3', 't1', 't4', 't2', 't5'])
  })

  it('podle ETF: prázdné hodnoty jsou vždy na konci, i při sestupném řazení', () => {
    expect(sort('security', 'asc').slice(0, 3)).toEqual(['t3', 't4', 't1'])
    expect(sort('security', 'desc').slice(0, 3)).toEqual(['t1', 't4', 't3'])
    expect(sort('security', 'asc').slice(3)).toEqual(['t2', 't5'])
    expect(sort('security', 'desc').slice(3)).toEqual(['t2', 't5'])
  })

  it('podle kusů číselně (ne textově)', () => {
    expect(sort('shares', 'asc').slice(0, 3)).toEqual(['t4', 't1', 't3'])
    expect(sort('shares', 'desc').slice(0, 3)).toEqual(['t3', 't1', 't4'])
  })

  it('podle ceny za kus; vklady a výběry (bez ceny) na konci', () => {
    // t1 = 100, t3 = 30, t4 = 110
    expect(sort('price', 'asc').slice(0, 3)).toEqual(['t3', 't1', 't4'])
    expect(sort('price', 'desc').slice(0, 3)).toEqual(['t4', 't1', 't3'])
    expect(sort('price', 'desc').slice(3)).toEqual(['t2', 't5'])
  })

  it('podle částky číselně', () => {
    expect(sort('amount', 'desc')).toEqual(['t5', 't1', 't3', 't4', 't2'])
    expect(sort('amount', 'asc')).toEqual(['t2', 't4', 't3', 't1', 't5'])
  })

  it('nemění původní pole', () => {
    const before = ids(data)
    sortTransactions(data, accounts, { key: 'amount', dir: 'asc' })
    expect(ids(data)).toEqual(before)
  })
})

describe('nextSort', () => {
  it('první klik: datum a čísla sestupně, text vzestupně', () => {
    expect(nextSort(DEFAULT_SORT, 'amount')).toEqual({ key: 'amount', dir: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'broker')).toEqual({ key: 'broker', dir: 'asc' })
    expect(nextSort({ key: 'broker', dir: 'asc' }, 'date')).toEqual({ key: 'date', dir: 'desc' })
  })

  it('opakovaný klik na stejný sloupec obrací směr', () => {
    expect(nextSort({ key: 'broker', dir: 'asc' }, 'broker')).toEqual({
      key: 'broker',
      dir: 'desc'
    })
    expect(nextSort({ key: 'date', dir: 'desc' }, 'date')).toEqual({ key: 'date', dir: 'asc' })
  })
})

describe('unitPrice', () => {
  it('vrací cenu jen u nákupu a prodeje', () => {
    expect(unitPrice(data[0])).toBe(100)
    expect(unitPrice(data[1])).toBeNull()
  })
})
