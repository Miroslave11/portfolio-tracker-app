import { useMemo, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { formatMonthLong } from '../../../core/date'
import { buildMonthFacts, templateSummary } from '../../../core/monthly-summary'
import type { AiRewriteResult } from '../../../shared/ai'
import { monthArticleId } from '../../../shared/summary'
import { cleanError } from '../errors'
import { reportMonths } from '../exportData'
import { useApp } from '../store'
import { Card } from './Card'

/** Přeformulované texty z této relace: stejné shrnutí se nemusí posílat modelu podruhé. */
const aiCache = new Map<string, Extract<AiRewriteResult, { status: 'ok' }>>()

/** Karta „Měsíční shrnutí“ na Přehledu: fakta počítá kód, volitelná lokální AI je jen přeformuluje. */
export function MonthlySummaryCard(): React.JSX.Element | null {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const displayCurrency = useApp((s) => s.settings.displayCurrency)
  const targetCzk = useApp((s) => s.settings.goal.targetCzk)
  const ai = useApp((s) => s.settings.ai)
  const setScreen = useApp((s) => s.setScreen)
  const openSummary = useApp((s) => s.openSummary)
  const summaries = useApp((s) => s.summaries)

  const months = useMemo(() => (portfolio ? reportMonths(portfolio) : []), [portfolio])
  // Výchozí je poslední dokončený měsíc (u prvního měsíce dat ten jediný).
  const [picked, setPicked] = useState<string | null>(null)
  const month = picked && months.includes(picked) ? picked : (months[1] ?? months[0])

  const lines = useMemo(() => {
    if (!portfolio || !month) return null
    const accountIds =
      brokerFilter === 'all'
        ? null
        : new Set(portfolio.accounts.filter((a) => a.name === brokerFilter).map((a) => a.id))
    const facts = buildMonthFacts({
      portfolio,
      prices,
      accountIds,
      month,
      currency: displayCurrency,
      targetCzk
    })
    return facts ? templateSummary(facts) : null
  }, [portfolio, prices, brokerFilter, displayCurrency, targetCzk, month])

  const articleId = month ? monthArticleId(month) : null
  const hasArticle = !!summaries?.some((a) => a.id === articleId)
  const source = lines?.join(' ') ?? ''
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ source: string; message: string } | null>(null)
  const [showAi, setShowAi] = useState(true)
  const cached = aiCache.get(`${ai.model}\n${source}`)
  const failed = failure && failure.source === source ? failure.message : null

  if (!lines || !month) return null

  const rewrite = async (): Promise<void> => {
    setBusy(true)
    setFailure(null)
    try {
      const result = await window.api.aiRewrite({ summary: source })
      if (result.status === 'ok') {
        aiCache.set(`${ai.model}\n${source}`, result)
        setShowAi(true)
      } else {
        setFailure({ source, message: result.message })
      }
    } catch (err) {
      setFailure({ source, message: `AI se nepodařilo zavolat: ${cleanError(err)}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-[13px] font-semibold tracking-[.04em] text-muted uppercase">
          Měsíční shrnutí
        </h3>
        <select
          aria-label="Měsíc shrnutí"
          value={month}
          onChange={(e) => setPicked(e.target.value)}
          className="rounded-[8px] border bg-surface-2 px-2 py-[3px] text-[13px] text-fg"
        >
          {months.map((m) => (
            <option key={m} value={m}>
              {formatMonthLong(m)}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {hasArticle && articleId && (
            <button
              onClick={() => openSummary(articleId)}
              className="text-[13px] text-accent hover:underline"
            >
              Celé shrnutí →
            </button>
          )}
          {ai.enabled ? (
            <button
              onClick={() => void rewrite()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-[8px] border bg-surface-2 px-3 py-[5px] text-[13px] hover:brightness-110 disabled:opacity-50"
            >
              <Sparkles size={14} className="text-accent" />
              {busy ? 'Přeformulovávám…' : cached ? 'Přeformulovat znovu' : 'Přeformulovat AI'}
            </button>
          ) : (
            <button
              onClick={() => setScreen('settings')}
              className="text-xs text-muted hover:text-accent hover:underline"
            >
              Zapnout AI →
            </button>
          )}
        </div>
      </div>

      {cached && showAi ? (
        <p className="text-[14px] leading-relaxed">{cached.text}</p>
      ) : (
        <ul className="grid gap-1.5 text-[14px] leading-relaxed">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {cached && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>
            {showAi
              ? `Přeformulováno AI (${cached.model}); každé číslo je ověřeno proti výpočtu.`
              : 'Strohé shrnutí vypočtené aplikací.'}
          </span>
          <button onClick={() => setShowAi(!showAi)} className="text-accent hover:underline">
            {showAi ? 'Zobrazit strohé shrnutí' : 'Zobrazit text od AI'}
          </button>
        </div>
      )}
      {failed && (
        <p role="status" className="mt-3 text-xs text-amber-500">
          {failed}
        </p>
      )}
    </Card>
  )
}
