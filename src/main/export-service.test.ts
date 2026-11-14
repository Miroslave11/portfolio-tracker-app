import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import type { ExportTable } from '../shared/export'
import { buildCsv, buildXlsx } from './export-service'

const sheet1: ExportTable = {
  name: 'Transakce',
  columns: [
    { label: 'Datum', type: 'date' },
    { label: 'ETF', type: 'text' },
    { label: 'Kusy', type: 'number' },
    { label: 'Částka', type: 'money' },
    { label: 'Počet', type: 'integer' },
    { label: 'Zisk', type: 'percent' }
  ],
  rows: [
    ['2026-11-10', 'SPYL.DE', 36.563071, 1500.5, 3, 0.1234],
    ['2026-01-05', '=SUM(A1:A2)', null, -20, 0, null]
  ]
}
const sheet2: ExportTable = {
  name: 'Měsíční investice',
  columns: [{ label: 'Měsíc', type: 'text' }],
  rows: []
}

async function load(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as unknown as ArrayBuffer)
  return wb
}

describe('buildXlsx', () => {
  it('listy, hlavička a data se po načtení shodují; čísla jsou čísla, data jsou data', async () => {
    const wb = await load(await buildXlsx([sheet1, sheet2]))
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Transakce', 'Měsíční investice'])
    const ws = wb.getWorksheet('Transakce')!
    expect(ws.getRow(1).values).toEqual([
      undefined,
      'Datum',
      'ETF',
      'Kusy',
      'Částka',
      'Počet',
      'Zisk'
    ])

    const r2 = ws.getRow(2)
    expect(r2.getCell(1).value).toEqual(new Date(Date.UTC(2026, 10, 10)))
    expect(r2.getCell(2).value).toBe('SPYL.DE')
    expect(typeof r2.getCell(3).value).toBe('number')
    expect(r2.getCell(3).value).toBe(36.563071)
    expect(r2.getCell(4).value).toBe(1500.5)
    expect(r2.getCell(5).value).toBe(3)
    expect(r2.getCell(6).value).toBe(0.1234)
  })

  it('formáty buněk: peníze na 2 místa, procenta, datum; prázdné buňky zůstanou prázdné', async () => {
    const ws = (await load(await buildXlsx([sheet1]))).getWorksheet('Transakce')!
    const r2 = ws.getRow(2)
    expect(r2.getCell(1).numFmt).toBe('d. m. yyyy')
    expect(r2.getCell(4).numFmt).toBe('#,##0.00')
    expect(r2.getCell(6).numFmt).toBe('0.0%')
    expect(ws.getRow(3).getCell(3).value).toBeNull()
  })

  it('text začínající „=“ zůstane textem (nespustí se jako vzorec)', async () => {
    const ws = (await load(await buildXlsx([sheet1]))).getWorksheet('Transakce')!
    const cell = ws.getRow(3).getCell(2)
    expect(cell.value).toBe('=SUM(A1:A2)')
    expect(cell.type).toBe(ExcelJS.ValueType.String)
  })

  it('hlavička je tučná, řádek ukotvený, tabulka bez řádků nepadá', async () => {
    const wb = await load(await buildXlsx([sheet1, sheet2]))
    const ws = wb.getWorksheet('Transakce')!
    expect(ws.getRow(1).font?.bold).toBe(true)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(wb.getWorksheet('Měsíční investice')!.rowCount).toBe(1)
  })
})

describe('buildCsv', () => {
  it('UTF-8 s BOM na začátku, česká diakritika zůstane', () => {
    const buf = buildCsv({
      name: 'T',
      columns: [{ label: 'Částka', type: 'money' }],
      rows: [[12.5]]
    })
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(buf.toString('utf-8').slice(1)).toBe('Částka\r\n12,50\r\n')
  })
})
