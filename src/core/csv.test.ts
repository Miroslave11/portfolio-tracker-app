import { describe, expect, it } from 'vitest'
import type { ExportTable } from '../shared/export'
import { csvNumber, csvText, tableToCsv } from './csv'

describe('csvNumber', () => {
  it('desetinná čárka, bez oddělovače tisíců', () => {
    expect(csvNumber(1234.5, 'money')).toBe('1234,50')
    expect(csvNumber(0, 'money')).toBe('0,00')
    expect(csvNumber(-12.345, 'money')).toBe('-12,35')
    expect(csvNumber(36.563071, 'number')).toBe('36,563071')
    expect(csvNumber(3, 'number')).toBe('3')
    expect(csvNumber(2.5, 'number')).toBe('2,5')
    expect(csvNumber(7.6, 'integer')).toBe('8')
  })

  it('procenta jako čísla v procentech', () => {
    expect(csvNumber(0.123, 'percent')).toBe('12,3')
    expect(csvNumber(-0.05, 'percent')).toBe('-5')
    expect(csvNumber(0, 'percent')).toBe('0')
  })

  it('záporná nula se nepíše', () => {
    expect(csvNumber(-0.0000001, 'number')).toBe('0')
  })
})

describe('csvText', () => {
  it('uvozovky jen když je potřeba, uvozovky se zdvojí', () => {
    expect(csvText('Nákup')).toBe('Nákup')
    expect(csvText('a;b')).toBe('"a;b"')
    expect(csvText('řekl "ahoj"')).toBe('"řekl ""ahoj"""')
    expect(csvText('dva\nřádky')).toBe('"dva\nřádky"')
  })

  it('text začínající jako vzorec dostane apostrof, číslo ne', () => {
    expect(csvText('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvText('+420 123')).toBe("'+420 123")
    expect(csvText('@cmd')).toBe("'@cmd")
    expect(csvText('-5,5')).toBe('-5,5')
    expect(csvText('-cmd|x')).toBe("'-cmd|x")
  })
})

describe('tableToCsv', () => {
  const table: ExportTable = {
    name: 'Test',
    columns: [
      { label: 'Datum', type: 'date' },
      { label: 'ETF', type: 'text' },
      { label: 'Kusy', type: 'number' },
      { label: 'Částka', type: 'money' },
      { label: 'Zisk (%)', type: 'percent' }
    ],
    rows: [
      ['2026-11-10', 'SPYL.DE', 36.563071, 1500, 0.1234],
      ['2026-11-09', 'Poznámka; se "středníkem"', null, 20.5, null]
    ]
  }

  it('BOM, hlavička, řádky CRLF, prázdné buňky, česká čísla', () => {
    const csv = tableToCsv(table)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Datum;ETF;Kusy;Částka;Zisk (%)',
      '2026-11-10;SPYL.DE;36,563071;1500,00;12,34',
      '2026-11-09;"Poznámka; se ""středníkem""";;20,50;',
      ''
    ])
  })

  it('vrácený text lze zpětně rozdělit podle pravidel CSV (round-trip)', () => {
    const csv = tableToCsv(table).slice(1)
    // jednoduchý parser CSV s uvozovkami a ';'
    const rows: string[][] = []
    let row: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i]
      if (quoted) {
        if (c === '"' && csv[i + 1] === '"') {
          cur += '"'
          i++
        } else if (c === '"') quoted = false
        else cur += c
      } else if (c === '"') quoted = true
      else if (c === ';') {
        row.push(cur)
        cur = ''
      } else if (c === '\r') {
        // konec řádku řeší \n
      } else if (c === '\n') {
        row.push(cur)
        rows.push(row)
        row = []
        cur = ''
      } else cur += c
    }
    expect(rows[2][1]).toBe('Poznámka; se "středníkem"')
    expect(rows).toHaveLength(3)
  })
})
