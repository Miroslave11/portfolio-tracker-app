/** Části obrazovky Nastavení (svislé podmenu vlevo); pořadí = pořadí v menu. */
export const SETTINGS_TAB_IDS = [
  'appearance',
  'general',
  'templates',
  'ai',
  'data',
  'about'
] as const
export type SettingsTab = (typeof SETTINGS_TAB_IDS)[number]

export const SETTINGS_TAB_LABELS: Record<SettingsTab, string> = {
  appearance: 'Vzhled',
  general: 'Obecné',
  templates: 'Šablony',
  ai: 'Umělá inteligence',
  data: 'Data a zálohy',
  about: 'Aplikace'
}

export const DEFAULT_SETTINGS_TAB: SettingsTab = 'appearance'

export const isSettingsTab = (value: unknown): value is SettingsTab =>
  typeof value === 'string' && (SETTINGS_TAB_IDS as readonly string[]).includes(value)
