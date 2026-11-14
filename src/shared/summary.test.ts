import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsPatchSchema, settingsSchema } from './settings'
import { LEVEL_SECTIONS, levelOf, SUMMARY_SECTIONS } from './summary'

describe('rozsah shrnutí', () => {
  it('úroveň odpovídá přesnému výběru sekcí (pořadí nevadí), jinak vlastní', () => {
    expect(levelOf(LEVEL_SECTIONS.short)).toBe('short')
    expect(levelOf([...LEVEL_SECTIONS.standard].reverse())).toBe('standard')
    expect(levelOf(SUMMARY_SECTIONS)).toBe('detail')
    expect(levelOf(['goal', 'risk'])).toBe('custom')
    expect(levelOf([])).toBe('custom')
  })

  it('každá užší úroveň je podmnožinou širší', () => {
    for (const s of LEVEL_SECTIONS.short) expect(LEVEL_SECTIONS.standard).toContain(s)
    for (const s of LEVEL_SECTIONS.standard) expect(LEVEL_SECTIONS.detail).toContain(s)
  })

  it('výchozí nastavení je detailní; poškozená hodnota se nahradí výchozí', () => {
    expect(levelOf(DEFAULT_SETTINGS.summary.month.sections)).toBe('detail')
    const broken = settingsSchema.parse({ summary: { month: { sections: ['neznámá'] } } })
    expect(broken.summary).toEqual(DEFAULT_SETTINGS.summary)
    // starší soubor nastavení bez shrnutí
    expect(settingsSchema.parse({}).summary).toEqual(DEFAULT_SETTINGS.summary)
  })

  it('změna z UI se validuje striktně', () => {
    expect(
      settingsPatchSchema.safeParse({ summary: { month: { sections: ['goal'] } } }).success
    ).toBe(true)
    expect(settingsPatchSchema.safeParse({ summary: { month: { sections: ['x'] } } }).success).toBe(
      false
    )
    expect(
      settingsPatchSchema.safeParse({ summary: { month: { sections: [] }, navíc: 1 } }).success
    ).toBe(false)
  })
})
