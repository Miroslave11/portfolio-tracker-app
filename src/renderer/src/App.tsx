import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { shortcutAction } from '../../core/shortcuts'
import { CommandPalette } from './components/CommandPalette'
import { DeleteTransactionDialog } from './components/DeleteTransactionDialog'
import { MonthlyDialog } from './components/MonthlyDialog'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { TransactionDialog } from './components/TransactionDialog'
import { TopBar } from './components/TopBar'
import { UpdateInstallOverlay } from './components/UpdateInstallOverlay'
import { UpdateBanner } from './components/UpdateBanner'
import { screenMeta } from './screenMeta'
import { PlaceholderScreen } from './screens/PlaceholderScreen'
import { AllocationScreen } from './screens/AllocationScreen'
import { GoalScreen } from './screens/GoalScreen'
import { InvestmentsScreen } from './screens/InvestmentsScreen'
import { OverviewScreen } from './screens/OverviewScreen'
import { PerformanceScreen } from './screens/PerformanceScreen'
import { SecuritiesScreen } from './screens/SecuritiesScreen'
import { TaxesScreen } from './screens/TaxesScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { SummaryScreen } from './screens/SummaryScreen'
import { TransactionsScreen } from './screens/TransactionsScreen'
import { versionChangeNotice } from '../../shared/update'
import { useApp } from './store'
import { useAutoSummaries } from './summaries'
import { useApplyTheme } from './useApplyTheme'

const REFRESH_INTERVAL_MS = 60 * 60 * 1000

/** Stahuje kurzy při spuštění, po změně dat (import) a pak každou hodinu. */
function useAutoRefreshPrices(): void {
  const auto = useApp((s) => s.settings.autoRefreshPrices)
  const transactions = useApp((s) => s.portfolio?.transactions)
  const refresh = useApp((s) => s.refreshPrices)
  const hasSecurities = useApp((s) => (s.portfolio?.securities.length ?? 0) > 0)

  useEffect(() => {
    if (!auto || !hasSecurities) return
    refresh()
    const id = setInterval(refresh, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [auto, hasSecurities, transactions, refresh])
}

/** Sleduje stav automatických aktualizací z hlavního procesu. */
function useUpdateState(): void {
  const setUpdate = useApp((s) => s.setUpdate)
  useEffect(() => {
    void window.api.getUpdateState().then(setUpdate)
    return window.api.onUpdateState(setUpdate)
  }, [setUpdate])
}

/** Po spuštění nové verze (po aktualizaci) ukáže zprávu a zapamatuje si běžící verzi. */
function useVersionNotice(): void {
  const showNotice = useApp((s) => s.showNotice)
  useEffect(() => {
    void (async () => {
      const [settings, current] = await Promise.all([
        window.api.getSettings(),
        window.api.getAppVersion()
      ])
      const notice = versionChangeNotice(settings.lastVersion, current)
      if (settings.lastVersion !== current) {
        await window.api.updateSettings({ lastVersion: current })
      }
      if (notice) showNotice(notice)
    })()
  }, [showNotice])
}

/** Ctrl+K paleta příkazů, Ctrl+N nový nákup, Ctrl+M měsíční nákup. */
function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      const action = shortcutAction(e)
      if (!action) return
      const app = useApp.getState()
      if (action === 'palette') {
        e.preventDefault()
        // Paleta se nesmí otevřít přes rozepsané okno transakce.
        if (app.txDialog === null || app.paletteOpen) app.setPaletteOpen(!app.paletteOpen)
        return
      }
      e.preventDefault()
      const hasData = (app.portfolio?.accounts.length ?? 0) > 0
      if (!hasData || app.txDialog !== null || app.paletteOpen) return
      app.openTxDialog(action === 'monthlyBuy' ? { mode: 'monthly' } : { mode: 'create' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

function App(): React.JSX.Element {
  useApplyTheme()
  useAutoRefreshPrices()
  useGlobalShortcuts()
  useUpdateState()
  useVersionNotice()
  useAutoSummaries()
  const screen = useApp((s) => s.screen)

  return (
    <div className="grid h-screen grid-cols-[220px_1fr]">
      <UpdateInstallOverlay />
      <Sidebar />
      <main className="flex min-h-0 flex-col overflow-hidden">
        <UpdateBanner />
        <TopBar />
        <AnimatePresence mode="wait">
          <motion.div
            key={screen}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="min-h-0 flex-1 overflow-auto px-[26px] pt-[22px] pb-6"
          >
            {screen === 'settings' ? (
              <SettingsScreen />
            ) : screen === 'transactions' ? (
              <TransactionsScreen />
            ) : screen === 'overview' ? (
              <OverviewScreen />
            ) : screen === 'summary' ? (
              <SummaryScreen />
            ) : screen === 'performance' ? (
              <PerformanceScreen />
            ) : screen === 'allocation' ? (
              <AllocationScreen />
            ) : screen === 'investments' ? (
              <InvestmentsScreen />
            ) : screen === 'goal' ? (
              <GoalScreen />
            ) : screen === 'taxes' ? (
              <TaxesScreen />
            ) : screen === 'securities' ? (
              <SecuritiesScreen />
            ) : (
              <PlaceholderScreen meta={screenMeta(screen)} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <TransactionDialog />
      <DeleteTransactionDialog />
      <MonthlyDialog />
      <CommandPalette />
      <Toast />
    </div>
  )
}

export default App
