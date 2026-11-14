import type { AccentId, Settings, ThemeId } from '../shared/settings'

export interface ThemeInfo {
  id: ThemeId
  label: string
  dark: boolean
  /** Barva pozadí – použije se i pro okno Electronu, aby při startu neblikalo bílé. */
  background: string
}

export const THEMES: readonly ThemeInfo[] = [
  { id: 'dark', label: 'Tmavý', dark: true, background: '#0f1115' },
  { id: 'light', label: 'Světlý', dark: false, background: '#f4f6fa' },
  { id: 'midnight', label: 'Půlnoční modrá', dark: true, background: '#0b1226' },
  { id: 'oled', label: 'OLED černá', dark: true, background: '#000000' },
  { id: 'warm', label: 'Teplý', dark: false, background: '#f6f0e6' }
]

export interface AccentInfo {
  id: AccentId
  label: string
  hex: string
}

export const ACCENTS: readonly AccentInfo[] = [
  { id: 'indigo', label: 'Indigo', hex: '#6366f1' },
  { id: 'emerald', label: 'Smaragd', hex: '#10b981' },
  { id: 'sky', label: 'Nebeská', hex: '#0ea5e9' },
  { id: 'amber', label: 'Jantar', hex: '#f59e0b' },
  { id: 'rose', label: 'Růže', hex: '#f43f5e' },
  { id: 'violet', label: 'Fialová', hex: '#8b5cf6' }
]

export function themeInfo(id: ThemeId): ThemeInfo {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function accentHex(id: AccentId): string {
  return (ACCENTS.find((a) => a.id === id) ?? ACCENTS[0]).hex
}

/**
 * Určí skutečně zobrazený motiv.
 * Při „podle Windows“: pokud zvolený motiv odpovídá světlosti systému, zůstane;
 * jinak se použije výchozí motiv opačného typu (Tmavý / Světlý).
 * Díky tomu jde kombinovat např. Půlnoční modrá v noci + Světlý přes den.
 */
export function resolveTheme(
  settings: Pick<Settings, 'theme' | 'followSystemTheme'>,
  systemPrefersDark: boolean
): ThemeId {
  if (!settings.followSystemTheme) return settings.theme
  const chosen = themeInfo(settings.theme)
  if (chosen.dark === systemPrefersDark) return chosen.id
  return systemPrefersDark ? 'dark' : 'light'
}
