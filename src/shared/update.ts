/**
 * Stav automatických aktualizací (hlavní proces ho posílá rendereru).
 * `disabled`: ve vývoji se nehledá vůbec, přenosná verze se aktualizovat neumí.
 */
export type UpdateState =
  | { status: 'disabled'; reason: 'dev' | 'portable' }
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date' }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }
  /** Instalace se spouští: aplikace se za chvíli zavře a po instalaci sama znovu spustí. */
  | { status: 'installing'; version: string }
  | { status: 'error'; message: string }

export const UPDATE_DISABLED_TEXT: Record<'dev' | 'portable', string> = {
  dev: 'Aktualizace se hledají jen v nainstalované aplikaci, ne při vývoji.',
  portable: 'Přenosná verze se sama neaktualizuje. Novou verzi stáhni na stránce vydání na GitHubu.'
}

/** Věta pro uživatele podle stavu aktualizací (prázdná = není co říct). */
export function updateStatusText(state: UpdateState): string {
  switch (state.status) {
    case 'disabled':
      return UPDATE_DISABLED_TEXT[state.reason]
    case 'idle':
      return ''
    case 'checking':
      return 'Hledám novou verzi…'
    case 'up-to-date':
      return 'Máš nejnovější verzi.'
    case 'downloading':
      return `Stahuji verzi ${state.version} (${state.percent} %)…`
    case 'ready':
      return `Verze ${state.version} je stažená a nainstaluje se po restartu aplikace.`
    case 'installing':
      return `Instaluji verzi ${state.version}…`
    case 'error':
      return state.message
  }
}

/**
 * Věta po spuštění nové verze (aktualizace proběhla): `previous` je verze naposledy spuštěná,
 * `current` ta, která běží teď. Prázdná předchozí verze (první spuštění) ani stejná verze
 * žádnou zprávu nevyvolá.
 */
export function versionChangeNotice(previous: string, current: string): string | null {
  if (!previous || !current || previous === current) return null
  return `Aplikace byla aktualizována na verzi ${current} (předtím ${previous}). Seznam změn najdeš v Nastavení → Aplikace.`
}
