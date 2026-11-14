export type ShortcutAction = 'palette' | 'newTransaction' | 'monthlyBuy'

/** Minimum z klávesové události, které rozpoznání zkratky potřebuje. */
export interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** Ctrl+K = paleta příkazů, Ctrl+N = nový nákup, Ctrl+M = měsíční nákup (na Macu ⌘). */
export function shortcutAction(e: KeyLike): ShortcutAction | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return null
  switch (e.key.toLowerCase()) {
    case 'k':
      return 'palette'
    case 'n':
      return 'newTransaction'
    case 'm':
      return 'monthlyBuy'
    default:
      return null
  }
}
