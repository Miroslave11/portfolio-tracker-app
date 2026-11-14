import { useState } from 'react'
import { AlertTriangle, CircleAlert, Plus, X } from 'lucide-react'
import { todayIso, formatMonthLong } from '../../../core/date'
import { calculateInvestments } from '../../../core/investments'
import { formatMoney } from '../../../core/money'
import {
  buysInMonth,
  monthOf,
  planFromLastMonth,
  planToRows,
  rowsToDrafts,
  type PlanRow
} from '../../../core/monthly-plan'
import {
  deriveTrade,
  editTradeField,
  EMPTY_TRADE_INPUT,
  formatInput,
  parseNumber,
  type TradeField,
  type TradeInputState
} from '../../../core/trade-math'
import { validateDraft } from '../../../core/transaction-edit'
import type { Portfolio } from '../../../shared/model'
import type { PriceCache, PricePoint } from '../../../shared/prices'
import type { MonthlyPlan, MonthlyPlanItem } from '../../../shared/settings'
import { cleanError } from '../errors'
import { useApp } from '../store'
import { ModalShell } from './ModalShell'

const inputClass =
  'w-full rounded-[8px] border bg-surface-2 px-2 py-[6px] text-[13px] outline-none focus:border-accent'
const buttonGhost =
  'rounded-[9px] border bg-surface-2 px-4 py-2 text-[13px] hover:brightness-110 disabled:opacity-50'
const buttonPrimary =
  'rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-40'

function quoteAt(points: readonly PricePoint[] | undefined, date: string): PricePoint | null {
  if (!points) return null
  for (let i = points.length - 1; i >= 0; i--) if (points[i][0] <= date) return points[i]
  return null
}

/** ETF seřazená tak, aby ta naposledy použitá u daného brokera byla nahoře. */
function sortedSecurities(portfolio: Portfolio, accountId: string): Portfolio['securities'] {
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
}

// ---------------------------------------------------------------------------
// Hromadný formulář měsíčního nákupu
// ---------------------------------------------------------------------------

interface RowState {
  key: string
  accountId: string
  securityId: string
  date: string
  trade: TradeInputState
}

function rowFromPlan(r: PlanRow): RowState {
  let trade = EMPTY_TRADE_INPUT
  if (r.shares !== undefined) trade = editTradeField(trade, 'shares', formatInput(r.shares, 6))
  else if (r.amount !== undefined) trade = editTradeField(trade, 'amount', formatInput(r.amount, 2))
  return { key: r.key, accountId: r.accountId, securityId: r.securityId, date: r.date, trade }
}

