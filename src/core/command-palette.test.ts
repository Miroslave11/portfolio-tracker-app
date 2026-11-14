import { describe, expect, it } from 'vitest'
import { searchPalette, type PaletteItem } from './command-palette'
import { shortcutAction } from './shortcuts'

const items: PaletteItem[] = [
  { id: 'new', label: 'Nový nákup', keywords: ['zapsat', 'obchod'] },
  { id: 'monthly', label: 'Měsíční nákup', keywords: ['spořicí plán'] },
  { id: 'prices', label: 'Aktualizovat kurzy', keywords: ['stáhnout', 'ceny'] },
  { id: 'go-tx', label: 'Přejít: Obchody' },
  { id: 'backup', label: 'Zálohovat data', keywords: ['export'] },
  { id: 'export', label: 'Export do Excelu' }
]

const ids = (query: string, limit?: number): string[] =>
  searchPalette(items, query, limit).map((i) => i.id)

describe('searchPalette', () => {
  it('prázdný dotaz vrátí vše v původním pořadí (a respektuje limit)', () => {
    expect(ids('')).toEqual(items.map((i) => i.id))
    expect(ids('  ', 2)).toEqual(['new', 'monthly'])
  })

  it('hledá bez diakritiky a bez ohledu na velikost písmen', () => {
    expect(ids('zalohovat')).toEqual(['backup'])
    expect(ids('MESICNI')).toEqual(['monthly'])
    expect(ids('nakup')).toEqual(['new', 'monthly'])
  })

  it('řadí: začátek popisku, pak začátek slova, pak kdekoli, pak klíčová slova', () => {
    // „nákup“: začátek popisku (Nový nákup nezačíná na „nakup“, ale slovo ano) – obě mají shodu na slově
    expect(ids('exp')).toEqual(['export', 'backup']) // začátek popisku → pouze klíčové slovo
    expect(ids('kurz')).toEqual(['prices']) // začátek slova
    expect(ids('ovat')).toEqual(['prices', 'backup']) // uprostřed popisku
  })

  it('všechna slova dotazu musí sedět (v libovolném pořadí)', () => {
    expect(ids('nakup mesicni')).toEqual(['monthly'])
    expect(ids('nakup xyz')).toEqual([])
  })

  it('najde i podle klíčových slov a synonym', () => {
    expect(ids('sporici')).toEqual(['monthly'])
    expect(ids('ceny')).toEqual(['prices'])
  })

  it('při stejné shodě zůstává původní pořadí', () => {
    expect(ids('nakup')).toEqual(['new', 'monthly'])
  })
})

describe('shortcutAction', () => {
  const key = (
    k: string,
    extra: Partial<Parameters<typeof shortcutAction>[0]> = {}
  ): ReturnType<typeof shortcutAction> =>
    shortcutAction({
      key: k,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      ...extra
    })

  it('rozpozná Ctrl+K, Ctrl+N a Ctrl+M (i s velkým písmenem)', () => {
    expect(key('k')).toBe('palette')
    expect(key('K')).toBe('palette')
    expect(key('n')).toBe('newTransaction')
    expect(key('m')).toBe('monthlyBuy')
  })

  it('na Macu stačí ⌘', () => {
    expect(key('k', { ctrlKey: false, metaKey: true })).toBe('palette')
  })

  it('ignoruje bez Ctrl a s dalšími modifikátory', () => {
    expect(key('k', { ctrlKey: false })).toBeNull()
    expect(key('k', { shiftKey: true })).toBeNull()
    expect(key('k', { altKey: true })).toBeNull()
    expect(key('x')).toBeNull()
  })
})
