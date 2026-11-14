import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { EChartsCoreOption } from 'echarts/core'
import {
  allocateByBroker,
  allocateBySecurity,
  type AllocationGroupBy,
  type AllocationSlice
} from '../../../core/allocation'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import type { Security } from '../../../shared/model'
import { type ChartColors, useChartColors } from '../chartColors'
import { Card } from '../components/Card'
import { EChart } from '../components/EChart'
import { Segmented } from '../components/Segmented'
import { TargetAllocation } from '../components/TargetAllocation'
import { useApp } from '../store'
import { toneClass } from '../tone'
import { usePortfolioCalc } from '../useCalc'

const GROUP_OPTIONS: { value: AllocationGroupBy; label: string }[] = [
  { value: 'index', label: 'Index' },
  { value: 'etf', label: 'ETF (dle ISIN)' },
  { value: 'broker', label: 'Broker' }
]
const GROUP_TITLES: Record<AllocationGroupBy, string> = {
  index: 'Podle indexu',
  etf: 'Podle ETF',
  broker: 'Podle brokera'
}

/** Zkrácený název do popisku grafu (plný název zůstává v tabulce a tooltipu). */
function chartName(name: string): string {
  return name
    .replace(/\s*UCITS ETF\s*/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Díly menší než tento podíl mají popisek mimo prstenec (uvnitř by se nevešel). */
const OUTSIDE_LABEL_BELOW = 0.1
const RING_RATIO = 0.46

/** Poloměr prstence podle šířky karty (největší, jaký se vejde i s popisky malých dílů). */
function ringOuterRadius(boxWidth: number): number {
  return Math.max(110, Math.min(200, Math.round(boxWidth / 2 - 130)))
}

function buildDonutOption(
  slices: AllocationSlice[],
  currency: MoneyCurrency,
  rate: number,
  c: ChartColors,
  outer: number
): EChartsCoreOption {
  const inner = Math.round(outer * RING_RATIO)
  const thickness = outer - inner
  const label = (percent: number, name: string): string =>
    `${chartName(name)}
${formatPercent(percent / 100, 1)}`
  return {
    animationDuration: 700,
    tooltip: {
      trigger: 'item',
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (p: { name: string; value: number; percent: number }) =>
        `<b>${p.name}</b><br/>${formatMoney(p.value * rate, currency, 0)} · ${formatPercent(p.percent / 100, 1)}`
    },
    series: [
      {
        type: 'pie',
        radius: [`${inner}px`, `${outer}px`],
        avoidLabelOverlap: true,
        padAngle: 1.5,
        itemStyle: { borderRadius: 5, borderColor: c.surface, borderWidth: 2 },
        label: { fontSize: 12, lineHeight: 16, overflow: 'break' },
        emphasis: { scaleSize: 6 },
        data: slices.map((s) => {
          const inside = s.share >= OUTSIDE_LABEL_BELOW
          return {
            name: s.label,
            value: s.value,
            itemStyle: { color: s.color },
            // Velké díly: název a podíl přímo v prstenci. Malé: popisek s čárou vně.
            label: inside
              ? {
                  show: true,
                  position: 'inside',
                  color: '#fff',
                  fontWeight: 600,
                  textBorderColor: 'rgba(0,0,0,0.35)',
                  textBorderWidth: 2.5,
                  width: Math.round(thickness * 0.88),
                  formatter: (p: { name: string; percent: number }) => label(p.percent, p.name)
                }
              : {
                  show: true,
                  position: 'outside',
                  color: c.text,
                  width: 120,
                  formatter: (p: { name: string; percent: number }) => label(p.percent, p.name)
                },
            labelLine: { show: !inside, length: 14, length2: 12, lineStyle: { color: s.color } }
          }
        })
      }
    ]
  }
}

/** Jedna řádka editoru: barva a skupina indexu pro fond (všechny kotace se stejným ISIN). */
function EtfMetaRow({ group }: { group: Security[] }): React.JSX.Element {
  const updateMeta = useApp((s) => s.updateSecurityMeta)
  const securities = useApp((s) => s.portfolio?.securities)
  const head = group[0]
  const ids = group.map((s) => s.id)
  // Rozepsaná hodnota (dokud se neuloží); jinak se zobrazuje uložená.
  const [draftGroup, setDraftGroup] = useState<string | null>(null)
  const [draftColor, setDraftColor] = useState<string | null>(null)
  const indexGroup = draftGroup ?? head.indexGroup
  const color = draftColor ?? head.color
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const known = useMemo(
    () => [...new Set((securities ?? []).map((s) => s.indexGroup))].sort(),
    [securities]
  )

  const save = (patch: { indexGroup?: string; color?: string }): void => {
    setError(null)
    updateMeta({ ids, ...patch })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setDraftGroup(null)
        setDraftColor(null)
      })
  }
  const commitGroup = (): void => {
    const value = indexGroup.trim()
    if (!value || value === head.indexGroup) return setDraftGroup(null)
    save({ indexGroup: value })
  }

  return (
    <tr className="hover:bg-surface-2">
      <td className="border-b px-2 py-2">
        <input
          type="color"
          aria-label={`Barva ${head.name}`}
          value={color}
          onChange={(e) => {
            setDraftColor(e.target.value)
            // Výběr barvy generuje mnoho událostí za sekundu – uloží se až po chvíli klidu.
            clearTimeout(timer.current)
            const value = e.target.value
            timer.current = setTimeout(() => save({ color: value }), 400)
          }}
          className="size-7 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
      </td>
      <td className="border-b px-2 py-2">
        <div className="font-medium">{head.name}</div>
        <div className="text-xs text-muted">
          {ids.join(', ')}
          {head.isin ? ` · ${head.isin}` : ''}
        </div>
      </td>
      <td className="border-b px-2 py-2">
        <input
          list="index-groups"
          aria-label={`Skupina indexu ${head.name}`}
          value={indexGroup}
          maxLength={40}
          onChange={(e) => setDraftGroup(e.target.value)}
          onBlur={commitGroup}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="w-44 rounded-[7px] border bg-surface-2 px-2 py-1"
        />
        <datalist id="index-groups">
          {known.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {error && <div className="mt-1 text-xs text-neg">{error}</div>}
      </td>
    </tr>
  )
}

function AllocationOverview(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const setScreen = useApp((s) => s.setScreen)
  const calc = usePortfolioCalc()
  const colors = useChartColors()
  const [by, setBy] = useState<AllocationGroupBy>('index')
  // Šířka popisků se přizpůsobí šířce karty, aby se u okraje neořezávaly.
  const chartBox = useRef<HTMLDivElement>(null)
  const [boxWidth, setBoxWidth] = useState(560)
  const hasChart = !!portfolio && portfolio.transactions.length > 0 && !!calc?.summary
  useEffect(() => {
    const el = chartBox.current
    if (!el) return
    const observer = new ResizeObserver(() => setBoxWidth(el.clientWidth))
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasChart])
  const outer = ringOuterRadius(boxWidth)

  const summary = calc?.summary ?? null
  const czk = displayCurrency === 'CZK' && summary?.fxRate != null
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'
  const rate = czk ? summary!.fxRate! : 1

  const slices = useMemo(() => {
    if (!portfolio || !summary) return []
    if (by === 'broker') {
      const ids =
        brokerFilter === 'all'
          ? null
          : new Set(portfolio.accounts.filter((a) => a.name === brokerFilter).map((a) => a.id))
      return allocateByBroker(portfolio, prices, ids)
    }
    return allocateBySecurity(summary.positions, portfolio.securities, by)
  }, [portfolio, prices, brokerFilter, summary, by])

  const option = useMemo(
    () => buildDonutOption(slices, currency, rate, colors, outer),
    [slices, currency, rate, colors, outer]
  )

  const etfGroups = useMemo(() => {
    const map = new Map<string, Security[]>()
    for (const s of portfolio?.securities ?? []) {
      const key = s.isin ?? s.id
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.values()]
  }, [portfolio?.securities])

  if (!portfolio || portfolio.transactions.length === 0 || !summary) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <div className="text-lg font-semibold">Zatím není co rozdělovat</div>
          <p className="max-w-md text-muted">
            {portfolio && portfolio.transactions.length > 0
              ? `Pro ${brokerFilter === 'all' ? 'vybraný výběr' : brokerFilter} nejsou žádné transakce.`
              : 'Naimportuj historii transakcí na obrazovce Obchody.'}
          </p>
          {(!portfolio || portfolio.transactions.length === 0) && (
            <button
              onClick={() => setScreen('transactions')}
              className="rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
            >
              Přejít na Obchody
            </button>
          )}
        </div>
      </Card>
    )
  }

  const total = slices.reduce((s, x) => s + x.value, 0)
  const totalCost = slices.reduce((s, x) => s + x.costBasis, 0)
  const money = (v: number): string => formatMoney(v * rate, currency, 0)
  const notes: string[] = []
  if (displayCurrency === 'CZK' && !czk) {
    notes.push('Kurz EUR/CZK z ČNB zatím není stažený – zobrazuji EUR.')
  }
  if (Math.abs(summary.cash) >= 1) {
    notes.push(
      `Na účtech je ještě hotovost ${money(summary.cash)} – v alokaci se nezapočítává, jde jen o ETF.`
    )
  }
  if (summary.missingPrices.length > 0) {
    notes.push(
      `Chybí kurz pro ${summary.missingPrices.join(', ')} – použita cena posledního obchodu.`
    )
  }

  return (
    <div className="grid gap-4">
      {notes.length > 0 && (
        <div className="grid gap-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
          {notes.map((n) => (
            <div key={n} className="flex gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {n}
            </div>
          ))}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-3">
          <span className="text-muted">Seskupit podle:</span>
          <Segmented<AllocationGroupBy>
            ariaLabel="Seskupení alokace"
            options={GROUP_OPTIONS}
            value={by}
            onChange={setBy}
          />
        </div>
      </Card>

      <div className="grid gap-4">
        <Card title={GROUP_TITLES[by]}>
          <div ref={chartBox} className="relative mx-auto max-w-[760px]">
            <EChart
              option={option}
              height={2 * outer + 90}
              ariaLabel={`Koláčový graf rozdělení portfolia ${GROUP_TITLES[by].toLowerCase()}`}
            />
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-xs text-muted">ETF celkem</div>
                <div className="text-xl font-bold">{money(total)}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Detail" className="!pb-2">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                {['', 'Hodnota', 'Podíl', 'Zisk'].map((h, i) => (
                  <th
                    key={h || 'name'}
                    className={`border-b px-2 py-1.5 font-semibold ${i ? 'text-right' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={s.key} className="hover:bg-surface-2">
                  <td className="border-b px-2 py-2">
                    <span
                      className="mr-2 inline-block size-2.5 rounded-full align-middle"
                      style={{ background: s.color }}
                    />
                    <b>{s.label}</b>
                    {s.sublabel && <div className="ml-[18px] text-xs text-muted">{s.sublabel}</div>}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    {money(s.value)}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    {formatPercent(s.share, 1)}
                  </td>
                  <td
                    className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(s.unrealized)}`}
                  >
                    {formatSignedMoney(s.unrealized * rate, currency, 0)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-2 py-2">Celkem</td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{money(total)}</td>
                <td className="px-2 py-2 text-right">{total > 0 ? '100 %' : '–'}</td>
                <td
                  className={`px-2 py-2 text-right whitespace-nowrap ${toneClass(total - totalCost)}`}
                >
                  {formatSignedMoney((total - totalCost) * rate, currency, 0)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Zisk je nerealizovaný (hodnota − pořizovací cena držených kusů).
            {currency === 'CZK' &&
              ' Hodnoty jsou přepočtené dnešním kurzem ČNB, zisk se počítá v EUR.'}
          </p>
        </Card>
      </div>

      <Card title="ETF: skupina indexu a barva" className="!pb-2">
        <p className="mb-2 text-[13px] text-muted">
          EUNL.DE a IWDA.AS jsou tentýž fond (stejný ISIN), proto se upravují společně. Změna se
          uloží hned po opuštění pole (barva po chvíli) a okamžitě se promítne do grafů a tabulek.
        </p>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="w-12 border-b px-2 py-1.5 font-semibold">Barva</th>
              <th className="border-b px-2 py-1.5 font-semibold">ETF</th>
              <th className="border-b px-2 py-1.5 font-semibold">Skupina indexu</th>
            </tr>
          </thead>
          <tbody>
            {etfGroups.map((g) => (
              <EtfMetaRow key={g[0].isin ?? g[0].id} group={g} />
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

type AllocationView = 'overview' | 'target'
const VIEW_OPTIONS: { value: AllocationView; label: string }[] = [
  { value: 'overview', label: 'Přehled' },
  { value: 'target', label: 'Cílová alokace' }
]

export function AllocationScreen(): React.JSX.Element {
  const [view, setView] = useState<AllocationView>('overview')
  return (
    <div className="grid gap-4">
      <div>
        <Segmented<AllocationView>
          ariaLabel="Zobrazení alokace"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
      </div>
      {view === 'overview' ? <AllocationOverview /> : <TargetAllocation />}
    </div>
  )
}
