import { describe, expect, it } from 'vitest'
import type { PricePoint } from '../shared/prices'
import { benchmarkInCzk, simulateBenchmark } from './benchmark'
import { computePerformance, type PerfPoint } from './performance'

const pts = (rows: [string, number, number][]): PerfPoint[] =>
  rows.map(([date, value, flow]) => ({ date, value, flow }))

describe('simulateBenchmark', () => {
  // benchmark: 100 → 110 → 121 (každý den +10 %)
  const prices: PricePoint[] = [
    ['2026-01-01', 100],
    ['2026-01-02', 110],
    ['2026-01-03', 121]
  ]

  it('vklady se hned nakoupí; hodnota roste s kurzem', () => {
    const real = pts([
      ['2026-01-01', 1000, 1000],
      ['2026-01-02', 1000, 0],
      ['2026-01-03', 2000, 1000]
    ])
    const s = simulateBenchmark(real, prices)
    // den 1: 10 ks; den 2: 10 × 110 = 1 100; den 3: +1 000/121 ks → 10 × 121 + 1 000 = 2 210
    expect(s.points.map((p) => Number(p.value.toFixed(6)))).toEqual([1000, 1100, 2210])
    expect(s.points.map((p) => p.flow)).toEqual([1000, 0, 1000])
    expect(s.daysWithoutPrice).toBe(0)
  })

  it('výběr prodá kusy v hodnotě výběru', () => {
    const s = simulateBenchmark(
      pts([
        ['2026-01-01', 1000, 1000],
        ['2026-01-02', 900, -100]
      ]),
      prices
    )
    // 10 ks; prodej 100/110 ks → (10 − 0,909) × 110 = 1 000
    expect(s.points[1].value).toBeCloseTo(1000, 8)
  })

  it('víkend: použije se poslední kurz', () => {
    const s = simulateBenchmark(
      pts([
        ['2026-01-03', 500, 500],
        ['2026-01-04', 500, 0]
      ]),
      prices
    )
    expect(s.points[1].value).toBeCloseTo(500, 8)
  })

  it('dokud benchmark nemá kurz, peníze čekají jako hotovost', () => {
    const late: PricePoint[] = [['2026-01-03', 50]]
    const s = simulateBenchmark(
      pts([
        ['2026-01-01', 100, 100],
        ['2026-01-02', 100, 0],
        ['2026-01-03', 300, 200]
      ]),
      late
    )
    expect(s.points.map((p) => p.value)).toEqual([100, 100, 300])
    expect(s.daysWithoutPrice).toBe(2)
    expect(s.firstPriceDate).toBe('2026-01-03')
  })

  it('TTWROR benchmarku = výkon samotného ETF (nezávisle na vkladech)', () => {
    const real = pts([
      ['2026-01-01', 1000, 1000],
      ['2026-01-02', 1000, 0],
      ['2026-01-03', 5000, 4000]
    ])
    const s = simulateBenchmark(real, prices)
    const perf = computePerformance(s.points, '2026-01-01', '2026-01-03')!
    expect(perf.ttwror).toBeCloseTo(0.21, 10) // 100 → 121
  })

  it('stejný ETF jako jediná pozice dá stejné hodnoty jako skutečnost', () => {
    // skutečné portfolio = vše v ETF s cenami prices, vklad 1 000 na začátku
    const real = pts([
      ['2026-01-01', 1000, 1000],
      ['2026-01-02', 1100, 0],
      ['2026-01-03', 1210, 0]
    ])
    expect(simulateBenchmark(real, prices).points.map((p) => p.value)).toEqual(
      real.map((p) => p.value)
    )
  })
})

describe('benchmarkInCzk', () => {
  it('hodnota kurzem dne, toky ze skutečného portfolia v Kč', () => {
    const eur = pts([
      ['2026-01-01', 100, 100],
      ['2026-01-02', 110, 0]
    ])
    const czkFlows = pts([
      ['2026-01-01', 2500, 2500],
      ['2026-01-02', 2700, 0]
    ])
    const r = benchmarkInCzk(eur, czkFlows, (d) => (d === '2026-01-01' ? 25 : 24))
    expect(r).toEqual([
      { date: '2026-01-01', value: 2500, flow: 2500 },
      { date: '2026-01-02', value: 2640, flow: 0 }
    ])
  })
})
