import {
  Check,
  Database,
  FileText,
  FolderOpen,
  Info,
  Palette,
  SlidersHorizontal,
  Sparkles,
  type LucideIcon
} from 'lucide-react'
import {
  SETTINGS_TAB_IDS,
  SETTINGS_TAB_LABELS,
  type SettingsTab
} from '../../../core/settings-tabs'
import { ACCENTS, THEMES, resolveTheme, themeInfo } from '../../../core/theme'
import { SummarySettingsCard } from '../components/SummarySettingsCard'
import { AiSettingsCard } from '../components/AiSettingsCard'
import { AboutCard } from '../components/AboutCard'
import { Card } from '../components/Card'
import { Segmented } from '../components/Segmented'
import { cleanError } from '../errors'
import { useApp } from '../store'
import { useSystemPrefersDark } from '../useApplyTheme'

const SETTINGS_TAB_ICONS: Record<SettingsTab, LucideIcon> = {
  appearance: Palette,
  general: SlidersHorizontal,
  templates: FileText,
  ai: Sparkles,
  data: Database,
  about: Info
}

function ThemeCard({
  id,
  label,
  selected,
  onSelect
}: {
  id: string
  label: string
  selected: boolean
  onSelect(): void
}): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-xl border-2 p-2 text-center text-xs transition-colors ${
        selected ? 'border-accent' : 'border-line hover:border-muted'
      }`}
    >
      {/* Náhled: data-theme na prvku přepne CSS proměnné jen uvnitř karty. */}
      <div
        data-theme={id}
        className="mb-1.5 grid h-16 grid-cols-[22%_1fr] overflow-hidden rounded-lg border bg-bg"
      >
        <div className="bg-surface" />
        <div className="relative p-2">
          <div className="h-2 w-3/5 rounded bg-fg/60" />
          <div className="mt-1.5 h-2 w-2/5 rounded bg-muted/60" />
          <div className="absolute right-2 bottom-2 left-2 h-3 rounded bg-gradient-to-r from-accent to-transparent" />
        </div>
      </div>
      <span className={selected ? 'font-semibold text-fg' : 'text-muted'}>{label}</span>
    </button>
  )
}

export function SettingsScreen(): React.JSX.Element {
  const settings = useApp((s) => s.settings)
  const updateSettings = useApp((s) => s.updateSettings)
  const showNotice = useApp((s) => s.showNotice)
  const openTxDialog = useApp((s) => s.openTxDialog)
  const monthlyPlan = settings.monthlyPlan
  const portfolio = useApp((s) => s.portfolio)
  const hasData = (portfolio?.accounts.length ?? 0) > 0
  const accountNames = new Map((portfolio?.accounts ?? []).map((a) => [a.id, a.name]))
  const error = useApp((s) => s.settingsError)
  const systemDark = useSystemPrefersDark()
  const active = resolveTheme(settings, systemDark)
  const tab = useApp((s) => s.settingsTab)
  const setTab = useApp((s) => s.setSettingsTab)

  return (
    <div className="grid grid-cols-[210px_1fr] items-start gap-6">
      <nav aria-label="Části nastavení" className="sticky top-0 grid gap-1">
        {SETTINGS_TAB_IDS.map((id) => {
          const Icon = SETTINGS_TAB_ICONS[id]
          const on = id === tab
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={on ? 'page' : undefined}
              className={`flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[13px] ${
                on ? 'bg-accent/15 font-semibold' : 'text-muted hover:bg-surface-2 hover:text-fg'
              }`}
            >
              <Icon size={16} className={on ? 'text-accent' : ''} />
              {SETTINGS_TAB_LABELS[id]}
            </button>
          )
        })}
      </nav>

      <div className="grid max-w-[900px] gap-4">
        {error && (
          <div className="rounded-xl border border-neg/50 bg-neg/10 px-4 py-3 text-neg">
            {error}
          </div>
        )}

        {tab === 'appearance' && (
          <Card title="Vzhled">
            <div className="grid grid-cols-5 gap-3">
              {THEMES.map((t) => (
                <ThemeCard
                  key={t.id}
                  id={t.id}
                  label={t.label}
                  selected={settings.theme === t.id}
                  onSelect={() => updateSettings({ theme: t.id })}
                />
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-5">
              <span className="text-muted">Akcentní barva:</span>
              <div className="flex gap-2.5" role="radiogroup" aria-label="Akcentní barva">
                {ACCENTS.map((a) => {
                  const on = settings.accent === a.id
                  return (
                    <button
                      key={a.id}
                      role="radio"
                      aria-checked={on}
                      title={a.label}
                      onClick={() => updateSettings({ accent: a.id })}
                      className={`grid size-7 place-items-center rounded-full border-[3px] transition-transform hover:scale-110 ${
                        on ? 'border-fg' : 'border-transparent'
                      }`}
                      style={{ background: a.hex }}
                    >
                      {on && <Check size={14} color="#fff" strokeWidth={3} />}
                    </button>
                  )
                })}
              </div>

              <label className="ml-auto flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={settings.followSystemTheme}
                  onChange={(e) => updateSettings({ followSystemTheme: e.target.checked })}
                />
                Řídit se motivem Windows (světlý/tmavý)
              </label>
            </div>

            {settings.followSystemTheme && (
              <p className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                Windows je teď v {systemDark ? 'tmavém' : 'světlém'} režimu → zobrazuji motiv „
                {themeInfo(active).label}“. Zvolený motiv se použije, když odpovídá režimu Windows,
                jinak se přepne na Tmavý/Světlý.
              </p>
            )}
          </Card>
        )}

        {tab === 'general' && (
          <Card title="Obecné">
            <div className="flex items-center gap-4">
              <span className="text-muted">Výchozí měna zobrazení</span>
              <Segmented
                ariaLabel="Výchozí měna"
                options={[
                  { value: 'EUR', label: 'EUR' },
                  { value: 'CZK', label: 'CZK' }
                ]}
                value={settings.displayCurrency}
                onChange={(displayCurrency) => updateSettings({ displayCurrency })}
              />
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--accent)]"
                checked={settings.autoRefreshPrices}
                onChange={(e) => updateSettings({ autoRefreshPrices: e.target.checked })}
              />
              Automaticky stahovat kurzy (při spuštění a každou hodinu)
            </label>
          </Card>
        )}

        {tab === 'templates' && (
          <Card title="Měsíční nákup – šablona">
            {monthlyPlan ? (
              <ul className="mb-3 grid gap-1 text-[13px]">
                {monthlyPlan.items.map((i, n) => (
                  <li key={n} className="text-muted">
                    <b className="text-fg">{i.securityId}</b> ·{' '}
                    {accountNames.get(i.accountId) ?? i.accountId}
                    {i.shares !== undefined && ` · ${i.shares} ks`}
                    {i.amount !== undefined && ` · ${i.amount} €`}
                  </li>
                ))}
                <li className="text-xs text-muted">
                  Připomenutí od {monthlyPlan.remindFromDay}. dne v měsíci.
                </li>
              </ul>
            ) : (
              <p className="mb-3 text-[13px] text-muted">
                Šablona pro pravidelný měsíční nákup zatím není nastavená.
              </p>
            )}
            <button
              onClick={() => openTxDialog({ mode: 'plan' })}
              disabled={!hasData}
              className="rounded-[9px] border bg-surface-2 px-3.5 py-[7px] text-[13px] hover:brightness-110 disabled:opacity-50"
            >
              {monthlyPlan ? 'Upravit šablonu' : 'Nastavit šablonu'}
            </button>
          </Card>
        )}

        {tab === 'ai' && (
          <>
            <AiSettingsCard />
            <SummarySettingsCard />
          </>
        )}

        {tab === 'data' && (
          <Card title="Data">
            <p className="mb-3 text-[13px] text-muted">
              Před každým zápisem, úpravou, smazáním i importem se zálohuje soubor s daty (drží se
              posledních 30 záloh). Zálohu vrátíš tak, že ji zkopíruješ jako{' '}
              <code>portfolio.json</code> do složky s daty (appka musí být zavřená).
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['data', 'Otevřít složku s daty'],
                  ['backups', 'Otevřít složku se zálohami']
                ] as const
              ).map(([which, label]) => (
                <button
                  key={which}
                  onClick={() =>
                    window.api
                      .openFolder(which)
                      .catch((err: unknown) =>
                        showNotice(`Složku se nepodařilo otevřít: ${cleanError(err)}`)
                      )
                  }
                  className="flex items-center gap-1.5 rounded-[9px] border bg-surface-2 px-3.5 py-[7px] text-[13px] hover:brightness-110"
                >
                  <FolderOpen size={15} /> {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Data se ukládají do %APPDATA%\portfolio-tracker. Import transakcí najdeš na obrazovce
              Obchody.
            </p>
          </Card>
        )}

        {tab === 'about' && <AboutCard />}
      </div>
    </div>
  )
}
