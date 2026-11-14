import { CalendarPlus, Plus, Search, Sprout } from 'lucide-react'
import { screenMeta } from '../screenMeta'
import { BROKER_FILTERS, useApp, type BrokerFilter } from '../store'
import { Segmented } from './Segmented'
import type { DisplayCurrency } from '../../../shared/settings'

const brokerOptions = BROKER_FILTERS.map((b) => ({
  value: b,
  label: b === 'all' ? 'Vše' : b
})) satisfies { value: BrokerFilter; label: string }[]

const currencyOptions = [
  { value: 'EUR', label: 'EUR' },
  { value: 'CZK', label: 'CZK' }
] satisfies { value: DisplayCurrency; label: string }[]

export function TopBar(): React.JSX.Element {
  const screen = useApp((s) => s.screen)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const setBrokerFilter = useApp((s) => s.setBrokerFilter)
  const currency = useApp((s) => s.settings.displayCurrency)
  const updateSettings = useApp((s) => s.updateSettings)
  const hasData = useApp((s) => (s.portfolio?.accounts.length ?? 0) > 0)
  const openTxDialog = useApp((s) => s.openTxDialog)
  const setPaletteOpen = useApp((s) => s.setPaletteOpen)
  const realValues = useApp((s) => s.settings.realValues)

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-bg/85 px-[26px] py-3.5 backdrop-blur-md">
      <h1 className="mr-auto text-xl font-semibold">{screenMeta(screen).title}</h1>
      <Segmented
        ariaLabel="Filtr brokera"
        options={brokerOptions}
        value={brokerFilter}
        onChange={setBrokerFilter}
      />
      <Segmented
        ariaLabel="Měna zobrazení"
        options={currencyOptions}
        value={currency}
        onChange={(displayCurrency) => updateSettings({ displayCurrency })}
      />
      <button
        onClick={() => updateSettings({ realValues: !realValues })}
        aria-pressed={realValues}
        aria-label="Po inflaci"
        title={
          realValues
            ? 'Hodnoty jsou v dnešních cenách (po inflaci) – kliknutím zpět na nominální'
            : 'Zobrazit Přehled, Výkon a Cíl v dnešních cenách (po inflaci)'
        }
        className={`flex items-center gap-1.5 rounded-[9px] border px-3 py-[7px] text-[13px] hover:brightness-110 ${
          realValues ? 'border-accent bg-accent/15 font-semibold text-fg' : 'bg-surface text-muted'
        }`}
      >
        <Sprout size={15} />
        <span className="hidden xl:inline">Po inflaci</span>
      </button>
      <button
        onClick={() => setPaletteOpen(true)}
        aria-label="Paleta příkazů"
        title="Paleta příkazů (Ctrl+K)"
        className="flex items-center gap-1.5 rounded-[9px] border bg-surface px-3 py-[7px] text-[13px] text-muted hover:brightness-110"
      >
        <Search size={15} />
        <kbd className="hidden text-[11px] xl:inline">Ctrl+K</kbd>
      </button>
      <button
        onClick={() => openTxDialog({ mode: 'monthly' })}
        disabled={!hasData}
        title={
          hasData
            ? 'Zapsat měsíční nákup ze šablony'
            : 'Nejdřív naimportuj data na obrazovce Obchody'
        }
        className="flex items-center gap-1.5 rounded-[9px] border bg-surface px-3.5 py-[7px] text-[13px] hover:brightness-110 disabled:opacity-50"
      >
        <CalendarPlus size={15} />
        <span className="hidden xl:inline">Měsíční nákup</span>
      </button>
      <button
        onClick={() => openTxDialog({ mode: 'create' })}
        disabled={!hasData}
        title={
          hasData ? 'Zapsat nákup, prodej, vklad…' : 'Nejdřív naimportuj data na obrazovce Obchody'
        }
        className="flex items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-[7px] text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
      >
        <Plus size={15} /> Nový nákup
      </button>
    </header>
  )
}
