export type MoneyCurrency = 'EUR' | 'CZK'

/** Zaokrouhlí peněžní částku na centy (odolné vůči chybám plovoucí čárky). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Naformátuje částku v české lokalizaci, např. „1 234,50 €“.
 * `fractionDigits` fixuje počet desetinných míst (např. 0 pro velké souhrny).
 */
export function formatMoney(
  value: number,
  currency: MoneyCurrency = 'EUR',
  fractionDigits?: number
): string {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency,
    ...(fractionDigits === undefined
      ? {}
      : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })
  }).format(value)
}

/** Jako `formatMoney`, ale s explicitním znaménkem u kladných hodnot („+1 234 €“). */
export function formatSignedMoney(
  value: number,
  currency: MoneyCurrency = 'EUR',
  fractionDigits?: number
): string {
  const text = formatMoney(value, currency, fractionDigits)
  return value > 0 ? `+${text}` : text
}

/** Zlomek na procenta: 0,264 → „26,40 %“; `signed` přidá „+“ u kladných hodnot. */
export function formatPercent(fraction: number, digits = 2, signed = false): string {
  const text = new Intl.NumberFormat('cs-CZ', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(fraction)
  return signed && fraction > 0 ? `+${text}` : text
}
