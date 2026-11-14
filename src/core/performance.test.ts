import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysBetween } from './date'
import type { SeriesPoint } from './portfolio-calc'
import {
  computePerformance,
  performanceByYear,
  resolvePeriod,
  toPerfPoints,
  xirr,
  type PerfPoint
} from './performance'

/** Denní řada od `start`; každý prvek je [hodnota na konci dne, tok dne]. */
function daily(start: string, days: [number, number][]): PerfPoint[] {
  return days.map(([value, flow], i) => ({ date: addDays(start, i), value, flow }))
}

describe('date helpers', () => {
  it('addMonths zkracuje konec měsíce', () => {
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2024-03-31', -1)).toBe('2024-02-29')
    expect(addMonths('2026-01-15', -3)).toBe('2025-10-15')
    expect(addMonths('2026-11-12', 3)).toBe('2027-02-12')
  })
  it('daysBetween', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366)
  })
})

describe('TTWROR', () => {
  it('bez vkladů: +8 % je +8 %', () => {
    const pts = daily('2026-01-01', [
      [1000, 1000],
      [1040, 0],
      [1080, 0]
    ])
    const r = computePerformance(pts, '2026-01-01', '2026-01-03')!
    expect(r.ttwror).toBeCloseTo(0.08, 10)
    expect(r.profit).toBeCloseTo(80, 10)
  })

  it('vklad sám výnos nezmění (tok se z výnosu vyloučí)', () => {
    const pts = daily('2026-01-01', [
      [1000, 1000],
      [1100, 0], // +10 %
      [2100, 1000], // vklad 1000, trh 0 %
      [2310, 0] // +10 %
    ])
    const r = computePerformance(pts, '2026-01-01', '2026-01-04')!
    expect(r.ttwror).toBeCloseTo(1.1 * 1.0 * 1.1 - 1, 10) // 21 %
    expect(r.netFlow).toBe(2000)
    expect(r.profit).toBeCloseTo(310, 10)
  })

  it('výběr: hodnota klesne, výkon ne', () => {
    const pts = daily('2026-01-01', [
      [1000, 1000],
      [1000, 0],
      [600, -400], // výběr 400
      [660, 0] // +10 %
    ])
    const r = computePerformance(pts, '2026-01-01', '2026-01-04')!
    expect(r.ttwror).toBeCloseTo(0.1, 10)
    expect(r.netFlow).toBe(600)
    expect(r.profit).toBeCloseTo(60, 10)
  })

  it('období uprostřed řady začíná hodnotou na konci dne `from`', () => {
    const pts = daily('2026-01-01', [
      [1000, 1000],
      [1100, 0], // +10 %
      [1100, 0],
      [1210, 0] // +10 %
    ])
    // období od 2. 1. (hodnota 1100) do 4. 1.
    const r = computePerformance(pts, '2026-01-02', '2026-01-04')!
    expect(r.startValue).toBe(1100)
    expect(r.ttwror).toBeCloseTo(0.1, 10)
    expect(r.profit).toBeCloseTo(110, 10)
    expect(r.curve[0]).toEqual({ date: '2026-01-02', pct: 0 })
    expect(r.curve.at(-1)!.pct).toBeCloseTo(0.1, 10)
  })

  it('začátek před prvním dnem se zkrátí na první den; `to` za koncem na poslední den', () => {
    const pts = daily('2026-01-05', [
      [500, 500],
      [550, 0]
    ])
    const r = computePerformance(pts, '2020-01-01', '2030-01-01')!
    expect(r.from).toBe('2026-01-05')
    expect(r.to).toBe('2026-01-06')
    expect(r.ttwror).toBeCloseTo(0.1, 10)
    expect(r.startValue).toBe(0)
  })

  it('křivka je kumulativní a končí hodnotou TTWROR', () => {
    const pts = daily('2026-01-01', [
      [100, 100],
      [110, 0],
      [99, 0]
    ])
    const r = computePerformance(pts, '2026-01-01', '2026-01-03')!
    expect(r.curve.map((c) => Number(c.pct.toFixed(4)))).toEqual([0, 0.1, -0.01])
    expect(r.ttwror).toBeCloseTo(-0.01, 10)
  })

  it('prázdná data nebo období bez dní → null', () => {
    expect(computePerformance([], '2026-01-01', '2026-02-01')).toBeNull()
    const pts = daily('2026-01-01', [[100, 100]])
    expect(computePerformance(pts, '2026-01-01', '2026-01-01')).toBeNull() // jediný den
    expect(computePerformance(pts, '2026-05-01', '2026-06-01')).toBeNull()
  })

  it('roční přepočet jen pro období od roku', () => {
    // +21 % za 2 roky ≈ 10 % ročně
    const pts: PerfPoint[] = [
      { date: '2024-01-01', value: 1000, flow: 1000 },
      { date: '2026-01-01', value: 1210, flow: 0 }
    ]
    const r = computePerformance(pts, '2024-01-01', '2026-01-01')!
    expect(r.days).toBe(731)
    expect(r.ttwrorAnnual).toBeCloseTo(Math.pow(1.21, 365 / 731) - 1, 10)
    const short = computePerformance(pts, '2024-01-01', '2024-06-01')
    // `to` je na „posledním dni“ = 2024-01-01 → jediný den → null; 2. bod je až v 2026
    expect(short).toBeNull()
  })
})

