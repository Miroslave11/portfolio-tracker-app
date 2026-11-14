import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ShoppingCart, Wand2 } from 'lucide-react'
import { allocateBySecurity } from '../../../core/allocation'
import { todayIso } from '../../../core/date'
import { formatDuration } from '../../../core/goal-projection'
import { formatMoney, formatPercent } from '../../../core/money'
import type { PlanRow } from '../../../core/monthly-plan'
import { calculatePortfolio } from '../../../core/portfolio-calc'
import {
  computeRebalance,
  monthsToTarget,
  roundToTotal,
  targetsSum,
  type RebalanceTarget
} from '../../../core/rebalance'
import { parseNumber } from '../../../core/trade-math'
import type { Portfolio, Security } from '../../../shared/model'
import type { Rebalance } from '../../../shared/settings'
import { useApp } from '../store'
import { Card } from './Card'
import { Tip } from './Kpi'

const SAVE_DELAY_MS = 500
const eur = (v: number): string => formatMoney(v, 'EUR', 0)
/** „45“ / „12,5“ – procenta do políčka cíle. */
const pctInput = (share: number): string => String(Math.round(share * 1000) / 10).replace('.', ',')

/** Odchylka v procentních bodech se znaménkem: „+10,3 p. b.“ */
function pp(deviation: number): string {
  const v = Math.round(deviation * 1000) / 10
  if (v === 0) return '0 p. b.'
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1).replace('.', ',')} p. b.`
}

interface Suggestion {
  group: string
  amount: number
  security: Security
  accountId: string
  accountName: string
  /** Proč právě toto ETF/broker. */
  reason: string
}

/** Co koupit ve skupině: ETF a broker z posledního nákupu v ní, jinak první ETF skupiny. */
function pickSecurity(
  portfolio: Portfolio,
  group: string
): Omit<Suggestion, 'group' | 'amount'> | null {
  const inGroup = portfolio.securities.filter((s) => s.indexGroup === group)
  if (inGroup.length === 0) return null
  const ids = new Set(inGroup.map((s) => s.id))
  const last = portfolio.transactions
    .filter((t) => t.type === 'BUY' && t.securityId && ids.has(t.securityId))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)
  const security = inGroup.find((s) => s.id === last?.securityId) ?? inGroup[0]
  const accountId = last?.accountId ?? portfolio.accounts[0]?.id
  const account = portfolio.accounts.find((a) => a.id === accountId)
  if (!account) return null
  return {
    security,
    accountId: account.id,
    accountName: account.name,
    reason: last ? 'naposledy kupované' : 'zatím nekupované'
  }
}

/** Záložka „Cílová alokace“: cílové podíly podle indexu a rozdělení měsíčního nákupu. */
export function TargetAllocation(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const saved = useApp((s) => s.settings.rebalance)
  const goalMonthly = useApp((s) => s.settings.goal.monthlyEur)
  const updateSettings = useApp((s) => s.updateSettings)
  const openTxDialog = useApp((s) => s.openTxDialog)

  // Cíle se upravují v textových polích; uloží se po chvíli klidu.
  const [rebalance, setRebalance] = useState<Rebalance>(saved)
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(saved.targets.map((t) => [t.group, pctInput(t.share)]))
  )
  const monthly = rebalance.monthlyEur ?? goalMonthly
  const [monthlyText, setMonthlyText] = useState(String(Math.round(monthly)))
  const lastSaved = useRef(saved)
  useEffect(() => {
    if (JSON.stringify(rebalance) === JSON.stringify(lastSaved.current)) return
    const id = setTimeout(() => {
      lastSaved.current = rebalance
      void updateSettings({ rebalance })
    }, SAVE_DELAY_MS)
    return () => clearTimeout(id)
  }, [rebalance, updateSettings])

  // Cílová alokace se počítá z celého portfolia (filtr brokera se neuplatňuje).
  const slices = useMemo(() => {
    if (!portfolio) return []
    const summary = calculatePortfolio({ portfolio, prices, accountIds: null }).summary
    return summary ? allocateBySecurity(summary.positions, portfolio.securities, 'index') : []
  }, [portfolio, prices])

  const groups = useMemo(() => {
    const out = new Map<string, string>() // skupina → barva
    for (const s of slices) out.set(s.key, s.color)
    for (const sec of portfolio?.securities ?? []) {
      if (!out.has(sec.indexGroup)) out.set(sec.indexGroup, sec.color)
    }
    return out
  }, [slices, portfolio?.securities])

  // Cíle jen pro existující skupiny (ETF mohlo mezitím změnit skupinu).
  const targets: RebalanceTarget[] = useMemo(
    () => rebalance.targets.filter((t) => groups.has(t.group)),
    [rebalance.targets, groups]
  )
  const values = useMemo(() => new Map(slices.map((s) => [s.key, s.value])), [slices])
  const sum = targetsSum(targets)
  const hasTargets = sum > 0
  const rows = useMemo(
    () => computeRebalance(values, targets, hasTargets ? monthly : 0),
    [values, targets, monthly, hasTargets]
  )
  // Skupiny bez hodnoty i bez cíle (ETF ve skupině zatím nedržíš) – aby šel nastavit cíl.
  const allRows = [
    ...rows,
    ...[...groups.keys()]
      .filter((g) => !rows.some((r) => r.group === g))
      .map((group) => ({
        group,
        value: 0,
        share: 0,
        target: 0,
        deviation: 0,
        buy: 0,
        shareAfter: 0
      }))
  ]
  const months = useMemo(
    () => (hasTargets ? monthsToTarget(values, targets, monthly) : null),
    [values, targets, monthly, hasTargets]
  )

  if (!portfolio || slices.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center text-muted">
          Zatím nedržíš žádné ETF – cílovou alokaci nastavíš, až budou v portfoliu pozice.
        </div>
      </Card>
    )
  }

  const total = slices.reduce((s, x) => s + x.value, 0)
  const totalBuy = allRows.reduce((s, r) => s + r.buy, 0)
  const sumOk = Math.abs(sum - 1) < 0.0005

  const setTarget = (group: string, text: string): void => {
    setTexts((t) => ({ ...t, [group]: text }))
    const n = parseNumber(text)
    if (text.trim() !== '' && (n === null || n < 0 || n > 100)) return
    const share = text.trim() === '' ? 0 : Math.round((n ?? 0) * 10) / 1000
    setRebalance((r) => ({
      ...r,
      targets: [
        ...r.targets.filter((x) => x.group !== group && groups.has(x.group)),
        ...(share > 0 ? [{ group, share }] : [])
      ].sort((a, b) => b.share - a.share)
    }))
  }

  const fromCurrent = (): void => {
    // Současné podíly zaokrouhlené na 0,1 % se součtem přesně 100 %.
    const tenths = roundToTotal(
      slices.map((s) => s.share * 1000),
      1000
    )
    const next = slices
      .map((s, i) => ({ group: s.key, share: tenths[i] / 1000 }))
      .filter((t) => t.share > 0)
    setRebalance((r) => ({ ...r, targets: next }))
    setTexts(Object.fromEntries(next.map((t) => [t.group, pctInput(t.share)])))
  }

  const commitMonthly = (): void => {
    const n = parseNumber(monthlyText)
    if (n !== null && n >= 0 && n <= 1_000_000) {
      setRebalance((r) => ({ ...r, monthlyEur: Math.round(n) }))
      setMonthlyText(String(Math.round(n)))
    } else setMonthlyText(String(Math.round(monthly)))
  }

  const suggestions: Suggestion[] = allRows
    .filter((r) => r.buy > 0)
    .flatMap((r) => {
      const pick = pickSecurity(portfolio, r.group)
      return pick ? [{ group: r.group, amount: r.buy, ...pick }] : []
    })

  const prefill = (): void => {
    const today = todayIso()
    const planRows: PlanRow[] = suggestions.map((s, i) => ({
      key: `rebalance-${i}`,
      accountId: s.accountId,
      securityId: s.security.id,
      date: today,
      amount: s.amount
    }))
    openTxDialog({ mode: 'monthly', rows: planRows })
  }

  return (
    <div className="grid gap-4">
      {brokerFilter !== 'all' && (
        <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          Cílová alokace se počítá z celého portfolia, filtr brokera se tu neuplatňuje.
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
            Cíl vs skutečnost (podle indexu)
          </h3>
          <button
            onClick={fromCurrent}
            className="flex items-center gap-1.5 rounded-[8px] border bg-surface-2 px-2.5 py-[5px] text-xs hover:brightness-110"
            title="Nastaví cílové podíly podle současného rozložení – pak je stačí upravit"
          >
            <Wand2 size={13} /> Podle současnosti
          </button>
          <label className="ml-auto flex items-center gap-2 text-[13px] text-muted">
            Měsíční nákup:
            <input
              aria-label="Měsíční nákup v EUR"
              inputMode="numeric"
              value={monthlyText}
              onChange={(e) => setMonthlyText(e.target.value)}
              onBlur={commitMonthly}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-[100px] rounded-[8px] border bg-surface-2 px-2.5 py-[6px] text-right text-[13px] text-fg"
            />
            €
          </label>
        </div>

        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="border-b px-2 py-1.5 font-semibold">Index</th>
              <th className="w-[26%] border-b px-2 py-1.5 font-semibold">Skutečnost vs cíl</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Skutečnost</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Cíl</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">Odchylka</th>
              <th className="border-b px-2 py-1.5 text-right font-semibold">
                <Tip text="Jak rozdělit měsíční nákup: dokupují se jen indexy pod cílem, nejvíc podvážené první. Nic se neprodává (kvůli dani a časovému testu).">
                  Doporučený nákup
                </Tip>
              </th>
            </tr>
          </thead>
          <tbody>
            {allRows.map((r) => {
              const color = groups.get(r.group) ?? '#888'
              const big = Math.abs(r.deviation) >= 0.05 && r.target > 0
              return (
                <tr key={r.group} className="hover:bg-surface-2">
                  <td className="border-b px-2 py-2">
                    <span
                      className="mr-2 inline-block size-2.5 rounded-full align-middle"
                      style={{ background: color }}
                    />
                    <b>{r.group}</b>
                  </td>
                  <td className="border-b px-2 py-2">
                    <div className="relative h-2.5 rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.min(100, r.share * 100)}%`, background: color }}
                      />
                      {r.target > 0 && (
                        <span
                          className="absolute -top-1 h-[18px] w-0.5 rounded bg-fg"
                          style={{ left: `${Math.min(100, r.target * 100)}%` }}
                          title={`Cíl ${formatPercent(r.target, 1)}`}
                        />
                      )}
                    </div>
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    {formatPercent(r.share, 1)}
                    <div className="text-xs text-muted">{eur(r.value)}</div>
                  </td>
                  <td className="border-b px-2 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <input
                        aria-label={`Cílový podíl ${r.group}`}
                        inputMode="decimal"
                        value={texts[r.group] ?? ''}
                        placeholder="0"
                        onChange={(e) => setTarget(r.group, e.target.value)}
                        className="w-[64px] rounded-[7px] border bg-surface-2 px-2 py-1 text-right"
                      />
                      %
                    </span>
                  </td>
                  <td
                    className={`border-b px-2 py-2 text-right whitespace-nowrap ${
                      !hasTargets || r.target === 0
                        ? 'text-muted'
                        : big
                          ? 'text-amber-500'
                          : 'text-muted'
                    }`}
                  >
                    {hasTargets && r.target > 0 ? pp(r.deviation) : '–'}
                  </td>
                  <td
                    className={`border-b px-2 py-2 text-right whitespace-nowrap ${r.buy > 0 ? 'font-semibold text-pos' : 'text-muted'}`}
                  >
                    {r.buy > 0 ? `+${eur(r.buy)}` : eur(0)}
                  </td>
                </tr>
              )
            })}
            <tr className="font-semibold">
              <td className="px-2 py-2">Celkem</td>
              <td />
              <td className="px-2 py-2 text-right whitespace-nowrap">
                100 %<div className="text-xs font-normal text-muted">{eur(total)}</div>
              </td>
              <td
                className={`px-2 py-2 text-right whitespace-nowrap ${hasTargets && !sumOk ? 'text-neg' : ''}`}
              >
                {formatPercent(sum, 1)}
              </td>
              <td />
              <td className="px-2 py-2 text-right whitespace-nowrap">{eur(totalBuy)}</td>
            </tr>
          </tbody>
        </table>
        {!hasTargets ? (
          <p className="mt-2 text-xs text-muted">
            Zadej cílové podíly (součet 100 %), nebo začni tlačítkem „Podle současnosti“.
          </p>
        ) : (
          !sumOk && (
            <p className="mt-2 flex gap-1.5 text-xs text-amber-500">
              <AlertTriangle size={13} className="mt-px shrink-0" />
              Součet cílů je {formatPercent(sum, 1)}, ne 100 % – doporučení počítá s jejich poměrem.
            </p>
          )
        )}
      </Card>

      {hasTargets && (
        <div className="grid grid-cols-2 gap-4">
          <Card title="Návrh pro tento měsíc">
            {suggestions.length === 0 ? (
              <p className="text-[13px] text-muted">
                Zadej částku měsíčního nákupu – pak tu bude, co koupit.
              </p>
            ) : (
              <ul className="grid gap-1.5 text-[13px] leading-relaxed">
                {suggestions.map((s) => (
                  <li key={s.group}>
                    Koupit za <b>{eur(s.amount)}</b> {s.group} – <b>{s.security.id}</b> u{' '}
                    {s.accountName} <span className="text-muted">({s.reason})</span>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={prefill}
              disabled={suggestions.length === 0}
              className="mt-3 flex items-center gap-1.5 rounded-[9px] bg-accent px-3.5 py-2 text-[13px] font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              <ShoppingCart size={15} /> Předvyplnit měsíční nákup
            </button>
            <p className="mt-2 text-xs text-muted">
              Otevře formulář měsíčního nákupu s těmito částkami; kusy se dopočítají z kurzu a vše
              ještě můžeš upravit.
            </p>
          </Card>
          <Card title="Kdy se dostaneš na cíl">
            <p className="text-[13px] leading-relaxed">
              {months === 0 ? (
                <>Už jsi na cílových podílech (odchylka do 1 p. b.).</>
              ) : months !== null ? (
                <>
                  Při dokupování jen podvážených indexů a nákupu {eur(monthly)} měsíčně se na cílové
                  podíly (±1 p. b.) dostaneš zhruba za <b>{formatDuration(months)}</b>.
                </>
              ) : (
                <>
                  Jen dokupováním se na cíl nedostaneš do 20 let – nadvážený index je na to moc
                  velký. Pomůže vyšší měsíční nákup nebo méně přísný cíl.
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-muted">
              Odhad bez pohybu kurzů. Cílové podíly se ukládají do nastavení. Prodej nadvážených ETF
              aplikace nenavrhuje (kvůli dani a časovému testu 3 roky).
            </p>
          </Card>
        </div>
      )}
    </div>
  )
}
