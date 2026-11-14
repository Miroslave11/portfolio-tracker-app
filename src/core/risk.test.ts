import { describe, expect, it } from 'vitest'
import { addDays } from './date'
import { computeRisk } from './risk'

/** Křivka z hodnot indexu (1 = začátek) po dnech od `start`. */
const curve = (start: string, values: number[]): { date: string; pct: number }[] =>
  values.map((v, i) => ({ date: addDays(start, i), pct: v - 1 }))

describe('propady', () => {
  // 1 → 1,2 (vrchol) → 0,9 (dno, −25 %) → 1,2 (zotavení) → 1,3 → 1,17 (−10 %, neuzavřený)
  const r = computeRisk(curve('2026-01-01', [1, 1.1, 1.2, 1.0, 0.9, 1.05, 1.2, 1.3, 1.17]))

  it('největší propad, jeho data a doba zotavení', () => {
    expect(r.maxDrawdown).toEqual({
      peakDate: '2026-01-03',
      troughDate: '2026-01-05',
      recoveryDate: '2026-01-07',
      depth: 0.9 / 1.2 - 1,
      recoveryDays: 2
    })
  })

  it('seznam propadů (nejhlubší první); neuzavřený propad nemá zotavení', () => {
    expect(r.episodes.map((e) => [Number(e.depth.toFixed(4)), e.recoveryDate])).toEqual([
      [-0.25, '2026-01-07'],
      [-0.1, null]
    ])
    expect(r.currentDrawdown).toBeCloseTo(-0.1, 10)
  })

  it('denní propad od vrcholu', () => {
    expect(r.drawdown.map((d) => Number(d.dd.toFixed(4)))).toEqual([
      0, 0, 0, -0.1667, -0.25, -0.125, 0, 0, -0.1
    ])
  })

  it('malé propady pod hranicí se do seznamu nezapočítají; stále rostoucí křivka nemá propad', () => {
    const small = computeRisk(curve('2026-01-01', [1, 1.01, 1.0, 1.02]), { minDepth: 0.02 })
    expect(small.episodes).toEqual([])
    expect(small.maxDrawdown!.depth).toBeCloseTo(1 / 1.01 - 1, 10)
    const up = computeRisk(curve('2026-01-01', [1, 1.1, 1.2]))
    expect(up.maxDrawdown).toBeNull()
    expect(up.currentDrawdown).toBe(0)
  })

  it('topN omezí počet', () => {
    const many = computeRisk(curve('2026-01-01', [1, 0.9, 1, 0.8, 1, 0.85, 1, 0.95, 1]), {
      topN: 2
    })
    expect(many.episodes.map((e) => Number(e.depth.toFixed(2)))).toEqual([-0.2, -0.15])
  })
})

describe('měsíční výnosy a volatilita', () => {
  // konec měsíců: start 1 (15. 1.), leden 1,0 · únor 1,1 · březen 0,99 · duben 1,1 · květen 1,1
  const points: { date: string; pct: number }[] = [
    { date: '2026-01-15', pct: 0 },
    { date: '2026-01-31', pct: 0 },
    { date: '2026-02-28', pct: 0.1 },
    { date: '2026-03-31', pct: -0.01 },
    { date: '2026-04-30', pct: 0.1 },
    { date: '2026-05-31', pct: 0.1 }
  ]
  const r = computeRisk(points)

  it('první (částečný) měsíc se nepočítá; nejhorší a nejlepší měsíc', () => {
    expect(r.months).toBe(4)
    expect(r.worstMonth!.key).toBe('2026-03')
    expect(r.worstMonth!.ret).toBeCloseTo(0.99 / 1.1 - 1, 10) // −10 %
    expect(r.bestMonth!.key).toBe('2026-04')
    expect(r.bestMonth!.ret).toBeCloseTo(1.1 / 0.99 - 1, 10)
  })

  it('volatilita = výběrová směrodatná odchylka měsíčních výnosů × √12', () => {
    const rets = [0.1, 0.99 / 1.1 - 1, 1.1 / 0.99 - 1, 0]
    const mean = rets.reduce((s, x) => s + x, 0) / 4
    const sd = Math.sqrt(rets.reduce((s, x) => s + (x - mean) ** 2, 0) / 3)
    expect(r.volatility).toBeCloseTo(sd * Math.sqrt(12), 10)
  })

  it('málo měsíců → volatilita null; krátká křivka → prázdný výsledek', () => {
    expect(computeRisk(points.slice(0, 3)).volatility).toBeNull()
    expect(computeRisk([{ date: '2026-01-01', pct: 0 }]).maxDrawdown).toBeNull()
  })
})

describe('nejhorší rok', () => {
  it('poslední hodnota roku vůči konci předchozího roku', () => {
    const r = computeRisk([
      { date: '2021-12-31', pct: 0 },
      { date: '2022-06-30', pct: -0.1 },
      { date: '2022-12-31', pct: -0.15 },
      { date: '2023-12-31', pct: 0.02 }
    ])
    expect(r.worstYear!.key).toBe('2022')
    expect(r.worstYear!.ret).toBeCloseTo(-0.15, 10)
  })
})

describe('nejhorší rok – jen celé roky', () => {
  it('rok, který v období nezačíná od ledna, se nepočítá', () => {
    const r = computeRisk([
      { date: '2025-11-13', pct: 0 },
      { date: '2025-12-31', pct: -0.05 },
      { date: '2026-06-30', pct: 0.1 }
    ])
    expect(r.worstYear!.key).toBe('2026')
    const short = computeRisk([
      { date: '2026-02-01', pct: 0 },
      { date: '2026-03-01', pct: -0.05 }
    ])
    expect(short.worstYear).toBeNull()
  })
})
