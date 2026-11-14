import { describe, expect, it } from 'vitest'
import {
  compareWithSelling,
  dividendStats,
  dividendTotalReturn,
  historicalTotalReturn,
  projectDividendIncome,
  type DividendEvent
} from './dividends'
import { perpetualMonthlyWithdrawal } from './withdrawal'
import { DEFAULT_WITHDRAWAL, settingsPatchSchema, settingsSchema } from '../shared/settings'

/** Čtvrtletní výplaty od 2011-12 do 2026-09; roční součet roste o 10 % ročně. */
function quarterly(): DividendEvent[] {
  const out: DividendEvent[] = [['2011-12-19', 0.05]]
  for (let y = 2012; y <= 2026; y++) {
    const total = 0.3 * Math.pow(1.1, y - 2012)
    for (const m of ['03', '06', '09', '12']) {
      if (y === 2026 && m === '12') continue
      out.push([`${y}-${m}-20`, total / 4])
    }
  }
  return out
}

describe('dividendStats', () => {
  it('výnos za 12 měsíců = poslední 4 čtvrtletní výplaty / kurz', () => {
    const ev = quarterly()
    const s = dividendStats(ev, 40, '2026-11-13')
    const last4 = ev.slice(-4).reduce((a, e) => a + e[1], 0)
    expect(s.ttm).toBeCloseTo(last4, 12)
    expect(s.yield).toBeCloseTo(last4 / 40, 12)
    expect(s.lastPayment).toBe('2026-09-20')
  })

  it('růst za 5 a 10 let z celých let (první a letošní rok se nepočítá)', () => {
    const s = dividendStats(quarterly(), 40, '2026-11-13')
    expect(s.lastFullYear).toBe(2025)
    expect(s.years[0].year).toBe(2012)
    expect(s.years.some((y) => y.year === 2026)).toBe(false)
    expect(s.growth5).toBeCloseTo(0.1, 10)
    expect(s.growth10).toBeCloseTo(0.1, 10)
  })

  it('málo historie → růst null; bez kurzu → výnos null; prázdné → nuly', () => {
    const short: DividendEvent[] = [
      ['2022-06-01', 1],
      ['2023-06-01', 1.1],
      ['2024-06-01', 1.2],
      ['2025-06-01', 1.3]
    ]
    const s = dividendStats(short, null, '2026-01-10')
    expect(s.growth5).toBeNull()
    expect(s.growth10).toBeNull()
    expect(s.yield).toBeNull()
    expect(s.ttm).toBe(1.3)
    expect(dividendStats([], 10, '2026-01-01').ttm).toBe(0)
  })

  it('měsíční výplaty: 12 v okně, třináctá (o rok starší) už ne', () => {
    const ev: DividendEvent[] = []
    for (let i = 0; i < 24; i++) {
      const d = new Date(Date.UTC(2024, i, 5)).toISOString().slice(0, 10)
      ev.push([d, 0.1])
    }
    expect(dividendStats(ev, 10, '2026-01-10').ttm).toBeCloseTo(1.2, 12)
  })
})

describe('projectDividendIncome', () => {
  const input = {
    capital: 5_000_000,
    dividendYield: 0.03,
    growth: 0.07,
    tax: 0.15,
    inflation: 0.025
  }

  it('odpovídá vzorci: C × výnos × (1+g)^k × (1 − daň) / 12', () => {
    const rows = projectDividendIncome(input, 30)
    expect(rows).toHaveLength(31)
    expect(rows[0].monthly).toBeCloseTo((5_000_000 * 0.03 * 0.85) / 12, 6)
    expect(rows[10].monthly).toBeCloseTo(rows[0].monthly * Math.pow(1.07, 10), 6)
    expect(rows[10].monthlyReal).toBeCloseTo(rows[10].monthly / Math.pow(1.025, 10), 6)
    expect(rows[20].capital).toBeCloseTo(5_000_000 * Math.pow(1.07, 20), 2)
  })

  it('nulový růst = stálý nominální příjem, reálně klesá o inflaci', () => {
    const rows = projectDividendIncome({ ...input, growth: 0 }, 10)
    expect(rows[10].monthly).toBeCloseTo(rows[0].monthly, 9)
    expect(rows[10].monthlyReal).toBeLessThan(rows[0].monthly)
    expect(rows[10].capital).toBe(5_000_000)
  })
})

