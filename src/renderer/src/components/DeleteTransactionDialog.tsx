import { useEffect, useMemo, useState } from 'react'
import { formatDate } from '../../../core/date'
import { formatMoney } from '../../../core/money'
import { findCounterpart } from '../../../core/transaction-edit'
import { TX_TYPE_LABELS, type Portfolio, type Transaction } from '../../../shared/model'
import { useApp } from '../store'
import { cleanError } from '../errors'

function describe(t: Transaction, portfolio: Portfolio): string {
  const account = portfolio.accounts.find((a) => a.id === t.accountId)?.name ?? t.accountId
  return (
    `${TX_TYPE_LABELS[t.type]} · ${formatDate(t.date)} · ${account}` +
    (t.securityId ? ` · ${t.securityId}${t.shares ? ` ${t.shares} ks` : ''}` : '') +
    ` · ${formatMoney(t.amount)}`
  )
}

function DeleteForm({
  portfolio,
  tx,
  onClose
}: {
  portfolio: Portfolio
  tx: Transaction
  onClose(): void
}): React.JSX.Element {
  const deleteTransaction = useApp((s) => s.deleteTransaction)
  const showNotice = useApp((s) => s.showNotice)
  const counterpart = useMemo(() => findCounterpart(portfolio, tx), [portfolio, tx])
  const isMain = tx.type === 'BUY' || tx.type === 'SELL'
  // U nákupu/prodeje je smazání vyrovnávacího vkladu předvolené, u vkladu nikdy.
  const [withCounterpart, setWithCounterpart] = useState(isMain && !!counterpart)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const confirm = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await deleteTransaction(tx.id, withCounterpart && !!counterpart)
      showNotice('Transakce smazána. Předchozí stav je v záloze (Nastavení → Data).')
      onClose()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Smazání transakce"
        className="w-[520px] rounded-2xl border bg-surface p-[22px] shadow-2xl"
      >
        <h2 className="text-lg font-semibold">Smazat transakci?</h2>
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
          {describe(tx, portfolio)}
        </p>
        {counterpart && (
          <label className="mt-3 flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={withCounterpart}
              onChange={(e) => setWithCounterpart(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Smazat i související {TX_TYPE_LABELS[counterpart.type].toLowerCase()}
              <span className="block text-xs text-muted">{describe(counterpart, portfolio)}</span>
            </span>
          </label>
        )}
        <p className="mt-3 text-xs text-muted">
          Před smazáním se zazálohuje celý soubor s daty, takže jde vrátit ze zálohy.
        </p>
        {error && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-neg/50 bg-neg/10 px-3 py-2.5 text-xs text-neg"
          >
            {error}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-[9px] border bg-surface-2 px-4 py-2 text-[13px] hover:brightness-110 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            onClick={confirm}
            disabled={busy}
            className="rounded-[9px] bg-neg px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-50"
          >
            {busy ? 'Mažu…' : 'Smazat'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeleteTransactionDialog(): React.JSX.Element | null {
  const dialog = useApp((s) => s.txDialog)
  const portfolio = useApp((s) => s.portfolio)
  const close = useApp((s) => s.closeTxDialog)
  if (!dialog || dialog.mode !== 'delete' || !portfolio) return null
  const tx = portfolio.transactions.find((t) => t.id === dialog.id)
  if (!tx) return null
  return <DeleteForm key={tx.id} portfolio={portfolio} tx={tx} onClose={close} />
}
