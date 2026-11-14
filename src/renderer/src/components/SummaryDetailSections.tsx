import { formatDate, formatMonthLong } from '../../../core/date'
import { formatMoney, formatPercent } from '../../../core/money'
import { articleOutlook, kindOf } from '../../../core/summary-month'
import { KIND_WORDS } from '../../../core/summary-period'
import type { MonthArticleFacts, MonthDetail } from '../../../shared/summary'
import { toneClass } from '../tone'
import { Card } from './Card'

/* Detailní sekce měsíčního článku (P25): srovnání s trhem, riziko, alokace, kurz, daně, výhled. */

const eur = (v: number): string => formatMoney(v, 'EUR', 0)
const shortDate = (iso: string): string => formatDate(iso).replace(/ \d{4}$/, '')
const th = 'border-b px-2 py-1.5 text-xs font-semibold text-muted'
const td = 'border-b px-2 py-2'
const pctOrDash = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '–' : formatPercent(v, digits, true)
const pp = (v: number): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v * 100)
    .toFixed(2)
    .replace('.', ',')} p. b.`

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function Title({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h4 className="mb-2 text-[15px] font-semibold">{children}</h4>
}

function Note({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <p className="mt-2 text-xs text-muted">{children}</p>
}

export function BenchmarkSection({
  f,
  d
}: {
  f: MonthArticleFacts
  d: MonthDetail
}): React.JSX.Element {
  const b = d.benchmark
  const diff =
    b?.periodReturn != null && f.periodReturn !== null ? f.periodReturn - b.periodReturn : null
  return (
    <section>
      <Title>Srovnání s trhem</Title>
      <Card className="!pb-3">
        {!b ? (
          <p className="text-[13px] text-muted">
            Benchmark nemá stažené kurzy. Vybereš ho na obrazovce Výkon.
          </p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-left">
                <th className={th} />
                <th className={`${th} text-right`}>{capital(KIND_WORDS[kindOf(f)].nom)}</th>
                <th className={`${th} text-right`}>Od začátku roku</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={td}>
                  <b>Moje portfolio</b>
                </td>
                <td className={`${td} text-right ${toneClass(f.periodReturn ?? 0)}`}>
                  {pctOrDash(f.periodReturn)}
                </td>
                <td className={`${td} text-right ${toneClass(f.ytdReturn ?? 0)}`}>
                  {pctOrDash(f.ytdReturn, 1)}
                </td>
              </tr>
              <tr>
                <td className={td}>
                  {b.ticker}
                  {b.name !== b.ticker && <div className="text-xs text-muted">{b.name}</div>}
                </td>
                <td className={`${td} text-right ${toneClass(b.periodReturn ?? 0)}`}>
                  {pctOrDash(b.periodReturn)}
                </td>
                <td className={`${td} text-right ${toneClass(b.ytdReturn ?? 0)}`}>
                  {pctOrDash(b.ytdReturn, 1)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        <Note>
          {diff !== null && (
            <>
              Rozdíl za {KIND_WORDS[kindOf(f)].nom}: <b className={toneClass(diff)}>{pp(diff)}</b>
              .{' '}
            </>
          )}
          Benchmark = vývoj ceny jednoho ETF (vybereš ho na obrazovce Výkon).
        </Note>
      </Card>
    </section>
  )
}

export function RiskSection({ f, d }: { f: MonthArticleFacts; d: MonthDetail }): React.JSX.Element {
  const r = d.risk
  const dd = f.drawdown
  const mood =
    r.volatility !== null && r.volatilityTypical !== null
      ? r.volatility < r.volatilityTypical * 0.9
        ? 'Tento měsíc byl klidnější než obvykle.'
        : r.volatility > r.volatilityTypical * 1.1
          ? 'Tento měsíc byl rozkolísanější než obvykle.'
          : 'Kolísání bylo podobné jako obvykle.'
      : ''
  const row = (label: string, value: React.ReactNode, tone = ''): React.JSX.Element => (
    <tr>
      <td className={td}>{label}</td>
      <td className={`${td} text-right whitespace-nowrap ${tone}`}>{value}</td>
    </tr>
  )
  return (
    <section>
      <Title>Riziko</Title>
      <Card className="!pb-3">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {row(
              'Největší pokles',
              dd && dd.pct < 0
                ? `${formatPercent(dd.pct, 1, true)} (${shortDate(dd.from)} → ${shortDate(dd.to)})`
                : 'žádný',
              dd && dd.pct < 0 ? 'text-neg' : ''
            )}
            {row(
              'Nejhorší den',
              r.worstDay
                ? `${formatPercent(r.worstDay.pct, 1, true)} (${shortDate(r.worstDay.date)})`
                : '–',
              r.worstDay ? 'text-neg' : ''
            )}
            {row(
              'Nejlepší den',
              r.bestDay
                ? `${formatPercent(r.bestDay.pct, 1, true)} (${shortDate(r.bestDay.date)})`
                : '–',
              r.bestDay ? 'text-pos' : ''
            )}
            {row(
              'Kolísavost (roční přepočet)',
              <>
                {r.volatility === null ? '–' : formatPercent(r.volatility, 1)}
                {r.volatilityTypical !== null && (
                  <span className="text-muted">
                    {' '}
                    · běžně {formatPercent(r.volatilityTypical, 1)}
                  </span>
                )}
              </>
            )}
          </tbody>
        </table>
        <Note>
          Vše bez vlivu vkladů. Kolísavost = jak moc hodnota skáče nahoru a dolů; „běžně“ = za
          posledních 12 měsíců. {mood}
        </Note>
      </Card>
    </section>
  )
}

export function AllocationSection({ d }: { d: MonthDetail }): React.JSX.Element {
  const a = d.allocation
  const buys = (a?.rows ?? []).filter((r) => r.buy >= 0.5).sort((x, y) => y.buy - x.buy)
  return (
    <section>
      <Title>Alokace vs. cílová alokace</Title>
      <Card>
        {!a ? (
          <p className="text-[13px] text-muted">
            Cílovou alokaci nastavíš na obrazovce Alokace → Cílová alokace.
          </p>
        ) : (
          <div className="grid grid-cols-[minmax(90px,auto)_1fr_150px] items-center gap-x-3 gap-y-2.5 text-[13px]">
            {a.rows.map((r) => {
              const dev = r.share - r.target
              return (
                <div key={r.group} className="contents">
                  <b className="truncate">{r.group}</b>
                  <div className="relative h-2.5 rounded bg-surface-2">
                    <i
                      className="absolute inset-y-0 left-0 rounded bg-sky-500"
                      style={{ width: `${Math.min(100, r.share * 100)}%` }}
                    />
                    <b
                      className="absolute -inset-y-1 w-0.5 bg-fg"
                      style={{ left: `${Math.min(100, r.target * 100)}%` }}
                      title={`Cíl ${formatPercent(r.target, 0)}`}
                    />
                  </div>
                  <span className="text-right whitespace-nowrap">
                    {formatPercent(r.share, 1)}{' '}
                    <span className={Math.abs(dev) >= 0.02 ? 'text-amber-500' : 'text-muted'}>
                      (cíl {formatPercent(r.target, 0)})
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {a && (
          <Note>
            Svislá čárka = cíl.{' '}
            {buys.length > 0 &&
              `Rozdělení dalšího nákupu ${eur(a.monthlyEur)} jen dokupováním: ${buys
                .map((r) => `${r.group} ${eur(r.buy)}`)
                .join(', ')}. `}
            Nejde o investiční doporučení.
          </Note>
        )}
      </Card>
    </section>
  )
}

export function FxSection({ f }: { f: MonthArticleFacts }): React.JSX.Element {
  const ok = f.fxStart !== null && f.fxEnd !== null
  const effect = ok ? f.valueEnd * (f.fxEnd! - f.fxStart!) : 0
  const rate = (v: number): string => v.toFixed(3).replace('.', ',')
  return (
    <section>
      <Title>Vliv kurzu EUR/CZK</Title>
      <Card>
        {!ok ? (
          <p className="text-[13px] text-muted">Kurz ČNB pro toto období není stažený.</p>
        ) : (
          <p className="text-[14px] leading-relaxed">
            Kurz ČNB se změnil z <b>{rate(f.fxStart!)}</b> na <b>{rate(f.fxEnd!)} Kč/€</b> (
            {formatPercent(f.fxEnd! / f.fxStart! - 1, 1, true)}). V korunách to hodnotě portfolia{' '}
            {effect >= 0 ? 'přidalo' : 'ubralo'} zhruba{' '}
            <b className={toneClass(effect)}>{formatMoney(Math.abs(effect), 'CZK', 0)}</b> navíc k
            výkonu investic.
          </p>
        )}
        <Note>Odhad: hodnota na konci období × změna kurzu.</Note>
      </Card>
    </section>
  )
}

export function TaxesSection({ d }: { d: MonthDetail }): React.JSX.Element {
  const t = d.timeTest
  return (
    <section>
      <Title>Daně – časový test 3 roky</Title>
      <Card className="!pb-3">
        {!t ? (
          <p className="text-[13px] text-muted">Žádné otevřené nákupy.</p>
        ) : (
          <>
            <p className="text-[14px] leading-relaxed">
              Po časovém testu je <b>{eur(t.freeValue)}</b> (
              {formatPercent(t.totalValue > 0 ? t.freeValue / t.totalValue : 0, 1)} portfolia).{' '}
              {t.releasing.length === 0
                ? `Příští měsíc (${formatMonthLong(t.nextMonth)}) časový test nesplní žádný nákup.`
                : `Příští měsíc (${formatMonthLong(t.nextMonth)}) ho splní ${t.releasing.length}× nákup:`}
            </p>
            {t.releasing.length > 0 && (
              <table className="mt-2 w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left">
                    {['ETF', 'Nákup', 'Volné od', 'Hodnota'].map((h, i) => (
                      <th key={h} className={`${th} ${i === 3 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.releasing.map((r, i) => (
                    <tr key={`${r.ticker}-${r.buyDate}-${i}`}>
                      <td className={td}>{r.ticker}</td>
                      <td className={td}>{formatDate(r.buyDate)}</td>
                      <td className={td}>{formatDate(r.freeFrom)}</td>
                      <td className={`${td} text-right whitespace-nowrap`}>{eur(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Note>
              Do konce roku {t.nextMonth.slice(0, 4)} bude po testu{' '}
              {formatPercent(t.freeShareYearEnd, 0)} portfolia (při dnešních cenách). Jen
              informativně, neřeší výši daně.
            </Note>
          </>
        )}
      </Card>
    </section>
  )
}

/** Výhled: text od AI (`lines`), jinak šablona. */
export function OutlookSection({
  f,
  lines
}: {
  f: MonthArticleFacts
  lines?: readonly string[] | null
}): React.JSX.Element {
  return (
    <section>
      <Title>Na co se dívat příští měsíc</Title>
      <Card>
        <ul className="grid list-disc gap-1.5 pl-5 text-[14px] leading-relaxed">
          {(lines ?? articleOutlook(f)).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <Note>
          Shrnuto z plánu, cílové alokace a časového testu. Nejde o investiční doporučení.
        </Note>
      </Card>
    </section>
  )
}
