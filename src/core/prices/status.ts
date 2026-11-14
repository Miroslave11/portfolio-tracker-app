import { formatDateTime } from '../date'
import type { PriceCache, PriceUpdateReport } from '../../shared/prices'

export type PriceStatusKind = 'none' | 'updating' | 'ok' | 'stale' | 'error'

export interface PriceStatus {
  kind: PriceStatusKind
  text: string
  /** Kdy se kurzy naposledy úspěšně stáhly (ISO čas), pokud vůbec. */
  lastFetched: string | null
}

/** Po jaké době považujeme stažené kurzy za zastaralé. */
export const STALE_AFTER_HOURS = 24

export function lastFetchedAt(cache: PriceCache | null): string | null {
  if (!cache) return null
  const times = [
    ...Object.values(cache.securities).map((s) => s.fetchedAt),
    ...Object.values(cache.fx).map((f) => f.fetchedAt)
  ]
  return times.length ? times.reduce((a, b) => (a > b ? a : b)) : null
}

/** Shrnutí stavu kurzů pro postranní panel. */
export function priceStatus(input: {
  cache: PriceCache | null
  report: PriceUpdateReport | null
  updating: boolean
  /** Chyba celého volání (např. nečitelné portfolio). */
  error: string | null
  now?: Date
}): PriceStatus {
  const lastFetched = lastFetchedAt(input.cache)
  const since = lastFetched ? formatDateTime(lastFetched) : null
  const make = (kind: PriceStatusKind, text: string): PriceStatus => ({ kind, text, lastFetched })

  if (input.updating) return make('updating', 'Aktualizuji kurzy…')

  const failed =
    input.error !== null ||
    (input.report !== null && (input.report.securities.some((s) => !s.ok) || !input.report.fx.ok))
  if (failed) {
    return make(
      'error',
      since ? `Aktualizace se nezdařila · data z ${since}` : 'Kurzy se nepodařilo stáhnout'
    )
  }
  if (!lastFetched) return make('none', 'Kurzy zatím nestaženy')

  const ageHours = ((input.now ?? new Date()).getTime() - new Date(lastFetched).getTime()) / 3.6e6
  return ageHours > STALE_AFTER_HOURS
    ? make('stale', `Kurzy jsou zastaralé · ${since}`)
    : make('ok', `Kurzy aktuální · ${since}`)
}
