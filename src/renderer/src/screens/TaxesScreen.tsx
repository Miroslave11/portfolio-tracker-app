import { Fragment, useCallback, useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { formatDate } from '../../../core/date'
import {
  computeLots,
  realizedByYear,
  timeTestFreeFrom,
  type RealizedSale
} from '../../../core/lots'
import { formatMoney, formatSignedMoney, type MoneyCurrency } from '../../../core/money'
import { valueAtOrBefore } from '../../../core/portfolio-calc'
import { FX_EUR_CZK } from '../../../shared/prices'
import { Card } from '../components/Card'
import { ExportMenu } from '../components/ExportMenu'
import { realizedSalesTable } from '../../../core/export-tables'
import { todayIso } from '../../../core/date'
import { Kpi, Tip } from '../components/Kpi'
import { Segmented } from '../components/Segmented'
import { TimeTestPanel } from '../components/TimeTestPanel'
import { useApp } from '../store'
import { toneClass } from '../tone'

type Tab = 'realized' | 'timetest'
const TABS: { value: Tab; label: string }[] = [
  { value: 'realized', label: 'Realizovaný zisk' },
  { value: 'timetest', label: 'Časový test 3 roky' }
]

const HELP_FIFO =
  'FIFO = první dovnitř, první ven. Každý prodej „spotřebuje“ nejstarší nakoupené kusy stejného fondu (podle ISIN, napříč všemi brokery).'
const HELP_TEST =
  'Časový test: prodej kusů držených déle než 3 roky může být od daně osvobozený. Počítá se od dne nákupu konkrétních kusů (FIFO).'

function plural(n: number, one: string, few: string, many: string): string {
  return n === 1 ? one : n >= 2 && n <= 4 ? few : many
}

export function TaxesScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const setScreen = useApp((s) => s.setScreen)
  const [tab, setTab] = useState<Tab>('realized')
  const [open, setOpen] = useState<Set<string>>(new Set())

  const fxSeries = prices.fx[FX_EUR_CZK]?.rates
  const czk = displayCurrency === 'CZK' && !!fxSeries && fxSeries.length > 0
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'

  // Loty se párují vždy přes všechny brokery (FIFO podle fondu); filtr brokera jen zúží zobrazení prodejů.
  const lots = useMemo(() => {
    if (!portfolio) return null
    const fxAt = (date: string): number | null =>
      fxSeries && fxSeries.length > 0 ? (valueAtOrBefore(fxSeries, date) ?? fxSeries[0][1]) : null
    return computeLots(portfolio, { fxAt })
  }, [portfolio, fxSeries])

  const accounts = useMemo(
    () => new Map((portfolio?.accounts ?? []).map((a) => [a.id, a])),
    [portfolio?.accounts]
  )
  const sales = useMemo(
    () =>
      (lots?.sales ?? [])
        .filter((s) => brokerFilter === 'all' || accounts.get(s.accountId)?.name === brokerFilter)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [lots, brokerFilter, accounts]
  )
  const years = useMemo(() => realizedByYear(sales, currency), [sales, currency])

  // Časový test: zbývající nákupy (filtr brokera zúží zobrazení), dnešní kurzy a přepočet měny.
  const openLots = useMemo(
    () =>
      (lots?.openLots ?? []).filter(
        (l) => brokerFilter === 'all' || accounts.get(l.accountId)?.name === brokerFilter
      ),
    [lots, brokerFilter, accounts]
  )
  const priceOf = useCallback(
    (id: string): number | undefined => prices.securities[id]?.prices.at(-1)?.[1],
    [prices.securities]
  )
  const rateToday = czk && fxSeries ? fxSeries[fxSeries.length - 1][1] : 1
  const rateAt = useCallback(
    (date: string): number =>
      czk && fxSeries ? (valueAtOrBefore(fxSeries, date) ?? fxSeries[0][1]) : 1,
    [czk, fxSeries]
  )

  if (!portfolio || portfolio.transactions.length === 0 || !lots) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="text-lg font-semibold">Zatím není z čeho počítat</div>
          <p className="max-w-md text-muted">Naimportuj historii transakcí na obrazovce Obchody.</p>
          <button
            onClick={() => setScreen('transactions')}
            className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          >
            Přejít na Obchody
          </button>
        </div>
      </Card>
    )
  }

  const pick = (eur: number, czkValue: number | null): number => (czk ? (czkValue ?? 0) : eur)
  const money = (v: number): string => formatMoney(v, currency, 0)
  const total = {
    proceeds: years.reduce((s, y) => s + y.proceeds, 0),
    gain: years.reduce((s, y) => s + y.gain, 0),
    exemptProceeds: years.reduce((s, y) => s + y.exemptProceeds, 0),
    otherProceeds: years.reduce((s, y) => s + y.otherProceeds, 0)
  }
  const toggle = (id: string): void =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const czkMissing = czk && sales.some((s) => s.gainCzk === null)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<Tab> ariaLabel="Daňový přehled" options={TABS} value={tab} onChange={setTab} />
        {brokerFilter !== 'all' && (
          <span className="text-[13px] text-muted">
            Jen údaje brokera <b className="text-fg">{brokerFilter}</b> (nákupy se párují napříč
            všemi brokery)
          </span>
        )}
        <div className="ml-auto">
          <ExportMenu
            csv={{
              label: 'CSV – realizované prodeje',
              fileName: `realizovane-prodeje-${todayIso()}.csv`,
              build: () => realizedSalesTable(sales, portfolio)
            }}
          />
        </div>
      </div>

      {tab === 'timetest' ? (
        <TimeTestPanel
          openLots={openLots}
          priceOf={priceOf}
          currency={currency}
          rateToday={rateToday}
          rateAt={rateAt}
          accountName={(id) => accounts.get(id)?.name ?? id}
        />
      ) : (
        <>
          {(lots.warnings.length > 0 || czkMissing) && (
            <div className="grid gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
              {[
                ...lots.warnings,
                ...(czkMissing
                  ? ['U některých prodejů chybí kurz ČNB – částky v Kč jsou neúplné.']
                  : [])
              ].map((w) => (
                <div key={w} className="flex gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {w}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-4 gap-4">
            <Kpi
              title="Realizovaný zisk celkem"
              value={sales.length ? formatSignedMoney(total.gain, currency, 0) : '–'}
              tone={toneClass(total.gain)}
              sub={
                sales.length
                  ? `z ${sales.length} ${plural(sales.length, 'prodeje', 'prodejů', 'prodejů')}`
                  : 'zatím žádný prodej'
              }
            />
            <Kpi
              title="Příjmy z prodejů"
              value={money(total.proceeds)}
              sub={czk ? 'kurzem ČNB ke dni prodeje' : 'součet částek z prodejů'}
            />
            <Kpi
              title={<Tip text={HELP_TEST}>Osvobozeno časovým testem</Tip>}
              value={money(total.exemptProceeds)}
              sub="příjem z kusů držených déle než 3 roky"
            />
            <Kpi
              title="Příjmy k posouzení"
              value={money(total.otherProceeds)}
              tone={total.otherProceeds > 0 ? 'text-amber-500' : ''}
              sub="bez časového testu – ověř limit osvobození"
            />
          </div>

          <div className="grid grid-cols-[3fr_2fr] gap-4">
            <Card title="Po letech" className="!pb-2">
              {years.length === 0 ? (
                <p className="py-6 text-center text-muted">
                  Zatím jsi nic neprodal – realizovaný zisk vznikne až prodejem ETF.
                </p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-muted">
                      {[
                        'Rok',
                        'Příjmy',
                        'Pořizovací cena',
                        'Zisk',
                        'Osvobozeno testem',
                        'K posouzení'
                      ].map((h, i) => (
                        <th
                          key={h}
                          className={`border-b px-2 py-1.5 font-semibold ${i ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {years.map((y) => (
                      <tr key={y.year} className="hover:bg-surface-2">
                        <td className="border-b px-2 py-2 font-semibold">
                          {y.year}
                          <span className="ml-1 text-xs font-normal text-muted">
                            ({y.sales} {plural(y.sales, 'prodej', 'prodeje', 'prodejů')})
                          </span>
                        </td>
                        <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                          {money(y.proceeds)}
                        </td>
                        <td className="border-b px-2 py-2 text-right whitespace-nowrap text-muted">
                          {money(y.cost)}
                        </td>
                        <td
                          className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(y.gain)}`}
                        >
                          {formatSignedMoney(y.gain, currency, 0)}
                        </td>
                        <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                          {money(y.exemptProceeds)}
                        </td>
                        <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                          {money(y.otherProceeds)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
            <Card title="Jak se to počítá">
              <div className="grid gap-2 text-[13px] leading-relaxed text-muted">
                <p>
                  Každý prodej spotřebuje <b className="text-fg">nejstarší nákupy</b> stejného fondu
                  (<Tip text={HELP_FIFO}>FIFO</Tip>). Zisk = příjem z prodeje − pořizovací cena
                  spotřebovaných kusů (poplatky jsou v částkách).
                </p>
                <p>
                  Časový test: kusy jsou osvobozené od dne po třetím výročí nákupu. Příjem prodeje
                  se dělí poměrem kusů, které test splnily.
                </p>
                {czk && (
                  <p>
                    V Kč: příjem kurzem ČNB ke dni prodeje, pořizovací cena kurzem ke dni nákupu.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <Card title="Detail prodejů" className="!pb-2">
            {sales.length === 0 ? (
              <p className="py-6 text-center text-muted">Žádné prodeje.</p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    {[
                      '',
                      'Datum',
                      'Broker',
                      'ETF',
                      'Kusy',
                      'Příjem',
                      'Pořízeno za',
                      'Zisk',
                      'Časový test'
                    ].map((h, i) => (
                      <th
                        key={h || 'x'}
                        className={`border-b px-2 py-1.5 font-semibold ${i >= 4 && i <= 7 ? 'text-right' : ''}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <SaleRow
                      key={s.txId}
                      sale={s}
                      expanded={open.has(s.txId)}
                      onToggle={() => toggle(s.txId)}
                      accountName={(id) => accounts.get(id)?.name ?? id}
                      money={(eur, czkValue) => formatMoney(pick(eur, czkValue), currency, 2)}
                      signed={(eur, czkValue) =>
                        formatSignedMoney(pick(eur, czkValue), currency, 2)
                      }
                      gainValue={pick(s.gain, s.gainCzk)}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Informativní přehled pro orientaci, ne daňové poradenství. Pravidla (časový test, limity
            osvobození, kurzy pro přepočet) se mohou měnit – před podáním přiznání je ověř.
          </div>
        </>
      )}
    </div>
  )
}

function SaleRow({
  sale,
  expanded,
  onToggle,
  accountName,
  money,
  signed,
  gainValue
}: {
  sale: RealizedSale
  expanded: boolean
  onToggle(): void
  accountName(id: string): string
  money(eur: number, czk: number | null): string
  signed(eur: number, czk: number | null): string
  gainValue: number
}): React.JSX.Element {
  const allExempt = sale.exemptShares >= sale.shares - 1e-9
  const noneExempt = sale.exemptShares <= 1e-9
  const firstFree = sale.uses.length
    ? sale.uses
        .map((u) => timeTestFreeFrom(u.buyDate))
        .sort()
        .at(-1)!
    : null
  const Icon = expanded ? ChevronDown : ChevronRight
  return (
    <Fragment>
      <tr className="cursor-pointer hover:bg-surface-2" onClick={onToggle} aria-expanded={expanded}>
        <td className="border-b px-2 py-2 text-muted">
          <Icon size={14} />
        </td>
        <td className="border-b px-2 py-2 whitespace-nowrap">{formatDate(sale.date)}</td>
        <td className="border-b px-2 py-2">{accountName(sale.accountId)}</td>
        <td className="border-b px-2 py-2 font-semibold">{sale.securityId}</td>
        <td className="border-b px-2 py-2 text-right">{sale.shares}</td>
        <td className="border-b px-2 py-2 text-right whitespace-nowrap">
          {money(sale.proceeds, sale.proceedsCzk)}
        </td>
        <td className="border-b px-2 py-2 text-right whitespace-nowrap text-muted">
          {money(sale.cost, sale.costCzk)}
        </td>
        <td className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(gainValue)}`}>
          {signed(sale.gain, sale.gainCzk)}
        </td>
        <td className="border-b px-2 py-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              allExempt
                ? 'bg-pos/15 text-pos'
                : noneExempt
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-accent/15 text-accent'
            }`}
            title={
              firstFree && !allExempt
                ? `Všechny kusy by byly volné od ${formatDate(firstFree)}`
                : undefined
            }
          >
            {allExempt
              ? 'splněn'
              : noneExempt
                ? 'nesplněn'
                : `částečně (${Math.round((sale.exemptShares / sale.shares) * 100)} %)`}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td />
          <td colSpan={8} className="border-b px-2 pb-3">
            <div className="mb-1 text-xs text-muted">Použité nákupy (FIFO):</div>
            <table className="w-full max-w-[720px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 pr-3 font-semibold">Nákup</th>
                  <th className="py-1 pr-3 font-semibold">Broker</th>
                  <th className="py-1 pr-3 font-semibold">ETF</th>
                  <th className="py-1 pr-3 text-right font-semibold">Kusy</th>
                  <th className="py-1 pr-3 text-right font-semibold">Pořizovací cena</th>
                  <th className="py-1 font-semibold">Drženo</th>
                </tr>
              </thead>
              <tbody>
                {sale.uses.map((u) => (
                  <tr key={u.lotId}>
                    <td className="py-1 pr-3">{formatDate(u.buyDate)}</td>
                    <td className="py-1 pr-3">{accountName(u.accountId)}</td>
                    <td className="py-1 pr-3">{u.securityId}</td>
                    <td className="py-1 pr-3 text-right">{Math.round(u.shares * 1e6) / 1e6}</td>
                    <td className="py-1 pr-3 text-right">{money(u.cost, u.costCzk)}</td>
                    <td className={`py-1 ${u.longTerm ? 'text-pos' : 'text-amber-500'}`}>
                      {u.longTerm
                        ? 'déle než 3 roky'
                        : `volné až od ${formatDate(timeTestFreeFrom(u.buyDate))}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </Fragment>
  )
}
