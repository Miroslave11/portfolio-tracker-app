import { useMemo, useState } from 'react'
import { addMonths, formatDate, formatDateTime } from '../../../core/date'
import { formatMoney, formatPercent, formatSignedMoney } from '../../../core/money'
import {
  articleCommentary,
  articleHighlights,
  articleTitle,
  kindOf,
  planShare,
  planTotal
} from '../../../core/summary-month'
import { KIND_WORDS } from '../../../core/summary-period'
import { AI_PART_LABELS, AI_PARTS } from '../../../shared/ai'
import { DETAIL_SECTIONS, type SummaryArticle, type SummarySection } from '../../../shared/summary'
import {
  AllocationSection,
  BenchmarkSection,
  FxSection,
  OutlookSection,
  RiskSection,
  TaxesSection
} from './SummaryDetailSections'
import { MonthsSection, YearReviewSection } from './SummaryPeriodSections'
import { useChartColors } from '../chartColors'
import { courseOption, waterfallOption } from '../summaryCharts'
import { toneClass } from '../tone'
import { Card } from './Card'
import { EChart } from './EChart'

const eur = (v: number, digits = 0): string => formatMoney(v, 'EUR', digits)
const signed = (v: number, digits = 0): string => formatSignedMoney(v, 'EUR', digits)
const shortDate = (iso: string): string => formatDate(iso).replace(/ \d{4}$/, '')

