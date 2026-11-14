import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  HardDriveDownload,
  Table2
} from 'lucide-react'
import { formatMonthLong, todayIso } from '../../../core/date'
import { buildReportHtml } from '../../../core/report-html'
import type { ExportRequest, ExportTable } from '../../../shared/export'
import {
  buildReportData,
  fxLookup,
  reportMonths,
  scopeLabel,
  workbookSheets,
  type ExportContext,
  type ReportOptions
} from '../exportData'
import { cleanError } from '../errors'
import { useApp } from '../store'
import { ModalShell } from './ModalShell'

function useRunExport(): {
  busy: boolean
  run: (request: ExportRequest) => Promise<boolean>
} {
  const showNotice = useApp((s) => s.showNotice)
  const [busy, setBusy] = useState(false)
  const run = async (request: ExportRequest): Promise<boolean> => {
    setBusy(true)
    try {
      const result = await window.api.exportFile(request)
      if (result.status === 'saved') {
        showNotice(`Uloženo: ${result.path}`)
        return true
      }
      if (result.status === 'error') showNotice(result.message, 'error')
      return false
    } catch (err) {
      showNotice(`Export se nepodařil: ${cleanError(err)}`, 'error')
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, run }
}

function currentContext(): ExportContext | null {
  const { portfolio, prices, brokerFilter } = useApp.getState()
  return portfolio && portfolio.transactions.length > 0 ? { portfolio, prices, brokerFilter } : null
}

interface Props {
  /** Tabulka z obrazovky, ze které se export otevírá (v aktuálním výběru). */
  csv?: { label: string; fileName: string; build: () => ExportTable }
}

const itemClass =
  'flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-50'

/** Tlačítko „Export“ s nabídkou: CSV aktuální tabulky, Excel, PDF měsíční report a záloha dat. */
export function ExportMenu({ csv }: Props): React.JSX.Element {
  const hasData = useApp((s) => (s.portfolio?.transactions.length ?? 0) > 0)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const [open, setOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const { busy, run } = useRunExport()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const today = todayIso()
  const scope = brokerFilter === 'all' ? 'všechny účty' : brokerFilter
  const choose = (action: () => Promise<unknown> | void): void => {
    setOpen(false)
    void action()
  }

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!hasData || busy}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-[8px] border bg-surface-2 px-3 py-[6px] text-[13px] hover:brightness-110 disabled:opacity-50"
      >
        <Download size={14} /> Export <ChevronDown size={13} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1.5 grid w-[330px] gap-0.5 rounded-xl border bg-surface p-1.5 text-[13px] shadow-2xl"
        >
          {csv && (
            <button
              role="menuitem"
              className={itemClass}
              onClick={() =>
                choose(() => run({ kind: 'csv', fileName: csv.fileName, table: csv.build() }))
              }
            >
              <Table2 size={16} className="mt-0.5 shrink-0 text-accent" />
              <span>
                <b>{csv.label}</b>
                <span className="block text-xs text-muted">
                  oddělovač „;“, česká čísla a diakritika pro Excel
                </span>
              </span>
            </button>
          )}
          <button
            role="menuitem"
            className={itemClass}
            onClick={() =>
              choose(() => {
                const ctx = currentContext()
                if (!ctx) return
                return run({
                  kind: 'xlsx',
                  fileName: `portfolio-tracker-${today}.xlsx`,
                  sheets: workbookSheets(ctx)
                })
              })
            }
          >
            <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <b>Excel (.xlsx) – všechna data</b>
              <span className="block text-xs text-muted">
                listy: Transakce, Měsíční investice, Pozice, Výkon po letech, Realizované prodeje (
                {scope})
              </span>
            </span>
          </button>
          <button
            role="menuitem"
            className={itemClass}
            onClick={() => choose(() => setReportOpen(true))}
          >
            <FileText size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <b>PDF – měsíční report…</b>
              <span className="block text-xs text-muted">
                přehled za vybraný měsíc k tisku nebo archivaci
              </span>
            </span>
          </button>
          <div className="mx-2 my-0.5 border-t" />
          <button
            role="menuitem"
            className={itemClass}
            onClick={() => choose(() => run({ kind: 'backup' }))}
          >
            <HardDriveDownload size={16} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <b>Zálohovat data…</b>
              <span className="block text-xs text-muted">
                kopie souboru portfolio.json do vybrané složky
              </span>
            </span>
          </button>
        </div>
      )}
      {reportOpen && <ReportDialog onClose={() => setReportOpen(false)} />}
    </div>
  )
}

