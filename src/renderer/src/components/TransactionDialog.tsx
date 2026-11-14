import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CircleAlert, Info } from 'lucide-react'
import { todayIso, formatDate } from '../../../core/date'
import { formatMoney } from '../../../core/money'
import {
  deriveTrade,
  editTradeField,
  formatInput,
  parseNumber,
  type TradeField,
  type TradeInputState
} from '../../../core/trade-math'
import { findCounterpart, validateDraft } from '../../../core/transaction-edit'
import {
  TX_TYPE_LABELS,
  TX_TYPES,
  type Portfolio,
  type Transaction,
  type TransactionDraft,
  type TxType
} from '../../../shared/model'
import type { PriceCache, PricePoint } from '../../../shared/prices'
import { cleanError } from '../errors'
import { Segmented } from './Segmented'
import { useApp } from '../store'

const NEW_SECURITY = '__new__'
const TYPE_OPTIONS = TX_TYPES.map((t) => ({ value: t, label: TX_TYPE_LABELS[t] }))
const SAVED_LABEL: Record<TxType, string> = {
  BUY: 'Nákup uložen',
  SELL: 'Prodej uložen',
  DEPOSIT: 'Vklad uložen',
  WITHDRAWAL: 'Výběr uložen',
  DIVIDEND: 'Dividenda uložena',
  FEE: 'Poplatek uložen'
}

const inputClass =
  'w-full rounded-[8px] border bg-surface-2 px-2.5 py-[7px] text-[13px] outline-none focus:border-accent'

/** Poslední známý kurz k danému dni nebo dříve. */
function quoteAt(points: readonly PricePoint[] | undefined, date: string): PricePoint | null {
  if (!points) return null
  for (let i = points.length - 1; i >= 0; i--) if (points[i][0] <= date) return points[i]
  return null
}

function Field({
  label,
  children,
  hint,
  tag
}: {
  label: string
  children: React.ReactNode
  hint?: React.ReactNode
  /** Malý štítek vpravo v řádku s popiskem (např. „dopočteno“). */
  tag?: string
}): React.JSX.Element {
  return (
    <label className="grid content-start gap-1 text-xs text-muted">
      <span className="flex items-center justify-between">
        {label}
        {tag && (
          <span className="rounded bg-accent/15 px-1.5 py-px text-[10px] text-accent">{tag}</span>
        )}
      </span>
      {children}
      {hint && <span className="text-[11px]">{hint}</span>}
    </label>
  )
}

interface FormProps {
  portfolio: Portfolio
  prices: PriceCache
  edit?: Transaction
  initialType: TxType
  onClose(): void
}

