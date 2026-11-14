import { copyFile, mkdir, readdir, readFile, stat, unlink } from 'fs/promises'
import { basename, join } from 'path'
import { importPortfolioPerformance, type ImportResult } from '../core/import-pp'
import { portfolioSchema, type Portfolio } from '../shared/model'
import { writeJsonAtomic } from './json-file'

export const PORTFOLIO_FILE = 'portfolio.json'
export const BACKUP_DIR = 'backups'
export const MAX_BACKUPS = 30
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024

/** Načte portfolio. Chybí-li soubor → `null`; poškozený soubor → výjimka (nepřepíše se potichu). */
export async function loadPortfolio(dir: string): Promise<Portfolio | null> {
  let raw: string
  try {
    raw = await readFile(join(dir, PORTFOLIO_FILE), 'utf-8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return portfolioSchema.parse(JSON.parse(raw))
  } catch {
    throw new Error(
      `Soubor ${PORTFOLIO_FILE} je poškozený. Původní data zůstala beze změny; ` +
        `zálohy najdeš ve složce ${BACKUP_DIR}.`
    )
  }
}

/** Zkopíruje stávající soubor do `backups/` a smaže nejstarší zálohy nad limit. */
export async function backupPortfolio(dir: string): Promise<string | null> {
  const source = join(dir, PORTFOLIO_FILE)
  try {
    await stat(source)
  } catch {
    return null
  }
  const backupDir = join(dir, BACKUP_DIR)
  await mkdir(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(backupDir, `portfolio-${stamp}.json`)
  await copyFile(source, target)

  const old = (await readdir(backupDir)).filter((f) => /^portfolio-.*\.json$/.test(f)).sort()
  for (const f of old.slice(0, Math.max(0, old.length - MAX_BACKUPS))) {
    await unlink(join(backupDir, f))
  }
  return target
}

/**
 * Zvaliduje a uloží portfolio; předtím zazálohuje to stávající
 * (`backup: false` jen pro drobné úpravy, které by zbytečně vytlačily staré zálohy).
 */
export async function savePortfolio(
  dir: string,
  portfolio: Portfolio,
  options: { backup?: boolean } = {}
): Promise<void> {
  const valid = portfolioSchema.parse(portfolio)
  await mkdir(dir, { recursive: true })
  if (options.backup !== false) await backupPortfolio(dir)
  await writeJsonAtomic(join(dir, PORTFOLIO_FILE), valid)
}

export type ReadImportResult =
  { ok: true; fileName: string; result: ImportResult } | { ok: false; message: string }

/** Přečte export z Portfolio Performance a převede ho (nic neukládá). */
export async function readImportFile(path: string): Promise<ReadImportResult> {
  const fileName = basename(path)
  let raw: string
  try {
    const info = await stat(path)
    if (info.size > MAX_IMPORT_BYTES) {
      return { ok: false, message: `Soubor je příliš velký (${Math.round(info.size / 1e6)} MB).` }
    }
    raw = await readFile(path, 'utf-8')
  } catch (err) {
    return { ok: false, message: `Soubor se nepodařilo přečíst: ${String(err)}` }
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { ok: false, message: 'Soubor není platný JSON.' }
  }
  return { ok: true, fileName, result: importPortfolioPerformance(json) }
}
