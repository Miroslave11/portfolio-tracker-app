import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { portfolioSchema } from '../shared/model'
import { importPortfolioPerformance } from './import-pp'
import { computeLots } from './lots'

// Ukázkový export (examples/ukazka-portfolio-performance.json) je vymyšlený a slouží k vyzkoušení
// aplikace bez vlastních dat. Test hlídá, aby se dal vždy bez chyb a varování naimportovat.
const file = join(__dirname, '../../examples/ukazka-portfolio-performance.json')
const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'))

describe('ukázkový export', () => {
  const { portfolio, report } = importPortfolioPerformance(raw)

  it('naimportuje se bez chyb a varování a je to platný datový model', () => {
    expect(report.errors).toEqual([])
    expect(report.warnings).toEqual([])
    expect(portfolio).not.toBeNull()
    expect(() => portfolioSchema.parse(portfolio)).not.toThrow()
  })

  it('má tři účty, čtyři ETF, nákupy po několik let a jeden prodej', () => {
    expect(portfolio!.accounts.map((a) => a.id).sort()).toEqual(['degiro', 'freedom24', 'xtb'])
    expect(portfolio!.securities).toHaveLength(4)
    expect(report.byType.SELL).toBe(1)
    expect(report.byType.BUY).toBeGreaterThan(40)
    expect(report.dateFrom?.slice(0, 4)).toBe('2023')
    expect(report.dateTo?.slice(0, 4)).toBe('2026')
  })

  it('prodej jde spárovat s nákupy (FIFO) bez varování', () => {
    const lots = computeLots(portfolio!)
    expect(lots.warnings).toEqual([])
    expect(lots.sales).toHaveLength(1)
  })
})
