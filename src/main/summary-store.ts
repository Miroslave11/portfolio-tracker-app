import { copyFile, mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import {
  SUMMARY_KINDS,
  summaryFileSchema,
  summarySaveRequestSchema,
  type SummaryArticle
} from '../shared/summary'
import { writeJsonAtomic } from './json-file'

export const SUMMARIES_FILE = 'summaries.json'

/**
 * Nejnovější první podle konce období; při stejném konci jde delší období před kratší –
 * jako v mockupu: Říjen, 3. kvartál, Září, … (u konce roku: Rok, 2. pololetí, 4. kvartál, Prosinec).
 */
export function sortArticles(articles: SummaryArticle[]): SummaryArticle[] {
  const rank = (a: SummaryArticle): number => SUMMARY_KINDS.indexOf(a.kind)
  return articles.sort(
    (a, b) => b.facts.to.localeCompare(a.facts.to) || rank(b) - rank(a) || a.id.localeCompare(b.id)
  )
}

/**
 * Načte uložená shrnutí. Chybějící soubor = žádná shrnutí. Poškozený soubor se zkopíruje
 * vedle (`summaries.json.bad-…`), aby se dalším uložením nepřepsal, a vrátí se prázdný seznam.
 */
export async function loadSummaries(dir: string): Promise<SummaryArticle[]> {
  const path = join(dir, SUMMARIES_FILE)
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return []
  }
  try {
    return sortArticles(summaryFileSchema.parse(JSON.parse(raw)).articles)
  } catch {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    await copyFile(path, `${path}.bad-${stamp}`).catch(() => undefined)
    return []
  }
}

/** Uloží nové nebo přegenerované články (stejné `id` se nahradí) a vrátí všechny. */
export async function saveSummaries(dir: string, request: unknown): Promise<SummaryArticle[]> {
  const incoming = summarySaveRequestSchema.parse(request)
  const byId = new Map((await loadSummaries(dir)).map((a) => [a.id, a]))
  for (const article of incoming) byId.set(article.id, article)
  const articles = sortArticles([...byId.values()])
  await mkdir(dir, { recursive: true })
  await writeJsonAtomic(join(dir, SUMMARIES_FILE), { version: 1, articles })
  return articles
}
