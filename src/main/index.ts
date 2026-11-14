import { randomUUID } from 'crypto'
import { app, BrowserWindow, dialog, ipcMain, net, screen, shell } from 'electron'
import { mkdir } from 'fs/promises'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { applySecurityMeta } from '../core/securities-meta'
import { addTransactions, deleteTransaction, updateTransaction } from '../core/transaction-edit'
import { themeInfo } from '../core/theme'
import { IPC } from '../shared/ipc'
import {
  deleteTransactionRequestSchema,
  transactionDraftSchema,
  updateTransactionRequestSchema,
  type ImportPreviewResult,
  type Portfolio
} from '../shared/model'
import { z } from 'zod'
import type { PriceUpdateResult } from '../shared/prices'
import { aiArticleRequestSchema, aiRewriteRequestSchema } from '../shared/ai'
import { writeArticleTexts } from './ai-article'
import { aiStatus, makeGenerator, modelName } from './ai-provider'
import { autoUpdater } from 'electron-updater'
import { runExport } from './export-handler'
import { GENERATE_TIMEOUT_MS, rewriteSummary } from './ollama'
import { loadPortfolio, readImportFile, savePortfolio } from './portfolio-store'
import { loadPriceCache, updatePrices, type Fetcher } from './price-service'
import { loadSummaries, saveSummaries } from './summary-store'
import { createUpdateManager, type UpdateManager } from './updater'
import { centerOnWorkArea } from './window-placement'

/**
 * Stahování přes síťovou vrstvu Chromia (net.fetch): na rozdíl od holého Node používá
 * systémový proxy a úložiště certifikátů Windows, takže funguje i za firemním proxy
 * nebo s antivirem, který kontroluje HTTPS.
 */
const electronFetcher: Fetcher = (url, headers) =>
  net.fetch(url, { headers, signal: AbortSignal.timeout(20_000) })
import { loadSettings, updateSettings } from './settings-store'

// Data v %APPDATA%/portfolio-tracker (nezávisle na zobrazovaném názvu appky).
// PT_DATA_DIR umožní E2E testům pracovat s dočasnou složkou místo skutečných dat.
app.setPath(
  'userData',
  process.env['PT_DATA_DIR'] || join(app.getPath('appData'), 'portfolio-tracker')
)
const dataDir = (): string => app.getPath('userData')

// Zápisy řadíme za sebe, aby se rychlé změny nepřepsaly navzájem.
let settingsQueue: Promise<unknown> = Promise.resolve()
let portfolioQueue: Promise<unknown> = Promise.resolve()
let summariesQueue: Promise<unknown> = Promise.resolve()

/** Probíhající stahování kurzů – souběžná volání sdílejí jeden běh. */
let priceUpdateInFlight: Promise<PriceUpdateResult> | null = null

/** Naposledy zobrazený náhled importu čekající na potvrzení (drží se jen v paměti main procesu). */
let pendingImport: { id: string; portfolio: Portfolio } | null = null

