import { useEffect } from 'react'
import { AlertTriangle, CircleAlert, Info } from 'lucide-react'
import { formatDate } from '../../../core/date'
import { formatMoney } from '../../../core/money'
import { TX_TYPE_LABELS, TX_TYPES, type ImportPreviewResult } from '../../../shared/model'

type Preview = Extract<ImportPreviewResult, { status: 'ok' }>

interface Props {
  preview: Preview
  busy: boolean
  error: string | null
  onConfirm(): void
  onCancel(): void
}

function Messages({
  items,
  tone
}: {
  items: string[]
  tone: 'info' | 'warn' | 'error'
}): React.JSX.Element | null {
  if (items.length === 0) return null
  const style =
    tone === 'error'
      ? 'border-neg/50 bg-neg/10 text-neg'
      : tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-500'
        : 'bg-surface-2 text-muted'
  const Icon = tone === 'error' ? CircleAlert : tone === 'warn' ? AlertTriangle : Info
  return (
    <ul className={`grid gap-1.5 rounded-lg border px-3 py-2.5 text-xs ${style}`}>
      {items.map((m) => (
        <li key={m} className="flex gap-2">
          <Icon size={14} className="mt-px shrink-0" />
          <span>{m}</span>
        </li>
      ))}
    </ul>
  )
}

export function ImportDialog({
  preview,
  busy,
  error,
  onConfirm,
  onCancel
}: Props): React.JSX.Element {
  const { report } = preview

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Náhled importu"
        className="flex max-h-full w-[720px] flex-col rounded-2xl border bg-surface p-[22px] shadow-2xl"
      >
        <h2 className="text-lg font-semibold">Import z Portfolio Performance</h2>
        <p className="mt-0.5 mb-4 text-[13px] text-muted">
          Soubor <b className="text-fg">{preview.fileName}</b> – zkontroluj výsledek, nic se zatím
          neuložilo.
        </p>

        <div className="grid gap-3 overflow-auto pr-1">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold">{report.total}</div>
              <div className="text-xs text-muted">transakcí</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold">{formatMoney(report.totalNetDeposits)}</div>
              <div className="text-xs text-muted">čistě vloženo</div>
            </div>
            <div className="rounded-lg bg-surface-2 p-3">
              <div className="text-xl font-bold">
                {report.dateFrom ? formatDate(report.dateFrom) : '–'}
              </div>
              <div className="text-xs text-muted">
                první · poslední {report.dateTo ? formatDate(report.dateTo) : '–'}
              </div>
            </div>
          </div>

          <div className="text-[13px] text-muted">
            {TX_TYPES.filter((t) => report.byType[t]).map((t) => (
              <span key={t} className="mr-4">
                {TX_TYPE_LABELS[t]}: <b className="text-fg">{report.byType[t]}</b>
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Účty
              </div>
              {report.accounts.map((a) => (
                <div key={a.id} className="flex justify-between border-b py-1 text-[13px]">
                  <span>
                    {a.name} <span className="text-muted">({a.transactions})</span>
                  </span>
                  <span>{formatMoney(a.netDeposits)}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                ETF ({report.securities.length})
              </div>
              {report.securities.map((s) => (
                <div key={s.id} className="flex justify-between border-b py-1 text-[13px]">
                  <span title={s.name}>{s.id}</span>
                  <span className="text-muted">{s.indexGroup}</span>
                </div>
              ))}
            </div>
          </div>

          <Messages tone="error" items={report.errors} />
          <Messages tone="warn" items={report.warnings} />
          <Messages tone="info" items={report.notes} />

          {preview.replacesExisting && preview.canCommit && (
            <Messages
              tone="warn"
              items={[
                `V appce už jsou data${preview.existingCount ? ` (${preview.existingCount} transakcí)` : ''}. Import je nahradí; stávající stav se předtím automaticky zazálohuje do složky backups.`
              ]}
            />
          )}
          {error && <Messages tone="error" items={[error]} />}
        </div>

        <div className="mt-4 flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="rounded-[9px] border bg-surface px-3.5 py-[7px] text-[13px] hover:brightness-110"
          >
            Zrušit
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !preview.canCommit}
            className="rounded-[9px] bg-accent px-3.5 py-[7px] text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Ukládám…' : preview.replacesExisting ? 'Nahradit a importovat' : 'Importovat'}
          </button>
        </div>
      </div>
    </div>
  )
}
