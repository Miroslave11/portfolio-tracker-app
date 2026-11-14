import { describe, expect, it } from 'vitest'
import { DEFAULT_GOAL, goalSchema, settingsPatchSchema, settingsSchema } from '../shared/settings'
import {
  formatDuration,
  futureValue,
  monthlyRate,
  monthsToReach,
  projectSeries,
  scenarios
} from './goal-projection'

describe('monthlyRate', () => {
  it('12 měsíců složeně dá přesně roční výnos', () => {
    expect(Math.pow(1 + monthlyRate(0.07), 12)).toBeCloseTo(1.07, 12)
    expect(monthlyRate(0)).toBe(0)
  })
})

describe('futureValue / projectSeries', () => {
  it('bez vkladů a bez výnosu se hodnota nemění; jen vklady se sčítají', () => {
    expect(futureValue(1000, 0, 0, 24)).toBe(1000)
    expect(futureValue(1000, 100, 0, 24)).toBe(3400)
  })

  it('jen výnos: 1000 při 7 % ročně po 10 letech = 1000 × 1,07^10', () => {
    expect(futureValue(1000, 0, 0.07, 120)).toBeCloseTo(1000 * Math.pow(1.07, 10), 8)
  })

  it('ručně spočítaný příklad: start 0, vklad 100, výnos 12 % ročně, 1 rok', () => {
    // r = 1,12^(1/12) − 1 ≈ 0,009489; FV = 100 × ((1+r)^12 − 1) / r = 100 × 0,12 / r
    const r = Math.pow(1.12, 1 / 12) - 1
    expect(futureValue(0, 100, 0.12, 12)).toBeCloseTo((100 * 0.12) / r, 8)
    expect(futureValue(0, 100, 0.12, 12)).toBeGreaterThan(1200) // víc než 12 × 100
  })

  it('řada po měsících sedí se vzorcem a začíná dneškem', () => {
    const s = projectSeries(5000, 250, 0.06, 36)
    expect(s).toHaveLength(37)
    expect(s[0]).toBe(5000)
    for (const n of [1, 12, 36]) expect(s[n]).toBeCloseTo(futureValue(5000, 250, 0.06, n), 6)
  })

  it('záporný výnos hodnotu snižuje', () => {
    expect(futureValue(1000, 0, -0.1, 12)).toBeCloseTo(900, 8)
  })
})

describe('monthsToReach', () => {
  it('už splněno → 0', () => {
    expect(monthsToReach(10_000, 0, 0.05, 10_000)).toBe(0)
    expect(monthsToReach(20_000, 100, 0.05, 10_000)).toBe(0)
  })

  it('bez výnosu: cíl / vklad zaokrouhleno nahoru', () => {
    expect(monthsToReach(0, 100, 0, 1000)).toBe(10)
    expect(monthsToReach(50, 100, 0, 1000)).toBe(10) // 50 + 10×100 = 1050
    expect(monthsToReach(50, 100, 0, 950)).toBe(9)
  })

  it('nejmenší n, pro které je hodnota ≥ cíl (hranice přesně)', () => {
    const target = 100_000
    const n = monthsToReach(20_000, 800, 0.07, target)!
    expect(futureValue(20_000, 800, 0.07, n)).toBeGreaterThanOrEqual(target)
    expect(futureValue(20_000, 800, 0.07, n - 1)).toBeLessThan(target)
  })

  it('vyšší vklad nebo výnos cíl přiblíží, nižší oddálí', () => {
    const base = monthsToReach(30_000, 1000, 0.07, 400_000)!
    expect(monthsToReach(30_000, 1500, 0.07, 400_000)!).toBeLessThan(base)
    expect(monthsToReach(30_000, 1000, 0.1, 400_000)!).toBeLessThan(base)
    expect(monthsToReach(30_000, 500, 0.07, 400_000)!).toBeGreaterThan(base)
    expect(monthsToReach(30_000, 1000, 0.03, 400_000)!).toBeGreaterThan(base)
  })

  it('nedosažitelné → null (nulový vklad a výnos; nebo za víc než 50 let)', () => {
    expect(monthsToReach(1000, 0, 0, 5000)).toBeNull()
    expect(monthsToReach(1000, 1, 0, 1_000_000)).toBeNull()
  })
})

describe('scenarios', () => {
  it('opatrně je později než základ a ten později než optimisticky; datum = dnes + měsíce', () => {
    const s = scenarios(30_000, 1000, 0.07, 400_000, '2026-11-12')
    expect(s.map((x) => x.id)).toEqual(['conservative', 'base', 'optimistic'])
    s.map((x) => x.annualReturn).forEach((v, i) => expect(v).toBeCloseTo([0.04, 0.07, 0.1][i], 10))
    const [c, b, o] = s.map((x) => x.months!)
    expect(c).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(o)
    expect(s[1].date).toBe(addMonthsRef('2026-11-12', b))
  })

  it('nedosažitelný scénář má months i date null', () => {
    const s = scenarios(0, 0, 0, 1_000_000, '2026-11-12')
    expect(s.every((x) => x.months === null || x.annualReturn > 0)).toBe(true)
    expect(s[0].months).toBeNull()
    expect(s[0].date).toBeNull()
  })
})

function addMonthsRef(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + n, d))
  return date.toISOString().slice(0, 10)
}

describe('formatDuration', () => {
  it('české tvary', () => {
    expect(formatDuration(0)).toBe('hned')
    expect(formatDuration(1)).toBe('1 měsíc')
    expect(formatDuration(3)).toBe('3 měsíce')
    expect(formatDuration(11)).toBe('11 měsíců')
    expect(formatDuration(12)).toBe('1 rok')
    expect(formatDuration(30)).toBe('2 roky a 6 měsíců')
    expect(formatDuration(77)).toBe('6 let a 5 měsíců')
    expect(formatDuration(36)).toBe('3 roky')
  })
})

describe('nastavení cíle', () => {
  it('výchozí je 5 mil. Kč, 7 % a 1 000 € měsíčně; poškozená hodnota se nahradí výchozí', () => {
    expect(settingsSchema.parse({}).goal).toEqual(DEFAULT_GOAL)
    expect(settingsSchema.parse({ goal: { targetCzk: -5 } }).goal).toEqual(DEFAULT_GOAL)
    const g = { targetCzk: 5_000_000, monthlyEur: 2000, annualReturn: 0.05 }
    expect(settingsSchema.parse({ goal: g }).goal).toEqual(g)
  })
  it('patch: striktní validace', () => {
    expect(settingsPatchSchema.parse({ goal: DEFAULT_GOAL })).toEqual({ goal: DEFAULT_GOAL })
    expect(() =>
      settingsPatchSchema.parse({ goal: { ...DEFAULT_GOAL, annualReturn: 2 } })
    ).toThrow()
    expect(() => settingsPatchSchema.parse({ goal: { ...DEFAULT_GOAL, monthlyEur: -1 } })).toThrow()
    expect(() => goalSchema.parse({ ...DEFAULT_GOAL, extra: 1 })).toThrow()
  })
})
