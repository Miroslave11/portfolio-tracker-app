import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MonthArticleFacts, SummaryArticle } from '../shared/summary'
import { loadSummaries, saveSummaries, SUMMARIES_FILE } from './summary-store'

const facts = (period: string, valueEnd = 100): MonthArticleFacts => ({
  period,
  from: `${period}-01`,
  to: `${period}-28`,
  asOf: `${period}-28`,
  partial: false,
  valueStart: 90,
  valueEnd,
  valueEndCzk: null,
  fxStart: null,
  fxEnd: null,
  netDeposits: 5,
  marketChange: 5,
  priceChange: 5,
  dividends: 0,
  fees: 0,
  periodReturn: 0.05,
  ytdReturn: null,
  drawdown: null,
  bought: 5,
  buyCount: 1,
  boughtPrevious: null,
  planMonthly: null,
  boughtYtd: 5,
  monthsYtd: 1,
  daily: [[`${period}-01`, 90]],
  trades: [],
  dividendList: [],
  dividendsYtd: 0,
  dividends12m: 0,
  etfs: [],
  goal: null
})

const article = (period: string, valueEnd?: number): SummaryArticle => ({
  id: `month-${period}`,
  kind: 'month',
  period,
  createdAt: '2026-11-01T07:00:00.000Z',
  facts: facts(period, valueEnd)
})

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pt-summaries-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('summary-store', () => {
  it('bez souboru vrátí prázdný seznam', async () => {
    expect(await loadSummaries(dir)).toEqual([])
  })

  it('uloží, seřadí od nejnovějšího a stejné id nahradí', async () => {
    await saveSummaries(dir, [article('2026-09'), article('2026-10')])
    const saved = await saveSummaries(dir, [article('2026-09', 222)])
    expect(saved.map((a) => a.period)).toEqual(['2026-10', '2026-09'])
    expect(saved[1].facts.valueEnd).toBe(222)
    expect((await loadSummaries(dir)).map((a) => a.id)).toEqual(['month-2026-10', 'month-2026-09'])
  })

  it('neplatný požadavek odmítne a nic nezapíše', async () => {
    await expect(saveSummaries(dir, [{ id: 'x' }])).rejects.toThrow()
    await expect(saveSummaries(dir, [])).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })

  it('poškozený soubor zazálohuje a vrátí prázdný seznam', async () => {
    await writeFile(join(dir, SUMMARIES_FILE), '{"version":1,"articles":[{"id":1}]}', 'utf-8')
    expect(await loadSummaries(dir)).toEqual([])
    const files = await readdir(dir)
    const backup = files.find((f) => f.startsWith(`${SUMMARIES_FILE}.bad-`))
    expect(backup).toBeDefined()
    expect(await readFile(join(dir, backup!), 'utf-8')).toContain('"id":1')
  })
})
