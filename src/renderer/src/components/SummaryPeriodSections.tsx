import { formatMonthLong } from '../../../core/date'
import { formatMoney, formatPercent } from '../../../core/money'
import { bestWorstMonth } from '../../../core/summary-month'
import type { MonthArticleFacts } from '../../../shared/summary'
import { toneClass } from '../tone'
import { Card } from './Card'

/* Sekce delších období (P26): tabulka po měsících a „Rok v číslech“. */

const eur = (v: number): string => formatMoney(v, 'EUR', 0)
const th = 'border-b px-2 py-1.5 text-xs font-semibold text-muted'
const td = 'border-b px-2 py-2'
const pctOrDash = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '–' : formatPercent(v, digits, true)
const pp = (v: number): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v * 100)
    .toFixed(1)
    .replace('.', ',')} p. b.`

function Title({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h4 className="mb-2 text-[15px] font-semibold">{children}</h4>
}

function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-2 text-xs text-muted">{children}</p>
}

/** Delší období: výkon, změna trhem, vklady a nákupy po jednotlivých měsících. */
export function MonthsSection({ f }: { f: MonthArticleFacts }): React.JSX.Element {
  const rows = f.months ?? []
  const { best, worst } = bestWorstMonth(f)
  return (
    <section>
      <Title>Po měsících</Title>
      <Card className="!pb-2">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left">
              {['Měsíc', 'Výkon', 'Trh', 'Vloženo', 'Nakoupeno', 'Hodnota na konci'].map((h, i) => (
                <th key={h} className={`${th} ${i ? 'text-right' : ''}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const isBest = m === best
              const isWorst = m === worst
              return (
                <tr key={m.month} className="hover:bg-surface-2">
                  <td className={td}>
                    {formatMonthLong(m.month)}
                    {(isBest || isWorst) && (
                      <span
                        className={isBest ? 'text-pos' : 'text-neg'}
                        title={isBest ? 'Nejlepší měsíc' : 'Nejhorší měsíc'}
                      >
                        {isBest ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </td>
                  <td className={`${td} text-right ${toneClass(m.periodReturn ?? 0)}`}>
                    {pctOrDash(m.periodReturn)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap ${toneClass(m.marketChange)}`}>
                    {eur(m.marketChange)}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{eur(m.netDeposits)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {m.bought > 0 ? eur(m.bought) : '—'}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{eur(m.valueEnd)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Note>
          Výkon je bez vlivu vkladů, Trh = změna hodnoty bez vkladů. ▲ nejlepší, ▼ nejhorší měsíc.
        </Note>
      </Card>
    </section>
  )
}

/** Rok: srovnání s předchozím rokem, posun k cíli a prodeje (informativně). */
export function YearReviewSection({ f }: { f: MonthArticleFacts }): React.JSX.Element {
  const prevYear = String(Number(f.period.slice(0, 4)) - 1)
  const goal = f.goal
  const realized = f.realized ?? null
  const row = (label: string, value: React.ReactNode, tone = ''): React.JSX.Element => (
    <tr>
      <td className={td}>{label}</td>
      <td className={`${td} text-right whitespace-nowrap ${tone}`}>{value}</td>
    </tr>
  )
  return (
    <section>
      <Title>Rok v číslech</Title>
      <Card className="!pb-3">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {row(
              'Výkon za rok (bez vkladů)',
              pctOrDash(f.periodReturn),
              toneClass(f.periodReturn ?? 0)
            )}
            {row(
              `Výkon v roce ${prevYear}`,
              f.prevPeriodReturn == null ? 'bez dat' : pctOrDash(f.prevPeriodReturn),
              toneClass(f.prevPeriodReturn ?? 0)
            )}
            {row('Nakoupeno za rok', eur(f.bought))}
            {row(
              `Nakoupeno v roce ${prevYear}`,
              f.boughtPrevious === null ? 'bez dat' : eur(f.boughtPrevious)
            )}
            {row('Vloženo (vklady − výběry)', eur(f.netDeposits))}
            {row('Změna hodnoty trhem', eur(f.marketChange), toneClass(f.marketChange))}
            {goal &&
              goal.progressPrev !== null &&
              row(
                'Posun k cíli za rok',
                `${formatPercent(goal.progressPrev, 1)} → ${formatPercent(goal.progress, 1)} (${pp(goal.progress - goal.progressPrev)})`,
                toneClass(goal.progress - goal.progressPrev)
              )}
            {row(
              'Prodeje',
              realized
                ? `${realized.count}× za ${eur(realized.proceeds)}, realizovaný zisk ${eur(realized.gain)}`
                : 'žádné'
            )}
          </tbody>
        </table>
        <Note>
          Realizovaný zisk je jen informativní (FIFO jako na obrazovce Daně), neřeší výši daně.
          {realized &&
            realized.exemptGain !== 0 &&
            ` Z toho po časovém testu ${eur(realized.exemptGain)}.`}
        </Note>
      </Card>
    </section>
  )
}
