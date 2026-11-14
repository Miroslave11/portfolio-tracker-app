import type { Portfolio } from '../shared/model'
import { FX_EUR_CZK, type PriceCache } from '../shared/prices'
import { addDays, addMonths, formatDate, formatMonthLong } from './date'
import { formatMoney, formatPercent, type MoneyCurrency } from './money'
import { computePerformance, toPerfPoints } from './performance'
import { calculatePortfolio, valueAtOrBefore, type SeriesPoint } from './portfolio-calc'

/** Jedno ETF s nejlepším / nejhorším výsledkem v měsíci (bez vlivu nákupů). */
export interface EtfMove {
  ticker: string
  /** Zlomek: 0,05 = +5 % z hodnoty na začátku měsíce a nákupů v něm. */
  pct: number
}

/** Ověřená čísla měsíce; text shrnutí se skládá výhradně z nich. */
export interface MonthFacts {
  /** „RRRR-MM“ */
  month: string
  currency: MoneyCurrency
  /** Den, ke kterému jsou hodnoty (konec měsíce, nebo poslední známý den). */
  asOf: string
  /** Měsíc ještě neskončil, nebo kurzy končí dřív než měsíc. */
  partial: boolean
  /** Nakoupeno v měsíci (součet nákupů ETF) a počet nákupů. */
  bought: number
  buyCount: number
  /** Nakoupeno v předchozím měsíci; `null` = žádný předchozí měsíc. */
  boughtPrevious: number | null
  /** Hodnota portfolia na konci měsíce. */
  value: number
  /** Změna hodnoty za měsíc celkem (včetně vkladů a výběrů). */
  valueChange: number
  /** Změna hodnoty bez vkladů a výběrů, tedy co udělal trh. */
  marketChange: number
  /** Výkon portfolia za měsíc bez vlivu vkladů (TTWROR); `null` = nejde spočítat. */
  monthReturn: number | null
  best: EtfMove | null
  worst: EtfMove | null
  /** Postup k cíli: hodnota v Kč a podíl na cíli; `null` bez kurzu ČNB. */
  goal: { targetCzk: number; valueCzk: number; progress: number } | null
}

export interface MonthFactsInput {
  portfolio: Portfolio
  prices: PriceCache
  accountIds?: ReadonlySet<string> | null
  /** „RRRR-MM“ */
  month: string
  currency: MoneyCurrency
  targetCzk: number
}

function pointAtOrBefore(series: readonly SeriesPoint[], date: string): SeriesPoint | null {
  let found: SeriesPoint | null = null
  for (const p of series) {
    if (p.date > date) break
    found = p
  }
  return found
}

/**
 * Spočítá fakta pro měsíční shrnutí. Vrací `null`, když pro měsíc nejsou žádná data
 * (měsíc je před prvním obchodem nebo nejsou žádné transakce).
 */
