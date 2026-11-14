import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS_TAB,
  isSettingsTab,
  SETTINGS_TAB_IDS,
  SETTINGS_TAB_LABELS
} from './settings-tabs'

describe('části Nastavení', () => {
  it('každá část má jedinečné id a neprázdný název a výchozí je existující část', () => {
    expect(new Set(SETTINGS_TAB_IDS).size).toBe(SETTINGS_TAB_IDS.length)
    for (const id of SETTINGS_TAB_IDS) expect(SETTINGS_TAB_LABELS[id].length).toBeGreaterThan(0)
    expect(SETTINGS_TAB_IDS).toContain(DEFAULT_SETTINGS_TAB)
  })

  it('pořadí odpovídá schválenému rozdělení (Šablony, AI včetně Shrnutí, Aplikace)', () => {
    expect(SETTINGS_TAB_IDS.map((id) => SETTINGS_TAB_LABELS[id])).toEqual([
      'Vzhled',
      'Obecné',
      'Šablony',
      'Umělá inteligence',
      'Data a zálohy',
      'Aplikace'
    ])
  })

  it('isSettingsTab pozná jen platné části', () => {
    expect(isSettingsTab('ai')).toBe(true)
    expect(isSettingsTab('summary')).toBe(false)
    expect(isSettingsTab(null)).toBe(false)
  })
})