describe('compareWithSelling', () => {
  const input = {
    capital: 5_000_000,
    dividendYield: 0.029,
    growth: 0.07,
    tax: 0.15,
    inflation: 0.025
  }

  it('odprodej počítá se stejným celkovým výnosem (dividenda + růst)', () => {
    const c = compareWithSelling(input)
    expect(c.totalReturn).toBeCloseTo(dividendTotalReturn(0.029, 0.07), 12)
    expect(c.sellPerpetual).toBeCloseTo(
      perpetualMonthlyWithdrawal(5_000_000, c.totalReturn, 0.025)!,
      6
    )
  })

  it('dividendy začínají níž a odprodej doženou v pozdějším roce', () => {
    const c = compareWithSelling(input)
    const rows = projectDividendIncome(input, 60)
    expect(rows[0].monthlyReal).toBeLessThan(c.sellPerpetual!)
    expect(c.dividendsAheadFrom).not.toBeNull()
    expect(rows[c.dividendsAheadFrom!].monthlyReal).toBeGreaterThanOrEqual(c.sellPerpetual!)
    expect(rows[c.dividendsAheadFrom! - 1].monthlyReal).toBeLessThan(c.sellPerpetual!)
  })

  it('nízký celkový výnos: odprodej „navždy“ dá méně a dividendy jsou vepředu hned', () => {
    // 2,9 % + 1 % růst = 3,9 % celkem, reálně jen ~1,4 % → udržitelný odprodej je malý.
    expect(compareWithSelling({ ...input, growth: 0.01 }).dividendsAheadFrom).toBe(0)
  })

  it('celkový výnos pod inflací: odprodej navždy nejde', () => {
    const c = compareWithSelling({ ...input, dividendYield: 0.01, growth: 0.01, inflation: 0.03 })
    expect(c.sellPerpetual).toBeNull()
    expect(c.dividendsAheadFrom).toBeNull()
  })
})

describe('nastavení kalkulačky čerpání', () => {
  it('uložení z P19 (bez dividendových polí) se načte s výchozími hodnotami, nic se neztratí', () => {
    const old = {
      source: 'custom',
      customCzk: 5_000_000,
      monthlyCzk: 20_000,
      annualReturn: 0.05,
      inflation: 0.025
    }
    const w = settingsSchema.parse({ withdrawal: old }).withdrawal
    expect(w).toEqual({ ...old, mode: 'sell', dividendTicker: 'SCHD', dividendTax: 0.15 })
  })

  it('neplatný ticker nebo daň → celé nastavení čerpání na výchozí', () => {
    const bad = { ...DEFAULT_WITHDRAWAL, dividendTicker: 'SCHD; rm', dividendTax: 2 }
    expect(settingsSchema.parse({ withdrawal: bad }).withdrawal).toEqual(DEFAULT_WITHDRAWAL)
    expect(
      settingsPatchSchema.safeParse({ withdrawal: { ...DEFAULT_WITHDRAWAL, mode: 'dividends' } })
        .success
    ).toBe(true)
  })
})

describe('historicalTotalReturn', () => {
  /** Měsíční kurzy rostoucí přesně o 10 % ročně, 2011-10 až 2026-11. */
  function monthly(): [string, number][] {
    const out: [string, number][] = []
    for (let i = 0; i <= 181; i++) {
      const d = new Date(Date.UTC(2011, 9 + i, 1)).toISOString().slice(0, 10)
      out.push([d, 10 * Math.pow(1.1, i / 12)])
    }
    return out
  }

  it('5 a 10 let: průměrný roční výnos z upravených kurzů', () => {
    const r5 = historicalTotalReturn(monthly(), 5)!
    expect(r5.from).toBe('2021-11-01')
    expect(r5.to).toBe('2026-11-01')
    expect(r5.annual).toBeCloseTo(0.1, 3)
    expect(historicalTotalReturn(monthly(), 10)!.annual).toBeCloseTo(0.1, 3)
  })

  it('historie nesahá dost daleko → null', () => {
    expect(historicalTotalReturn(monthly(), 20)).toBeNull()
    expect(historicalTotalReturn([], 5)).toBeNull()
    expect(historicalTotalReturn(monthly().slice(-30), 5)).toBeNull()
  })
})
