import { describe, expect, it } from 'vitest'
import { exportTableSchema } from '../shared/export'
import type { Account, Security, Transaction } from '../shared/model'
import {
  monthlyInvestmentsTable,
  performanceYearsTable,
  positionsTable,
  realizedSalesTable,
  SHEET,
  transactionsTable
} from './export-tables'
import type { InvestmentStats } from './investments'
import type { RealizedSale } from './lots'
import type { Position } from './portfolio-calc'

const accounts: Account[] = [
  { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#111111' },
  { id: 'f24', name: 'Freedom24', currency: 'EUR', color: '#222222' }
]
const securities: Security[] = [
  {
    id: 'EUNL.DE',
    name: 'iShares Core MSCI World',
    isin: 'IE00B4L5Y983',
    yahooTicker: 'EUNL.DE',
    currency: 'EUR',
    indexGroup: 'MSCI World',
    distributing: false,
    color: '#6366f1'
  }
]
const meta = { accounts, securities }

describe('transactionsTable', () => {
  const txs: Transaction[] = [
    {
      id: '1',
      accountId: 'xtb',
      date: '2026-11-10',
      type: 'BUY',
      amount: 1000,
      currency: 'EUR',
      securityId: 'EUNL.DE',
      shares: 10,
      fee: 1.5,
      note: '=nebezpečná poznámka'
    },
    { id: '2', accountId: 'f24', date: '2026-11-09', type: 'DEPOSIT', amount: 500, currency: 'EUR' }
  ]

  it('každá transakce jeden řádek, názvy brokerů a ETF, částka na kus', () => {
    const t = transactionsTable(txs, meta)
    expect(t.name).toBe(SHEET.transactions)
    expect(t.rows[0]).toEqual([
      '2026-11-10',
      'XTB',
      'Nákup',
      'EUNL.DE',
      'iShares Core MSCI World',
      'IE00B4L5Y983',
      10,
      100,
      1000,
      'EUR',
      1.5,
      null,
      '=nebezpečná poznámka'
    ])
    expect(t.rows[1]).toEqual([
      '2026-11-09',
      'Freedom24',
      'Vklad',
      null,
      null,
      null,
      null,
      null,
      500,
      'EUR',
      null,
      null,
      null
    ])
  })

  it('výsledek odpovídá schématu exportu (stejný počet buněk, název listu)', () => {
    expect(exportTableSchema.safeParse(transactionsTable(txs, meta)).success).toBe(true)
    expect(exportTableSchema.safeParse(transactionsTable([], meta)).success).toBe(true)
  })
})

describe('monthlyInvestmentsTable', () => {
  const stats = {
    months: [
      { month: '2026-09', total: 0, byAccount: {}, buys: 0 },
      { month: '2026-10', total: 1500, byAccount: { xtb: 1000, f24: 500 }, buys: 3 }
    ]
  } as unknown as InvestmentStats

  it('sloupec pro každého brokera s nákupy, celkem a počet nákupů', () => {
    const t = monthlyInvestmentsTable(stats, accounts)
    expect(t.columns.map((c) => c.label)).toEqual([
      'Měsíc',
      'XTB (EUR)',
      'Freedom24 (EUR)',
      'Celkem (EUR)',
      'Počet nákupů'
    ])
    expect(t.rows).toEqual([
      ['2026-09', 0, 0, 0, 0],
      ['2026-10', 1000, 500, 1500, 3]
    ])
  })

  it('měna v záhlaví podle zobrazení', () => {
    const t = monthlyInvestmentsTable(stats, accounts, { currencyLabel: 'Kč' })
    expect(t.columns.map((c) => c.label).slice(1, 4)).toEqual([
      'XTB (Kč)',
      'Freedom24 (Kč)',
      'Celkem (Kč)'
    ])
  })

  it('s kurzem přibude sloupec Celkem (Kč)', () => {
    const t = monthlyInvestmentsTable(stats, accounts, {
      czkTotals: new Map([['2026-10', 36_500]])
    })
    expect(t.columns.at(-2)?.label).toBe('Celkem (Kč)')
    expect(t.rows[1]).toEqual(['2026-10', 1000, 500, 1500, 36_500, 3])
    expect(t.rows[0].at(-2)).toBeNull()
  })
})

describe('positionsTable', () => {
  const pos: Position[] = [
    {
      securityId: 'EUNL.DE',
      shares: 10,
      costBasis: 800,
      price: 100,
      priceDate: '2026-11-12',
      estimated: false,
      value: 1000,
      unrealized: 200,
      unrealizedPct: 0.25
    }
  ]

  it('pozice s metadaty ETF; hodnota v Kč jen s kurzem', () => {
    const noFx = positionsTable(pos, securities, null)
    expect(noFx.rows[0]).toEqual([
      'EUNL.DE',
      'iShares Core MSCI World',
      'IE00B4L5Y983',
      'MSCI World',
      10,
      100,
      1000,
      800,
      200,
      0.25
    ])
    const fx = positionsTable(pos, securities, 24.5)
    expect(fx.rows[0].at(-1)).toBe(24_500)
    expect(fx.columns.at(-1)?.label).toBe('Hodnota (Kč)')
  })
})

describe('performanceYearsTable', () => {
  it('rok, hranice, zisk, TTWROR a IRR; rok bez výsledku má prázdné buňky', () => {
    const t = performanceYearsTable(
      [
        {
          year: 2025,
          result: {
            from: '2025-01-01',
            to: '2025-12-31',
            profit: 1234.5,
            ttwror: 0.12,
            irr: 0.11
          } as never
        },
        { year: 2026, result: null }
      ],
      'EUR'
    )
    expect(t.columns[3].label).toBe('Zisk (EUR)')
    expect(t.rows).toEqual([
      [2025, '2025-01-01', '2025-12-31', 1234.5, 0.12, 0.11],
      [2026, null, null, null, null, null]
    ])
  })
})

describe('realizedSalesTable', () => {
  it('prodej s částkami v EUR i Kč', () => {
    const sale = {
      date: '2026-05-01',
      accountId: 'xtb',
      securityId: 'EUNL.DE',
      shares: 5,
      proceeds: 600,
      cost: 500,
      gain: 100,
      exemptGain: 40,
      proceedsCzk: 14_700,
      costCzk: 12_000,
      gainCzk: 2700
    } as unknown as RealizedSale
    const t = realizedSalesTable([sale], meta)
    expect(t.rows[0]).toEqual([
      '2026-05-01',
      'XTB',
      'EUNL.DE',
      5,
      600,
      500,
      100,
      40,
      14_700,
      12_000,
      2700
    ])
    expect(exportTableSchema.safeParse(t).success).toBe(true)
  })
})
