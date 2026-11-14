import { monthlyRate } from './goal-projection'

/**
 * Kalkulačka čerpání: kolik lze měsíčně vybírat z kapitálu a jak dlouho vydrží.
 *
 * Model: kapitál se každý měsíc zhodnotí o měsíční výnos a na konci měsíce se vybere
 * měsíční částka. Ta je po celý rok stejná a na začátku každého dalšího roku se zvýší
 * o inflaci (aby si udržela kupní sílu). Daně se nezohledňují.
 */

/** Nejdelší sledovaná doba čerpání (100 let); co vydrží déle, je „navždy“ nebo „přes 100 let“. */
export const MAX_WITHDRAWAL_MONTHS = 1200

/** Současná hodnota 12 měsíčních výběrů po 1 Kč na konci měsíce (na začátku roku). */
function yearAnnuity(annualReturn: number): number {
  const r = monthlyRate(annualReturn)
  if (Math.abs(r) < 1e-12) return 12
  return (1 - Math.pow(1 + r, -12)) / r
}

/**
 * Nejvyšší počáteční měsíční čerpání, se kterým kapitál vydrží přesně `years` let
 * (čerpání roste každý rok o inflaci). Uzavřený vzorec rostoucí anuity po letech.
 */
export function maxMonthlyWithdrawal(
  capital: number,
  annualReturn: number,
  inflation: number,
  years: number
): number {
  if (capital <= 0 || years <= 0) return 0
  const g = (1 + inflation) / (1 + annualReturn)
  const sum = Math.abs(g - 1) < 1e-12 ? years : (1 - Math.pow(g, years)) / (1 - g)
  return capital / (yearAnnuity(annualReturn) * sum)
}

/**
 * Nejvyšší počáteční měsíční čerpání, se kterým kapitál vydrží navždy (kupní síla kapitálu
 * zůstává stejná). Jen když výnos převyšuje inflaci, jinak `null`.
 * Ročně to vychází zhruba na kapitál × reálný výnos.
 */
export function perpetualMonthlyWithdrawal(
  capital: number,
  annualReturn: number,
  inflation: number
): number | null {
  if (annualReturn <= inflation || capital <= 0) return null
  return (capital * (annualReturn - inflation)) / ((1 + annualReturn) * yearAnnuity(annualReturn))
}

export interface WithdrawalResult {
  /** Hodnota kapitálu na začátku a po každém měsíci (dokud nedojde, max. `months`). */
  capital: number[]
  /** Kolik měsíčních výběrů se vyplatilo celých; `null` = kapitál nedošel v rámci horizontu. */
  monthsLasting: number | null
  /** Kapitál nikdy nedojde (čerpání nepřevyšuje udržitelnou částku). */
  forever: boolean
}

/** Vývoj kapitálu při daném čerpání po dobu `months` měsíců (nebo do vyčerpání). */
export function simulateWithdrawal(
  capital: number,
  monthly: number,
  annualReturn: number,
  inflation: number,
  months = MAX_WITHDRAWAL_MONTHS
): WithdrawalResult {
  const perpetual = perpetualMonthlyWithdrawal(capital, annualReturn, inflation)
  const forever = monthly <= 0 || (perpetual !== null && monthly <= perpetual * (1 + 1e-9))
  const r = monthlyRate(annualReturn)
  const out = [capital]
  let value = capital
  let withdrawal = monthly
  let lasting: number | null = null
  for (let i = 1; i <= months; i++) {
    if (i > 1 && (i - 1) % 12 === 0) withdrawal *= 1 + inflation
    value = value * (1 + r) - withdrawal
    // Malá tolerance: přesně vyčerpaný kapitál může kvůli zaokrouhlení vyjít −0,000…
    if (value < -1e-6) {
      // Poslední výběr už se celý nevyplatil.
      lasting = i - 1
      out.push(0)
      break
    }
    out.push(Math.max(0, value))
  }
  return { capital: out, monthsLasting: forever ? null : lasting, forever }
}

/** Za jak dlouho (v měsících) kapitál dojde; `null` = navždy nebo přes 100 let. */
export function monthsLasting(
  capital: number,
  monthly: number,
  annualReturn: number,
  inflation: number
): number | null {
  return simulateWithdrawal(capital, monthly, annualReturn, inflation).monthsLasting
}
