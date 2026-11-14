import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarPlus,
  CornerDownLeft,
  Download,
  HardDriveDownload,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Sprout,
  ArrowRightLeft,
  ListOrdered,
  type LucideIcon
} from 'lucide-react'
import { searchPalette, type PaletteItem } from '../../../core/command-palette'
import { formatDate, todayIso } from '../../../core/date'
import { formatMoney } from '../../../core/money'
import { EMPTY_TX_FILTER, filterTransactions } from '../../../core/transaction-filter'
import { THEMES } from '../../../core/theme'
import { TX_TYPE_LABELS } from '../../../shared/model'
import { cleanError } from '../errors'
import { workbookSheets } from '../exportData'
import { SCREEN_META } from '../screenMeta'
import { useApp } from '../store'

type Group = 'Akce' | 'Přejít na' | 'Nastavení' | 'Transakce'

interface Entry extends PaletteItem {
  group: Group
  icon: LucideIcon
  run: () => void
}

const MAX_TX_RESULTS = 6
const MIN_TX_QUERY = 2

/** Uloží soubor přes hlavní proces a ohlásí výsledek zprávou dole (stejně jako menu Export). */
async function runExport(
  request: Parameters<typeof window.api.exportFile>[0],
  ok = (path: string) => `Uloženo: ${path}`
): Promise<void> {
  const { showNotice } = useApp.getState()
  try {
    const result = await window.api.exportFile(request)
    if (result.status === 'saved') showNotice(ok(result.path))
    else if (result.status === 'error') showNotice(result.message, 'error')
  } catch (err) {
    showNotice(`Export se nepodařil: ${cleanError(err)}`, 'error')
  }
}

/** Paleta příkazů (Ctrl+K): akce, přechod na obrazovky, přepnutí motivu a měny, hledání v transakcích. */
export function CommandPalette(): React.JSX.Element | null {
  const open = useApp((s) => s.paletteOpen)
  if (!open) return null
  return <PaletteBody />
}

