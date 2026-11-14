import { describe, expect, it } from 'vitest'
import { updateStatusText, type UpdateState } from './update'

describe('updateStatusText', () => {
  it('každý stav má srozumitelnou větu (kromě klidového)', () => {
    const cases: [UpdateState, string][] = [
      [{ status: 'idle' }, ''],
      [{ status: 'checking' }, 'Hledám novou verzi…'],
      [{ status: 'up-to-date' }, 'Máš nejnovější verzi.'],
      [{ status: 'downloading', version: '1.5.1', percent: 30 }, 'Stahuji verzi 1.5.1 (30 %)…'],
      [{ status: 'error', message: 'Chyba spojení' }, 'Chyba spojení']
    ]
    for (const [state, text] of cases) expect(updateStatusText(state)).toBe(text)
    expect(updateStatusText({ status: 'ready', version: '1.5.1' })).toContain('1.5.1')
    expect(updateStatusText({ status: 'disabled', reason: 'dev' })).toContain('při vývoji')
    expect(updateStatusText({ status: 'disabled', reason: 'portable' })).toContain('Přenosná')
  })
})

describe('nastavení autoUpdate', () => {
  it('je ve výchozím nastavení zapnuté (i u starého souboru bez pole)', async () => {
    const { settingsSchema, settingsPatchSchema } = await import('./settings')
    expect(settingsSchema.parse({}).autoUpdate).toBe(true)
    expect(settingsSchema.parse({ autoUpdate: 'nesmysl' }).autoUpdate).toBe(true)
    expect(settingsPatchSchema.parse({ autoUpdate: false })).toEqual({ autoUpdate: false })
  })
})
