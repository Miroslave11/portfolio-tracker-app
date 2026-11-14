import type { UpdateState } from '../shared/update'

/** Výchozí odstup mezi kontrolami za běhu aplikace a prodleva po spuštění. */
export const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000
export const START_DELAY_MS = 20_000

/** Jen to, co z `electron-updater` potřebujeme (v testech ho nahradí falešný objekt). */
export interface UpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  on(event: string, listener: (arg?: unknown) => void): unknown
  checkForUpdates(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

export type UpdateMode = 'enabled' | 'dev' | 'portable'

export interface UpdateManagerOptions {
  updater: UpdaterLike
  mode: UpdateMode
  /** Je zapnuté automatické hledání (Nastavení → Aplikace)? Ruční kontrola funguje vždy. */
  isEnabled: () => boolean | Promise<boolean>
  onState: (state: UpdateState) => void
  startDelayMs?: number
  intervalMs?: number
}

export interface UpdateManager {
  getState(): UpdateState
  /** Zahájí pravidelné automatické hledání (první kontrola krátce po spuštění). */
  start(): void
  /** Zkontroluje novou verzi teď (ruční kontrola v Nastavení nebo automatická). */
  checkNow(): Promise<UpdateState>
  /** Zavře aplikaci a nainstaluje stažené vydání (jen když je připravené). */
  install(): void
  stop(): void
}

const NETWORK =
  /ENOTFOUND|ENETUNREACH|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ERR_INTERNET|ERR_NETWORK|ERR_NAME|ERR_CONNECTION|ERR_TIMED_OUT/i

/** Srozumitelná česká zpráva k chybě updateru. */
export function updateErrorMessage(err: unknown): string {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err)
  if (NETWORK.test(text)) {
    return 'Nepodařilo se zjistit, jestli je nová verze (zkontroluj připojení k internetu).'
  }
  if (/404|Cannot find|latest\.yml|No published versions/i.test(text)) {
    return 'Na GitHubu zatím není žádné vydání s aktualizací.'
  }
  if (/sha512|checksum|signature/i.test(text)) {
    return 'Stažená aktualizace nesouhlasí s kontrolním součtem a nebyla použita.'
  }
  const short = (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 160)
  return `Aktualizaci se nepodařilo zkontrolovat: ${short}`
}

const versionOf = (info: unknown): string =>
  typeof (info as { version?: unknown } | null)?.version === 'string'
    ? (info as { version: string }).version
    : ''

/**
 * Řídí automatické aktualizace: hledá nové vydání (GitHub Releases), stahuje ho na pozadí
 * a po stažení čeká na restart uživatele (nebo nainstaluje při zavření aplikace).
 * Ve vývoji a v přenosné verzi nedělá nic.
 */
export function createUpdateManager(opts: UpdateManagerOptions): UpdateManager {
  const { updater, mode } = opts
  let state: UpdateState =
    mode === 'enabled' ? { status: 'idle' } : { status: 'disabled', reason: mode }
  let timer: ReturnType<typeof setInterval> | undefined
  let first: ReturnType<typeof setTimeout> | undefined

  // Čtení přes funkci: TypeScript by jinak po `await` zúžil typ stavu a kontrolu zahodil.
  const current = (): UpdateState => state

  const set = (next: UpdateState): void => {
    state = next
    opts.onState(state)
  }

  if (mode === 'enabled') {
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = true
    updater.allowPrerelease = false

    updater.on('checking-for-update', () => {
      if (state.status !== 'ready' && state.status !== 'downloading') set({ status: 'checking' })
    })
    updater.on('update-available', (info) => {
      set({ status: 'downloading', version: versionOf(info), percent: 0 })
    })
    updater.on('update-not-available', () => {
      if (state.status === 'checking') set({ status: 'up-to-date' })
    })
    updater.on('download-progress', (p) => {
      const percent = (p as { percent?: unknown } | undefined)?.percent
      if (state.status === 'downloading' && typeof percent === 'number') {
        set({ ...state, percent: Math.max(0, Math.min(100, Math.round(percent))) })
      }
    })
    updater.on('update-downloaded', (info) => {
      set({
        status: 'ready',
        version: versionOf(info) || ('version' in state ? state.version : '')
      })
    })
    updater.on('error', (err) => {
      // Stažená verze zůstává připravená k instalaci i při pozdější chybě spojení.
      if (state.status === 'ready') return
      set({ status: 'error', message: updateErrorMessage(err) })
    })
  }

  const checkNow = async (): Promise<UpdateState> => {
    if (mode !== 'enabled') return state
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') {
      return state
    }
    set({ status: 'checking' })
    try {
      await updater.checkForUpdates()
    } catch (err) {
      if (current().status === 'checking') {
        set({ status: 'error', message: updateErrorMessage(err) })
      }
    }
    // Když updater nic nehlásil (např. už stažená verze), nezůstáváme viset v „hledám“.
    if (current().status === 'checking') set({ status: 'up-to-date' })
    return state
  }

  const auto = async (): Promise<void> => {
    if (await opts.isEnabled()) await checkNow()
  }

  return {
    getState: () => state,
    start() {
      if (mode !== 'enabled') return
      first = setTimeout(() => void auto(), opts.startDelayMs ?? START_DELAY_MS)
      timer = setInterval(() => void auto(), opts.intervalMs ?? CHECK_INTERVAL_MS)
      first.unref?.()
      timer.unref?.()
    },
    checkNow,
    install() {
      if (state.status === 'ready') updater.quitAndInstall(true, true)
    },
    stop() {
      clearTimeout(first)
      clearInterval(timer)
    }
  }
}
