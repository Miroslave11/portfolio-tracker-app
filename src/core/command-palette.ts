import { normalizeText } from './transaction-filter'

/** Jedna položka palety příkazů (akce, přechod na obrazovku nebo nalezená transakce). */
export interface PaletteItem {
  id: string
  /** Hlavní text; podle něj se hledá nejpřednostněji. */
  label: string
  /** Doplňkový text vpravo (zkratka, popis…). */
  hint?: string
  /** Další slova, podle kterých jde položku najít (synonyma). */
  keywords?: readonly string[]
}

/**
 * Jak dobře položka odpovídá dotazu (nižší = lepší), nebo `null`, když neodpovídá.
 * Každé slovo dotazu musí být v popisku nebo klíčových slovech (bez diakritiky a velikosti písmen).
 */
function matchRank(item: PaletteItem, tokens: readonly string[]): number | null {
  const label = normalizeText(item.label)
  const labelWords = label.split(/[^a-z0-9]+/).filter(Boolean)
  const extra = normalizeText((item.keywords ?? []).join(' '))
  let rank = 0
  for (const token of tokens) {
    let best: number
    if (label.startsWith(token)) best = 0
    else if (labelWords.some((w) => w.startsWith(token))) best = 1
    else if (label.includes(token)) best = 2
    else if (extra.includes(token)) best = 3
    else return null
    rank += best
  }
  return rank
}

/**
 * Vyhledá položky podle dotazu. Prázdný dotaz vrátí položky v původním pořadí;
 * jinak jsou seřazené podle shody (začátek popisku → začátek slova → kdekoli → klíčová slova),
 * při shodě zůstává původní pořadí.
 */
export function searchPalette<T extends PaletteItem>(
  items: readonly T[],
  query: string,
  limit = Infinity
): T[] {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return items.slice(0, limit)
  return items
    .map((item, index) => ({ item, index, rank: matchRank(item, tokens) }))
    .filter((x): x is { item: T; index: number; rank: number } => x.rank !== null)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item)
}
