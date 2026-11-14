import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import {
  DEFAULT_SETTINGS,
  settingsPatchSchema,
  settingsSchema,
  type Settings
} from '../shared/settings'
import { writeJsonAtomic } from './json-file'

export const SETTINGS_FILE = 'settings.json'

/** Načte nastavení ze složky. Chybějící nebo poškozený soubor → výchozí hodnoty. */
export async function loadSettings(dir: string): Promise<Settings> {
  try {
    const raw = await readFile(join(dir, SETTINGS_FILE), 'utf-8')
    return settingsSchema.parse(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Aplikuje změnu na uložené nastavení a vrátí výsledek. Neplatný patch vyhodí chybu. */
export async function updateSettings(dir: string, patch: unknown): Promise<Settings> {
  const validPatch = settingsPatchSchema.parse(patch)
  const current = await loadSettings(dir)
  const next = settingsSchema.parse({ ...current, ...validPatch })
  await mkdir(dir, { recursive: true })
  await writeJsonAtomic(join(dir, SETTINGS_FILE), next)
  return next
}
