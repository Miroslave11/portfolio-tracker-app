import { useMemo, useState } from 'react'
import type { EChartsCoreOption } from 'echarts/core'
import { formatDate, todayIso } from '../../../core/date'
import { formatDuration } from '../../../core/goal-projection'
import type { Lot } from '../../../core/lots'
import {
  formatMoney,
  formatPercent,
  formatSignedMoney,
  type MoneyCurrency
} from '../../../core/money'
import { timeTestSummary, type TimeTestLot } from '../../../core/time-test'
import { type ChartColors, useChartColors } from '../chartColors'
import { toneClass } from '../tone'
import { Card } from './Card'
import { EChart } from './EChart'
import { Kpi, Tip } from './Kpi'
import { Segmented } from './Segmented'

type Show = 'all' | 'free' | 'waiting'
const SHOW_OPTIONS: { value: Show; label: string }[] = [
  { value: 'all', label: 'Vše' },
  { value: 'free', label: 'Volné' },
  { value: 'waiting', label: 'Čekající' }
]

/** „za 5 dní“, „za 2 měsíce“, „za 1 rok a 8 měsíců“. */
function waitLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'volné'
  if (daysLeft < 31) {
    return `za ${daysLeft} ${daysLeft === 1 ? 'den' : daysLeft <= 4 ? 'dny' : 'dní'}`
  }
  return `za ${formatDuration(Math.max(1, Math.round(daysLeft / 30.44)))}`
}

