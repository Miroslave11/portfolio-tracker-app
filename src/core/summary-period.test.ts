import { describe, expect, it } from 'vitest'
import {
  duePeriods,
  missingPeriods,
  nextPeriod,
  periodBounds,
  periodMonths,
  periodOf,
  periodReady,
  periodShortTitle,
  periodTitle,
  previousPeriod
} from './summary-period'

describe('období shrnutí', () => {
  it('období podle data', () => {
    expect(periodOf('month', '2026-10-15')).toBe('2026-10')
    expect(periodOf('quarter', '2026-10-15')).toBe('2026-Q4')
    expect(periodOf('quarter', '2026-03-31')).toBe('2026-Q1')
    expect(periodOf('half', '2026-06-30')).toBe('2026-H1')
    expect(periodOf('half', '2026-07-01')).toBe('2026-H2')
    expect(periodOf('year', '2026-07-01')).toBe('2026')
  })

  it('hranice období (včetně přestupného roku)', () => {
    expect(periodBounds('quarter', '2026-Q3')).toEqual({ from: '2026-07-01', to: '2026-09-30' })
    expect(periodBounds('quarter', '2024-Q1')).toEqual({ from: '2024-01-01', to: '2024-03-31' })
    expect(periodBounds('half', '2026-H2')).toEqual({ from: '2026-07-01', to: '2026-12-31' })
    expect(periodBounds('year', '2024')).toEqual({ from: '2024-01-01', to: '2024-12-31' })
    expect(periodBounds('month', '2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('měsíce období, předchozí a následující období (i přes konec roku)', () => {
    expect(periodMonths('quarter', '2026-Q4')).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(periodMonths('half', '2026-H1')).toHaveLength(6)
    expect(previousPeriod('quarter', '2026-Q1')).toBe('2025-Q4')
    expect(previousPeriod('half', '2026-H1')).toBe('2025-H2')
    expect(previousPeriod('year', '2026')).toBe('2025')
    expect(nextPeriod('quarter', '2025-Q4')).toBe('2026-Q1')
    expect(nextPeriod('month', '2025-12')).toBe('2026-01')
  })

  it('názvy', () => {
    expect(periodTitle('month', '2026-10')).toBe('Říjen 2026')
    expect(periodTitle('quarter', '2026-Q3')).toBe('3. kvartál 2026')
    expect(periodTitle('half', '2026-H1')).toBe('1. pololetí 2026')
    expect(periodTitle('year', '2025')).toBe('Rok 2025')
    expect(periodShortTitle('quarter', '2026-Q3')).toBe('3. kvartál')
    expect(periodShortTitle('year', '2025')).toBe('Celý rok')
  })

  it('období musí skončit a mít kurzy ke konci', () => {
    expect(periodReady('quarter', '2026-Q3', '2026-09-30', '2026-10-01')).toBe(true)
    expect(periodReady('quarter', '2026-Q3', '2026-09-30', '2026-09-30')).toBe(false)
    expect(periodReady('year', '2025', '2025-12-31', '2026-01-02')).toBe(true)
    expect(periodReady('year', '2025', '2025-12-20', '2026-01-02')).toBe(false)
  })

  it('chybějící a automaticky vytvářená období', () => {
    const missing = missingPeriods('quarter', new Set(), '2025-08-10', '2026-11-12', '2026-11-13')
    expect(missing).toEqual(['2025-Q3', '2025-Q4', '2026-Q1', '2026-Q2', '2026-Q3'])
    // bez článků jen poslední skončené období
    expect(duePeriods('quarter', new Set(), '2025-08-10', '2026-11-12', '2026-11-13')).toEqual([
      '2026-Q3'
    ])
    expect(duePeriods('year', new Set(), '2025-08-10', '2026-11-12', '2026-11-13')).toEqual([
      '2025'
    ])
    expect(
      duePeriods('half', new Set(['2025-H2']), '2025-08-10', '2026-11-12', '2026-11-13')
    ).toEqual(['2026-H1'])
    expect(
      duePeriods('half', new Set(['2026-H1']), '2025-08-10', '2026-11-12', '2026-11-13')
    ).toEqual([])
  })
})
