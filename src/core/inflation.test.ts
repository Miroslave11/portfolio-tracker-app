import { describe, expect, it } from 'vitest'
import { averageInflation, deflateCalc, makeDeflator, realRate } from './inflation'
import type { CalcResult } from './portfolio-calc'
import { hicpUrl, parseHicp, type CpiPoint } from './prices/hicp'

/** Zmenšená skutečná odpověď Eurostatu (prc_hicp_minr, EA, TOTAL, I15). */
const SAMPLE = {
  version: '2.0',
  class: 'dataset',
  id: ['freq', 'unit', 'coicop18', 'geo', 'time'],
  size: [1, 1, 1, 1, 4],
  value: { '0': 104.68, '1': 105.1, '2': 129.56 },
  dimension: {
    freq: { category: { index: { M: 0 } } },
    unit: { category: { index: { I15: 0 } } },
    coicop18: { category: { index: { TOTAL: 0 } } },
    geo: { category: { index: { EA: 0 } } },
    time: { category: { index: { '2018-10': 0, '2018-11': 1, '2025-12': 2, '2026-10': 3 } } }
  }
}

describe('Eurostat HICP', () => {
  it('adresa dotazu', () => {
    const u = new URL(hicpUrl('CZ', '2018-01'))
    expect(u.pathname).toMatch(/prc_hicp_minr$/)
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      geo: 'CZ',
      coicop18: 'TOTAL',
      unit: 'I15',
      sinceTimePeriod: '2018-01',
      format: 'JSON'
    })
  })

  it('převede JSON-stat na měsíční řadu; měsíc bez hodnoty (ještě nezveřejněný) vynechá', () => {
    expect(parseHicp(SAMPLE)).toEqual([
      ['2018-10', 104.68],
      ['2018-11', 105.1],
      ['2025-12', 129.56]
    ])
  })

  it('nesmyslná odpověď → srozumitelná chyba', () => {
    expect(() => parseHicp({ error: 'x' })).toThrow(/formát/)
    expect(() => parseHicp({ ...SAMPLE, size: [1, 2, 1, 1, 4] })).toThrow(/víc řad/)
    expect(() => parseHicp({ ...SAMPLE, id: ['freq', 'unit'] })).toThrow(/časová osa/)
  })
})

const CPI: CpiPoint[] = [
  ['2020-01', 100],
  ['2020-02', 101],
  ['2021-01', 110],
  ['2022-01', 125]
]

describe('makeDeflator', () => {
  const f = makeDeflator(CPI)!
  it('poslední index / index měsíce', () => {
    expect(f('2020-01-15')).toBeCloseTo(1.25, 12)
    expect(f('2021-01-31')).toBeCloseTo(125 / 110, 12)
  })
  it('měsíc po posledním zveřejněném = 1; před začátkem = první měsíc; mezera = předchozí měsíc', () => {
    expect(f('2022-06-01')).toBe(1)
    expect(f('2019-05-01')).toBeCloseTo(1.25, 12)
    expect(f('2020-07-10')).toBeCloseTo(125 / 101, 12)
  })
  it('bez dat → null', () => {
    expect(makeDeflator([])).toBeNull()
  })
})

describe('averageInflation / realRate', () => {
  it('průměrná roční inflace z indexu', () => {
    // 2020-01 → 2022-01: 100 → 125 za 24 měsíců → √1,25 − 1
    expect(averageInflation(CPI, '2020-01-10')).toBeCloseTo(Math.sqrt(1.25) - 1, 12)
    expect(averageInflation([['2020-01', 100]], '2020-01-01')).toBeNull()
  })
  it('reálný výnos', () => {
    expect(realRate(0.07, 0.025)).toBeCloseTo(1.07 / 1.025 - 1, 12)
    expect(realRate(0.02, 0.02)).toBeCloseTo(0, 12)
  })
})

describe('deflateCalc', () => {
  // vklad 1 000 v 1/2020 (koef. 1,25) a 1 000 v 1/2021 (koef. 125/110); hodnota dnes 2 500
  const calc: CalcResult = {
    series: [
      { date: '2020-01-10', value: 1000, invested: 1000, valueCzk: 25000, investedCzk: 25000 },
      { date: '2021-01-10', value: 2100, invested: 2000, valueCzk: 52000, investedCzk: 51000 },
      { date: '2022-01-10', value: 2500, invested: 2000, valueCzk: 60000, investedCzk: 51000 }
    ],
    summary: {
      asOf: '2022-01-10',
      firstDate: '2020-01-10',
      value: 2500,
      invested: 2000,
      profit: 500,
      profitPct: 0.25,
      cash: 0,
      depositCount: 2,
      dayChange: 10,
      dayChangePct: 0.004,
      fxRate: 24,
      valueCzk: 60000,
      investedCzk: 51000,
      profitCzk: 9000,
      positions: [],
      missingPrices: [],
      warnings: []
    }
  }
  const eur = makeDeflator(CPI)
  const czk = makeDeflator([
    ['2020-01', 100],
    ['2022-01', 110]
  ])
  const r = deflateCalc(calc, eur, czk)

  it('vloženo v dnešních cenách: dřívější vklady váží víc', () => {
    expect(r.summary!.invested).toBeCloseTo(1000 * 1.25 + 1000 * (125 / 110), 8)
    expect(r.series[0].value).toBeCloseTo(1250, 8)
    expect(r.summary!.value).toBe(2500) // dnešní hodnota se nemění
    expect(r.summary!.profit).toBeCloseTo(2500 - r.summary!.invested, 8)
  })

  it('Kč se přepočítává inflací ČR', () => {
    // vklady v Kč: 25 000 (1/2020, koef. 1,1) a 26 000 (1/2021, koef. 1,1 – mezera → 1/2020)
    expect(r.summary!.investedCzk).toBeCloseTo(25000 * 1.1 + 26000 * 1.1, 8)
    expect(r.summary!.valueCzk).toBe(60000)
  })

  it('pozice a změna za den zůstávají; bez dat o inflaci se nic nemění', () => {
    expect(r.summary!.dayChange).toBe(10)
    expect(deflateCalc(calc, null, null)).toBe(calc)
  })
})
