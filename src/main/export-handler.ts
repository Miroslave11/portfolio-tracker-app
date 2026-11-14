import { app, BrowserWindow, dialog } from 'electron'
import { copyFile, stat, writeFile } from 'fs/promises'
import { extname, join } from 'path'
import {
  exportRequestSchema,
  sanitizeFileName,
  type ExportRequest,
  type ExportResult
} from '../shared/export'
import { buildCsv, buildXlsx } from './export-service'
import { htmlToPdf } from './pdf'

type FileKind = 'csv' | 'xlsx' | 'pdf'

const FILE_INFO: Record<FileKind, { title: string; filter: Electron.FileFilter; ext: string }> = {
  csv: {
    title: 'Uložit tabulku jako CSV',
    filter: { name: 'CSV (Excel)', extensions: ['csv'] },
    ext: '.csv'
  },
  xlsx: {
    title: 'Uložit Excel',
    filter: { name: 'Excel', extensions: ['xlsx'] },
    ext: '.xlsx'
  },
  pdf: { title: 'Uložit PDF', filter: { name: 'PDF', extensions: ['pdf'] }, ext: '.pdf' }
}

/** Pouze pro automatické testy a jen ve vývojovém běhu: složka, kam se uloží bez dialogu. */
function forcedDir(): string | undefined {
  return app.isPackaged ? undefined : process.env['PT_EXPORT_DIR']
}

/** Cestu vybírá vždy uživatel v dialogu uložení (renderer žádnou cestu neposílá). */
async function pickSavePath(
  window: BrowserWindow | null,
  kind: FileKind,
  fileName: string
): Promise<string | null> {
  const info = FILE_INFO[kind]
  const name = sanitizeFileName(fileName)
  const forced = forcedDir()
  if (forced) return join(forced, name)
  const options = {
    title: info.title,
    defaultPath: join(app.getPath('documents'), name),
    filters: [info.filter]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  return extname(result.filePath) ? result.filePath : result.filePath + info.ext
}

async function pickDirectory(window: BrowserWindow | null): Promise<string | null> {
  const forced = forcedDir()
  if (forced) return forced
  const options = {
    title: 'Vyber složku pro zálohu dat',
    properties: ['openDirectory' as const, 'createDirectory' as const]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

function stamp(date: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}`
}

function writeError(err: unknown): string {
  const code = (err as NodeJS.ErrnoException)?.code
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return 'Soubor se nepodařilo uložit – je otevřený v jiném programu (např. v Excelu) nebo do složky nelze zapisovat.'
  }
  if (code === 'ENOENT')
    return 'Soubor se nepodařilo uložit – složka, do které se mělo ukládat, neexistuje.'
  if (code === 'ENOSPC') return 'Soubor se nepodařilo uložit – na disku není dost místa.'
  return `Soubor se nepodařilo uložit: ${err instanceof Error ? err.message : String(err)}`
}

/** Provede export podle ověřeného požadavku: dialog uložení, vytvoření souboru, zápis. */
export async function runExport(
  window: BrowserWindow | null,
  raw: unknown,
  dataDir: string
): Promise<ExportResult> {
  const parsed = exportRequestSchema.safeParse(raw)
  if (!parsed.success) return { status: 'error', message: 'Neplatný požadavek na export.' }
  const request: ExportRequest = parsed.data

  try {
    if (request.kind === 'backup') {
      const source = join(dataDir, 'portfolio.json')
      try {
        await stat(source)
      } catch {
        return { status: 'error', message: 'Zatím nejsou žádná data, která by šlo zazálohovat.' }
      }
      const dir = await pickDirectory(window)
      if (!dir) return { status: 'canceled' }
      const target = join(dir, `portfolio-zaloha-${stamp(new Date())}.json`)
      await copyFile(source, target)
      return { status: 'saved', path: target }
    }

    const path = await pickSavePath(window, request.kind, request.fileName)
    if (!path) return { status: 'canceled' }
    const content =
      request.kind === 'csv'
        ? buildCsv(request.table)
        : request.kind === 'xlsx'
          ? await buildXlsx(request.sheets)
          : await htmlToPdf(request.html)
    await writeFile(path, content)
    return { status: 'saved', path }
  } catch (err) {
    return { status: 'error', message: writeError(err) }
  }
}
