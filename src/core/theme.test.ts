import { describe, expect, it } from 'vitest'
import { THEME_IDS, ACCENT_IDS } from '../shared/settings'
import { ACCENTS, accentHex, resolveTheme, THEMES } from './theme'

describe('resolveTheme', () => {
  it('bez „podle Windows“ vrátí zvolený motiv bez ohledu na systém', () => {
    expect(resolveTheme({ theme: 'warm', followSystemTheme: false }, true)).toBe('warm')
    expect(resolveTheme({ theme: 'oled', followSystemTheme: false }, false)).toBe('oled')
  })

  it('podle Windows: zvolený motiv zůstane, když sedí světlost', () => {
    expect(resolveTheme({ theme: 'midnight', followSystemTheme: true }, true)).toBe('midnight')
    expect(resolveTheme({ theme: 'warm', followSystemTheme: true }, false)).toBe('warm')
  })

  it('podle Windows: při nesouladu přepne na Tmavý/Světlý', () => {
    expect(resolveTheme({ theme: 'midnight', followSystemTheme: true }, false)).toBe('light')
    expect(resolveTheme({ theme: 'warm', followSystemTheme: true }, true)).toBe('dark')
  })
})

describe('katalog motivů', () => {
  it('obsahuje všech 5 motivů a 6 akcentů ze schématu nastavení', () => {
    expect(THEMES.map((t) => t.id).sort()).toEqual([...THEME_IDS].sort())
    expect(ACCENTS.map((a) => a.id).sort()).toEqual([...ACCENT_IDS].sort())
  })

  it('akcenty mají platné hex barvy', () => {
    for (const a of ACCENTS) expect(accentHex(a.id)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