async function createWindow(): Promise<void> {
  const settings = await loadSettings(dataDir())

  // Okno se otevře na displeji, kde je při spuštění kurzor myši (spuštění ze Start menu na externím
  // monitoru ho otevře tam), ne vždy na hlavním displeji Windows (u notebooku často jeho vlastní).
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = centerOnWorkArea(display.workArea, { width: 1360, height: 860 })

  const mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'Portfolio Tracker',
    // V sestavené appce ikonu nese .exe; tady je pro vývojový režim a okno.
    icon: join(__dirname, '../../resources/icon.png'),
    backgroundColor: themeInfo(settings.theme).background,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  // Odkazy ven otevírat v systémovém prohlížeči, nikdy ne v okně appky.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (details.url.startsWith('https://')) shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/** Cestu k souboru vybírá vždy main proces (renderer nesmí určovat, co se čte z disku). */
async function pickImportFile(window: BrowserWindow | null): Promise<string | null> {
  // Pouze pro automatické testy a jen ve vývojovém (nesestaveném) běhu: soubor určí proměnná prostředí.
  const forced = app.isPackaged ? undefined : process.env['PT_IMPORT_FILE']
  if (forced) return forced
  const options = {
    title: 'Importovat transakce z Portfolio Performance',
    filters: [{ name: 'Portfolio Performance (JSON)', extensions: ['json'] }],
    properties: ['openFile' as const]
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
}

async function previewImport(window: BrowserWindow | null): Promise<ImportPreviewResult> {
  const path = await pickImportFile(window)
  if (!path) return { status: 'canceled' }

  const read = await readImportFile(path)
  if (!read.ok) return { status: 'error', message: read.message }

  let existingCount = 0
  let existingUnreadable = false
  try {
    existingCount = (await loadPortfolio(dataDir()))?.transactions.length ?? 0
  } catch {
    existingUnreadable = true
  }

  const { portfolio, report } = read.result
  const previewId = randomUUID()
  pendingImport = portfolio ? { id: previewId, portfolio } : null
  return {
    status: 'ok',
    previewId,
    fileName: read.fileName,
    report,
    canCommit: portfolio !== null,
    existingCount,
    replacesExisting: existingCount > 0 || existingUnreadable
  }
}

const AI_OFF_MESSAGE = 'AI je vypnutá (Nastavení → Umělá inteligence).'

/** Automatické aktualizace (jen v nainstalované aplikaci; ve vývoji a v přenosné verzi se nehledá). */
let updates: UpdateManager | null = null
function setupUpdates(): UpdateManager {
  updates = createUpdateManager({
    updater: autoUpdater,
    mode: !app.isPackaged ? 'dev' : process.env['PORTABLE_EXECUTABLE_DIR'] ? 'portable' : 'enabled',
    isEnabled: async () => (await loadSettings(dataDir())).autoUpdate,
    onState: (state) => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IPC.updateEvent, state)
    }
  })
  return updates
}

