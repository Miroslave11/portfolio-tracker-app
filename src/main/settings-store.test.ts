import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { loadSettings, SETTINGS_FILE, updateSettings } from './settings-store'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pt-settings-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('settings-store', () => {
  it('bez souboru vrátí výchozí nastavení', async () => {
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: 'dark',
      accent: 'indigo',
      followSystemTheme: false,
      displayCurrency: 'EUR',
      autoRefreshPrices: true
    })
  })

  it('uloží změnu a po novém načtení ji vrátí (přežije restart)', async () => {
    await updateSettings(dir, { theme: 'midnight', accent: 'rose' })
    const loaded = await loadSettings(dir)
    expect(loaded.theme).toBe('midnight')
    expect(loaded.accent).toBe('rose')
    expect(loaded.displayCurrency).toBe('EUR')
  })

  it('postupné změny se skládají', async () => {
    await updateSettings(dir, { theme: 'warm' })
    await updateSettings(dir, { followSystemTheme: true })
    expect(await loadSettings(dir)).toMatchObject({ theme: 'warm', followSystemTheme: true })
  })

  it('poškozený soubor → výchozí hodnoty, appka nespadne', async () => {
    await writeFile(join(dir, SETTINGS_FILE), '{ tohle není JSON', 'utf-8')
    expect(await loadSettings(dir)).toEqual(DEFAULT_SETTINGS)
  })

  it('neznámá hodnota v souboru se nahradí výchozí, ostatní zůstanou', async () => {
    await writeFile(
      join(dir, SETTINGS_FILE),
      JSON.stringify({ theme: 'neexistuje', accent: 'emerald' }),
      'utf-8'
    )
    expect(await loadSettings(dir)).toMatchObject({ theme: 'dark', accent: 'emerald' })
  })

  it('neplatný patch z UI odmítne a nic nezapíše', async () => {
    await expect(updateSettings(dir, { theme: 'neexistuje' })).rejects.toThrow()
    await expect(updateSettings(dir, { hacker: true })).rejects.toThrow()
    await expect(readFile(join(dir, SETTINGS_FILE))).rejects.toThrow()
  })
})