const SECTIONS: { key: 'summary' | 'investments' | 'positions' | 'performance'; label: string }[] =
  [
    { key: 'summary', label: 'Souhrn (hodnota, vloženo, zisk)' },
    { key: 'investments', label: 'Investice v měsíci a po brokerech' },
    { key: 'positions', label: 'Pozice a alokace' },
    { key: 'performance', label: 'Výkon (TTWROR, IRR)' }
  ]

/** Okno měsíčního PDF reportu: výběr měsíce, měny a obsahu. */
function ReportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const { busy, run } = useRunExport()
  const months = portfolio ? reportMonths(portfolio) : []
  const czkAvailable = fxLookup(prices) !== null
  const [opts, setOpts] = useState<ReportOptions>({
    // Výchozí je poslední dokončený měsíc (u prvního měsíce dat ten jediný).
    month: months[1] ?? months[0] ?? todayIso().slice(0, 7),
    currency: displayCurrency === 'CZK' && czkAvailable ? 'CZK' : 'EUR',
    summary: true,
    investments: true,
    positions: true,
    performance: true
  })
  const [error, setError] = useState<string | null>(null)
  const none = !SECTIONS.some((s) => opts[s.key])

  const save = async (): Promise<void> => {
    const ctx = currentContext()
    if (!ctx) return
    setError(null)
    const data = buildReportData(ctx, opts)
    if (!data) {
      setError('Pro tento výběr nejsou data.')
      return
    }
    const ok = await run({
      kind: 'pdf',
      fileName: `report-${opts.month}.pdf`,
      html: buildReportHtml(data)
    })
    if (ok) onClose()
  }

  return (
    <ModalShell label="PDF – měsíční report" width={480} busy={busy} onClose={onClose}>
      <h2 className="text-lg font-semibold">PDF – měsíční report</h2>
      <p className="mt-0.5 mb-4 text-[13px] text-muted">
        Hodnoty jsou k poslednímu dni vybraného měsíce (
        {scopeLabel({ portfolio: portfolio!, prices, brokerFilter })}).
      </p>
      <div className="grid grid-cols-2 gap-3 text-[13px]">
        <label className="grid gap-1 text-xs text-muted">
          Měsíc
          <select
            aria-label="Měsíc reportu"
            value={opts.month}
            onChange={(e) => setOpts({ ...opts, month: e.target.value })}
            className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthLong(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Měna
          <select
            aria-label="Měna reportu"
            value={opts.currency}
            onChange={(e) => setOpts({ ...opts, currency: e.target.value as 'EUR' | 'CZK' })}
            className="rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] text-fg"
          >
            <option value="EUR">EUR</option>
            <option value="CZK" disabled={!czkAvailable}>
              Kč{czkAvailable ? '' : ' (chybí kurz ČNB)'}
            </option>
          </select>
        </label>
      </div>
      <div className="mt-4 grid gap-1.5 text-[13px]">
        {SECTIONS.map((s) => (
          <label key={s.key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={opts[s.key]}
              onChange={(e) => setOpts({ ...opts, [s.key]: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            {s.label}
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-[13px] text-neg">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onClose}
          disabled={busy}
          className="rounded-[9px] border bg-surface-2 px-4 py-2 text-[13px] hover:brightness-110 disabled:opacity-50"
        >
          Zrušit
        </button>
        <button
          onClick={() => void save()}
          disabled={busy || none || months.length === 0}
          className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-40"
        >
          {busy ? 'Ukládám…' : 'Uložit PDF…'}
        </button>
      </div>
    </ModalShell>
  )
}
