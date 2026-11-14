import type { SummaryKind } from '../shared/summary'
import { addDays, addMonths, formatMonthLong } from './date'

/*
 * Období shrnutí: měsíc „2026-10“, kvartál „2026-Q3“, pololetí „2026-H1“ a rok „2026“.
 */

/** Kolik měsíců má období daného typu. */
export const KIND_MONTHS: Record<SummaryKind, number> = { month: 1, quarter: 3, half: 6, year: 12 }

/** Tvary slov pro texty článku. */
export const KIND_WORDS: Record<
  SummaryKind,
  { nom: string; gen: string; loc: string; prev: string }
> = {
  month: { nom: 'měsíc', gen: 'měsíce', loc: 'tomto měsíci', prev: 'předchozí měsíc' },
  quarter: { nom: 'kvartál', gen: 'kvartálu', loc: 'tomto kvartálu', prev: 'předchozí kvartál' },
  half: { nom: 'pololetí', gen: 'pololetí', loc: 'tomto pololetí', prev: 'předchozí pololetí' },
  year: { nom: 'rok', gen: 'roku', loc: 'tomto roce', prev: 'předchozí rok' }
}

/** Období daného typu, do kterého patří datum (RRRR-MM-DD nebo RRRR-MM). */
export function periodOf(kind: SummaryKind, date: string): string {
  const y = date.slice(0, 4)
  const m = Number(date.slice(5, 7))
  switch (kind) {
    case 'month':
      return date.slice(0, 7)
    case 'quarter':
      return `${y}-Q${Math.ceil(m / 3)}`
    case 'half':
      return `${y}-H${m <= 6 ? 1 : 2}`
    case 'year':
      return y
  }
}

/** První měsíc období „RRRR-MM“. */
function firstMonthOf(kind: SummaryKind, period: string): string {
  const y = period.slice(0, 4)
  switch (kind) {
    case 'month':
      return period
    case 'quarter':
      return `${y}-${String((Number(period.slice(6)) - 1) * 3 + 1).padStart(2, '0')}`
    case 'half':
      return `${y}-${period.endsWith('H1') ? '01' : '07'}`
    case 'year':
      return `${y}-01`
  }
}

/** První a poslední den období. */
export function periodBounds(kind: SummaryKind, period: string): { from: string; to: string } {
  const from = `${firstMonthOf(kind, period)}-01`
  return { from, to: addDays(addMonths(from, KIND_MONTHS[kind]), -1) }
}

/** Měsíce období („RRRR-MM“) od nejstaršího. */
export function periodMonths(kind: SummaryKind, period: string): string[] {
  const first = `${firstMonthOf(kind, period)}-01`
  return Array.from({ length: KIND_MONTHS[kind] }, (_, i) => addMonths(first, i).slice(0, 7))
}

/** Předchozí období stejného typu. */
export function previousPeriod(kind: SummaryKind, period: string): string {
  return periodOf(kind, addDays(periodBounds(kind, period).from, -1))
}

/** Následující období stejného typu. */
export function nextPeriod(kind: SummaryKind, period: string): string {
  return periodOf(kind, addDays(periodBounds(kind, period).to, 1))
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** „Říjen 2026“, „3. kvartál 2026“, „1. pololetí 2026“, „Rok 2025“. */
export function periodTitle(kind: SummaryKind, period: string): string {
  const y = period.slice(0, 4)
  switch (kind) {
    case 'month':
      return capital(formatMonthLong(period))
    case 'quarter':
      return `${period.slice(6)}. kvartál ${y}`
    case 'half':
      return `${period.slice(6)}. pololetí ${y}`
    case 'year':
      return `Rok ${y}`
  }
}

/** Krátký název do seznamu pod rokem: „Říjen“, „3. kvartál“, „Celý rok“. */
export function periodShortTitle(kind: SummaryKind, period: string): string {
  return kind === 'year' ? 'Celý rok' : periodTitle(kind, period).replace(/ \d{4}$/, '')
}

/**
 * Období je připravené k vytvoření, když skončilo a kurzy pokrývají jeho konec
 * (3 dny rezerva na víkend a svátek: období končící v sobotu stačí s kurzem z pátku).
 */
export function periodReady(
  kind: SummaryKind,
  period: string,
  latestPrice: string | null,
  today: string
): boolean {
  const { to } = periodBounds(kind, period)
  return to < today && latestPrice !== null && latestPrice >= addDays(to, -3)
}

/** Všechna skončená a připravená období od prvního obchodu, která ještě nemají článek. */
export function missingPeriods(
  kind: SummaryKind,
  existing: ReadonlySet<string>,
  firstDate: string,
  latestPrice: string | null,
  today: string
): string[] {
  const out: string[] = []
  for (
    let p = periodOf(kind, firstDate);
    periodBounds(kind, p).from < today;
    p = nextPeriod(kind, p)
  ) {
    if (!periodReady(kind, p, latestPrice, today)) break
    if (!existing.has(p)) out.push(p)
  }
  return out
}

/**
 * Automatické „dohnání“: období po posledním existujícím článku daného typu. Bez jediného
 * článku jen poslední skončené období – starší historie se vytváří tlačítkem „Vytvořit zpětně“.
 */
export function duePeriods(
  kind: SummaryKind,
  existing: ReadonlySet<string>,
  firstDate: string,
  latestPrice: string | null,
  today: string
): string[] {
  const missing = missingPeriods(kind, existing, firstDate, latestPrice, today)
  if (existing.size === 0) return missing.slice(-1)
  const newest = [...existing].sort().at(-1)!
  return missing.filter((p) => p > newest)
}