function registerIpc(): void {
  ipcMain.handle(IPC.updateGet, () => updates?.getState() ?? { status: 'idle' })
  ipcMain.handle(IPC.updateCheck, () => updates?.checkNow() ?? { status: 'idle' })
  ipcMain.handle(IPC.updateInstall, () => updates?.install())
  ipcMain.handle(IPC.appVersion, () => app.getVersion())

  ipcMain.handle(IPC.settingsGet, () => loadSettings(dataDir()))
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: unknown) => {
    const result = settingsQueue.then(() => updateSettings(dataDir(), patch))
    settingsQueue = result.catch(() => undefined)
    return result
  })

  ipcMain.handle(IPC.portfolioGet, () => loadPortfolio(dataDir()))
  ipcMain.handle(IPC.importPreview, (event) =>
    previewImport(BrowserWindow.fromWebContents(event.sender))
  )
  ipcMain.handle(IPC.exportSave, (event, request: unknown) =>
    runExport(BrowserWindow.fromWebContents(event.sender), request, dataDir())
  )
  ipcMain.handle(IPC.aiStatus, async () => aiStatus((await loadSettings(dataDir())).ai))
  ipcMain.handle(IPC.aiRewrite, async (_e, request: unknown) => {
    const { summary } = aiRewriteRequestSchema.parse(request)
    const { ai } = await loadSettings(dataDir())
    // Poskytovatele a model určuje vždy nastavení uložené v main procesu, ne renderer.
    if (!ai.enabled) {
      return { status: 'unavailable', message: AI_OFF_MESSAGE }
    }
    const generate = makeGenerator(ai)
    return rewriteSummary(summary, modelName(ai), undefined, undefined, (prompt) =>
      generate(prompt, { timeoutMs: GENERATE_TIMEOUT_MS })
    )
  })
  ipcMain.handle(IPC.aiArticle, async (_e, request: unknown) => {
    const parsed = aiArticleRequestSchema.parse(request)
    const { ai } = await loadSettings(dataDir())
    // Zapnutí, poskytovatele, model, části, délku a styl určuje vždy nastavení z main procesu.
    if (!ai.enabled) {
      return { status: 'unavailable', message: AI_OFF_MESSAGE }
    }
    return writeArticleTexts(parsed, ai)
  })
  ipcMain.handle(IPC.summariesGet, () => loadSummaries(dataDir()))
  ipcMain.handle(IPC.summariesSave, (_e, articles: unknown) => {
    const result = summariesQueue.then(() => saveSummaries(dataDir(), articles))
    summariesQueue = result.catch(() => undefined)
    return result
  })
  ipcMain.handle(IPC.pricesGet, () => loadPriceCache(dataDir()))
  ipcMain.handle(IPC.pricesUpdate, () => {
    priceUpdateInFlight ??= Promise.all([loadPortfolio(dataDir()), loadSettings(dataDir())])
      .then(([portfolio, settings]) =>
        updatePrices(dataDir(), portfolio, {
          fetcher: electronFetcher,
          extraTickers: [settings.benchmark],
          inflation: true,
          // Dividendy jen tehdy, když je kalkulačka čerpání přepnutá na „Jen dividendy“.
          dividendTicker:
            settings.withdrawal.mode === 'dividends'
              ? settings.withdrawal.dividendTicker
              : undefined
        })
      )
      .finally(() => {
        priceUpdateInFlight = null
      })
    return priceUpdateInFlight
  })

  ipcMain.handle(IPC.securityMetaUpdate, (_e, patch: unknown) => {
    const result = portfolioQueue.then(async () => {
      const current = await loadPortfolio(dataDir())
      if (!current) throw new Error('Nejsou žádná data k úpravě.')
      const updated = applySecurityMeta(current, patch)
      await savePortfolio(dataDir(), updated, { backup: false })
      return updated
    })
    portfolioQueue = result.catch(() => undefined)
    return result
  })

  /** Načte data, změní je a uloží (se zálohou); zápisy se řadí za sebe. */
  const mutatePortfolio = (change: (current: Portfolio) => Portfolio): Promise<Portfolio> => {
    const result = portfolioQueue.then(async () => {
      const current = await loadPortfolio(dataDir())
      if (!current) throw new Error('Nejdřív naimportuj data na obrazovce Obchody.')
      const updated = change(current)
      await savePortfolio(dataDir(), updated)
      return updated
    })
    portfolioQueue = result.catch(() => undefined)
    return result
  }
  ipcMain.handle(IPC.transactionsAdd, (_e, drafts: unknown) => {
    const parsed = z.array(transactionDraftSchema).min(1).max(50).parse(drafts)
    return mutatePortfolio((p) => addTransactions(p, parsed))
  })
  ipcMain.handle(IPC.transactionUpdate, (_e, request: unknown) => {
    const r = updateTransactionRequestSchema.parse(request)
    return mutatePortfolio((p) => updateTransaction(p, r.id, r.draft, r.withCounterpart))
  })
  ipcMain.handle(IPC.transactionDelete, (_e, request: unknown) => {
    const r = deleteTransactionRequestSchema.parse(request)
    return mutatePortfolio((p) => deleteTransaction(p, r.id, r.withCounterpart))
  })
  ipcMain.handle(IPC.openFolder, async (_e, which: unknown) => {
    // Cestu určuje vždy main proces; renderer jen vybírá z dvou možností.
    const target =
      which === 'backups' ? join(dataDir(), 'backups') : which === 'data' ? dataDir() : null
    if (!target) throw new Error('Neznámá složka.')
    await mkdir(target, { recursive: true })
    const error = await shell.openPath(target)
    if (error) throw new Error(error)
  })

  ipcMain.handle(IPC.importCommit, (_e, previewId: unknown) => {
    const pending = pendingImport
    if (!pending || typeof previewId !== 'string' || pending.id !== previewId) {
      return Promise.reject(new Error('Náhled importu už není platný – vyber soubor znovu.'))
    }
    const result = portfolioQueue.then(async () => {
      await savePortfolio(dataDir(), pending.portfolio)
      if (pendingImport?.id === pending.id) pendingImport = null
      return pending.portfolio
    })
    portfolioQueue = result.catch(() => undefined)
    return result
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.portfoliotracker.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupUpdates()
  registerIpc()
  createWindow()
  updates?.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