function PaletteBody(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const settings = useApp((s) => s.settings)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const entries = useMemo<Entry[]>(() => {
    const app = useApp.getState()
    const close = (): void => app.setPaletteOpen(false)
    const hasData = (portfolio?.accounts.length ?? 0) > 0
    const hasTx = (portfolio?.transactions.length ?? 0) > 0
    const list: Entry[] = []

    if (hasData) {
      list.push(
        {
          id: 'new',
          group: 'Akce',
          icon: Plus,
          label: 'Nový nákup',
          hint: 'Ctrl+N',
          keywords: ['zapsat', 'obchod', 'transakce', 'prodej', 'vklad', 'pridat'],
          run: () => app.openTxDialog({ mode: 'create' })
        },
        {
          id: 'monthly',
          group: 'Akce',
          icon: CalendarPlus,
          label: 'Měsíční nákup',
          hint: 'Ctrl+M',
          keywords: ['sporici plan', 'sablona', 'pravidelny'],
          run: () => app.openTxDialog({ mode: 'monthly' })
        }
      )
    }
    list.push({
      id: 'prices',
      group: 'Akce',
      icon: RefreshCw,
      label: 'Aktualizovat kurzy',
      keywords: ['stahnout', 'ceny', 'obnovit', 'refresh'],
      run: () => {
        close()
        void app.refreshPrices()
      }
    })
    if (hasTx) {
      list.push(
        {
          id: 'export-xlsx',
          group: 'Akce',
          icon: Download,
          label: 'Export do Excelu (.xlsx)',
          keywords: ['exportovat', 'tabulka', 'ulozit', 'excel'],
          run: () => {
            close()
            const { portfolio: p, prices, brokerFilter } = useApp.getState()
            if (!p) return
            void runExport({
              kind: 'xlsx',
              fileName: `portfolio-tracker-${todayIso()}.xlsx`,
              sheets: workbookSheets({ portfolio: p, prices, brokerFilter })
            })
          }
        },
        {
          id: 'backup',
          group: 'Akce',
          icon: HardDriveDownload,
          label: 'Zálohovat data…',
          keywords: ['zaloha', 'kopie', 'backup', 'export'],
          run: () => {
            close()
            void runExport({ kind: 'backup' })
          }
        }
      )
    }

    for (const s of SCREEN_META) {
      list.push({
        id: `screen:${s.id}`,
        group: 'Přejít na',
        icon: s.icon,
        label: `Přejít: ${s.label}`,
        keywords: [s.title],
        run: () => app.setScreen(s.id)
      })
    }

    for (const t of THEMES) {
      list.push({
        id: `theme:${t.id}`,
        group: 'Nastavení',
        icon: Palette,
        label: `Motiv: ${t.label}`,
        hint: settings.theme === t.id ? 'aktuální' : undefined,
        keywords: ['vzhled', 'barvy', 'tema'],
        run: () => void app.updateSettings({ theme: t.id })
      })
    }
    for (const c of ['EUR', 'CZK'] as const) {
      list.push({
        id: `currency:${c}`,
        group: 'Nastavení',
        icon: ArrowRightLeft,
        label: `Měna: ${c}`,
        hint: settings.displayCurrency === c ? 'aktuální' : undefined,
        keywords: ['zobrazeni', c === 'CZK' ? 'koruny kc' : 'euro'],
        run: () => void app.updateSettings({ displayCurrency: c })
      })
    }
    list.push({
      id: 'real',
      group: 'Nastavení',
      icon: Sprout,
      label: settings.realValues ? 'Vypnout zobrazení po inflaci' : 'Zapnout zobrazení po inflaci',
      keywords: ['realne hodnoty', 'inflace', 'dnesni ceny'],
      run: () => void app.updateSettings({ realValues: !settings.realValues })
    })
    return list
  }, [portfolio, settings.theme, settings.displayCurrency, settings.realValues])

  const results = useMemo<Entry[]>(() => {
    const found = searchPalette(entries, query)
    if (!portfolio || query.trim().length < MIN_TX_QUERY) return found
    const accounts = new Map(portfolio.accounts.map((a) => [a.id, a]))
    const secs = new Map(portfolio.securities.map((s) => [s.id, s]))
    const txs = filterTransactions(
      portfolio.transactions,
      { ...EMPTY_TX_FILTER, search: query },
      accounts,
      portfolio.securities,
      todayIso()
    )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_TX_RESULTS)
    const app = useApp.getState()
    const txEntries: Entry[] = txs.map((t) => {
      const sec = t.securityId ? secs.get(t.securityId) : undefined
      const currency = accounts.get(t.accountId)?.currency === 'CZK' ? 'CZK' : 'EUR'
      return {
        id: `tx:${t.id}`,
        group: 'Transakce',
        icon: ListOrdered,
        label: `${formatDate(t.date)} · ${TX_TYPE_LABELS[t.type]}${sec ? ` · ${sec.id}` : ''}`,
        hint: `${accounts.get(t.accountId)?.name ?? ''} · ${formatMoney(t.amount, currency)}`,
        run: () => app.openTxDialog({ mode: 'edit', id: t.id })
      }
    })
    return [...found, ...txEntries]
  }, [entries, query, portfolio])

  const selected = Math.min(active, Math.max(results.length - 1, 0))

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const close = (): void => useApp.getState().setPaletteOpen(false)
  const choose = (entry: Entry | undefined): void => {
    if (!entry) return
    close()
    entry.run()
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((selected + 1) % Math.max(results.length, 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((selected - 1 + results.length) % Math.max(results.length, 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(results[selected])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/50 px-6 pt-[14vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta příkazů"
        className="flex h-fit max-h-[70vh] w-[560px] max-w-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-2xl"
      >
        <div className="flex items-center gap-2.5 border-b px-4 py-3">
          <Search size={16} className="shrink-0 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Hledej akci, obrazovku nebo transakci…"
            aria-label="Hledat příkaz"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[11px] text-muted">Esc</kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="overflow-auto p-1.5">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-muted">
              Nic nenalezeno pro „{query}“.
            </p>
          )}
          {results.map((entry, i) => {
            const Icon = entry.icon
            // Při hledání jsou výsledky řazené podle shody, nadpisy skupin by se opakovaly.
            const showGroup =
              (i === 0 || results[i - 1].group !== entry.group) &&
              (query.trim() === '' || entry.group === 'Transakce')
            return (
              <div key={entry.id}>
                {showGroup && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                    {entry.group}
                  </div>
                )}
                <button
                  role="option"
                  aria-selected={i === selected}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(entry)}
                  tabIndex={-1}
                  className={`flex w-full items-center gap-3 rounded-[9px] px-3 py-2 text-left text-[13px] ${
                    i === selected ? 'bg-accent/15' : ''
                  }`}
                >
                  <Icon size={15} className="shrink-0 text-accent" />
                  <span className="truncate">{entry.label}</span>
                  {entry.hint && (
                    <span className="ml-auto shrink-0 text-xs text-muted">{entry.hint}</span>
                  )}
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 border-t px-4 py-2 text-[11px] text-muted">
          <span>↑↓ výběr</span>
          <span className="flex items-center gap-1">
            <CornerDownLeft size={11} /> spustit
          </span>
          <span className="ml-auto">Ctrl+K otevře / zavře</span>
        </div>
      </div>
    </div>
  )
}
