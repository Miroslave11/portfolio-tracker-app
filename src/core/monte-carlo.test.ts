import { describe, expect, it } from 'vitest'
import { futureValue, monthsToReach, projectSeries } from './goal-projection'
import {
  makeRandom,
  monthAtProbability,
  monthIndexAtYearEnd,
  probabilityByYearEnd,
  quantileSorted,
  simulateGoal,
  type MonteCarloInput
} from './monte-carlo'

const BASE: MonteCarloInput = {
  start: 80_000,
  monthly: 1500,
  annualReturn: 0.07,
  volatility: 0.15,
  target: 400_000,
  runs: 4000,
  seed: 7
}

describe('makeRandom', () => {
  it('je opakovatelný a v intervalu [0, 1)', () => {
    const a = makeRandom(42)
    const b = makeRandom(42)
    for (let i = 0; i < 1000; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })
})

describe('quantileSorted', () => {
  it('interpoluje lineárně', () => {
    expect(quantileSorted([1, 2, 3, 4, 5], 0.5)).toBe(3)
    expect(quantileSorted([0, 10], 0.25)).toBe(2.5)
    expect(quantileSorted([7], 0.9)).toBe(7)
  })
})

describe('monthIndexAtYearEnd / probabilityByYearEnd', () => {
  it('počítá měsíce do konce roku od dneška', () => {
    expect(monthIndexAtYearEnd('2026-11-13', 2026)).toBe(1)
    expect(monthIndexAtYearEnd('2026-11-13', 2027)).toBe(13)
    expect(monthIndexAtYearEnd('2026-12-05', 2026)).toBe(0)
    expect(monthIndexAtYearEnd('2026-01-31', 2026)).toBe(11)
    expect(monthIndexAtYearEnd('2026-11-13', 2025)).toBeLessThan(0)
  })

  it('vrací podíl dosažených scénářů, mimo horizont null', () => {
    const r = simulateGoal(BASE)
    const year = 2026 + Math.floor(r.months / 12)
    const p = probabilityByYearEnd(r, '2026-11-13', 2030)
    expect(p).toBe(r.reachedBy[monthIndexAtYearEnd('2026-11-13', 2030)])
    expect(probabilityByYearEnd(r, '2026-11-13', year + 5)).toBeNull()
    expect(probabilityByYearEnd(r, '2026-11-13', 2020)).toBeNull()
  })
})

describe('simulateGoal', () => {
  it('nulová kolísavost = deterministická projekce z P11', () => {
    const r = simulateGoal({ ...BASE, volatility: 0, runs: 10 })
    const det = projectSeries(BASE.start, BASE.monthly, BASE.annualReturn, r.months)
    r.bands.p50.forEach((v, i) => expect(v / det[i]).toBeCloseTo(1, 5))
    r.bands.p10.forEach((v, i) => expect(v / det[i]).toBeCloseTo(1, 5))
    const months = monthsToReach(BASE.start, BASE.monthly, BASE.annualReturn, BASE.target)!
    expect(monthAtProbability(r, 0.5)).toBe(months)
    expect(r.reachedBy[months - 1]).toBe(0)
    expect(r.reachedBy[months]).toBe(1)
  })

  it('průměr scénářů odpovídá vzorci budoucí hodnoty', () => {
    // Střední hodnotu ověřujeme přes průměr, ne medián: log-normální rozdělení je zešikmené.
    const months = 120
    const r = simulateGoal({ ...BASE, target: 1e12, runs: 20_000, maxMonths: months, seed: 3 })
    expect(r.months).toBe(months)
    for (const i of [12, 60, 120]) {
      const expected = futureValue(BASE.start, BASE.monthly, BASE.annualReturn, i)
      expect(Math.abs(r.mean[i] / expected - 1)).toBeLessThan(0.01)
    }
    // Medián je pod průměrem (zešikmení doprava).
    expect(r.bands.p50[months]).toBeLessThan(r.mean[months])
  })

  it('percentily jsou seřazené a pravděpodobnosti neklesají', () => {
    const r = simulateGoal(BASE)
    for (let i = 0; i <= r.months; i++) {
      expect(r.bands.p10[i]).toBeLessThanOrEqual(r.bands.p25[i])
      expect(r.bands.p25[i]).toBeLessThanOrEqual(r.bands.p50[i])
      expect(r.bands.p50[i]).toBeLessThanOrEqual(r.bands.p75[i])
      expect(r.bands.p75[i]).toBeLessThanOrEqual(r.bands.p90[i])
    }
    for (let i = 1; i < r.reachedBy.length; i++) {
      expect(r.reachedBy[i]).toBeGreaterThanOrEqual(r.reachedBy[i - 1])
    }
    const p50 = monthAtProbability(r, 0.5)!
    const p80 = monthAtProbability(r, 0.8)!
    const p90 = monthAtProbability(r, 0.9)!
    expect(p50).toBeLessThan(p80)
    expect(p80).toBeLessThan(p90)
    // Pásma končí 2 roky po dosažení cíle v 90 % scénářů.
    expect(r.months).toBe(p90 + 24)
  })

  it('stejné semínko = stejný výsledek, jiné semínko = trochu jiný', () => {
    const a = simulateGoal(BASE)
    const b = simulateGoal(BASE)
    const c = simulateGoal({ ...BASE, seed: 8 })
    expect(a).toEqual(b)
    expect(monthAtProbability(c, 0.5)).not.toBeNull()
    expect(Math.abs(monthAtProbability(c, 0.5)! - monthAtProbability(a, 0.5)!)).toBeLessThanOrEqual(
      3
    )
  })

  it('vyšší kolísavost rozšíří pásmo', () => {
    const lo = simulateGoal({ ...BASE, volatility: 0.08 })
    const hi = simulateGoal({ ...BASE, volatility: 0.25 })
    const i = 60
    expect(hi.bands.p90[i] - hi.bands.p10[i]).toBeGreaterThan(lo.bands.p90[i] - lo.bands.p10[i])
  })

  it('cíl už splněný = 100 % hned; nedosažitelný = 0 %', () => {
    const done = simulateGoal({ ...BASE, start: 500_000, runs: 100 })
    expect(done.reachedBy[0]).toBe(1)
    expect(monthAtProbability(done, 0.9)).toBe(0)
    const never = simulateGoal({
      ...BASE,
      monthly: 0,
      annualReturn: -0.2,
      volatility: 0.01,
      runs: 100,
      maxMonths: 120
    })
    expect(never.neverReached).toBe(1)
    expect(monthAtProbability(never, 0.5)).toBeNull()
    expect(never.months).toBe(120)
  })
})