export function buildMonthFacts(input: MonthFactsInput): MonthFacts | null {
  const { portfolio, prices, month } = input
  const accountIds = input.accountIds ?? null
  const monthStart = `${month}-01`
  const monthEnd = addDays(addMonths(monthStart, 1), -1)
  const prevEnd = addDays(monthStart, -1)

  const full = calculatePortfolio({ portfolio, prices, accountIds })
  if (!full.summary) return null
  const asOf = monthEnd < full.summary.asOf ? monthEnd : full.summary.asOf
  if (asOf < monthStart) return null

  const end = pointAtOrBefore(full.series, asOf)
  if (!end) return null
  const start = pointAtOrBefore(full.series, prevEnd)

  const fxRates = prices.fx[FX_EUR_CZK]?.rates ?? []
  const fxAt = (date: string): number | null =>
    fxRates.length ? (valueAtOrBefore(fxRates, date) ?? fxRates[0][1]) : null

  const czk =
    input.currency === 'CZK' &&
    end.valueCzk !== null &&
    end.investedCzk !== null &&
    (start === null || (start.valueCzk !== null && start.investedCzk !== null))
  const currency: MoneyCurrency = czk ? 'CZK' : 'EUR'
  const valueOf = (p: SeriesPoint | null): number => (p === null ? 0 : czk ? p.valueCzk! : p.value)
  const investedOf = (p: SeriesPoint | null): number =>
    p === null ? 0 : czk ? p.investedCzk! : p.invested

  const value = valueOf(end)
  const valueChange = value - valueOf(start)
  const marketChange = valueChange - (investedOf(end) - investedOf(start))

  // Nákupy ETF v měsíci (a v předchozím měsíci) v měně shrnutí.
  const ids = (t: { accountId: string }): boolean => !accountIds || accountIds.has(t.accountId)
  const boughtIn = (m: string): { total: number; count: number } => {
    let total = 0
    let count = 0
    for (const t of portfolio.transactions) {
      if (t.type !== 'BUY' || !ids(t) || t.date.slice(0, 7) !== m) continue
      const rate = czk ? (fxAt(t.date) ?? 1) : 1
      total += t.amount * rate
      count++
    }
    return { total, count }
  }
  const current = boughtIn(month)
  const firstMonth = full.summary.firstDate.slice(0, 7)
  const previousMonth = addMonths(monthStart, -1).slice(0, 7)
  const previous = previousMonth >= firstMonth ? boughtIn(previousMonth).total : null

  // Výkon měsíce bez vkladů (od konce předchozího měsíce, aby se počítal i pohyb 1. dne).
  const points = toPerfPoints(full.series, 'EUR')
  const monthPerf = points ? computePerformance(points, prevEnd, asOf) : null

  // Nejlepší / nejhorší ETF: změna hodnoty pozice bez nákupů a prodejů v měsíci.
  const positionsAt = (date: string): Map<string, { value: number; estimated: boolean }> => {
    const calc = calculatePortfolio({ portfolio, prices, accountIds, asOf: date })
    return new Map((calc.summary?.positions ?? []).map((p) => [p.securityId, p]))
  }
  const endPositions = positionsAt(asOf)
  const startPositions = positionsAt(prevEnd)
  const moves: EtfMove[] = []
  for (const [ticker, pos] of endPositions) {
    const before = startPositions.get(ticker)
    if (pos.estimated || before?.estimated) continue
    let boughtEur = 0
    let soldEur = 0
    for (const t of portfolio.transactions) {
      if (t.securityId !== ticker || !ids(t) || t.date.slice(0, 7) !== month) continue
      if (t.type === 'BUY') boughtEur += t.amount
      else if (t.type === 'SELL') soldEur += t.amount
    }
    const base = (before?.value ?? 0) + boughtEur
    if (base <= 1) continue
    const gain = pos.value - (before?.value ?? 0) - boughtEur + soldEur
    moves.push({ ticker, pct: gain / base })
  }
  moves.sort((a, b) => b.pct - a.pct || a.ticker.localeCompare(b.ticker))
  const best = moves[0] ?? null
  const worst = moves.length >= 2 ? moves[moves.length - 1] : null

  const goal =
    end.valueCzk !== null && input.targetCzk > 0
      ? {
          targetCzk: input.targetCzk,
          valueCzk: end.valueCzk,
          progress: end.valueCzk / input.targetCzk
        }
      : null

  return {
    month,
    currency,
    asOf,
    partial: asOf < monthEnd,
    bought: current.total,
    buyCount: current.count,
    boughtPrevious: previous,
    value,
    valueChange,
    marketChange,
    monthReturn: monthPerf?.ttwror ?? null,
    best,
    worst,
    goal
  }
}

const NBSP = ' '

