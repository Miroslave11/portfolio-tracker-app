import ExcelJS from 'exceljs'
import { tableToCsv } from '../core/csv'
import type { ColumnType, ExportTable } from '../shared/export'

/** Formát buněk v Excelu podle typu sloupce (čísla zůstávají čísly, takže jdou sčítat a filtrovat). */
const NUM_FORMAT: Partial<Record<ColumnType, string>> = {
  date: 'd. m. yyyy',
  number: '#,##0.######',
  integer: '0',
  money: '#,##0.00',
  percent: '0.0%'
}

/** „2026-11-10“ → datum o půlnoci UTC (exceljs z něj udělá kalendářní den bez posunu časovou zónou). */
function isoToDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

/** Excel (.xlsx) z tabulek: jeden list na tabulku, tučná hlavička, ukotvený řádek a filtr. */
export async function buildXlsx(sheets: readonly ExportTable[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Portfolio Tracker'
  wb.created = new Date()

  for (const table of sheets) {
    const ws = wb.addWorksheet(table.name, { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.columns = table.columns.map((c, i) => {
      const longest = Math.max(
        c.label.length,
        ...table.rows.slice(0, 500).map((r) => String(r[i] ?? '').length)
      )
      return { header: c.label, width: Math.min(48, Math.max(10, longest + 2)) }
    })
    for (const row of table.rows) {
      ws.addRow(
        row.map((value, i) => {
          if (typeof value === 'string' && table.columns[i].type === 'date') {
            return isoToDate(value) ?? value
          }
          return value
        })
      )
    }
    table.columns.forEach((c, i) => {
      const fmt = NUM_FORMAT[c.type]
      if (!fmt) return
      ws.getColumn(i + 1).numFmt = fmt
      if (c.type !== 'date') ws.getColumn(i + 1).alignment = { horizontal: 'right' }
    })
    const header = ws.getRow(1)
    header.font = { bold: true }
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E9F5' } }
    header.alignment = { vertical: 'middle', wrapText: true }
    if (table.rows.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: table.columns.length } }
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** CSV jako bajty k zápisu (UTF-8 s BOM, ať Excel přečte diakritiku). */
export function buildCsv(table: ExportTable): Buffer {
  return Buffer.from(tableToCsv(table), 'utf-8')
}