function SectionTitle({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <h4 className="mb-2 text-[15px] font-semibold">{children}</h4>
}

function MiniKpi({
  title,
  value,
  sub,
  tone = ''
}: {
  title: string
  value: string
  sub?: string
  tone?: string
}): React.JSX.Element {
  return (
    <Card className="!p-[14px]">
      <div className="text-[11px] font-semibold tracking-[.04em] text-muted uppercase">{title}</div>
      <div className={`mt-1 text-[20px] font-bold tracking-tight whitespace-nowrap ${tone}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Článek
// ---------------------------------------------------------------------------

const th = 'border-b px-2 py-1.5 text-xs font-semibold text-muted'
const td = 'border-b px-2 py-2'

export function SummaryArticleView({
  article,
  sections,
  actions
}: {
  article: SummaryArticle
  /** Zapnuté sekce (Nastavení → Shrnutí portfolia). */
  sections: readonly SummarySection[]
  actions?: React.ReactNode
}): React.JSX.Element {
  const f = article.facts
  const d = f.detail
  const on = (section: SummarySection): boolean => sections.includes(section)
  const missingDetail = !d && DETAIL_SECTIONS.some(on)
  const projection = d?.projection
  const yearIn = (months: number): string => addMonths(f.asOf, months).slice(0, 4)
  const colors = useChartColors()
  const course = useMemo(() => courseOption(f, colors), [f, colors])
  const waterfall = useMemo(() => waterfallOption(f, colors), [f, colors])
  // Text od AI (P27): u každé části platí AI text, jinak šablona; přepínač zobrazí jen šablonu.
  const [showTemplate, setShowTemplate] = useState(false)
  const ai = article.ai
  const aiParts = AI_PARTS.filter((p) => (ai?.[p]?.length ?? 0) > 0)
  const fromAi = (part: (typeof AI_PARTS)[number]): string[] | null =>
    showTemplate ? null : (ai?.[part] ?? null)
  const highlights = fromAi('highlights') ?? articleHighlights(f)
  const commentary = fromAi('commentary') ?? articleCommentary(f)
  const outlookLines = fromAi('outlook')
  const change = f.valueEnd - f.valueStart
  const share = planShare(f)
  const etfTotal = f.etfs.reduce((s, e) => s + e.valueEnd, 0)
  const contribTotal = f.etfs.reduce((s, e) => s + e.contribution, 0)
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const isMonth = kind === 'month'
  /** U delších období se obchody vypíšou jen do tohoto počtu (jinak je přehled po měsících). */
  const maxTrades = isMonth ? Infinity : 12

  return (
    <article className="grid max-w-[920px] gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[26px] font-bold tracking-tight">{articleTitle(f)}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            <span className="rounded-full border border-sky-500 px-2 text-[11px] text-sky-500">
              shrnutí za {w.nom}
            </span>
            <span>vytvořeno {formatDateTime(article.createdAt)}</span>
            <span>·</span>
            {!isMonth && (
              <>
                <span>
                  {formatDate(f.from)} – {formatDate(f.to)}
                </span>
                <span>·</span>
              </>
            )}
            <span>hodnoty k {formatDate(f.asOf)}</span>
            {f.partial && <span className="text-amber-500">(období ještě neskončilo)</span>}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            {aiParts.length > 0 ? (
              <>
                <span
                  className="rounded-full border border-accent px-2 text-[11px] text-accent"
                  title={`Model ${ai!.model}, napsáno ${formatDateTime(ai!.createdAt)}`}
                >
                  {showTemplate ? 'text: šablona' : 'text: AI · čísla ověřena ✓'}
                </span>
                <span className="text-muted">
                  AI napsala: {aiParts.map((p) => AI_PART_LABELS[p]).join(', ')}
                </span>
                <button
                  onClick={() => setShowTemplate(!showTemplate)}
                  className="text-accent hover:underline"
                >
                  {showTemplate ? 'Zobrazit text od AI' : 'Zobrazit šablonu'}
                </button>
              </>
            ) : (
              <span className="rounded-full border px-2 text-[11px] text-muted">text: šablona</span>
            )}
            {(ai?.rejected ?? []).map((r) => (
              <span key={r.part} className="text-amber-500">
                {AI_PART_LABELS[r.part]}: {r.message}
              </span>
            ))}
          </div>
        </div>
        {actions}
      </header>

      <Card className="border-l-[3px] !border-l-accent bg-accent/5">
        <h3 className="mb-2 text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          V kostce
        </h3>
        <ul className="grid list-disc gap-1.5 pl-5 text-[14px] leading-relaxed">
          {highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-4 gap-3">
        <MiniKpi
          title="Hodnota"
          value={eur(f.valueEnd)}
          sub={f.valueEndCzk !== null ? `≈ ${formatMoney(f.valueEndCzk, 'CZK', 0)}` : undefined}
        />
        <MiniKpi
          title={`Změna za ${w.nom}`}
          value={signed(change)}
          tone={toneClass(change)}
          sub="včetně vkladů"
        />
        <MiniKpi
          title="Výkon (TTWROR)"
          value={f.periodReturn === null ? '–' : formatPercent(f.periodReturn, 2, true)}
          tone={f.periodReturn === null ? '' : toneClass(f.periodReturn)}
          sub="bez vlivu vkladů"
        />
        <MiniKpi
          title="Nakoupeno"
          value={eur(f.bought)}
          sub={
            `${f.buyCount}× nákup` +
            (f.boughtPrevious !== null ? ` · předtím ${eur(f.boughtPrevious)}` : '')
          }
        />
      </div>

      {missingDetail && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-500">
          Tento článek vznikl ve starší verzi a nemá údaje pro detailní sekce (srovnání s trhem,
          riziko, alokace, časový test, výhled). Doplníš je tlačítkem „Vytvořit znovu“.
        </div>
      )}

      {on('commentary') && (
        <section>
          <SectionTitle>Komentář</SectionTitle>
          <Card>
            <div className="grid gap-2 text-[14px] leading-relaxed">
              {commentary.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </Card>
        </section>
      )}

      {on('course') && (
        <section>
          <SectionTitle>Průběh {w.gen}</SectionTitle>
          <Card>
            <EChart option={course} height={240} ariaLabel="Hodnota portfolia během období" />
            <p className="mt-2 text-xs text-muted">
              Hodnota portfolia včetně nákupů. Zelené body = nákupy, červený pruh = největší pokles
              (bez vlivu vkladů).
            </p>
          </Card>
        </section>
      )}

      {on('waterfall') && (
        <section>
          <SectionTitle>Odkud se vzala změna</SectionTitle>
          <Card>
            <EChart option={waterfall} height={250} ariaLabel="Rozklad změny hodnoty portfolia" />
            <p className="mt-2 text-xs text-muted">
              Osa nezačíná nulou, aby byly rozdíly vidět.
              {f.fees > 0 && (
                <>
                  {' '}
                  Trh celkem = <b className={toneClass(f.marketChange)}>
                    {signed(f.marketChange)}
                  </b>{' '}
                  (změna cen − poplatky).
                </>
              )}
            </p>
          </Card>
        </section>
      )}

      {on('etfs') && (
        <section>
          <SectionTitle>Jednotlivá ETF</SectionTitle>
          <Card className="!pb-2">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="text-left">
                  {[
                    'ETF',
                    'Hodnota',
                    'Váha',
                    isMonth ? 'Výkon v měsíci' : 'Výkon za období',
                    'Příspěvek',
                    'Nakoupeno'
                  ].map((h, i) => (
                    <th key={h} className={`${th} ${i ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {f.etfs.map((e) => (
                  <tr key={e.ticker} className="hover:bg-surface-2">
                    <td className={td}>
                      <b>{e.ticker}</b>
                      {e.estimated && (
                        <span title="Kurz chyběl – hodnota je odhad z ceny posledního obchodu">
                          {' '}
                          *
                        </span>
                      )}
                      <div className="text-xs text-muted">{e.name}</div>
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{eur(e.valueEnd)}</td>
                    <td className={`${td} text-right text-muted`}>{formatPercent(e.weight, 1)}</td>
                    <td className={`${td} text-right ${e.pct === null ? '' : toneClass(e.pct)}`}>
                      {e.pct === null ? '–' : formatPercent(e.pct, 1, true)}
                    </td>
                    <td
                      className={`${td} text-right whitespace-nowrap ${toneClass(e.contribution)}`}
                    >
                      {signed(e.contribution)}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {e.bought > 0 ? eur(e.bought) : '—'}
                      {e.sold > 0 && <div className="text-xs text-neg">prodej {eur(e.sold)}</div>}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="px-2 py-2">Celkem</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{eur(etfTotal)}</td>
                  <td className="px-2 py-2 text-right text-muted">100 %</td>
                  <td
                    className={`px-2 py-2 text-right ${f.periodReturn === null ? '' : toneClass(f.periodReturn)}`}
                  >
                    {f.periodReturn === null ? '–' : formatPercent(f.periodReturn, 2, true)}
                  </td>
                  <td
                    className={`px-2 py-2 text-right whitespace-nowrap ${toneClass(contribTotal)}`}
                  >
                    {signed(contribTotal)}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{eur(f.bought)}</td>
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Příspěvek = o kolik ETF změnilo hodnotu portfolia bez vlivu nákupů a prodejů.
              {f.fees > 0 && ` Poplatky ${eur(f.fees, 2)} nejsou u žádného ETF.`}
              {Math.abs(f.valueEnd - etfTotal) >= 1 &&
                ` Hotovost na účtech: ${eur(f.valueEnd - etfTotal)}.`}
            </p>
          </Card>
        </section>
      )}

      {on('purchases') && (
        <section>
          <SectionTitle>Nákupy vs. plán</SectionTitle>
          <Card className="!pb-3">
            {f.trades.length === 0 ? (
              <p className="text-[13px] text-muted">V {w.loc} žádný obchod.</p>
            ) : f.trades.length > maxTrades ? (
              <p className="text-[13px]">
                V {w.loc} proběhlo {f.trades.length} obchodů, nákupy celkem {eur(f.bought)}. Rozpis
                po měsících je v tabulce Po měsících.
              </p>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="text-left">
                    {['Datum', 'Broker', 'ETF', 'Částka'].map((h, i) => (
                      <th key={h} className={`${th} ${i === 3 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {f.trades.map((t, i) => (
                    <tr key={`${t.date}-${t.ticker}-${i}`}>
                      <td className={td}>{shortDate(t.date)}</td>
                      <td className={td}>{t.broker}</td>
                      <td className={td}>
                        {t.ticker}
                        {t.type === 'SELL' && (
                          <span className="ml-1.5 text-xs text-neg">prodej</span>
                        )}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{eur(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-muted">
              {share === null ? (
                'Měsíční plán (měsíční vklad) nastavíš na obrazovce Cíl.'
              ) : (
                <>
                  {isMonth
                    ? `Plán ${eur(f.planMonthly!)} / měsíc`
                    : `Plán za ${w.nom} ${eur(planTotal(f)!)} (${f.periodMonths ?? 1} × ${eur(f.planMonthly!)})`}{' '}
                  →{' '}
                  <b className={share >= 0.995 ? 'text-pos' : 'text-amber-500'}>
                    splněno {formatPercent(share, 0)}
                  </b>
                  . Od začátku roku nakoupeno {eur(f.boughtYtd)} z plánovaných{' '}
                  {eur(f.planMonthly! * f.monthsYtd)}.
                </>
              )}
            </p>
          </Card>
        </section>
      )}

      {!isMonth && on('months') && <MonthsSection f={f} />}

      {d && (on('benchmark') || on('risk')) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
          {on('benchmark') && <BenchmarkSection f={f} d={d} />}
          {on('risk') && <RiskSection f={f} d={d} />}
        </div>
      )}

      {d && on('allocation') && <AllocationSection d={d} />}

      {on('goal') && f.goal && (
        <section>
          <SectionTitle>Cesta k cíli {formatMoney(f.goal.targetCzk, 'CZK', 0)}</SectionTitle>
          <Card>
            <div className="mb-2 flex justify-between text-[13px]">
              <span>
                <b>{formatMoney(f.goal.valueCzk, 'CZK', 0)}</b> z{' '}
                {formatMoney(f.goal.targetCzk, 'CZK', 0)}
              </span>
              <span>
                <b>{formatPercent(f.goal.progress, 1)}</b>
                {f.goal.progressPrev !== null && (
                  <span className={toneClass(f.goal.progress - f.goal.progressPrev)}>
                    {' '}
                    ({f.goal.progress >= f.goal.progressPrev ? '+' : '-'}
                    {Math.abs((f.goal.progress - f.goal.progressPrev) * 100)
                      .toFixed(1)
                      .replace('.', ',')}{' '}
                    p. b.)
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded-md bg-surface-2">
              <i
                className="block h-full bg-gradient-to-r from-accent to-sky-500"
                style={{ width: `${Math.min(100, f.goal.progress * 100)}%` }}
              />
              {f.goal.progressPrev !== null && (
                <b
                  className="absolute top-0 bottom-0 w-0.5 bg-amber-500"
                  style={{ left: `${Math.min(100, f.goal.progressPrev * 100)}%` }}
                  title={`Stav na začátku ${w.gen}`}
                />
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Oranžová čárka = stav na začátku {w.gen}.
              {f.fxEnd !== null &&
                ` Přepočteno kurzem ČNB ${f.fxEnd.toFixed(3).replace('.', ',')} Kč/€.`}
            </p>
            {projection && (
              <p className="mt-2 text-[13px]">
                {projection.months === null ? (
                  'Při předpokladech z obrazovky Cíl se cíle do 50 let nedosáhne.'
                ) : (
                  <>
                    Při výnosu {formatPercent(projection.annualReturn, 1)} ročně a{' '}
                    {eur(projection.monthlyEur)} měsíčně vychází dosažení cíle kolem roku{' '}
                    <b>{yearIn(projection.months)}</b>
                    {projection.monthsLow !== null &&
                      (projection.monthsHigh !== null
                        ? ` (rozpětí ${yearIn(projection.monthsLow)}–${yearIn(projection.monthsHigh)} při výnosu ±3 p. b.)`
                        : ` (nejdříve ${yearIn(projection.monthsLow)})`)}
                    . Je to odhad modelu, ne jistota.
                  </>
                )}
              </p>
            )}
          </Card>
        </section>
      )}

      {kind === 'year' && on('yearReview') && <YearReviewSection f={f} />}

      {(on('fx') || (d && on('taxes'))) && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
          {on('fx') && <FxSection f={f} />}
          {d && on('taxes') && <TaxesSection d={d} />}
        </div>
      )}

      {d && on('outlook') && <OutlookSection f={f} lines={outlookLines} />}

      <footer className="border-t pt-3 text-xs text-muted">
        Čísla spočítala aplikace z tvých transakcí a kurzů (Yahoo, ČNB) v den vytvoření článku a
        článek se už sám nemění – aktuální data do něj dostaneš tlačítkem „Vytvořit znovu“.{' '}
        {aiParts.length > 0 && !showTemplate
          ? `Části textu (${aiParts.map((p) => AI_PART_LABELS[p]).join(', ')}) napsala umělá inteligence a každé číslo v nich se ověřilo proti výpočtu; zbytek textu je ze šablony.`
          : 'Text je sestavený šablonou z vypočtených čísel.'}{' '}
        Nejde o finanční poradenství.
      </footer>
    </article>
  )
}
