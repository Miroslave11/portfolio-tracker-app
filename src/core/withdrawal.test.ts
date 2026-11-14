import { describe, expect, it } from 'vitest'
import { realRate } from './inflation'
import {
  maxMonthlyWithdrawal,
  monthsLasting,
  perpetualMonthlyWithdrawal,
  simulateWithdrawal
} from './withdrawal'

const C = 5_000_000

describe('maxMonthlyWithdrawal', () => {
  it('nulový výnos i inflace = kapitál / počet měsíců', () => {
    expect(maxMonthlyWithdrawal(C, 0, 0, 25)).toBeCloseTo(C / 300, 6)
  })

  it('bez inflace = klasická anuita (měsíční splátka)', () => {
    const r = Math.pow(1.05, 1 / 12) - 1
    const n = 30 * 12
    const annuity = (C * r) / (1 - Math.pow(1 + r, -n))
    expect(maxMonthlyWithdrawal(C, 0.05, 0, 30)).toBeCloseTo(annuity, 4)
  })

  it('výnos = inflace: čerpání v reálných hodnotách se dělí rovnoměrně', () => {
    // g = 1 → součet = počet let; PV jednoho roku = w · a12.
    const w = maxMonthlyWithdrawal(C, 0.03, 0.03, 20)
    const sim = simulateWithdrawal(C, w, 0.03, 0.03, 240)
    expect(sim.capital[240]).toBeCloseTo(0, -1)
  })

  it('simulace s tímto čerpáním skončí přesně na nule po N letech', () => {
    for (const years of [10, 25, 40]) {
      const w = maxMonthlyWithdrawal(C, 0.05, 0.025, years)
      const sim = simulateWithdrawal(C, w, 0.05, 0.025, years * 12)
      expect(Math.abs(sim.capital[years * 12])).toBeLessThan(1)
      // O korunu víc a kapitál dojde o měsíc dřív.
      expect(monthsLasting(C, w * 1.001, 0.05, 0.025)).toBe(years * 12 - 1)
    }
  })

  it('kratší doba = vyšší čerpání; nulový kapitál = 0', () => {
    expect(maxMonthlyWithdrawal(C, 0.05, 0.025, 25)).toBeGreaterThan(
      maxMonthlyWithdrawal(C, 0.05, 0.025, 50)
    )
    expect(maxMonthlyWithdrawal(0, 0.05, 0.025, 25)).toBe(0)
  })
})

describe('perpetualMonthlyWithdrawal', () => {
  it('navždy ≈ kapitál × reálný výnos', () => {
    const w = perpetualMonthlyWithdrawal(C, 0.05, 0.025)!
    const real = realRate(0.05, 0.025)
    expect((w * 12) / (C * real)).toBeGreaterThan(0.99)
    expect((w * 12) / (C * real)).toBeLessThan(1.01)
  })

  it('kapitál si drží kupní sílu: na začátku každého roku = C × (1 + inflace)^rok', () => {
    const w = perpetualMonthlyWithdrawal(C, 0.06, 0.02)!
    const sim = simulateWithdrawal(C, w, 0.06, 0.02, 600)
    expect(sim.forever).toBe(true)
    for (const year of [1, 10, 50]) {
      expect(sim.capital[year * 12] / (C * Math.pow(1.02, year))).toBeCloseTo(1, 9)
    }
  })

  it('je limitou čerpání pro dlouhé doby', () => {
    const p = perpetualMonthlyWithdrawal(C, 0.05, 0.025)!
    expect(maxMonthlyWithdrawal(C, 0.05, 0.025, 500)).toBeCloseTo(p, 0)
    expect(maxMonthlyWithdrawal(C, 0.05, 0.025, 50)).toBeGreaterThan(p)
  })

  it('výnos ≤ inflace → navždy nejde', () => {
    expect(perpetualMonthlyWithdrawal(C, 0.02, 0.025)).toBeNull()
    expect(perpetualMonthlyWithdrawal(C, 0.03, 0.03)).toBeNull()
  })
})

describe('simulateWithdrawal / monthsLasting', () => {
  it('nulový výnos a inflace: vydrží přesně kapitál / čerpání', () => {
    expect(monthsLasting(1200, 100, 0, 0)).toBe(12)
    expect(monthsLasting(1250, 100, 0, 0)).toBe(12)
    expect(monthsLasting(1199, 100, 0, 0)).toBe(11)
  })

  it('čerpání se zvyšuje o inflaci jednou ročně', () => {
    // 0 % výnos, 10 % inflace: rok 1 = 12 × 100, rok 2 = 12 × 110 → 2 520 vydrží přesně 2 roky.
    const sim = simulateWithdrawal(2520, 100, 0, 0.1, 30)
    expect(sim.monthsLasting).toBe(24)
    expect(sim.capital[12]).toBeCloseTo(1320, 9)
    expect(sim.capital[24]).toBeCloseTo(0, 9)
  })

  it('pod udržitelnou částkou vydrží navždy, nad ní dojde', () => {
    const p = perpetualMonthlyWithdrawal(C, 0.05, 0.025)!
    expect(simulateWithdrawal(C, p * 0.99, 0.05, 0.025).forever).toBe(true)
    expect(monthsLasting(C, p * 0.99, 0.05, 0.025)).toBeNull()
    const m = monthsLasting(C, p * 1.2, 0.05, 0.025)
    expect(m).not.toBeNull()
    expect(m!).toBeGreaterThan(12 * 40)
  })

  it('20 000 Kč z 5 mil. při 5 % a 2,5 %: vydrží 29–30 let a souhlasí se vzorcem', () => {
    const m = monthsLasting(C, 20_000, 0.05, 0.025)!
    expect(m / 12).toBeGreaterThan(29)
    expect(m / 12).toBeLessThan(30)
    // Čerpání pro 29 let je vyšší než 20 000, pro 30 let nižší.
    expect(maxMonthlyWithdrawal(C, 0.05, 0.025, 29)).toBeGreaterThan(20_000)
    expect(maxMonthlyWithdrawal(C, 0.05, 0.025, 30)).toBeLessThan(20_000)
  })
})
