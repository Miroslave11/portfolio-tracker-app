import type { ColumnType, ExportCell, ExportTable } from '../shared/export'

/** Excel v české verzi čte oddělovač „;“ a desetinnou čárku; UTF-8 s BOM zachová diakritiku. */
export const CSV_SEPARATOR = ';'
const BOM = '﻿'

/** Číslo s desetinnou čárkou a bez oddělovače tisíců (aby Excel rozpoznal číslo). */
export function csvNumber(value: number, type: ColumnType): string {
  let v = value
  let digits: number
  switch (type) {
    case 'integer':
      v = Math.round(value)
      digits = 0
      break
    case 'money':
      digits = 2
      break
    case 'percent':
      // Procenta se v CSV píšou jako čísla v procentech (0,123 → 12,3).
      v = value * 100
      digits = 4
      break
    default:
      digits = 6
  }
  // Zaokrouhlení „od nuly“ (Math.round u záporných půlek zaokrouhluje k nule: −12,345 → −12,34).
  const rounded =
    (Math.sign(v) * Math.round((Math.abs(v) + Number.EPSILON) * 10 ** digits)) / 10 ** digits
  const text = rounded.toFixed(digits)
  const trimmed = type === 'money' || digits === 0 ? text : text.replace(/\.?0+$/, '')
  return (trimmed === '-0' ? '0' : trimmed).replace('.', ',')
}

/**
 * Text buňky: uvozovky při zvláštních znacích a ochrana před „vzorci“ – text začínající
 * = + - @ by Excel po otevření spustil jako vzorec, proto dostane apostrof.
 */
export function csvText(value: string): string {
  let text = value
  if (/^[=+\-@\t\r]/.test(text) && !/^-?[\d.,]+$/.test(text)) text = `'${text}`
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvCell(value: ExportCell, type: ColumnType): string {
  if (value === null || value === '') return ''
  if (typeof value === 'number') return csvNumber(value, type)
  return csvText(value)
}

/** Tabulka jako CSV text (UTF-8 s BOM, řádky CRLF, oddělovač „;“). */
export function tableToCsv(table: ExportTable): string {
  const lines = [
    table.columns.map((c) => csvText(c.label)).join(CSV_SEPARATOR),
    ...table.rows.map((row) =>
      row.map((value, i) => csvCell(value, table.columns[i].type)).join(CSV_SEPARATOR)
    )
  ]
  return BOM + lines.join('\r\n') + '\r\n'
}
