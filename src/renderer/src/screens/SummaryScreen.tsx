import { useMemo, useState } from 'react'
import { FileText, History, Newspaper, RefreshCw, Sparkles } from 'lucide-react'
import { formatDate, formatDateTime } from '../../../core/date'
import { formatPercent } from '../../../core/money'
import { articleHighlights, articleTitle } from '../../../core/summary-month'
import { buildArticleHtml } from '../../../core/summary-pdf'
import { periodShortTitle } from '../../../core/summary-period'
import {
  LEVEL_LABELS,
  levelOf,
  type SummaryArticle,
  type SummaryKind
} from '../../../shared/summary'
import { Card } from '../components/Card'
import { Segmented } from '../components/Segmented'
import { SummaryArticleView } from '../components/SummaryArticleView'
import { cleanError } from '../errors'
import { useApp } from '../store'
import { backfillPeriods, buildArticles, writeAiTexts, type PeriodRef } from '../summaries'
import { articleChartImages } from '../summaryCharts'
import { toneClass } from '../tone'

const KIND_LABEL: Record<SummaryKind, string> = {
  month: 'měsíc',
  quarter: 'kvartál',
  half: 'pololetí',
  year: 'rok'
}
const KIND_CLASS: Record<SummaryKind, string> = {
  month: 'border-sky-500 text-sky-500',
  quarter: 'border-amber-500 text-amber-500',
  half: 'border-emerald-500 text-emerald-500',
  year: 'border-rose-500 text-rose-500'
}

type Filter = 'all' | SummaryKind
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Vše' },
  { value: 'month', label: 'Měsíce' },
  { value: 'quarter', label: 'Kvartály' },
  { value: 'half', label: 'Pololetí' },
  { value: 'year', label: 'Roky' }
]

function KindTag({ kind }: { kind: SummaryKind }): React.JSX.Element {
  return (
    <span className={`rounded-full border px-2 text-[11px] whitespace-nowrap ${KIND_CLASS[kind]}`}>
      {KIND_LABEL[kind]}
    </span>
  )
}

const btn =
  'flex items-center gap-1.5 rounded-[8px] border bg-surface-2 px-3 py-[5px] text-[13px] hover:brightness-110 disabled:opacity-50'

