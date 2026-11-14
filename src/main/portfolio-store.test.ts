import { mkdtemp, readdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importPortfolioPerformance } from '../core/import-pp'
import { EMPTY_PORTFOLIO, type Portfolio } from '../shared/model'
import {
  BACKUP_DIR,
  backupPortfolio,
  loadPortfolio,
  MAX_BACKUPS,
  PORTFOLIO_FILE,
  readImportFile,
  savePortfolio
} from './portfolio-store'

let dir: string

const ppExport = {
  version: 1,
  transactions: [
    {
      type: 'PURCHASE',
      account: 'XTB - EUR cash',
      portfolio: 'XTB - EUR portfolio',
      date: '2024-07-27',
      currency: 'EUR',
      amount: 250.5,
      shares: 3,
      security: { name: 'EUNL.DE', ticker: 'EUNL.DE', currency: 'EUR' }
    },
    {
      type: 'DEPOSIT',
      account: 'XTB - EUR cash',
      date: '2024-07-24',
      currency: 'EUR',
      amount: 250.5
    }
  ]
}

function sample(): Portfolio {
  return importPortfolioPerformance(ppExport).portfolio!
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pt-portfolio-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('portfolio-store', () => {
  it('bez souboru vrátí null', async () => {
    expect(await loadPortfolio(dir)).toBeNull()
  })

  it('uloží a znovu načte totéž (přežije restart)', async () => {
    const p = sample()
    await savePortfolio(dir, p)
    expect(await loadPortfolio(dir)).toEqual(p)
  })

  it('první uložení nevytváří zálohu, druhé zazálohuje předchozí stav', async () => {
    await savePortfolio(dir, sample())
    await expect(readdir(join(dir, BACKUP_DIR))).rejects.toThrow()
    await savePortfolio(dir, EMPTY_PORTFOLIO)
    const backups = await readdir(join(dir, BACKUP_DIR))
    expect(backups).toHaveLength(1)
    const saved = JSON.parse(await readFile(join(dir, BACKUP_DIR, backups[0]), 'utf-8'))
    expect(saved.transactions).toHaveLength(2)
  })

  it('uložení s backup: false zálohu nevytváří (drobné úpravy metadat ETF)', async () => {
    const p = sample()
    await savePortfolio(dir, p)
    const edited = { ...p, securities: p.securities.map((s) => ({ ...s, indexGroup: 'Jiný' })) }
    await savePortfolio(dir, edited, { backup: false })
    await expect(readdir(join(dir, BACKUP_DIR))).rejects.toThrow()
    expect((await loadPortfolio(dir))!.securities[0].indexGroup).toBe('Jiný')
  })

  it('poškozený soubor nenačte tiše – vyhodí srozumitelnou chybu a nepřepíše ho', async () => {
    await writeFile(join(dir, PORTFOLIO_FILE), '{ rozbité', 'utf-8')
    await expect(loadPortfolio(dir)).rejects.toThrow(/poškozený/)
    expect(await readFile(join(dir, PORTFOLIO_FILE), 'utf-8')).toBe('{ rozbité')
  })

  it('před přepsáním poškozeného souboru ho zazálohuje', async () => {
    await writeFile(join(dir, PORTFOLIO_FILE), '{ rozbité', 'utf-8')
    await savePortfolio(dir, sample())
    const [name] = await readdir(join(dir, BACKUP_DIR))
    expect(await readFile(join(dir, BACKUP_DIR, name), 'utf-8')).toBe('{ rozbité')
  })

  it('odmítne uložit nekonzistentní data', async () => {
    const bad = sample()
    bad.transactions[0].accountId = 'neexistuje'
    await expect(savePortfolio(dir, bad)).rejects.toThrow()
    expect(await loadPortfolio(dir)).toBeNull()
  })

  it('drží nejvýše MAX_BACKUPS záloh a maže ty nejstarší', async () => {
    await savePortfolio(dir, sample())
    for (let i = 0; i < MAX_BACKUPS + 5; i++) {
      await backupPortfolio(dir)
      await new Promise((r) => setTimeout(r, 3))
    }
    const files = await readdir(join(dir, BACKUP_DIR))
    expect(files).toHaveLength(MAX_BACKUPS)
  })
})

describe('readImportFile', () => {
  it('přečte a převede platný export', async () => {
    const path = join(dir, 'export.json')
    await writeFile(path, JSON.stringify(ppExport), 'utf-8')
    const res = await readImportFile(path)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.fileName).toBe('export.json')
      expect(res.result.report.total).toBe(2)
      expect(res.result.portfolio).not.toBeNull()
    }
  })

  it('neplatný JSON → srozumitelná chyba', async () => {
    const path = join(dir, 'bad.json')
    await writeFile(path, 'nejsem json', 'utf-8')
    expect(await readImportFile(path)).toEqual({ ok: false, message: 'Soubor není platný JSON.' })
  })

  it('neexistující soubor → chyba, ne výjimka', async () => {
    const res = await readImportFile(join(dir, 'neni.json'))
    expect(res.ok).toBe(false)
  })
})
