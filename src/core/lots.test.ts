import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Portfolio, Security, Transaction } from '../shared/model'
import { importPortfolioPerformance } from './import-pp'
import { computeLots, passesTimeTest, realizedByYear, timeTestFreeFrom } from './lots'

const sec = (id: string, isin?: string): Security => ({
  id,
  ...(isin ? { isin } : {}),
  name: id,
  yahooTicker: id,
  currency: 'EUR',
  indexGroup: 'X',
  distributing: false,
  color: '#6366f1'
})
const buy = (
  id: string,
  date: string,
  securityId: string,
  shares: number,
  amount: number,
  accountId = 'xtb'
): Transaction => ({
  id,
  accountId,
  date,
  type: 'BUY',
  amount,
  currency: 'EUR',
  securityId,
  shares
})
const sell = (
  id: string,
  date: string,
  securityId: string,
  shares: number,
  amount: number,
  accountId = 'xtb'
): Transaction => ({
  ...buy(id, date, securityId, shares, amount, accountId),
  type: 'SELL'
})
const portfolio = (transactions: Transaction[]): Portfolio => ({
  version: 1,
  accounts: [
    { id: 'xtb', name: 'XTB', currency: 'EUR', color: '#6366f1' },
    { id: 'degiro', name: 'Degiro', currency: 'EUR', color: '#0ea5e9' }
  ],
  securities: [
    sec('EUNL.DE', 'IE00B4L5Y983'),
    sec('IWDA.AS', 'IE00B4L5Y983'),
    sec('SXR8.DE', 'IE00B5BMR087'),
    sec('BEZISIN')
  ],
  transactions
})

describe('časový test', () => {
  it('osvobozeno až den po třetím výročí nákupu', () => {
    expect(timeTestFreeFrom('2020-03-15')).toBe('2023-03-16')
    expect(passesTimeTest('2020-03-15', '2023-03-15')).toBe(false) // přesně 3 roky nestačí
    expect(passesTimeTest('2020-03-15', '2023-03-16')).toBe(true)
    expect(passesTimeTest('2020-03-15', '2022-12-31')).toBe(false)
  })
  it('přestupný rok: nákup 29. 2. → výročí 28. 2., volné od 1. 3.', () => {
    expect(timeTestFreeFrom('2024-02-29')).toBe('2027-03-01')
    expect(timeTestFreeFrom('2023-12-31')).toBe('2027-01-01')
  })
})

