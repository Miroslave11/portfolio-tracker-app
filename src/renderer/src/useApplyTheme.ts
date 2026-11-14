import { useEffect, useSyncExternalStore } from 'react'
import { accentHex, resolveTheme } from '../../core/theme'
import type { ThemeId } from '../../shared/settings'
import { useApp } from './store'

const darkQuery = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

function subscribeSystemTheme(callback: () => void): () => void {
  const mq = darkQuery()
  mq.addEventListener('change', callback)
  return () => mq.removeEventListener('change', callback)
}

/** Zda má Windows zapnutý tmavý režim (živě sleduje změny). */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystemTheme, () => darkQuery().matches)
}

/** Vrátí skutečně zobrazený motiv a aplikuje ho na <html>. */
export function useApplyTheme(): ThemeId {
  const settings = useApp((s) => s.settings)
  const systemDark = useSystemPrefersDark()
  const active = resolveTheme(settings, systemDark)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = active
    root.style.setProperty('--accent', accentHex(settings.accent))
  }, [active, settings.accent])

  return active
}