export function SummaryScreen(): React.JSX.Element {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const summaries = useApp((s) => s.summaries)
  const focus = useApp((s) => s.summaryFocus)
  const setFocus = useApp((s) => s.setSummaryFocus)
  const saveSummaries = useApp((s) => s.saveSummaries)
  const showNotice = useApp((s) => s.showNotice)
  const setScreen = useApp((s) => s.setScreen)
  const summarySettings = useApp((s) => s.settings.summary)
  const ai = useApp((s) => s.settings.ai)
  const aiBusy = useApp((s) => s.summaryAiBusy)
  const setAiBusy = useApp((s) => s.setSummaryAiBusy)
  const aiOn = ai.enabled && ai.parts.length > 0

  const [view, setView] = useState<'article' | 'list'>('article')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState(false)

  const articles = useMemo(() => summaries ?? [], [summaries])
  const missing = useMemo(
    () => backfillPeriods(portfolio, prices, summaries, summarySettings.auto),
    [portfolio, prices, summaries, summarySettings.auto]
  )
  const current = articles.find((a) => a.id === focus) ?? articles[0] ?? null

  /**
   * Vytvoří články z aktuálních dat. `withAi`: u přepočítaného článku se rovnou nechá napsat text
   * lokální AI (u hromadného zpětného vytvoření ne – bylo by to příliš pomalé).
   */
  const create = async (
    periods: PeriodRef[],
    message: (n: number) => string,
    withAi = false
  ): Promise<void> => {
    if (!portfolio) return
    setBusy(true)
    try {
      let built = buildArticles(periods, portfolio, prices, useApp.getState().settings)
      if (built.length === 0) {
        showNotice('Pro vybrané období nejsou data.', 'error')
        return
      }
      let aiMessage: string | null = null
      if (withAi && aiOn) {
        setAiBusy(built[0].id)
        const outcome = await writeAiTexts(built[0])
        built = [outcome.article, ...built.slice(1)]
        aiMessage = outcome.message
      }
      await saveSummaries(built)
      showNotice(`${message(built.length)}${aiMessage ? ` ${aiMessage}` : ''}`)
    } catch (err) {
      showNotice(`Shrnutí se nepodařilo uložit: ${cleanError(err)}`, 'error')
    } finally {
      setAiBusy(null)
      setBusy(false)
    }
  }

  /** Dopíše text lokální AI k už uloženému článku (jeho čísla se nepřepočítávají). */
  const writeAi = async (article: SummaryArticle): Promise<void> => {
    setBusy(true)
    setAiBusy(article.id)
    try {
      const outcome = await writeAiTexts(article)
      if (!outcome.unavailable) await saveSummaries([outcome.article])
      showNotice(
        outcome.message ?? 'AI nenapsala žádný text.',
        outcome.unavailable ? 'error' : 'ok'
      )
    } catch (err) {
      showNotice(`Text se nepodařilo uložit: ${cleanError(err)}`, 'error')
    } finally {
      setAiBusy(null)
      setBusy(false)
    }
  }

  /** Uloží článek jako PDF (A4) tak, jak je zobrazený: stejné sekce podle nastavení rozsahu. */
  const savePdf = async (article: SummaryArticle): Promise<void> => {
    setBusy(true)
    try {
      const html = buildArticleHtml(article, {
        sections: summarySettings[article.kind].sections,
        charts: articleChartImages(article.facts)
      })
      const result = await window.api.exportFile({
        kind: 'pdf',
        fileName: `Shrnutí ${articleTitle(article.facts)}.pdf`,
        html
      })
      if (result.status === 'saved') showNotice(`Uloženo: ${result.path}`)
      else if (result.status === 'error') showNotice(result.message, 'error')
    } catch (err) {
      showNotice(`PDF se nepodařilo uložit: ${cleanError(err)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const backfill = (): Promise<void> =>
    create(missing, (n) => `Vytvořeno ${n} shrnutí za starší období.`)

  const backfillButton = (
    <button onClick={() => void backfill()} disabled={busy || missing.length === 0} className={btn}>
      <History size={14} />
      {missing.length === 0 ? 'Vše vytvořeno' : `Vytvořit zpětně (${missing.length})`}
    </button>
  )

  if (!portfolio || portfolio.transactions.length === 0) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <Newspaper size={28} className="text-accent" />
          <div className="text-lg font-semibold">Zatím tu nejsou žádná data</div>
          <p className="max-w-md text-muted">
            Shrnutí portfolia se vytvářejí z transakcí. Nejdřív je naimportuj na obrazovce Obchody.
          </p>
          <button
            onClick={() => setScreen('transactions')}
            className="mt-1 rounded-[9px] bg-accent px-4 py-2 text-[13px] font-semibold text-white hover:brightness-110"
          >
            Přejít na Obchody
          </button>
        </div>
      </Card>
    )
  }

  if (articles.length === 0 || !current) {
    return (
      <Card>
        <div className="grid justify-items-center gap-3 py-10 text-center">
          <Newspaper size={28} className="text-accent" />
          <div className="text-lg font-semibold">Zatím tu není žádné shrnutí</div>
          <p className="max-w-lg text-muted">
            Shrnutí za měsíc, kvartál, pololetí a rok se vytvoří samo po skončení období, jakmile
            jsou stažené kurzy k jeho konci. Starší období můžeš vytvořit zpětně od první transakce.
          </p>
          {backfillButton}
        </div>
      </Card>
    )
  }

  const regenerate = (a: SummaryArticle): Promise<void> =>
    create(
      [{ kind: a.kind, period: a.period }],
      () => `Shrnutí ${articleTitle(a.facts)} je vytvořené znovu z aktuálních dat.`,
      true
    )

  const years = new Map<string, SummaryArticle[]>()
  for (const a of articles) {
    const y = a.period.slice(0, 4)
    years.set(y, [...(years.get(y) ?? []), a])
  }
  const listed = articles.filter((a) => filter === 'all' || a.kind === filter)

  const open = (a: SummaryArticle): void => {
    setFocus(a.id)
    setView('article')
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented<'article' | 'list'>
          ariaLabel="Zobrazení shrnutí"
          options={[
            { value: 'article', label: 'Článek' },
            { value: 'list', label: 'Seznam' }
          ]}
          value={view}
          onChange={setView}
        />
        {view === 'list' && (
          <Segmented<Filter>
            ariaLabel="Typ shrnutí"
            options={FILTERS}
            value={filter}
            onChange={setFilter}
          />
        )}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setScreen('settings')}
            className="text-[13px] text-muted hover:text-accent hover:underline"
            title="Rozsah a sekce článku nastavíš v Nastavení → Shrnutí portfolia"
          >
            Rozsah ({KIND_LABEL[current.kind]}):{' '}
            {LEVEL_LABELS[levelOf(summarySettings[current.kind].sections, current.kind)]}
          </button>
          {backfillButton}
        </div>
      </div>

      {view === 'list' ? (
        <div className="grid max-w-[920px] gap-3">
          {listed.length === 0 && (
            <Card>
              <p className="text-muted">Tohoto typu zatím žádné shrnutí není.</p>
            </Card>
          )}
          {listed.map((a) => {
            const r = a.facts.periodReturn
            return (
              <button
                key={a.id}
                onClick={() => open(a)}
                className="rounded-[14px] border bg-surface p-[16px] text-left shadow-card hover:border-accent"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <KindTag kind={a.kind} />
                      {formatDate(a.createdAt.slice(0, 10))}
                    </div>
                    <div className="mt-1 text-[17px] font-semibold">{articleTitle(a.facts)}</div>
                  </div>
                  <div className={`text-[17px] font-bold ${r === null ? '' : toneClass(r)}`}>
                    {r === null ? '–' : formatPercent(r, 2, true)}
                  </div>
                </div>
                <p className="mt-1.5 text-[13px] text-muted">{articleHighlights(a.facts)[0]}</p>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-[210px_1fr] items-start gap-5">
          <Card className="sticky top-0 max-h-[calc(100vh-170px)] overflow-y-auto !p-3">
            <h3 className="mb-1 px-2 text-[12px] font-semibold tracking-[.04em] text-muted uppercase">
              Shrnutí portfolia
            </h3>
            {[...years].map(([year, list]) => (
              <div key={year}>
                <div className="mt-3 mb-1 px-2 text-[11px] tracking-[.05em] text-muted uppercase">
                  {year}
                </div>
                {list.map((a) => {
                  const on = a.id === current.id
                  return (
                    <button
                      key={a.id}
                      onClick={() => open(a)}
                      aria-current={on ? 'page' : undefined}
                      className={`flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-1.5 text-left text-[13px] ${
                        on ? 'bg-accent/15 font-semibold' : 'hover:bg-surface-2'
                      }`}
                    >
                      <span className="truncate">{periodShortTitle(a.kind, a.period)}</span>
                      <KindTag kind={a.kind} />
                    </button>
                  )
                })}
              </div>
            ))}
            <p className="mt-3 px-2 text-[11px] leading-snug text-muted">
              Nové shrnutí se vytvoří samo při prvním spuštění po skončení měsíce, kvartálu,
              pololetí nebo roku.
            </p>
          </Card>

          <SummaryArticleView
            key={current.id}
            article={current}
            sections={summarySettings[current.kind].sections}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {aiBusy === current.id && (
                  <span className="text-xs text-muted">
                    AI píše článek po částech – přes Claude to trvá desítky sekund, lokální model na
                    pomalejším počítači i několik minut.
                  </span>
                )}
                {aiOn && (
                  <button
                    onClick={() => void writeAi(current)}
                    disabled={busy || aiBusy !== null}
                    className={btn}
                    title="AI napíše text článku z jeho uložených čísel (čísla se ověří)"
                  >
                    <Sparkles size={14} className="text-accent" />
                    {aiBusy === current.id
                      ? 'AI píše…'
                      : current.ai
                        ? 'Napsat AI znovu'
                        : 'Napsat AI'}
                  </button>
                )}
                <button
                  onClick={() => void savePdf(current)}
                  disabled={busy || aiBusy !== null}
                  className={btn}
                  title="Uloží celý článek jako PDF (A4) se sekcemi podle Nastavení → Shrnutí portfolia"
                >
                  <FileText size={14} />
                  PDF
                </button>
                <button
                  onClick={() => void regenerate(current)}
                  disabled={busy || aiBusy !== null}
                  className={btn}
                  title={`Vytvořeno ${formatDateTime(current.createdAt)} – přepočítat z aktuálních dat`}
                >
                  <RefreshCw size={14} />
                  Vytvořit znovu
                </button>
              </div>
            }
          />
        </div>
      )}
    </div>
  )
}
