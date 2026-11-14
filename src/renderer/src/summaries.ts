import { useEffect, useRef } from 'react'
import { todayIso } from '../../core/date'
import { articleFactSheet } from '../../core/summary-ai'
import { buildPeriodFacts, latestPriceDate } from '../../core/summary-month'
import { duePeriods, missingPeriods } from '../../core/summary-period'
import type { Portfolio } from '../../shared/model'
import type { PriceCache } from '../../shared/prices'
import type { Settings } from '../../shared/settings'
import {
  articleId,
  type ArticleAiTexts,
  type SummaryArticle,
  type SummaryKind
} from '../../shared/summary'
import { cleanError } from './errors'
import { useApp } from './store'

export interface PeriodRef {
  kind: SummaryKind
  /** „2026-10“, „2026-Q3“, „2026-H1“ nebo „2026“ */
  period: string
}

/** Vytvoří články za daná období z aktuálních dat (období bez dat se přeskočí). */
export function buildArticles(
  periods: readonly PeriodRef[],
  portfolio: Portfolio,
  prices: PriceCache,
  settings: Settings
): SummaryArticle[] {
  const createdAt = new Date().toISOString()
  const out: SummaryArticle[] = []
  for (const { kind, period } of periods) {
    const facts = buildPeriodFacts({
      portfolio,
      prices,
      kind,
      period,
      planMonthly: settings.goal.monthlyEur,
      targetCzk: settings.goal.targetCzk,
      detail: {
        benchmark: settings.benchmark,
        targets: settings.rebalance.targets,
        allocationEur: settings.rebalance.monthlyEur,
        annualReturn: settings.goal.annualReturn
      }
    })
    if (facts) out.push({ id: articleId(kind, period), kind, period, createdAt, facts })
  }
  return out
}

/** Výsledek psaní AI textu: článek s textem (nebo beze změny) a zpráva pro uživatele. */
export interface AiWriteOutcome {
  article: SummaryArticle
  message: string | null
  /** Model není dostupný (Ollama neběží, Claude Code nepřihlášený…) – další články se už zkoušet nemají. */
  unavailable: boolean
}

/** Počet částí, které model napsal správně / špatně, jako věta pro uživatele. */
function aiSummaryMessage(ok: number, rejected: number): string | null {
  if (ok === 0 && rejected === 0) return null
  if (rejected === 0) return 'AI napsala text shrnutí; každé číslo je ověřeno.'
  if (ok === 0) return 'AI napsala text špatně (změněná čísla), zůstává šablona.'
  return `AI napsala ${ok} z ${ok + rejected} částí, u zbytku zůstává šablona.`
}

/**
 * Nechá lokální AI napsat vybrané části článku z jeho uložených faktů. Čísla se ověřují
 * v hlavním procesu; části, které neprošly, zůstanou ze šablony.
 */
export async function writeAiTexts(article: SummaryArticle): Promise<AiWriteOutcome> {
  let result
  try {
    result = await window.api.aiWriteArticle({
      kind: article.kind,
      facts: articleFactSheet(article.facts)
    })
  } catch (err) {
    return {
      article,
      message: `AI se nepodařilo zavolat: ${cleanError(err)}`,
      unavailable: true
    }
  }
  if (result.status === 'unavailable') {
    return { article, message: result.message, unavailable: true }
  }
  const texts: ArticleAiTexts = {
    model: result.model,
    createdAt: new Date().toISOString(),
    rejected: []
  }
  let ok = 0
  for (const p of result.parts) {
    if (p.status === 'ok') {
      texts[p.part] = p.lines
      ok++
    } else {
      texts.rejected.push({ part: p.part, message: p.message })
    }
  }
  return {
    article: { ...article, ai: texts },
    message: aiSummaryMessage(ok, texts.rejected.length),
    unavailable: false
  }
}