describe('XIRR', () => {
  it('jediný vklad a výběr za rok = prostý výnos', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 }
    ])!
    expect(r).toBeCloseTo(0.1, 8)
  })

  it('několik toků: součet diskontovaných toků je nula', () => {
    const flows = [
      { date: '2020-01-01', amount: -1000 },
      { date: '2020-07-01', amount: -1000 },
      { date: '2021-01-01', amount: 2200 }
    ]
    const r = xirr(flows)!
    const npv = flows.reduce(
      (s, f) => s + f.amount / Math.pow(1 + r, daysBetween(flows[0].date, f.date) / 365),
      0
    )
    expect(npv).toBeCloseTo(0, 6)
    expect(r).toBeGreaterThan(0.1)
    expect(r).toBeLessThan(0.3)
  })

  it('ztráta dává záporné IRR', () => {
    const r = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 900 }
    ])!
    expect(r).toBeCloseTo(-0.1, 8)
  })

  it('bez kladného nebo záporného toku není řešení', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeNull()
    expect(
      xirr([
        { date: '2025-01-01', amount: -1000 },
        { date: '2026-01-01', amount: -5 }
      ])
    ).toBeNull()
  })

  it('IRR období z výkonu: pravidelné vklady, jednoduchý případ s 0 % trhem → IRR 0', () => {
    const pts: PerfPoint[] = [
      { date: '2025-01-01', value: 1000, flow: 1000 },
      { date: '2025-07-01', value: 2000, flow: 1000 },
      { date: '2026-01-01', value: 2000, flow: 0 }
    ]
    const r = computePerformance(pts, '2025-01-01', '2026-01-01')!
    expect(r.irr).toBeCloseTo(0, 6)
    expect(r.ttwror).toBeCloseTo(0, 10)
    expect(r.profit).toBe(0)
  })

  it('IRR je vyšší než TTWROR, když vklad předcházel růstu (načasování)', () => {
    const pts: PerfPoint[] = [
      { date: '2025-01-01', value: 1000, flow: 1000 },
      { date: '2025-01-02', value: 1000, flow: 0 },
      { date: '2025-07-01', value: 1000, flow: 0 },
      { date: '2025-07-02', value: 3000, flow: 2000 }, // velký vklad těsně před růstem
      { date: '2026-01-01', value: 3300, flow: 0 } // +10 %
    ]
    const r = computePerformance(pts, '2025-01-01', '2026-01-01')!
    expect(r.ttwror).toBeCloseTo(0.1, 10)
    expect(r.irr!).toBeGreaterThan(0.1) // kladný zisk, ale kapitál byl většinu času vyšší
  })
})

describe('resolvePeriod', () => {
  const first = '2018-06-12'
  const last = '2026-11-12'
  it('předvolby', () => {
    expect(resolvePeriod('1M', first, last)).toEqual({ from: '2026-10-12', to: last })
    expect(resolvePeriod('3M', first, last)).toEqual({ from: '2026-08-12', to: last })
    expect(resolvePeriod('YTD', first, last)).toEqual({ from: '2025-12-31', to: last })
    expect(resolvePeriod('1R', first, last)).toEqual({ from: '2025-11-12', to: last })
    expect(resolvePeriod('3R', first, last)).toEqual({ from: '2023-11-12', to: last })
    expect(resolvePeriod('5R', first, last)).toEqual({ from: '2021-11-12', to: last })
  })
  it('kalendářní rok: uplynulý končí 31. 12., letošní posledním dnem', () => {
    expect(resolvePeriod('Y2024', first, last)).toEqual({ from: '2023-12-31', to: '2024-12-31' })
    expect(resolvePeriod('Y2026', first, last)).toEqual({ from: '2025-12-31', to: last })
  })
  it('vlastní období a Max', () => {
    expect(resolvePeriod('CUSTOM', first, last, { from: '2025-01-01', to: '2025-06-30' })).toEqual({
      from: '2025-01-01',
      to: '2025-06-30'
    })
    expect(resolvePeriod('MAX', first, last)).toEqual({ from: '2018-06-11', to: last })
  })
})

describe('performanceByYear + toPerfPoints', () => {
  const series: SeriesPoint[] = [
    { date: '2024-12-30', value: 1000, invested: 1000, valueCzk: 25000, investedCzk: 25000 },
    { date: '2024-12-31', value: 1100, invested: 1000, valueCzk: 27500, investedCzk: 25000 },
    { date: '2025-01-01', value: 1100, invested: 1000, valueCzk: 27500, investedCzk: 25000 },
    { date: '2025-12-31', value: 2420, invested: 2000, valueCzk: 60500, investedCzk: 50000 }
  ]

  it('toPerfPoints dopočítá denní toky z kumulativního vloženo', () => {
    const p = toPerfPoints(series, 'EUR')!
    expect(p.map((x) => x.flow)).toEqual([1000, 0, 0, 1000])
    expect(toPerfPoints(series, 'CZK')!.map((x) => x.flow)).toEqual([25000, 0, 0, 25000])
  })

  it('chybějící kurz ČNB → CZK není k dispozici', () => {
    expect(toPerfPoints([{ ...series[0], valueCzk: null }], 'CZK')).toBeNull()
  })

  it('řádek pro každý rok; hodnoty sedí s ručním výpočtem', () => {
    const rows = performanceByYear(toPerfPoints(series, 'EUR')!)
    expect(rows.map((r) => r.year)).toEqual([2024, 2025])
    expect(rows[0].result!.ttwror).toBeCloseTo(0.1, 10)
    // 2025: začátek 1100 (31. 12. 2024), vklad 1000, konec 2420 → zisk 320; výnos (2420−1000)/1100 − 1
    const y25 = rows[1].result!
    expect(y25.startValue).toBe(1100)
    expect(y25.profit).toBeCloseTo(320, 10)
    expect(y25.ttwror).toBeCloseTo((2420 - 1000) / 1100 - 1, 10)
  })
})