function TxForm({ portfolio, prices, edit, initialType, onClose }: FormProps): React.JSX.Element {
  const addTransactions = useApp((s) => s.addTransactions)
  const updateTransaction = useApp((s) => s.updateTransaction)
  const showNotice = useApp((s) => s.showNotice)

  const lastTx = useMemo(
    () =>
      portfolio.transactions.reduce<Transaction | null>(
        (best, t) => (!best || t.date > best.date ? t : best),
        null
      ),
    [portfolio.transactions]
  )
  const counterpart = useMemo(
    () => (edit ? findCounterpart(portfolio, edit) : null),
    [portfolio, edit]
  )

  const [type, setType] = useState<TxType>(edit?.type ?? initialType)
  const [accountId, setAccountId] = useState(
    edit?.accountId ?? lastTx?.accountId ?? portfolio.accounts[0]?.id ?? ''
  )
  const [date, setDate] = useState(edit?.date ?? todayIso())
  const [securityKey, setSecurityKey] = useState<string>(edit?.securityId ?? '')
  const [trade, setTrade] = useState<TradeInputState>({
    texts: {
      shares: edit?.shares !== undefined ? formatInput(edit.shares, 6) : '',
      price: '',
      amount: edit ? formatInput(edit.amount, 2) : ''
    },
    order: edit?.shares ? ['shares', 'amount'] : [],
    priceTouched: !!edit
  })
  const [feeText, setFeeText] = useState(edit?.fee ? formatInput(edit.fee, 2) : '')
  const [note, setNote] = useState(edit?.note ?? '')
  const [withCash, setWithCash] = useState(initialType === 'BUY')
  const [withCounterpart, setWithCounterpart] = useState(
    !!counterpart && (edit?.type === 'BUY' || edit?.type === 'SELL')
  )
  const [newSec, setNewSec] = useState({ ticker: '', name: '', isin: '', group: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isTrade = type === 'BUY' || type === 'SELL'
  const needsSecurity = isTrade || type === 'DIVIDEND'

  // Nabídka ETF: naposledy použitá u vybraného brokera nahoře.
  const secOptions = useMemo(() => {
    const inAccount = new Map<string, string>()
    const overall = new Map<string, string>()
    for (const t of portfolio.transactions) {
      if (!t.securityId) continue
      if ((overall.get(t.securityId) ?? '') < t.date) overall.set(t.securityId, t.date)
      if (t.accountId === accountId && (inAccount.get(t.securityId) ?? '') < t.date) {
        inAccount.set(t.securityId, t.date)
      }
    }
    return [...portfolio.securities].sort(
      (a, b) =>
        (inAccount.get(b.id) ?? '').localeCompare(inAccount.get(a.id) ?? '') ||
        (overall.get(b.id) ?? '').localeCompare(overall.get(a.id) ?? '') ||
        a.id.localeCompare(b.id)
    )
  }, [portfolio, accountId])

  // Výchozí ETF = naposledy použité (dokud uživatel nevybral jiné).
  const effectiveKey = securityKey || secOptions[0]?.id || NEW_SECURITY
  const quote = quoteAt(prices.securities[effectiveKey]?.prices, date)

  // Kurz z internetu se předvyplní do ceny, dokud ji uživatel sám nezadá.
  const derivedTrade = deriveTrade(
    isTrade ? trade : { ...trade, texts: { shares: '', price: '', amount: trade.texts.amount } },
    isTrade && quote ? quote[1] : null
  )
  const showPrefill = isTrade && derivedTrade.prefilled
  const { invalid } = derivedTrade
  const resolved = { values: derivedTrade.values, derived: derivedTrade.derived }
  const shownText = derivedTrade.shown

  const feeValue = feeText.trim() ? parseNumber(feeText) : undefined
  const feeInvalid = feeText.trim() !== '' && (feeValue === null || (feeValue ?? 0) < 0)

  const missing: string[] = []
  if (!accountId) missing.push('broker')
  if (needsSecurity && effectiveKey === NEW_SECURITY) {
    if (!newSec.ticker.trim()) missing.push('ticker ETF')
    if (!newSec.name.trim()) missing.push('název ETF')
  }
  if (isTrade && !(resolved.values.shares && resolved.values.shares > 0)) missing.push('počet kusů')
  if (!(resolved.values.amount && resolved.values.amount > 0)) missing.push('celkovou částku')

  const draft: TransactionDraft | null =
    missing.length === 0 && invalid.length === 0 && !feeInvalid
      ? {
          type,
          accountId,
          date,
          amount: resolved.values.amount!,
          ...(isTrade ? { shares: resolved.values.shares } : {}),
          ...(needsSecurity
            ? effectiveKey === NEW_SECURITY
              ? {
                  newSecurity: {
                    yahooTicker: newSec.ticker.trim(),
                    name: newSec.name.trim(),
                    ...(newSec.isin.trim() ? { isin: newSec.isin.trim().toUpperCase() } : {}),
                    indexGroup: newSec.group.trim() || 'Ostatní'
                  }
                }
              : { securityId: effectiveKey }
            : {}),
          ...(feeValue ? { fee: feeValue } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(!edit && isTrade && withCash ? { withCash: true } : {})
        }
      : null

  const issues = draft
    ? validateDraft(
        portfolio,
        draft,
        {
          today: todayIso(),
          priceAt: (id, d) => quoteAt(prices.securities[id]?.prices, d)?.[1]
        },
        edit?.id
      )
    : { errors: [] as string[], warnings: [] as string[] }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  const touch = (field: TradeField, text: string): void => {
    setTrade((t) => editTradeField(t, field, text))
  }
  const changeType = (next: TxType): void => {
    setType(next)
    setWithCash(next === 'BUY')
    setError(null)
  }

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!draft || issues.errors.length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      if (edit) {
        await updateTransaction(edit.id, draft, withCounterpart && !!counterpart)
        showNotice('Změny uloženy. Předchozí stav je v záloze (Nastavení → Data).')
      } else {
        await addTransactions([draft])
        showNotice(
          SAVED_LABEL[type] +
            (draft.withCash
              ? ` (i ${type === 'BUY' ? 'vklad' : 'výběr'} ${formatMoney(draft.amount)})`
              : '') +
            '.'
        )
      }
      onClose()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  const account = portfolio.accounts.find((a) => a.id === accountId)
  const canSave = !!draft && issues.errors.length === 0 && !busy

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-6 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label={edit ? 'Úprava transakce' : 'Nový zápis'}
        className="flex max-h-full w-[560px] flex-col rounded-2xl border bg-surface p-[22px] shadow-2xl"
      >
        <h2 className="text-lg font-semibold">
          {edit ? `Úprava: ${TX_TYPE_LABELS[edit.type].toLowerCase()}` : 'Nový zápis'}
        </h2>
        <p className="mt-0.5 mb-3 text-[13px] text-muted">
          {edit
            ? `Transakce z ${formatDate(edit.date)}. Před uložením se zazálohuje celý soubor s daty.`
            : 'Rychlý zápis jedné transakce. Před uložením se zazálohuje celý soubor s daty.'}
        </p>

        <div className="grid gap-3 overflow-auto pr-1">
          {!edit && (
            <Segmented<TxType>
              ariaLabel="Typ transakce"
              options={TYPE_OPTIONS}
              value={type}
              onChange={changeType}
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Broker">
              <select
                aria-label="Broker"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className={inputClass}
              >
                {portfolio.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Datum">
              <input
                type="date"
                aria-label="Datum"
                value={date}
                required
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {needsSecurity && (
            <>
              <Field label="ETF (naposledy použité nahoře)">
                <select
                  aria-label="ETF"
                  value={effectiveKey}
                  onChange={(e) => {
                    setSecurityKey(e.target.value)
                    setTrade((t) => ({
                      ...t,
                      priceTouched: false,
                      texts: { ...t.texts, price: '' },
                      order: t.order.filter((f) => f !== 'price')
                    }))
                  }}
                  className={inputClass}
                >
                  {secOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} – {s.name}
                    </option>
                  ))}
                  <option value={NEW_SECURITY}>+ Nové ETF…</option>
                </select>
              </Field>
              {effectiveKey === NEW_SECURITY && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-surface-2/50 p-3">
                  <Field label="Ticker (Yahoo Finance), např. VWCE.DE">
                    <input
                      aria-label="Ticker nového ETF"
                      value={newSec.ticker}
                      maxLength={20}
                      onChange={(e) => setNewSec({ ...newSec, ticker: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Název">
                    <input
                      aria-label="Název nového ETF"
                      value={newSec.name}
                      maxLength={100}
                      onChange={(e) => setNewSec({ ...newSec, name: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="ISIN (volitelné)">
                    <input
                      aria-label="ISIN nového ETF"
                      value={newSec.isin}
                      maxLength={12}
                      onChange={(e) => setNewSec({ ...newSec, isin: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Skupina indexu">
                    <input
                      aria-label="Skupina indexu nového ETF"
                      value={newSec.group}
                      placeholder="Ostatní"
                      maxLength={40}
                      onChange={(e) => setNewSec({ ...newSec, group: e.target.value })}
                      className={inputClass}
                    />
                  </Field>
                </div>
              )}
            </>
          )}

          {isTrade ? (
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  ['shares', 'Počet kusů'],
                  ['price', 'Cena / ks (€)'],
                  ['amount', 'Celkem (€)']
                ] as [TradeField, string][]
              ).map(([f, label]) => (
                <Field key={f} label={label} tag={resolved.derived === f ? 'dopočteno' : undefined}>
                  <input
                    aria-label={label}
                    inputMode="decimal"
                    autoComplete="off"
                    autoFocus={f === 'shares'}
                    value={shownText(f)}
                    onChange={(e) => touch(f, e.target.value)}
                    className={`${inputClass} ${resolved.derived === f ? 'italic opacity-80' : ''} ${
                      invalid.includes(f) ? 'border-neg' : ''
                    }`}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <Field label={type === 'FEE' ? 'Částka poplatku (€)' : 'Částka (€)'}>
              <input
                aria-label="Částka"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                value={trade.texts.amount}
                onChange={(e) => touch('amount', e.target.value)}
                className={`${inputClass} ${invalid.includes('amount') ? 'border-neg' : ''}`}
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Poplatek (€, volitelné)"
              hint={isTrade ? 'Je už zahrnutý v celkové částce – jen pro evidenci.' : undefined}
            >
              <input
                aria-label="Poplatek"
                inputMode="decimal"
                autoComplete="off"
                value={feeText}
                onChange={(e) => setFeeText(e.target.value)}
                className={`${inputClass} ${feeInvalid ? 'border-neg' : ''}`}
              />
            </Field>
            <Field label="Poznámka (volitelné)">
              <input
                aria-label="Poznámka"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>

          {isTrade && quote && (
            <div className="flex items-start gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
              <Info size={14} className="mt-px shrink-0" />
              <span>
                Kurz {effectiveKey} k {formatDate(quote[0])} je{' '}
                <b className="text-fg">{formatMoney(quote[1])}</b>
                {showPrefill ? ' (předvyplněno). ' : '. '}
                Stačí zadat 2 ze 3 polí, třetí se dopočítá.
              </span>
            </div>
          )}

          {!edit && isTrade && (
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={withCash}
                onChange={(e) => setWithCash(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Vytvořit i {type === 'BUY' ? 'vklad' : 'výběr'}{' '}
                <b>{resolved.values.amount ? formatMoney(resolved.values.amount) : ''}</b> na účet{' '}
                {account?.name}
                <span className="block text-xs text-muted">
                  {type === 'BUY'
                    ? 'Stejně jako v tvých datech: každý nákup má vklad stejné částky.'
                    : 'Zapni, pokud peníze z prodeje opouštějí účet.'}
                </span>
              </span>
            </label>
          )}
          {edit && counterpart && (
            <label className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={withCounterpart}
                onChange={(e) => setWithCounterpart(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Upravit i spárovaný {TX_TYPE_LABELS[counterpart.type].toLowerCase()} (
                {formatDate(counterpart.date)}, {formatMoney(counterpart.amount)})
                <span className="block text-xs text-muted">
                  Převezme nové datum, broker a částku.
                </span>
              </span>
            </label>
          )}

          {issues.errors.length > 0 && (
            <ul className="grid gap-1.5 rounded-lg border border-neg/50 bg-neg/10 px-3 py-2.5 text-xs text-neg">
              {issues.errors.map((m) => (
                <li key={m} className="flex gap-2">
                  <CircleAlert size={14} className="mt-px shrink-0" /> {m}
                </li>
              ))}
            </ul>
          )}
          {issues.warnings.length > 0 && (
            <ul className="grid gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
              {issues.warnings.map((m) => (
                <li key={m} className="flex gap-2">
                  <AlertTriangle size={14} className="mt-px shrink-0" /> {m}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-neg/50 bg-neg/10 px-3 py-2.5 text-xs text-neg"
            >
              {error}
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          {!draft && missing.length > 0 && (
            <span className="mr-auto text-xs text-muted">Doplň: {missing.join(', ')}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[9px] border bg-surface-2 px-4 py-2 text-[13px] hover:brightness-110 disabled:opacity-50"
          >
            Zrušit
          </button>
          <button
            type="submit"
            disabled={!canSave}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {busy
              ? 'Ukládám…'
              : edit
                ? 'Uložit změny'
                : `Uložit: ${TX_TYPE_LABELS[type].toLowerCase()}`}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Okno pro zápis nové a úpravu existující transakce (otevírá se přes `txDialog` ve store). */
export function TransactionDialog(): React.JSX.Element | null {
  const dialog = useApp((s) => s.txDialog)
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const close = useApp((s) => s.closeTxDialog)
  if (!dialog || (dialog.mode !== 'create' && dialog.mode !== 'edit') || !portfolio) return null
  const edit =
    dialog.mode === 'edit' ? portfolio.transactions.find((t) => t.id === dialog.id) : undefined
  if (dialog.mode === 'edit' && !edit) return null
  return (
    <TxForm
      key={dialog.mode === 'edit' ? dialog.id : `new-${dialog.type ?? 'BUY'}`}
      portfolio={portfolio}
      prices={prices}
      edit={edit}
      initialType={dialog.mode === 'create' ? (dialog.type ?? 'BUY') : edit!.type}
      onClose={close}
    />
  )
}