function MonthlyForm({
  portfolio,
  prices,
  initialRows,
  fromRebalance = false,
  onClose
}: {
  portfolio: Portfolio
  prices: PriceCache
  initialRows: PlanRow[]
  /** Řádky přišly z cílové alokace (ne ze šablony). */
  fromRebalance?: boolean
  onClose(): void
}): React.JSX.Element {
  const addTransactions = useApp((s) => s.addTransactions)
  const showNotice = useApp((s) => s.showNotice)
  const openTxDialog = useApp((s) => s.openTxDialog)

  const today = todayIso()
  const [rows, setRows] = useState<RowState[]>(() => initialRows.map(rowFromPlan))
  const [withCash, setWithCash] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState(100)

  const derived = rows.map((r) =>
    deriveTrade(r.trade, quoteAt(prices.securities[r.securityId]?.prices, r.date)?.[1] ?? null)
  )
  const complete = rows.map((_, i) => {
    const v = derived[i].values
    return (
      derived[i].invalid.length === 0 && !!v.shares && v.shares > 0 && !!v.amount && v.amount > 0
    )
  })
  const total = derived.reduce((s, d, i) => s + (complete[i] ? d.values.amount! : 0), 0)
  const allComplete = rows.length > 0 && complete.every(Boolean)

  const month = rows[0] ? monthOf(rows[0].date) : monthOf(today)
  const already = buysInMonth(portfolio, month)
  const stats = calculateInvestments(portfolio, { asOf: today })
  const [y, m] = month.split('-').map(Number)
  const prevMonthKey = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`
  const prevTotal = stats.months.find((x) => x.month === prevMonthKey)?.total

  const drafts = allComplete
    ? rowsToDrafts(
        rows.map((r, i) => ({
          accountId: r.accountId,
          securityId: r.securityId,
          date: r.date,
          shares: derived[i].values.shares!,
          amount: derived[i].values.amount!
        })),
        withCash
      )
    : []
  const warnings = [
    ...new Set(
      drafts.flatMap((d) =>
        validateDraft(portfolio, d, {
          today,
          priceAt: (id, date) => quoteAt(prices.securities[id]?.prices, date)?.[1]
        }).warnings.map((w) => `${d.securityId}: ${w}`)
      )
    )
  ]
  const errors = drafts.flatMap((d) =>
    validateDraft(portfolio, d, { today }).errors.map((e) => `${d.securityId}: ${e}`)
  )

  const patchRow = (key: string, patch: Partial<RowState>): void =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const touch = (key: string, field: TradeField, text: string): void =>
    setRows((rs) =>
      rs.map((r) => (r.key === key ? { ...r, trade: editTradeField(r.trade, field, text) } : r))
    )
  const addRow = (): void => {
    const last = rows[rows.length - 1]
    const accountId = last?.accountId ?? portfolio.accounts[0].id
    const used = new Set(rows.filter((r) => r.accountId === accountId).map((r) => r.securityId))
    const security =
      sortedSecurities(portfolio, accountId).find((s) => !used.has(s.id)) ?? portfolio.securities[0]
    setRows((rs) => [
      ...rs,
      {
        key: `row-${nextKey}`,
        accountId,
        securityId: security.id,
        date: last?.date ?? today,
        trade: EMPTY_TRADE_INPUT
      }
    ])
    setNextKey((n) => n + 1)
  }

  const save = async (): Promise<void> => {
    if (!allComplete || errors.length > 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      await addTransactions(drafts)
      showNotice(
        `Zapsáno ${drafts.length} ${drafts.length === 1 ? 'nákup' : drafts.length < 5 ? 'nákupy' : 'nákupů'} (celkem ${formatMoney(total)}${withCash ? ', i vklady' : ''}).`
      )
      onClose()
    } catch (err) {
      setError(cleanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalShell label="Měsíční nákup" width={820} busy={busy} onClose={onClose}>
      <h2 className="text-lg font-semibold">Měsíční nákup – {formatMonthLong(month)}</h2>
      <p className="mt-0.5 mb-3 text-[13px] text-muted">
        {fromRebalance
          ? 'Předvyplněno podle cílové alokace (částky na dorovnání podílů).'
          : 'Předvyplněno ze šablony.'}{' '}
        Doplň skutečné kusy nebo částky, třetí údaj se dopočítá z kurzu.
      </p>

      <div className="grid gap-3 overflow-auto pr-1">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              {[
                ['Broker', 'w-[150px]'],
                ['ETF', 'w-[120px]'],
                ['Datum', 'w-[150px]'],
                ['Kusy', 'w-[110px]'],
                ['Celkem €', 'w-[120px]'],
                ['Cena / ks', 'w-[90px]'],
                ['', 'w-[36px]']
              ].map(([h, w], i) => (
                <th
                  key={h || 'x'}
                  className={`px-1.5 py-1.5 font-semibold whitespace-nowrap ${w} ${i === 3 || i === 4 || i === 5 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = derived[i]
              const price = d.values.price ?? d.values.amount! / (d.values.shares ?? NaN)
              return (
                <tr key={r.key}>
                  <td className="px-1.5 py-1">
                    <select
                      aria-label={`Broker, řádek ${i + 1}`}
                      value={r.accountId}
                      onChange={(e) => patchRow(r.key, { accountId: e.target.value })}
                      className={inputClass}
                    >
                      {portfolio.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <select
                      aria-label={`ETF, řádek ${i + 1}`}
                      value={r.securityId}
                      onChange={(e) =>
                        patchRow(r.key, {
                          securityId: e.target.value,
                          // Cena se po změně ETF znovu předvyplní z jeho kurzu.
                          trade: {
                            ...r.trade,
                            priceTouched: false,
                            texts: { ...r.trade.texts, price: '' },
                            order: r.trade.order.filter((f) => f !== 'price')
                          }
                        })
                      }
                      className={inputClass}
                    >
                      {portfolio.securities.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1.5 py-1">
                    <input
                      type="date"
                      aria-label={`Datum, řádek ${i + 1}`}
                      value={r.date}
                      onChange={(e) => patchRow(r.key, { date: e.target.value })}
                      className={inputClass}
                    />
                  </td>
                  {(['shares', 'amount'] as const).map((f) => (
                    <td key={f} className="px-1.5 py-1">
                      <input
                        aria-label={`${f === 'shares' ? 'Kusy' : 'Celkem €'}, řádek ${i + 1}`}
                        inputMode="decimal"
                        autoComplete="off"
                        value={d.shown(f)}
                        onChange={(e) => touch(r.key, f, e.target.value)}
                        className={`${inputClass} text-right ${
                          d.derived === f ? 'italic opacity-80' : ''
                        } ${d.invalid.includes(f) ? 'border-neg' : ''}`}
                      />
                    </td>
                  ))}
                  <td className="px-1.5 py-1 text-right whitespace-nowrap text-muted">
                    {Number.isFinite(price) && price > 0 ? formatMoney(price) : '–'}
                  </td>
                  <td className="px-1.5 py-1 text-right">
                    <button
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      aria-label={`Odebrat řádek ${i + 1}`}
                      title="Odebrat řádek"
                      className="rounded-md p-1.5 text-muted hover:bg-neg/15 hover:text-neg"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-muted">
                  Žádný řádek. Přidej ho tlačítkem níže.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center gap-4 text-[13px]">
          <button onClick={addRow} className="flex items-center gap-1 text-accent hover:underline">
            <Plus size={14} /> přidat řádek
          </button>
          <button
            onClick={() => openTxDialog({ mode: 'plan', thenMonthly: true })}
            className="text-accent hover:underline"
          >
            upravit šablonu
          </button>
        </div>

        <div className="rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-muted">
          Celkem <b className="text-fg">{formatMoney(total)}</b>
          {prevTotal !== undefined && prevTotal > 0 && (
            <> · minulý měsíc {formatMoney(prevTotal)}</>
          )}
        </div>
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={withCash}
            onChange={(e) => setWithCash(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Vytvořit i vklady na účty
            <span className="block text-xs text-muted">
              Ke každému nákupu vznikne vklad stejné částky (jako v tvých datech).
            </span>
          </span>
        </label>

        {already > 0 && (
          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            <AlertTriangle size={14} className="mt-px shrink-0" />
            Za {formatMonthLong(month)} už je zapsáno {already}{' '}
            {already === 1 ? 'nákup' : already < 5 ? 'nákupy' : 'nákupů'} – nezapisuješ je podruhé?
          </div>
        )}
        {errors.length > 0 && (
          <ul className="grid gap-1.5 rounded-lg border border-neg/50 bg-neg/10 px-3 py-2.5 text-xs text-neg">
            {errors.map((e) => (
              <li key={e} className="flex gap-2">
                <CircleAlert size={14} className="mt-px shrink-0" /> {e}
              </li>
            ))}
          </ul>
        )}
        {warnings.length > 0 && (
          <ul className="grid gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-500">
            {warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <AlertTriangle size={14} className="mt-px shrink-0" /> {w}
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
        {!allComplete && rows.length > 0 && (
          <span className="mr-auto text-xs text-muted">
            U každého řádku doplň kusy nebo celkovou částku.
          </span>
        )}
        <button onClick={onClose} disabled={busy} className={buttonGhost}>
          Zrušit
        </button>
        <button
          onClick={save}
          disabled={!allComplete || errors.length > 0 || busy}
          className={buttonPrimary}
        >
          {busy
            ? 'Ukládám…'
            : `Uložit ${rows.length} ${rows.length === 1 ? 'nákup' : rows.length < 5 ? 'nákupy' : 'nákupů'}`}
        </button>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Editor šablony
// ---------------------------------------------------------------------------

interface ItemState {
  key: string
  accountId: string
  securityId: string
  shares: string
  amount: string
}

function itemFrom(i: MonthlyPlanItem, n: number): ItemState {
  return {
    key: `item-${n}`,
    accountId: i.accountId,
    securityId: i.securityId,
    shares: i.shares !== undefined ? formatInput(i.shares, 6) : '',
    amount: i.amount !== undefined ? formatInput(i.amount, 2) : ''
  }
}

function PlanEditor({
  portfolio,
  plan,
  thenMonthly,
  onClose
}: {
  portfolio: Portfolio
  plan: MonthlyPlan | null
  thenMonthly: boolean
  onClose(): void
}): React.JSX.Element {
  const updateSettings = useApp((s) => s.updateSettings)
  const openTxDialog = useApp((s) => s.openTxDialog)
  const showNotice = useApp((s) => s.showNotice)
  const [items, setItems] = useState<ItemState[]>(() => (plan?.items ?? []).map(itemFrom))
  const [remindDay, setRemindDay] = useState(String(plan?.remindFromDay ?? 10))
  const [nextKey, setNextKey] = useState(100)

  const parsed = items.map((i) => ({
    shares: i.shares.trim() ? parseNumber(i.shares) : undefined,
    amount: i.amount.trim() ? parseNumber(i.amount) : undefined
  }))
  const badNumber = parsed.some(
    (p) => p.shares === null || p.amount === null || (p.shares ?? 1) <= 0 || (p.amount ?? 1) <= 0
  )
  const day = Number(remindDay)
  const dayOk = Number.isInteger(day) && day >= 1 && day <= 28
  const valid = items.length > 0 && items.length <= 12 && !badNumber && dayOk

  const patch = (key: string, p: Partial<ItemState>): void =>
    setItems((is) => is.map((i) => (i.key === key ? { ...i, ...p } : i)))
  const addItem = (): void => {
    const last = items[items.length - 1]
    const accountId = last?.accountId ?? portfolio.accounts[0].id
    const used = new Set(items.filter((i) => i.accountId === accountId).map((i) => i.securityId))
    const security =
      sortedSecurities(portfolio, accountId).find((s) => !used.has(s.id)) ?? portfolio.securities[0]
    setItems((is) => [
      ...is,
      { key: `item-${nextKey}`, accountId, securityId: security.id, shares: '', amount: '' }
    ])
    setNextKey((n) => n + 1)
  }
  const fillFromHistory = (): void => {
    const suggestion = planFromLastMonth(portfolio)
    if (suggestion) setItems(suggestion.items.map(itemFrom))
  }

  const finish = (): void => {
    if (thenMonthly) openTxDialog({ mode: 'monthly' })
    else onClose()
  }
  const save = async (): Promise<void> => {
    if (!valid) return
    await updateSettings({
      monthlyPlan: {
        remindFromDay: day,
        items: items.map((i, n) => ({
          accountId: i.accountId,
          securityId: i.securityId,
          ...(parsed[n].shares ? { shares: parsed[n].shares as number } : {}),
          ...(parsed[n].amount ? { amount: parsed[n].amount as number } : {})
        }))
      }
    })
    showNotice('Šablona měsíčního nákupu uložena.')
    finish()
  }
  const remove = async (): Promise<void> => {
    await updateSettings({ monthlyPlan: null })
    showNotice('Šablona měsíčního nákupu smazána.')
    onClose()
  }

  return (
    <ModalShell label="Šablona měsíčního nákupu" width={720} onClose={onClose}>
      <h2 className="text-lg font-semibold">Šablona měsíčního nákupu</h2>
      <p className="mt-0.5 mb-3 text-[13px] text-muted">
        Co pravidelně nakupuješ. U každého řádku zadej typický počet kusů <i>nebo</i> částku; při
        zápisu se druhé dopočítá z aktuálního kurzu a vše můžeš upravit.
      </p>

      <div className="grid gap-3 overflow-auto pr-1">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              {[
                ['Broker', 'w-[170px]'],
                ['ETF', 'w-[130px]'],
                ['Kusy', 'w-[130px]'],
                ['nebo částka €', 'w-[130px]'],
                ['', 'w-[36px]']
              ].map(([h, w], i) => (
                <th
                  key={h || 'x'}
                  className={`px-1.5 py-1.5 font-semibold whitespace-nowrap ${w} ${i === 2 || i === 3 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it, n) => (
              <tr key={it.key}>
                <td className="px-1.5 py-1">
                  <select
                    aria-label={`Broker, položka ${n + 1}`}
                    value={it.accountId}
                    onChange={(e) => patch(it.key, { accountId: e.target.value })}
                    className={inputClass}
                  >
                    {portfolio.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-1.5 py-1">
                  <select
                    aria-label={`ETF, položka ${n + 1}`}
                    value={it.securityId}
                    onChange={(e) => patch(it.key, { securityId: e.target.value })}
                    className={inputClass}
                  >
                    {portfolio.securities.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.id}
                      </option>
                    ))}
                  </select>
                </td>
                {(['shares', 'amount'] as const).map((f) => (
                  <td key={f} className="px-1.5 py-1">
                    <input
                      aria-label={`${f === 'shares' ? 'Kusy' : 'Částka'}, položka ${n + 1}`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={it[f]}
                      onChange={(e) => patch(it.key, { [f]: e.target.value })}
                      className={`${inputClass} text-right`}
                    />
                  </td>
                ))}
                <td className="px-1.5 py-1 text-right">
                  <button
                    onClick={() => setItems((is) => is.filter((x) => x.key !== it.key))}
                    aria-label={`Odebrat položku ${n + 1}`}
                    title="Odebrat"
                    className="rounded-md p-1.5 text-muted hover:bg-neg/15 hover:text-neg"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-muted">
                  Šablona je prázdná. Přidej řádek nebo ji vyplň z posledního měsíce.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center gap-4 text-[13px]">
          <button onClick={addItem} className="flex items-center gap-1 text-accent hover:underline">
            <Plus size={14} /> přidat řádek
          </button>
          <button onClick={fillFromHistory} className="text-accent hover:underline">
            vyplnit z posledního měsíce s nákupem
          </button>
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          Připomenout od
          <input
            aria-label="Připomenout od dne v měsíci"
            inputMode="numeric"
            value={remindDay}
            onChange={(e) => setRemindDay(e.target.value)}
            className={`${inputClass} w-[64px] text-center ${dayOk ? '' : 'border-neg'}`}
          />
          . dne v měsíci, pokud ještě nic nenakoupeno (1–28)
        </label>
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {plan && (
          <button onClick={remove} className="mr-auto text-[13px] text-neg hover:underline">
            Smazat šablonu
          </button>
        )}
        <button onClick={onClose} className={buttonGhost}>
          Zrušit
        </button>
        <button onClick={save} disabled={!valid} className={buttonPrimary}>
          Uložit šablonu
        </button>
      </div>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Vstupní bod
// ---------------------------------------------------------------------------

/** Okno měsíčního nákupu (hromadný zápis) a editor šablony; ovládá se přes `txDialog` ve store. */
export function MonthlyDialog(): React.JSX.Element | null {
  const dialog = useApp((s) => s.txDialog)
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const plan = useApp((s) => s.settings.monthlyPlan)
  const close = useApp((s) => s.closeTxDialog)
  const openTxDialog = useApp((s) => s.openTxDialog)
  if (!dialog || !portfolio || portfolio.accounts.length === 0) return null

  if (dialog.mode === 'plan') {
    return (
      <PlanEditor
        key="plan"
        portfolio={portfolio}
        plan={plan}
        thenMonthly={!!dialog.thenMonthly}
        onClose={close}
      />
    )
  }
  if (dialog.mode !== 'monthly') return null

  if (!plan && !dialog.rows) {
    return (
      <ModalShell label="Měsíční nákup" width={520} onClose={close}>
        <h2 className="text-lg font-semibold">Měsíční nákup</h2>
        <p className="mt-2 text-[13px] text-muted">
          Zatím nemáš šablonu. Šablona je seznam toho, co pravidelně nakupuješ (broker, ETF a
          typický počet kusů). Pak stačí jednou za měsíc doplnit skutečné údaje a uložit všechno
          najednou.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={close} className={buttonGhost}>
            Zrušit
          </button>
          <button
            onClick={() => openTxDialog({ mode: 'plan', thenMonthly: true })}
            className={buttonPrimary}
          >
            Vytvořit šablonu
          </button>
        </div>
      </ModalShell>
    )
  }
  return (
    <MonthlyForm
      key="monthly"
      portfolio={portfolio}
      prices={prices}
      initialRows={dialog.rows ?? planToRows(plan!, portfolio, todayIso())}
      fromRebalance={!!dialog.rows}
      onClose={close}
    />
  )
}
