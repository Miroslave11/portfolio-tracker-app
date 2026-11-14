import type {
  DeleteTransactionRequest,
  ImportPreviewResult,
  Portfolio,
  SecurityMetaPatch,
  TransactionDraft,
  UpdateTransactionRequest
} from './model'
import type {
  AiArticleRequest,
  AiArticleResult,
  AiRewriteRequest,
  AiRewriteResult,
  AiStatusResult
} from './ai'
import type { ExportRequest, ExportResult } from './export'
import type { PriceCache, PriceUpdateResult } from './prices'
import type { Settings, SettingsPatch } from './settings'
import type { SummaryArticle } from './summary'
import type { UpdateState } from './update'

/** Názvy IPC kanálů sdílené mezi main a preload. */
export const IPC = {
  appVersion: 'app:version',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  portfolioGet: 'portfolio:get',
  importPreview: 'portfolio:import-preview',
  importCommit: 'portfolio:import-commit',
  securityMetaUpdate: 'portfolio:security-meta-update',
  transactionsAdd: 'portfolio:transactions-add',
  transactionUpdate: 'portfolio:transaction-update',
  transactionDelete: 'portfolio:transaction-delete',
  openFolder: 'app:open-folder',
  pricesGet: 'prices:get',
  pricesUpdate: 'prices:update',
  exportSave: 'export:save',
  aiStatus: 'ai:status',
  aiRewrite: 'ai:rewrite',
  aiArticle: 'ai:article',
  summariesGet: 'summaries:get',
  summariesSave: 'summaries:save',
  updateGet: 'update:get',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  /** Událost main → renderer: změnil se stav aktualizací. */
  updateEvent: 'update:state'
} as const

/** API, které preload vystavuje rendereru jako `window.api`. */
export interface PortfolioApi {
  getAppVersion(): Promise<string>
  getSettings(): Promise<Settings>
  updateSettings(patch: SettingsPatch): Promise<Settings>
  /** Aktuální data, nebo `null`, pokud ještě nebyla nic importována. */
  getPortfolio(): Promise<Portfolio | null>
  /** Otevře výběr souboru, soubor načte a převede – nic neukládá. */
  previewImport(): Promise<ImportPreviewResult>
  /** Uloží dříve zobrazený náhled (nahradí stávající data, předtím je zazálohuje). */
  commitImport(previewId: string): Promise<Portfolio>
  /** Změní skupinu indexu / barvu vybraných ETF a vrátí aktuální data. */
  updateSecurityMeta(patch: SecurityMetaPatch): Promise<Portfolio>
  /** Zapíše nové transakce (před zápisem zazálohuje data) a vrátí aktuální data. */
  addTransactions(drafts: TransactionDraft[]): Promise<Portfolio>
  updateTransaction(request: UpdateTransactionRequest): Promise<Portfolio>
  deleteTransaction(request: DeleteTransactionRequest): Promise<Portfolio>
  /** Otevře složku s daty nebo se zálohami ve správci souborů. */
  openFolder(which: 'data' | 'backups'): Promise<void>
  /** Kurzy uložené na disku (bez stahování z internetu). */
  getPrices(): Promise<PriceCache>
  /** Stáhne chybějící kurzy z internetu a vrátí aktuální cache a hlášení. */
  updatePrices(): Promise<PriceUpdateResult>
  /** Export (CSV, Excel, PDF) nebo záloha dat; cestu k souboru vybírá uživatel v dialogu. */
  exportFile(request: ExportRequest): Promise<ExportResult>
  /** Zjistí, zda lokální Ollama běží, a které modely má stažené. */
  aiStatus(): Promise<AiStatusResult>
  /** Přeformuluje shrnutí lokálním modelem; text s jakýmkoli změněným číslem se zamítne. */
  aiRewrite(request: AiRewriteRequest): Promise<AiRewriteResult>
  /** Napíše lokálním modelem vybrané části článku z faktů; každé číslo se ověří. */
  aiWriteArticle(request: AiArticleRequest): Promise<AiArticleResult>
  /** Uložená shrnutí portfolia (nejnovější první). */
  getSummaries(): Promise<SummaryArticle[]>
  /** Uloží nové nebo přegenerované články (stejné id se nahradí) a vrátí všechny. */
  saveSummaries(articles: SummaryArticle[]): Promise<SummaryArticle[]>
  /** Aktuální stav automatických aktualizací. */
  getUpdateState(): Promise<UpdateState>
  /** Zkontroluje novou verzi teď (funguje i při vypnutém automatickém hledání). */
  checkForUpdates(): Promise<UpdateState>
  /** Zavře aplikaci a nainstaluje stažené vydání (jen když je připravené). */
  installUpdate(): Promise<void>
  /** Odběr změn stavu aktualizací; vrací funkci pro odhlášení. */
  onUpdateState(listener: (state: UpdateState) => void): () => void
}