function compact(value: number, currency: MoneyCurrency): string {
  const unit = currency === 'CZK' ? 'Kč' : '€'
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1).replace('.', ',')} mil. ${unit}`
  if (Math.abs(value) >= 1e3) return `${Math.round(value / 1e3)} tis. ${unit}`
  return `${Math.round(value)} ${unit}`
}

function buildBars(
  byYear: { year: number | null; value: number }[],
  currency: MoneyCurrency,
  c: ChartColors
): EChartsCoreOption {
  const labels = byYear.map((b) => (b.year === null ? 'volné dnes' : `uvolní se ${b.year}`))
  return {
    animationDuration: 600,
    grid: { left: 8, right: 16, top: 28, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: c.surface,
      borderColor: c.border,
      textStyle: { color: c.text },
      formatter: (params: { dataIndex: number }[]) => {
        const b = byYear[params[0]?.dataIndex ?? 0]
        return `<b>${labels[params[0]?.dataIndex ?? 0]}</b><br/>${formatMoney(b.value, currency, 0)}`
      }
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: c.border } },
      axisTick: { show: false },
      axisLabel: { color: c.muted }
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: c.muted, formatter: (v: number) => compact(v, currency) },
      splitLine: { lineStyle: { color: c.border } }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 70,
        data: byYear.map((b, i) => ({
          value: b.value,
          itemStyle: { color: i === 0 ? c.pos : c.accent, borderRadius: [6, 6, 0, 0] }
        })),
        label: {
          show: true,
          position: 'top',
          color: c.text,
          formatter: (p: { value: number }) => compact(p.value, currency)
        }
      }
    ]
  }
}

interface Props {
  openLots: readonly Lot[]
  priceOf(securityId: string): number | undefined
  currency: MoneyCurrency
  rateToday: number
  rateAt(date: string): number
  accountName(id: string): string
}

/** Záložka „Časový test 3 roky“: co je už volné k prodeji bez daně a kdy se uvolní další kusy. */
export function TimeTestPanel({
  openLots,
  priceOf,
  currency,
  rateToday,
  rateAt,
  accountName
}: Props): React.JSX.Element {
  const colors = useChartColors()
  const [show, setShow] = useState<Show>('all')
  const today = todayIso()
  const t = useMemo(
    () => timeTestSummary(openLots, today, { priceOf, rateToday, rateAt }),
    [openLots, today, priceOf, rateToday, rateAt]
  )
  const option = useMemo(() => buildBars(t.byYear, currency, colors), [t, currency, colors])
  const money = (v: number): string => formatMoney(v, currency, 0)
  const pct = (v: number): string => (t.totalValue > 0 ? formatPercent(v / t.totalValue, 1) : '–')
  const freeFunds = t.byFund.filter((f) => f.freeShares > 0).length
  const rows: TimeTestLot[] = t.lots.filter((l) =>
    show === 'all' ? true : show === 'free' ? l.free : !l.free
  )

  if (t.lots.length === 0) {
    return (
      <Card>
        <p className="py-8 text-center text-muted">Nedržíš žádné ETF, není co testovat.</p>
      </Card>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-4">
        <Kpi
          title="Volné k prodeji bez daně"
          value={money(t.freeValue)}
          tone={t.freeValue > 0 ? 'text-pos' : ''}
          sub={`${pct(t.freeValue)} portfolia · ${freeFunds} ${freeFunds === 1 ? 'fond' : freeFunds >= 2 && freeFunds <= 4 ? 'fondy' : 'fondů'}`}
        />
        <Kpi
          title="Do 12 měsíců se uvolní"
          value={money(t.freeWithinYearValue)}
          sub={`dalších ${pct(t.freeWithinYearValue)}`}
        />
        <Kpi
          title="Nejbližší uvolnění"
          value={t.next ? formatDate(t.next.freeFrom) : '–'}
          sub={
            t.next
              ? `${t.next.lot.securityId} · ${Math.round(t.next.lot.remaining * 1e6) / 1e6} ks · ${waitLabel(t.next.daysLeft)}`
              : 'vše už je volné'
          }
        />
        <Kpi
          title="Zbývá čekat"
          value={money(t.waitingValue)}
          sub={`${pct(t.waitingValue)} portfolia je mladší než 3 roky`}
        />
      </div>

      <div className="grid grid-cols-[3fr_2fr] gap-4">
        <Card title="Kdy se hodnota uvolní">
          <EChart
            option={option}
            height={260}
            ariaLabel="Graf hodnoty uvolněné časovým testem podle roku"
          />
        </Card>
        <Card title="Podle ETF" className="!pb-2">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="border-b px-2 py-1.5 font-semibold">Fond</th>
                <th className="border-b px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                  <Tip text="Kolik kusů lze prodat bez daně – podle FIFO se prodávají nejstarší kusy, takže volné jdou první.">
                    Volné ks
                  </Tip>
                </th>
                <th className="border-b px-2 py-1.5 text-right font-semibold">Volné</th>
                <th className="border-b px-2 py-1.5 text-right font-semibold">Čeká</th>
                <th className="border-b px-2 py-1.5 text-right font-semibold">Další</th>
              </tr>
            </thead>
            <tbody>
              {t.byFund.map((f) => (
                <tr key={f.securityKey} className="hover:bg-surface-2">
                  <td className="border-b px-2 py-2 font-semibold">{f.label}</td>
                  <td className="border-b px-2 py-2 text-right">
                    {Math.round(f.freeShares * 1e6) / 1e6}
                  </td>
                  <td
                    className={`border-b px-2 py-2 text-right whitespace-nowrap ${f.freeValue > 0 ? 'text-pos' : 'text-muted'}`}
                  >
                    {money(f.freeValue)}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                    {money(f.waitingValue)}
                  </td>
                  <td className="border-b px-2 py-2 text-right whitespace-nowrap text-muted">
                    {f.nextFreeFrom ? formatDate(f.nextFreeFrom) : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Prodávat lze jen u brokera, kde kusy držíš; párování na nejstarší nákupy (FIFO) ale
            platí napříč brokery.
          </p>
        </Card>
      </div>

      <Card className="!pb-2">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
            Nákupy od nejstarších
          </h3>
          <span className="text-xs text-muted">zbývající kusy po všech prodejích (FIFO)</span>
          <div className="ml-auto">
            <Segmented<Show>
              ariaLabel="Zobrazit nákupy"
              options={SHOW_OPTIONS}
              value={show}
              onChange={setShow}
            />
          </div>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted">
              {[
                'Nákup',
                'Broker',
                'ETF',
                'Zbývá ks',
                'Pořizovací cena',
                'Hodnota dnes',
                'Zisk',
                'Volné od',
                'Stav'
              ].map((h, i) => (
                <th
                  key={h}
                  className={`border-b px-2 py-1.5 font-semibold ${i >= 3 && i <= 6 ? 'text-right' : ''}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.lot.id} className="hover:bg-surface-2">
                <td className="border-b px-2 py-2 whitespace-nowrap">{formatDate(l.lot.date)}</td>
                <td className="border-b px-2 py-2">{accountName(l.lot.accountId)}</td>
                <td className="border-b px-2 py-2 font-semibold">{l.lot.securityId}</td>
                <td className="border-b px-2 py-2 text-right">
                  {Math.round(l.lot.remaining * 1e6) / 1e6}
                </td>
                <td className="border-b px-2 py-2 text-right whitespace-nowrap text-muted">
                  {formatMoney(l.cost, currency, 2)}
                </td>
                <td className="border-b px-2 py-2 text-right whitespace-nowrap">
                  {formatMoney(l.value, currency, 2)}
                </td>
                <td
                  className={`border-b px-2 py-2 text-right whitespace-nowrap ${toneClass(l.gain)}`}
                >
                  {formatSignedMoney(l.gain, currency, 0)}
                </td>
                <td className="border-b px-2 py-2 whitespace-nowrap">{formatDate(l.freeFrom)}</td>
                <td className="w-[170px] border-b px-2 py-2">
                  {l.free ? (
                    <span className="rounded-md bg-pos/15 px-2 py-0.5 text-[11px] font-semibold text-pos">
                      volné
                    </span>
                  ) : (
                    <div title={`Uplynulo ${Math.round(l.progress * 100)} % tříleté lhůty`}>
                      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{ width: `${l.progress * 100}%` }}
                        />
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{waitLabel(l.daysLeft)}</div>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-muted">
                  {show === 'free' ? 'Zatím žádné volné kusy.' : 'Žádné čekající kusy.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