function firstDate(portfolio: Portfolio): string | null {
  let first: string | null = null
  for (const t of portfolio.transactions) if (first === null || t.date < first) first = t.date
  return first
}

function existing(summaries: readonly SummaryArticle[], kind: SummaryKind): Set<string> {
  return new Set(summaries.filter((a) => a.kind === kind).map((a) => a.period))
}

/** Pro každý zapnutý typ období vybere období funkcí `pick` (chybějící nebo k dohnání). */
function collect(
  portfolio: Portfolio | null,
  prices: PriceCache,
  summaries: readonly SummaryArticle[] | null,
  kinds: readonly SummaryKind[],
  pick: typeof missingPeriods
): PeriodRef[] {
  const first = portfolio && firstDate(portfolio)
  if (!portfolio || !first || !summaries) return []
  const latest = latestPriceDate(portfolio, prices)
  const today = todayIso()
  return kinds.flatMap((kind) =>
    pick(kind, existing(summaries, kind), first, latest, today).map((period) => ({ kind, period }))
  )
}

/** Skončená období (zapnutých typů) bez článku, která jde vytvořit zpětně. */
export function backfillPeriods(
  portfolio: Portfolio | null,
  prices: PriceCache,
  summaries: readonly SummaryArticle[] | null,
  kinds: readonly SummaryKind[]
): PeriodRef[] {
  return collect(portfolio, prices, summaries, kinds, missingPeriods)
}

/**
 * Nově vytvořeným článkům nechá (je-li AI zapnutá) napsat text. Články jsou už uložené se
 * šablonou, takže výpadek Ollamy nic nekazí. Starší články (zpětné vytvoření) se nepíšou.
 */
async function writeAiForNew(articles: readonly SummaryArticle[]): Promise<void> {
  const { settings, saveSummaries, showNotice, setSummaryAiBusy } = useApp.getState()
  if (!settings.ai.enabled || settings.ai.parts.length === 0) return
  try {
    for (const article of articles) {
      setSummaryAiBusy(article.id)
      const outcome = await writeAiTexts(article)
      if (outcome.unavailable) {
        showNotice(
          `Shrnutí je uložené s šablonovým textem. ${outcome.message ?? ''} Později ho dopíšeš tlačítkem „Napsat AI“.`,
          'error'
        )
        return
      }
      await saveSummaries([outcome.article])
    }
  } finally {
    setSummaryAiBusy(null)
  }
}

/**
 * Po skončení období (a jakmile jsou stažené kurzy k jeho konci) vytvoří chybějící články
 * zapnutých typů – „dohnání“ při prvním spuštění po skončení měsíce, kvartálu, pololetí, roku.
 */
export function useAutoSummaries(): void {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const updating = useApp((s) => s.priceUpdating)
  const summaries = useApp((s) => s.summaries)
  const kinds = useApp((s) => s.settings.summary.auto)
  const busy = useRef(false)
  const failed = useRef(false)

  useEffect(() => {
    if (!portfolio || summaries === null || updating || busy.current || failed.current) return
    const due = collect(portfolio, prices, summaries, kinds, duePeriods)
    if (due.length === 0) return
    const { settings, saveSummaries, showNotice } = useApp.getState()
    const articles = buildArticles(due, portfolio, prices, settings)
    if (articles.length === 0) return
    busy.current = true
    saveSummaries(articles)
      .then(async () => {
        const names = articles.length === 1 ? 'Nové shrnutí' : `${articles.length} nová shrnutí`
        showNotice(`${names} portfolia – najdeš je na obrazovce Shrnutí.`)
        await writeAiForNew(articles)
      })
      .catch((err) => {
        // Při chybě to v této relaci znovu nezkoušet (jinak by se opakovalo s každou změnou).
        failed.current = true
        showNotice(`Shrnutí se nepodařilo uložit: ${cleanError(err)}`, 'error')
      })
      .finally(() => {
        busy.current = false
      })
  }, [portfolio, prices, updating, summaries, kinds])
}
