import { useCallback, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, FileUp, Pencil, Search, Trash2, X } from 'lucide-react'
import { todayIso, formatDate } from '../../../core/date'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import { valueAtOrBefore } from '../../../core/portfolio-calc'
import {
  buyProfit,
  EMPTY_TX_FILTER,
  filterTransactions,
  isFilterActive,
  securityOptions,
  type BuyProfit,
  type SecurityOption,
  type TxFilter
} from '../../../core/transaction-filter'
import {
  DEFAULT_SORT,
  nextSort,
  sortTransactions,
  unitPrice,
  type SortKey,
  type SortState
} from '../../../core/transaction-sort'
import { FX_EUR_CZK } from '../../../shared/prices'
import {
  TX_TYPES,
  TX_TYPE_LABELS,
  type ImportPreviewResult,
  type Portfolio,
  type TxType
} from '../../../shared/model'
import { Card } from '../components/Card'
import { ExportMenu } from '../components/ExportMenu'
import { transactionsTable } from '../../../core/export-tables'
import { ImportDialog } from '../components/ImportDialog'
import { useApp } from '../store'
import { toneClass } from '../tone'

type Preview = Extract<ImportPreviewResult, { status: 'ok' }>

const TYPE_STYLE: Record<TxType, string> = {
  BUY: 'bg-pos/15 text-pos',
  SELL: 'bg-neg/15 text-neg',
  DEPOSIT: 'bg-accent/15 text-accent',
  WITHDRAWAL: 'bg-amber-500/15 text-amber-500',
  DIVIDEND: 'bg-pos/15 text-pos',
  FEE: 'bg-surface-2 text-muted'
}