describe('computeLots – FIFO', () => {
  /*
   * Ruční příklad (SXR8):
   *  2020-01-10 nákup 10 ks za 1 000 € (100 €/ks)
   *  2021-06-01 nákup  5 ks za   600 € (120 €/ks)
   *  2023-02-01 prodej 12 ks za 1 800 € → FIFO: 10 ks z 2020 (1 000 €) + 2 ks z 2021 (240 €)
   *             náklady 1 240 €, zisk 560 €; časový test splněn jen u 10 ks z 2020
   */
  const p = portfolio([
    buy('b1', '2020-01-10', 'SXR8.DE', 10, 1000),
    buy('b2', '2021-06-01', 'SXR8.DE', 5, 600),
    sell('s1', '2023-02-01', 'SXR8.DE', 12, 1800)
  ])
  const r = computeLots(p)

  it('prodej spotřebuje nejstarší nákupy', () => {
    expect(r.sales).toHaveLength(1)
    const s = r.sales[0]
    expect(s.uses.map((u) => [u.lotId, u.shares, u.cost])).toEqual([
      ['b1', 10, 1000],
      ['b2', 2, 240]
    ])
    expect(s.cost).toBeCloseTo(1240, 10)
    expect(s.gain).toBeCloseTo(560, 10)
  })

  it('rozdělení podle časového testu (poměrem kusů)', () => {
    const s = r.sales[0]
    expect(s.uses.map((u) => u.longTerm)).toEqual([true, false])
    expect(s.exemptShares).toBe(10)
    expect(s.exemptProceeds).toBeCloseTo(1500, 10) // 10/12 × 1 800
    expect(s.exemptGain).toBeCloseTo(500, 10) // 1 500 − 1 000
  })

  it('zbývající kusy zůstanou v otevřených lotech', () => {
    expect(r.openLots.map((l) => [l.id, l.remaining])).toEqual([['b2', 3]])
    expect(r.warnings).toEqual([])
  })

  it('stejný ISIN napříč kotacemi a brokery tvoří jednu frontu', () => {
    const q = computeLots(
      portfolio([
        buy('a', '2019-01-01', 'IWDA.AS', 4, 200, 'degiro'), // 50 €/ks
        buy('b', '2020-01-01', 'EUNL.DE', 4, 240, 'xtb'), // 60 €/ks
        sell('s', '2021-01-01', 'EUNL.DE', 6, 420, 'xtb')
      ])
    )
    const s = q.sales[0]
    expect(s.securityKey).toBe('IE00B4L5Y983')
    expect(s.uses.map((u) => [u.lotId, u.accountId, u.securityId, u.shares])).toEqual([
      ['a', 'degiro', 'IWDA.AS', 4],
      ['b', 'xtb', 'EUNL.DE', 2]
    ])
    expect(s.cost).toBeCloseTo(320, 10)
    expect(s.gain).toBeCloseTo(100, 10)
  })

  it('různé fondy se nemíchají; ETF bez ISIN se páruje podle tickeru', () => {
    const q = computeLots(
      portfolio([
        buy('x', '2020-01-01', 'SXR8.DE', 1, 100),
        buy('y', '2020-01-01', 'BEZISIN', 2, 20),
        sell('s', '2020-06-01', 'BEZISIN', 2, 30)
      ])
    )
    expect(q.sales[0].uses.map((u) => u.lotId)).toEqual(['y'])
    expect(q.openLots.map((l) => l.id)).toEqual(['x'])
  })

  it('ve stejný den se nákup započítá před prodejem', () => {
    const q = computeLots(
      portfolio([
        sell('s', '2020-01-01', 'SXR8.DE', 1, 110),
        buy('b', '2020-01-01', 'SXR8.DE', 1, 100)
      ])
    )
    expect(q.sales[0].gain).toBeCloseTo(10, 10)
    expect(q.warnings).toEqual([])
  })

  it('prodej bez dostatku nákupů → upozornění, zisk z dostupných kusů', () => {
    const q = computeLots(
      portfolio([
        buy('b', '2020-01-01', 'SXR8.DE', 1, 100),
        sell('s', '2020-02-01', 'SXR8.DE', 3, 330)
      ])
    )
    expect(q.warnings[0]).toMatch(/chybí nákupy pro 2 ks/)
    expect(q.sales[0].cost).toBe(100)
  })

  it('částky v Kč: příjem kurzem ke dni prodeje, náklady kurzem ke dni nákupu', () => {
    const fx: Record<string, number> = { '2020-01-10': 25, '2021-06-01': 26, '2023-02-01': 24 }
    const q = computeLots(p, { fxAt: (d) => fx[d] ?? null })
    const s = q.sales[0]
    expect(s.proceedsCzk).toBe(1800 * 24)
    expect(s.costCzk).toBeCloseTo(1000 * 25 + 240 * 26, 8)
    expect(s.gainCzk).toBeCloseTo(43200 - 31240, 8)
    expect(s.exemptProceedsCzk).toBeCloseTo(43200 * (10 / 12), 8)
    // bez kurzu u nákupu nelze náklady v Kč spočítat
    const partial = computeLots(p, { fxAt: (d) => (d === '2023-02-01' ? 24 : null) })
    expect(partial.sales[0].costCzk).toBeNull()
    expect(partial.sales[0].gainCzk).toBeNull()
  })
})

