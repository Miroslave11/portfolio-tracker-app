import { addMonths } from './date'

/** Nejdelší horizont, který se počítá (50 let); dál se cíl považuje za nedosažitelný. */
export const MAX_MONTHS = 600

/** Měsíční výnos odpovídající roční sazbě (složené úročení: (1 + roční)^(1/12) − 1). */
export function monthlyRate(annualReturn: number): number {
  return Math.pow(1 + annualReturn, 1 / 12) - 1
}

/**
 * Hodnota po `months` měsících: každý měsíc se hodnota zhodnotí a na jeho konci se přidá
 * měsíční vklad. Vrací pole délky `months + 1` (index 0 = dnešek).
 */
export function projectSeries(
  start: number,
  monthly: number,
  annualReturn: number,
  months: number
): number[] {
  const r = monthlyRate(annualReturn)
  const out = [start]
  let value = start
  for (let i = 0; i < months; i++) {
    value = value * (1 + r) + monthly
    out.push(value)
  }
  return out
}

/** Hodnota po `months` měsících (vzorec budoucí hodnoty s pravidelným vkladem na konci měsíce). */
export function futureValue(
  start: number,
  monthly: number,
  annualReturn: number,
  months: number
): number {
  const r = monthlyRate(annualReturn)
  if (Math.abs(r) < 1e-12) return start + monthly * months
  const growth = Math.pow(1 + r, months)
  return start * growth + (monthly * (growth - 1)) / r
}

/**
 * Za kolik měsíců hodnota poprvé dosáhne cíle; 0, pokud už ho má. `null`, pokud se cíle
 * nedosáhne ani za `maxMonths` (např. nulový vklad a nulový výnos).
 */
export function monthsToReach(
  start: number,
  monthly: number,
  annualReturn: number,
  target: number,
  maxMonths = MAX_MONTHS
): number | null {
  if (start >= target) return 0
  const r = monthlyRate(annualReturn)
  let value = start
  for (let i = 1; i <= maxMonths; i++) {
    value = value * (1 + r) + monthly
    if (value >= target) return i
  }
  return null
}

export interface GoalScenario {
  id: 'conservative' | 'base' | 'optimistic'
  label: string
  annualReturn: number
  /** Počet měsíců do cíle; `null` = nedosáhne se do 50 let. */
  months: number | null
  /** Datum dosažení (RRRR-MM-DD, den jako dnes). */
  date: string | null
}

/** Odhad pro základní výnos a pro výnos o `spread` nižší a vyšší (rozmezí nejistoty). */
export function scenarios(
  start: number,
  monthly: number,
  annualReturn: number,
  target: number,
  today: string,
  spread = 0.03
): GoalScenario[] {
  const defs: [GoalScenario['id'], string, number][] = [
    ['conservative', 'Opatrně', annualReturn - spread],
    ['base', 'Základ', annualReturn],
    ['optimistic', 'Optimisticky', annualReturn + spread]
  ]
  return defs.map(([id, label, rate]) => {
    const months = monthsToReach(start, monthly, rate, target)
    return {
      id,
      label,
      annualReturn: rate,
      months,
      date: months === null ? null : addMonths(today, months)
    }
  })
}

/** „3 roky a 5 měsíců“, „11 měsíců“, „teď“. */
export function formatDuration(months: number): string {
  if (months <= 0) return 'hned'
  const years = Math.floor(months / 12)
  const rest = months % 12
  const y = years === 1 ? '1 rok' : years >= 2 && years <= 4 ? `${years} roky` : `${years} let`
  const m = rest === 1 ? '1 měsíc' : rest >= 2 && rest <= 4 ? `${rest} měsíce` : `${rest} měsíců`
  if (years === 0) return m
  return rest === 0 ? y : `${y} a ${m}`
}
