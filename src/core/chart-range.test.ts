import { describe, expect, it } from 'vitest'
import { sliceByRange, yearsBack } from './chart-range'

const days = (from: string, count: number): { date: string }[] =>
  Array.from({ length: count }, (_, i) => {
    const d = new Date(`${from}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + i)
    return { date: d.toISOString().slice(0, 10) }
  })

describe('yearsBack', () => {
  it('odečte roky', () => {
    expect(yearsBack('2026-11-12', 1)).toBe('2025-11-12')
    expect(yearsBack('2026-11-12', 5)).toBe('2021-11-12')
  })

  it('29. února v nepřestupném roce → 28. února', () => {
    expect(yearsBack('2024-02-29', 1)).toBe('2023-02-28')
    expect(yearsBack('2024-02-29', 4)).toBe('2020-02-29')
  })
})

describe('sliceByRange', () => {
  const series = days('2020-01-01', 2500)

  it('MAX vrací vše (kopii)', () => {
    const r = sliceByRange(series, 'MAX')
    expect(r).toHaveLength(2500)
    expect(r).not.toBe(series)
  })

  it('1R končí posledním dnem a začíná o rok dříve (včetně)', () => {
    const r = sliceByRange(series, '1R')
    const last = series.at(-1)!.date
    expect(r.at(-1)!.date).toBe(last)
    expect(r[0].date).toBe(yearsBack(last, 1))
  })

  it('3R je delší než 1R; kratší řada než rozsah → celá řada', () => {
    expect(sliceByRange(series, '3R').length).toBeGreaterThan(sliceByRange(series, '1R').length)
    expect(sliceByRange(days('2026-01-01', 30), '5R')).toHaveLength(30)
  })

  it('prázdná řada', () => {
    expect(sliceByRange([], '1R')).toEqual([])
  })
})
