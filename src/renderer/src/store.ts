import type { PlanRow } from '../../core/monthly-plan'
import { create } from 'zustand'
import type { Portfolio, SecurityMetaPatch, TransactionDraft, TxType } from '../../shared/model'
import { EMPTY_PRICE_CACHE, type PriceCache, type PriceUpdateReport } from '../../shared/prices'
import { DEFAULT_SETTINGS, type Settings, type SettingsPatch } from '../../shared/settings'
import type { SummaryArticle } from '../../shared/summary'

export const SCREENS = [
  'overview',
  'summary',
  'performance',
  'allocation',
  'investments',
  'transactions',
  'taxes',
  'securities',
  'goal',
  'settings'
] as const
export type ScreenId = (typeof SCREENS)[number]

export const BROKER_FILTERS = ['all', 'Freedom24', 'XTB', 'Degiro'] as const
export type BrokerFilter = (typeof BROKER_FILTERS)[number]

/** Které okno pro zápis transakcí je právě otevřené. */
export type TxDialogState =
  | { mode: 'create'; type?: TxType }
  | { mode: 'edit'; id: string }
  | { mode: 'delete'; id: string }
  /** Měsíční nákup; `rows` = předvyplněné řádky (např. z cílové alokace) místo šablony. */
  | { mode: 'monthly'; rows?: PlanRow[] }
  /** Šablona měsíčního nákupu; `thenMonthly` = po uložení se vrátit do měsíčního nákupu. */
  | { mode: 'plan'; thenMonthly?: boolean }

interface AppState {
  screen: ScreenId
  brokerFilter: BrokerFilter
  settings: Settings
  settingsError: string | null
  /** Importovaná data; `null` = zatím nic neimportováno. */
  portfolio: Portfolio | null
  portfolioError: string | null
  /** Kurzy stažené z internetu (uložené na disku). */
  prices: PriceCache
  priceReport: PriceUpdateReport | null
  priceUpdating: boolean
  /** Chyba celého stahování (např. nečitelné portfolio). */
  priceError: string | null
  /** Otevřené okno zápisu / úpravy / smazání transakce; `null` = žádné. */
  txDialog: TxDialogState | null
  /** Krátká zpráva o provedené akci (zobrazí se dole a sama zmizí). */
  notice: string | null
  /** Vzhled zprávy: úspěch (výchozí), nebo chyba. */
  noticeTone: 'ok' | 'error'
  /** Je otevřená paleta příkazů (Ctrl+K)? */
  paletteOpen: boolean
  /** Uložená shrnutí portfolia (nejnovější první); `null` = ještě nenačtena. */
  summaries: SummaryArticle[] | null
  /** Článek, který se má otevřít na obrazovce Shrnutí (např. z Přehledu). */
  summaryFocus: string | null
  /** Článek, pro který právě píše text lokální AI; `null` = nic se nepíše. */
  summaryAiBusy: string | null
  setSummaryAiBusy(id: string | null): void
  initSummaries(summaries: SummaryArticle[]): void
  /** Uloží nové nebo přegenerované články; při chybě vyhodí výjimku. */
  saveSummaries(articles: SummaryArticle[]): Promise<void>
  /** Přejde na obrazovku Shrnutí a otevře daný článek. */
  openSummary(id: string): void
  setSummaryFocus(id: string | null): void
  setPaletteOpen(open: boolean): void
  setScreen(screen: ScreenId): void
  openTxDialog(state: TxDialogState): void
  closeTxDialog(): void
  showNotice(message: string | null, tone?: 'ok' | 'error'): void
  /** Zapíše nové transakce; při chybě vyhodí výjimku se srozumitelným textem. */
  addTransactions(drafts: TransactionDraft[]): Promise<void>
  updateTransaction(id: string, draft: TransactionDraft, withCounterpart: boolean): Promise<void>
  deleteTransaction(id: string, withCounterpart: boolean): Promise<void>
  setBrokerFilter(filter: BrokerFilter): void
  initSettings(settings: Settings): void
  initPortfolio(portfolio: Portfolio | null, error?: string | null): void
  initPrices(prices: PriceCache): void
  /** Stáhne chybějící kurzy; souběžná volání se spojí do jednoho. */
  refreshPrices(): Promise<void>
  /** Uloží novou skupinu indexu / barvu ETF; vyhodí chybu, pokud se uložení nepovede. */
  updateSecurityMeta(patch: SecurityMetaPatch): Promise<void>
  /** Okamžitě změní UI a na pozadí uloží; při chybě vrátí původní stav. */
  updateSettings(patch: SettingsPatch): Promise<void>
}

export const useApp = create<AppState>((set, get) => ({
  screen: 'overview',
  brokerFilter: 'all',
  settings: DEFAULT_SETTINGS,
  settingsError: null,
  portfolio: null,
  portfolioError: null,
  prices: EMPTY_PRICE_CACHE,
  priceReport: null,
  priceUpdating: false,
  priceError: null,
  txDialog: null,
  notice: null,
  noticeTone: 'ok',
  paletteOpen: false,
  summaries: null,
  summaryFocus: null,
  summaryAiBusy: null,
  setSummaryAiBusy: (summaryAiBusy) => set({ summaryAiBusy }),
  initSummaries: (summaries) => set({ summaries }),
  saveSummaries: async (articles) => {
    set({ summaries: await window.api.saveSummaries(articles) })
  },
  openSummary: (id) => set({ screen: 'summary', summaryFocus: id }),
  setSummaryFocus: (summaryFocus) => set({ summaryFocus }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setScreen: (screen) => set({ screen }),
  openTxDialog: (txDialog) => set({ txDialog, notice: null }),
  closeTxDialog: () => set({ txDialog: null }),
  showNotice: (notice, tone = 'ok') => set({ notice, noticeTone: tone }),
  addTransactions: async (drafts) => {
    set({ portfolio: await window.api.addTransactions(drafts) })
  },
  updateTransaction: async (id, draft, withCounterpart) => {
    set({ portfolio: await window.api.updateTransaction({ id, draft, withCounterpart }) })
  },
  deleteTransaction: async (id, withCounterpart) => {
    set({ portfolio: await window.api.deleteTransaction({ id, withCounterpart }) })
  },
  setBrokerFilter: (brokerFilter) => set({ brokerFilter }),
  initSettings: (settings) => set({ settings }),
  initPortfolio: (portfolio, error = null) => set({ portfolio, portfolioError: error }),
  initPrices: (prices) => set({ prices }),
  refreshPrices: async () => {
    if (get().priceUpdating) return
    set({ priceUpdating: true, priceError: null })
    try {
      const { cache, report } = await window.api.updatePrices()
      set({ prices: cache, priceReport: report, priceUpdating: false })
    } catch (err) {
      set({
        priceUpdating: false,
        priceError: err instanceof Error ? err.message : String(err)
      })
    }
  },
  updateSecurityMeta: async (patch) => {
    const saved = await window.api.updateSecurityMeta(patch)
    // Transakce zůstávají tytéž objekty, jinak by se zbytečně znovu stahovaly kurzy.
    const current = get().portfolio
    set({ portfolio: current ? { ...current, securities: saved.securities } : saved })
  },
  updateSettings: async (patch) => {
    const previous = get().settings
    set({ settings: { ...previous, ...patch }, settingsError: null })
    try {
      const saved = await window.api.updateSettings(patch)
      set({ settings: saved })
    } catch (err) {
      set({ settings: previous, settingsError: `Nastavení se nepodařilo uložit: ${String(err)}` })
    }
  }
}))