function czCount(n: number, one: string, few: string, many: string): string {
  return `${n}${NBSP}${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
}

/** Strohé shrnutí ze šablon: jedna věta na jeden bod, každé číslo pochází z `facts`. */
export function templateSummary(f: MonthFacts): string[] {
  const money = (v: number): string => formatMoney(Math.abs(v), f.currency, 0)
  const lines: string[] = []

  if (f.buyCount === 0) {
    lines.push(`Za ${formatMonthLong(f.month)} jsi nenakoupil žádné ETF.`)
  } else {
    let line = `Za ${formatMonthLong(f.month)} jsi nakoupil ETF za ${money(f.bought)} (${czCount(
      f.buyCount,
      'nákup',
      'nákupy',
      'nákupů'
    )}).`
    if (f.boughtPrevious !== null) {
      line += ` Předchozí měsíc to bylo ${money(f.boughtPrevious)}.`
    }
    lines.push(line)
  }

  const direction = f.valueChange >= 0 ? 'vzrostla' : 'klesla'
  const market =
    Math.abs(f.marketChange) < 0.5
      ? 'Trh ji prakticky nezměnil.'
      : f.marketChange > 0
        ? `Samotný trh k tomu přidal ${money(f.marketChange)}.`
        : `Samotný trh ji snížil o ${money(f.marketChange)}.`
  lines.push(
    `Hodnota portfolia ${direction} o ${money(f.valueChange)} a ke dni ${formatDate(f.asOf)} je ${money(
      f.value
    )}. ${market}`
  )

  if (f.monthReturn !== null) {
    lines.push(
      `Výkon portfolia za měsíc bez vlivu vkladů: ${formatPercent(f.monthReturn, 2, true)}.`
    )
  }

  if (f.best) {
    let line = `Nejlépe si vedlo ${f.best.ticker} (${formatPercent(f.best.pct, 1, true)})`
    if (f.worst) line += `, nejhůře ${f.worst.ticker} (${formatPercent(f.worst.pct, 1, true)})`
    lines.push(`${line}.`)
  }

  if (f.goal) {
    lines.push(
      `K cíli ${formatMoney(f.goal.targetCzk, 'CZK', 0)} jsi došel na ${formatPercent(
        f.goal.progress,
        1
      )}.`
    )
  }

  if (f.partial) {
    lines.push(`Měsíc ještě neskončil, hodnoty jsou k ${formatDate(f.asOf)}.`)
  }
  return lines
}

// ---------------------------------------------------------------------------
// Ověření čísel v textu přeformulovaném jazykovým modelem
// ---------------------------------------------------------------------------

const NUMBER_RE = /\d+(?:\s\d{3}(?!\d))*(?:[.,]\d+)?/g
const SPACES_RE = /\s/g

function parseNumber(token: string): number {
  return Number(token.replace(SPACES_RE, '').replace(',', '.'))
}

/** Všechna čísla v textu (české zápisy „1 234,5“, „12,3 %“, „2026“), znaménka se ignorují. */
export function extractNumbers(text: string): number[] {
  return (text.match(NUMBER_RE) ?? []).map(parseNumber)
}

/**
 * Ověří, že text neobsahuje žádné číslo, které není ve zdrojovém textu (tolerance jen na
 * zápis: „2,5“ = „2,50“). Vrací čísla, která nesedí; prázdné pole = text je v pořádku.
 */
export function unknownNumbers(source: string, candidate: string): number[] {
  const allowed = new Set(extractNumbers(source).map((n) => n.toFixed(6)))
  const known = (n: number): boolean => allowed.has(n.toFixed(6))
  const unknown: number[] = []
  for (const token of candidate.match(NUMBER_RE) ?? []) {
    if (known(parseNumber(token))) continue
    // „10 2026“ nebo „5 3“ může být dvojice samostatných čísel zapsaných za sebou.
    const parts = token.split(SPACES_RE).filter(Boolean)
    if (parts.length > 1 && parts.every((p) => known(parseNumber(p)))) continue
    unknown.push(parseNumber(token))
  }
  return unknown
}

/** Pokyn pro jazykový model: jen přeformulovat, nic nepřidávat ani neměnit. */
export function buildRewritePrompt(summary: string): string {
  return [
    'Jsi pomocník, který přeformuluje měsíční shrnutí investičního portfolia do plynulého textu česky.',
    'Pravidla:',
    '- Použij 3 až 5 vět v jednom odstavci, bez seznamů a nadpisů.',
    '- Žádná čísla, částky, procenta, data ani názvy ETF neměň, nevynechávej a nepřidávej nové.',
    '- Nic nepočítej, nezaokrouhluj a nepřevádí měny.',
    '- Nepřidávej rady, doporučení, hodnocení ani předpovědi.',
    '- Vrať jen výsledný text.',
    '',
    'Shrnutí:',
    summary
  ].join('\n')
}

export type RewriteCheck =
  | { ok: true; text: string }
  | { ok: false; reason: 'empty' | 'too-long' | 'numbers'; unknown: number[] }

/** Zkontroluje text od modelu: neprázdný, přiměřeně dlouhý a bez jediného neznámého čísla. */
export function checkRewrite(source: string, candidate: string): RewriteCheck {
  const text = candidate.trim()
  if (text === '') return { ok: false, reason: 'empty', unknown: [] }
  if (text.length > source.length * 3 + 200) return { ok: false, reason: 'too-long', unknown: [] }
  const unknown = unknownNumbers(source, text)
  if (unknown.length > 0) return { ok: false, reason: 'numbers', unknown }
  return { ok: true, text }
}