function useImport(): {
  start(): Promise<void>
  confirm(): Promise<void>
  cancel(): void
  preview: Preview | null
  busy: boolean
  error: string | null
  message: string | null
} {
  const initPortfolio = useApp((s) => s.initPortfolio)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const start = useCallback(async () => {
    setMessage(null)
    setError(null)
    setBusy(true)
    try {
      const res = await window.api.previewImport()
      if (res.status === 'ok') setPreview(res)
      else if (res.status === 'error') setMessage(res.message)
    } catch (err) {
      setMessage(`Import se nepodařil: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  const confirm = useCallback(async () => {
    if (!preview) return
    setBusy(true)
    setError(null)
    try {
      const saved = await window.api.commitImport(preview.previewId)
      initPortfolio(saved)
      setMessage(`Import dokončen: ${saved.transactions.length} transakcí uloženo.`)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [preview, initPortfolio])

  const cancel = useCallback(() => {
    setPreview(null)
    setError(null)
  }, [])

  return { start, confirm, cancel, preview, busy, error, message }
}

interface Column {
  key: SortKey
  label: string
  right?: boolean
}

const COLUMNS: Column[] = [
  { key: 'date', label: 'Datum' },
  { key: 'broker', label: 'Broker' },
  { key: 'type', label: 'Typ' },
  { key: 'security', label: 'ETF' },
  { key: 'shares', label: 'Kusy', right: true },
  { key: 'price', label: 'Cena / ks', right: true },
  { key: 'amount', label: 'Částka', right: true },
  { key: 'profit', label: 'Zisk dnes', right: true }
]

function SortableHeader({
  column,
  sort,
  onSort
}: {
  column: Column
  sort: SortState
  onSort(): void
}): React.JSX.Element {
  const active = sort.key === column.key
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th
      aria-sort={!active ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending'}
      className={`border-b p-0 font-semibold ${column.right ? 'text-right' : ''}`}
    >
      <button
        onClick={onSort}
        title={`Seřadit podle: ${column.label}`}
        className={`flex w-full items-center gap-1 px-3 py-2 hover:text-fg ${
          column.right ? 'justify-end' : ''
        } ${active ? 'text-fg' : ''}`}
      >
        {column.label}
        <Icon size={13} className={active ? 'text-accent' : 'opacity-40'} />
      </button>
    </th>
  )
}

const selectClass = 'rounded-[8px] border bg-surface-2 px-2.5 py-[6px] text-[13px]'

function FilterBar({
  filter,
  onChange,
  options,
  years,
  actions
}: {
  filter: TxFilter
  onChange(next: TxFilter): void
  options: SecurityOption[]
  years: number[]
  /** Tlačítka vpravo na konci lišty (např. import). */
  actions?: React.ReactNode
}): React.JSX.Element {
  const set = (patch: Partial<TxFilter>): void => onChange({ ...filter, ...patch })
  const active = isFilterActive(filter)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-[18px] py-3">
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          aria-label="Hledat v transakcích"
          placeholder="Hledat (datum, broker, ETF, poznámka…)"
          value={filter.search}
          onChange={(e) => set({ search: e.target.value })}
          className={`${selectClass} w-[300px] pl-8`}
        />
      </div>
      <select
        aria-label="Typ transakce"
        value={filter.type ?? ''}
        onChange={(e) => set({ type: (e.target.value || null) as TxType | null })}
        className={selectClass}
      >
        <option value="">Všechny typy</option>
        {TX_TYPES.map((t) => (
          <option key={t} value={t}>
            {TX_TYPE_LABELS[t]}
          </option>
        ))}
      </select>
      <select
        aria-label="ETF"
        value={filter.securityKey ?? ''}
        onChange={(e) => set({ securityKey: e.target.value || null })}
        className={selectClass}
      >
        <option value="">Všechna ETF</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Období"
        value={filter.period}
        onChange={(e) => set({ period: e.target.value })}
        className={selectClass}
      >
        <option value="ALL">Celá historie</option>
        <option value="YTD">Letos</option>
        <option value="12M">Posledních 12 měsíců</option>
        {years.map((y) => (
          <option key={y} value={`Y${y}`}>
            Rok {y}
          </option>
        ))}
        <option value="CUSTOM">Vlastní…</option>
      </select>
      {filter.period === 'CUSTOM' && (
        <>
          <input
            type="date"
            aria-label="Od data"
            value={filter.from}
            max={filter.to || undefined}
            onChange={(e) => set({ from: e.target.value })}
            className={selectClass}
          />
          <span className="text-muted">–</span>
          <input
            type="date"
            aria-label="Do data"
            value={filter.to}
            min={filter.from || undefined}
            onChange={(e) => set({ to: e.target.value })}
            className={selectClass}
          />
        </>
      )}
      {active && (
        <button
          onClick={() => onChange(EMPTY_TX_FILTER)}
          className="flex items-center gap-1 rounded-[8px] px-2.5 py-[6px] text-[13px] text-accent hover:underline"
        >
          <X size={14} /> Zrušit filtry
        </button>
      )}
      {actions && <div className="ml-auto">{actions}</div>}
    </div>
  )
}

function TransactionTable({
  portfolio,
  actions
}: {
  portfolio: Portfolio
  actions?: React.ReactNode
}): React.JSX.Element {
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const prices = useApp((s) => s.prices)
  const openTxDialog = useApp((s) => s.openTxDialog)

  const accounts = useMemo(
    () => new Map(portfolio.accounts.map((a) => [a.id, a])),
    [portfolio.accounts]
  )
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT)
  const [filter, setFilter] = useState<TxFilter>(EMPTY_TX_FILTER)

  const fxSeries = prices.fx[FX_EUR_CZK]?.rates
  const czk = displayCurrency === 'CZK' && !!fxSeries && fxSeries.length > 0
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'
  const fxToday = czk ? fxSeries![fxSeries!.length - 1][1] : 1
  const fxAt = useCallback(
    (date: string): number => (czk ? (valueAtOrBefore(fxSeries!, date) ?? fxSeries![0][1]) : 1),
    [czk, fxSeries]
  )

  // Transakce vybraného brokera (globální filtr nahoře) – základ pro nabídky a počty.
  const brokerRows = useMemo(
    () =>
      portfolio.transactions.filter(
        (t) => brokerFilter === 'all' || accounts.get(t.accountId)?.name === brokerFilter
      ),
    [portfolio.transactions, accounts, brokerFilter]
  )
  const options = useMemo(
    () => securityOptions(portfolio.securities, brokerRows),
    [portfolio.securities, brokerRows]
  )
  const years = useMemo(
    () => [...new Set(brokerRows.map((t) => Number(t.date.slice(0, 4))))].sort((a, b) => b - a),
    [brokerRows]
  )

  const filtered = useMemo(
    () => filterTransactions(brokerRows, filter, accounts, portfolio.securities, todayIso()),
    [brokerRows, filter, accounts, portfolio.securities]
  )

  const profits = useMemo(() => {
    const map = new Map<string, BuyProfit>()
    for (const t of filtered) {
      const latest = t.securityId ? prices.securities[t.securityId]?.prices.at(-1)?.[1] : undefined
      const p = buyProfit(t, latest, { today: fxToday, atDate: fxAt(t.date) })
      if (p) map.set(t.id, p)
    }
    return map
  }, [filtered, prices.securities, fxToday, fxAt])

  const rows = useMemo(
    () =>
      sortTransactions(
        filtered,
        accounts,
        sort,
        new Map([...profits].map(([id, p]) => [id, p.profit]))
      ),
    [filtered, accounts, sort, profits]
  )

  const netDeposits = rows.reduce((sum, t) => {
    if (t.type === 'DEPOSIT') return sum + t.amount * fxAt(t.date)
    if (t.type === 'WITHDRAWAL') return sum - t.amount * fxAt(t.date)
    return sum
  }, 0)
  const bought = rows.reduce((sum, t) => sum + (t.type === 'BUY' ? t.amount * fxAt(t.date) : 0), 0)
  const money = (v: number, digits?: number): string => formatMoney(v, currency, digits)

  return (
    <Card className="flex min-h-0 flex-1 flex-col !p-0">
      <FilterBar
        filter={filter}
        onChange={setFilter}
        options={options}
        years={years}
        actions={
          <div className="flex items-center gap-2">
            <ExportMenu
              csv={{
                label: isFilterActive(filter)
                  ? 'CSV – transakce (aktuální výběr)'
                  : 'CSV – transakce',
                fileName: `transakce-${todayIso()}.csv`,
                build: () => transactionsTable(rows, portfolio)
              }}
            />
            {actions}
          </div>
        }
      />
      <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-1 border-b px-[18px] py-2.5 text-[13px] text-muted">
        <span aria-live="polite">
          {isFilterActive(filter) ? (
            <>
              <b className="text-fg">{rows.length}</b> z {brokerRows.length} transakcí
            </>
          ) : (
            <>
              <b className="text-fg">{brokerRows.length}</b> transakcí
            </>
          )}
        </span>
        {brokerFilter !== 'all' && (
          <span>
            Broker: <b className="text-fg">{brokerFilter}</b>
          </span>
        )}
        <span>
          čistě vloženo <b className="text-fg">{money(netDeposits, 0)}</b>
        </span>
        <span>
          nakoupeno <b className="text-fg">{money(bought, 0)}</b>
        </span>
        {czk && (
          <span className="ml-auto text-xs">
            Částky v Kč: kurz ČNB z dne transakce; zisk nákupu dnešním kurzem.
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-surface">
            <tr className="text-left text-xs text-muted">
              {COLUMNS.map((c) => (
                <SortableHeader
                  key={c.key}
                  column={c}
                  sort={sort}
                  onSort={() => setSort((cur) => nextSort(cur, c.key))}
                />
              ))}
              <th className="w-[84px] border-b" aria-label="Akce" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const account = accounts.get(t.accountId)
              const rate = fxAt(t.date)
              const unit = unitPrice(t)
              const gain = profits.get(t.id)
              return (
                <tr key={t.id} className="group hover:bg-surface-2">
                  <td className="border-b px-3 py-2 whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="border-b px-3 py-2 whitespace-nowrap">
                    <span
                      className="mr-2 inline-block size-2 rounded-full"
                      style={{ background: account?.color }}
                    />
                    {account?.name}
                  </td>
                  <td className="border-b px-3 py-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${TYPE_STYLE[t.type]}`}
                    >
                      {TX_TYPE_LABELS[t.type]}
                    </span>
                  </td>
                  <td className="border-b px-3 py-2 font-semibold">{t.securityId ?? ''}</td>
                  <td className="border-b px-3 py-2 text-right">{t.shares ?? ''}</td>
                  <td className="border-b px-3 py-2 text-right whitespace-nowrap text-muted">
                    {unit !== null ? money(unit * rate) : ''}
                  </td>
                  <td className="border-b px-3 py-2 text-right whitespace-nowrap">
                    {money(t.amount * rate)}
                  </td>
                  <td
                    className={`border-b px-3 py-2 text-right whitespace-nowrap ${gain ? toneClass(gain.profit) : ''}`}
                  >
                    {gain ? (
                      <>
                        {formatSignedMoney(gain.profit, currency, 0)}
                        <div className="text-xs">{formatPercent(gain.pct, 1, true)}</div>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    <span className="inline-flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        onClick={() => openTxDialog({ mode: 'edit', id: t.id })}
                        aria-label={`Upravit transakci ${formatDate(t.date)}`}
                        title="Upravit"
                        className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => openTxDialog({ mode: 'delete', id: t.id })}
                        aria-label={`Smazat transakci ${formatDate(t.date)}`}
                        title="Smazat"
                        className="rounded-md p-1.5 text-muted hover:bg-neg/15 hover:text-neg"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-3 py-10 text-center text-muted">
                  Žádná transakce neodpovídá filtrům.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

export function TransactionsScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const portfolioError = useApp((s) => s.portfolioError)
  const { start, confirm, cancel, preview, busy, error, message } = useImport()

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-4">
      {portfolioError && (
        <div className="shrink-0 rounded-xl border border-neg/50 bg-neg/10 px-4 py-3 text-neg">
          {portfolioError}
        </div>
      )}
      {message && (
        <div
          className="shrink-0 rounded-xl border bg-surface-2 px-4 py-3 text-[13px]"
          role="status"
        >
          {message}
        </div>
      )}

      {portfolio && portfolio.transactions.length > 0 ? (
        <>
          <TransactionTable
            portfolio={portfolio}
            actions={
              <button
                onClick={start}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-[8px] border bg-surface-2 px-3 py-[6px] text-[13px] hover:brightness-110 disabled:opacity-50"
              >
                <FileUp size={14} /> Importovat znovu…
              </button>
            }
          />
        </>
      ) : (
        <Card>
          <div className="grid justify-items-center gap-3 py-10 text-center">
            <div className="grid size-14 place-items-center rounded-2xl bg-accent/15 text-accent">
              <FileUp size={28} />
            </div>
            <div className="text-lg font-semibold">Zatím tu nejsou žádné transakce</div>
            <p className="max-w-md text-muted">
              Naimportuj historii z exportu Portfolio Performance (soubor JSON). Před uložením
              uvidíš náhled a kontrolu dat.
            </p>
            <button
              onClick={start}
              disabled={busy}
              className="mt-1 flex items-center gap-1.5 rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              <FileUp size={15} /> Importovat z Portfolio Performance (JSON)…
            </button>
          </div>
        </Card>
      )}

      {preview && (
        <ImportDialog
          preview={preview}
          busy={busy}
          error={error}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </div>
  )
}