describe('realizedByYear', () => {
  const p = portfolio([
    buy('b1', '2018-01-10', 'SXR8.DE', 10, 1000),
    sell('s1', '2023-02-01', 'SXR8.DE', 2, 300), // osvobozeno, zisk 100
    buy('b2', '2023-03-01', 'EUNL.DE', 10, 500),
    sell('s2', '2023-05-01', 'EUNL.DE', 4, 220), // neosvobozeno, zisk 20
    sell('s3', '2024-07-01', 'SXR8.DE', 1, 90) // osvobozeno, ztráta −10
  ])
  const rows = realizedByYear(computeLots(p).sales)
  it('součty po letech (nejnovější první)', () => {
    expect(rows.map((r) => r.year)).toEqual([2024, 2023])
    const y23 = rows[1]
    expect(y23.sales).toBe(2)
    expect(y23.proceeds).toBe(520)
    expect(y23.cost).toBe(400)
    expect(y23.gain).toBe(120)
    expect(y23.exemptProceeds).toBe(300)
    expect(y23.exemptGain).toBe(100)
    expect(y23.otherProceeds).toBe(220)
    expect(rows[0].gain).toBe(-10)
  })
})

// ---- kontrola na skutečném exportu (jen lokálně; soubor není v repozitáři) ----
const REAL = join(__dirname, '../../Všechny_transakce.json')
describe.skipIf(!existsSync(REAL))('skutečná data', () => {
  let p: Portfolio
  beforeAll(() => {
    p = importPortfolioPerformance(JSON.parse(readFileSync(REAL, 'utf-8'))).portfolio!
  })

  it('jediný prodej (2023) sedí s nezávislým FIFO výpočtem', () => {
    const r = computeLots(p)
    expect(r.warnings).toEqual([])
    const sells = p.transactions.filter((t) => t.type === 'SELL')
    expect(r.sales).toHaveLength(sells.length)
    // nezávislý FIFO: projít nákupy daného fondu chronologicky
    const s = r.sales[0]
    const isin = p.securities.find((x) => x.id === s.securityId)!.isin
    const sameFund = new Set(
      p.securities.filter((x) => (x.isin ?? x.id) === (isin ?? s.securityId)).map((x) => x.id)
    )
    const buys = p.transactions
      .filter((t) => t.type === 'BUY' && sameFund.has(t.securityId!) && t.date <= s.date)
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    let left = s.shares
    let cost = 0
    for (const b of buys) {
      const take = Math.min(left, b.shares!)
      cost += (take * b.amount) / b.shares!
      left -= take
      if (left <= 1e-9) break
    }
    expect(s.proceeds).toBeCloseTo(sells[0].amount, 6)
    expect(s.cost).toBeCloseTo(cost, 6)
    expect(s.uses.reduce((x, u) => x + u.shares, 0)).toBeCloseTo(s.shares, 9)
  })

  it('součet zbývajících kusů = držené kusy', () => {
    const r = computeLots(p)
    const held = new Map<string, number>()
    for (const t of p.transactions) {
      if (t.type !== 'BUY' && t.type !== 'SELL') continue
      held.set(
        t.securityId!,
        (held.get(t.securityId!) ?? 0) + (t.type === 'BUY' ? t.shares! : -t.shares!)
      )
    }
    const open = new Map<string, number>()
    for (const l of r.openLots) open.set(l.securityId, (open.get(l.securityId) ?? 0) + l.remaining)
    // po ISIN (prodej mohl ubrat z jiné kotace téhož fondu)
    const byIsin = (m: Map<string, number>): Record<string, number> => {
      const out: Record<string, number> = {}
      for (const [id, n] of m) {
        const k = p.securities.find((x) => x.id === id)!.isin ?? id
        out[k] = Math.round(((out[k] ?? 0) + n) * 1e6) / 1e6
      }
      for (const k of Object.keys(out)) if (Math.abs(out[k]) < 1e-9) delete out[k]
      return out
    }
    expect(byIsin(open)).toEqual(byIsin(held))
  })
})
