import { describe, expect, it } from 'vitest'
import {
  allocateContribution,
  computeRebalance,
  monthsToTarget,
  roundToTotal,
  type RebalanceTarget
} from './rebalance'

const values = (o: Record<string, number>): Map<string, number> => new Map(Object.entries(o))
const T = (o: Record<string, number>): RebalanceTarget[] =>
  Object.entries(o).map(([group, share]) => ({ group, share }))

describe('allocateContribution', () => {
  it('deficit větší než vklad: dokupuje se nejvíc podvážený, pak se srovnávají', () => {
    // celkem 10 000 + 1 000; cíl 50/30/20 → A je nad cílem, B a C pod
    const v = values({ A: 6000, B: 2500, C: 1500 })
    const b = allocateContribution(v, T({ A: 0.5, B: 0.3, C: 0.2 }), 1000)
    expect(b.get('A')).toBe(0)
    // poměr v/t: B 8 333, C 7 500 → nejdřív C až na 8 333 (C = 1 666,7, tj. +166,7),
    // zbytek 833,3 rozdělit B:C v poměru 3:2
    expect(b.get('C')! + b.get('B')!).toBeCloseTo(1000, 9)
    expect((v.get('B')! + b.get('B')!) / 0.3).toBeCloseTo((v.get('C')! + b.get('C')!) / 0.2, 6)
  })

  it('vklad stačí na všechno: skupiny pod cílem se dorovnají přesně na cíl, zbytek podle cílů', () => {
    // A 1 000 (cíl 50 %), B 0 (cíl 50 %), vklad 3 000 → celkem 4 000, každá 2 000
    const b = allocateContribution(values({ A: 1000, B: 0 }), T({ A: 0.5, B: 0.5 }), 3000)
    expect(b.get('A')).toBeCloseTo(1000, 9)
    expect(b.get('B')).toBeCloseTo(2000, 9)
  })

  it('nikdy záporný nákup, součet = vklad; skupina s nulovým cílem nic', () => {
    const cases: [Record<string, number>, Record<string, number>, number][] = [
      [{ A: 9000, B: 100, C: 900 }, { A: 0.2, B: 0.4, C: 0.4 }, 1500],
      [{ A: 0, B: 0 }, { A: 0.7, B: 0.3 }, 1000],
      [{ A: 5000, X: 5000 }, { A: 0.6, B: 0.4 }, 777],
      [{ A: 100 }, { A: 1 }, 50]
    ]
    for (const [v, t, c] of cases) {
      const b = allocateContribution(values(v), T(t), c)
      expect([...b.values()].every((x) => x >= 0)).toBe(true)
      expect([...b.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(c, 6)
      expect(b.has('X')).toBe(false)
    }
  })

  it('cíle se normalizují (součet 80 % se bere jako 100 %)', () => {
    const a = allocateContribution(values({ A: 0, B: 0 }), T({ A: 0.4, B: 0.4 }), 1000)
    expect(a.get('A')).toBeCloseTo(500, 9)
  })

  it('bez cílů nebo bez vkladu nic', () => {
    expect([...allocateContribution(values({ A: 1 }), [], 100).values()]).toEqual([])
    expect(allocateContribution(values({ A: 1 }), T({ A: 1 }), 0).get('A')).toBe(0)
  })
})

describe('roundToTotal', () => {
  it('zaokrouhlí na celá eura a součet přesně sedí', () => {
    expect(roundToTotal([333.33, 333.33, 333.34], 1000)).toEqual([333, 333, 334])
    expect(roundToTotal([166.7, 833.3], 1000)).toEqual([167, 833])
    expect(roundToTotal([0, 0.4, 999.6], 1000)).toEqual([0, 0, 1000])
    expect(roundToTotal([12.5, 37.5], 50, 10)).toEqual([10, 40])
  })
})

describe('computeRebalance', () => {
  it('řádky s podílem, odchylkou, nákupem a podílem po nákupu; součet nákupů = vklad', () => {
    const rows = computeRebalance(
      values({ 'S&P 500': 5530, 'MSCI World': 2210, 'Nasdaq 100': 1600, 'World ex-USA': 660 }),
      T({ 'S&P 500': 0.45, 'MSCI World': 0.3, 'Nasdaq 100': 0.15, 'World ex-USA': 0.1 }),
      1500
    )
    expect(rows.map((r) => r.group)).toEqual([
      'S&P 500',
      'MSCI World',
      'Nasdaq 100',
      'World ex-USA'
    ])
    const sp = rows[0]
    expect(sp.share).toBeCloseTo(0.553, 9)
    expect(sp.deviation).toBeCloseTo(0.103, 9)
    expect(sp.buy).toBe(0)
    expect(rows.reduce((s, r) => s + r.buy, 0)).toBe(1500)
    expect(rows.every((r) => Number.isInteger(r.buy) && r.buy >= 0)).toBe(true)
    // po nákupu jsou podvážené indexy blíž cíli
    const world = rows[1]
    expect(Math.abs(world.shareAfter - 0.3)).toBeLessThan(Math.abs(world.share - 0.3))
  })

  it('skupina bez cíle se ukáže s cílem 0 a bez nákupu; cíl bez pozice s nákupem', () => {
    const rows = computeRebalance(values({ A: 1000, X: 500 }), T({ A: 0.5, B: 0.5 }), 500)
    const x = rows.find((r) => r.group === 'X')!
    expect(x.target).toBe(0)
    expect(x.buy).toBe(0)
    expect(rows.find((r) => r.group === 'B')!.buy).toBe(500)
  })
})

describe('monthsToTarget', () => {
  it('počet měsíců do tolerance 1 p. b. (bez pohybu kurzů)', () => {
    const v = values({ A: 6000, B: 4000 })
    const t = T({ A: 0.5, B: 0.5 })
    // každý měsíc 1 000 do B: po m měsících B = 4 000 + 1 000 m, celkem 10 000 + 1 000 m
    // A/celkem ≤ 0,51 → 6 000 ≤ 0,51 (10 000 + 1 000 m) → m ≥ 1,77 → 2 měsíce
    expect(monthsToTarget(v, t, 1000)).toBe(2)
    expect(monthsToTarget(values({ A: 5000, B: 5000 }), t, 1000)).toBe(0)
  })

  it('bez vkladu a mimo toleranci → null; velmi pomalé → null', () => {
    expect(monthsToTarget(values({ A: 6000, B: 4000 }), T({ A: 0.5, B: 0.5 }), 0)).toBeNull()
    expect(
      monthsToTarget(values({ A: 1_000_000, B: 0 }), T({ A: 0.1, B: 0.9 }), 10, 0.01, 24)
    ).toBeNull()
  })
})
