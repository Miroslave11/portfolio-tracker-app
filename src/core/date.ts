/** „2026-11-10“ → „10. 11. 2026“ (bez práce s časovými pásmy). */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${Number(d)}. ${Number(m)}. ${y}`
}

const MONTH_NAMES = [
  'leden',
  'únor',
  'březen',
  'duben',
  'květen',
  'červen',
  'červenec',
  'srpen',
  'září',
  'říjen',
  'listopad',
  'prosinec'
]

/** „2026-11“ nebo „2026-11-10“ → „listopad 2026“. */
export function formatMonthLong(iso: string): string {
  const [y, m] = iso.split('-')
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`
}

/** „2026-11“ nebo „2026-11-10“ → „11/2026“. */
export function formatMonth(iso: string): string {
  const [y, m] = iso.split('-')
  return `${Number(m)}/${y}`
}

/** ISO čas (UTC) → „12. 11. 2026 17:42“ v místním čase počítače. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Přičte (nebo odečte) dny k datu ve formátu RRRR-MM-DD. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/** Přičte (nebo odečte) měsíce; přetečení dne se zkrátí na poslední den měsíce (31. 3. − 1 měsíc = 28./29. 2.). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1 + months, d))
  const expectedMonth = (((m - 1 + months) % 12) + 12) % 12
  if (date.getUTCMonth() !== expectedMonth) date.setUTCDate(0)
  return date.toISOString().slice(0, 10)
}

/** Počet dní mezi dvěma daty (`to` − `from`). */
export function daysBetween(from: string, to: string): number {
  const ms = (iso: string): number => {
    const [y, m, d] = iso.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  return Math.round((ms(to) - ms(from)) / 86_400_000)
}

/** Dnešní datum (RRRR-MM-DD) v místním čase počítače. */
export function todayIso(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
