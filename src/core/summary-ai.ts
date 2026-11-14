import type { AiLength, AiPart, AiStyle } from '../shared/ai'
import type { MonthArticleFacts, SummaryKind } from '../shared/summary'
import { addMonths, formatDate, formatMonthLong } from './date'
import { formatMoney, formatPercent } from './money'
import { unknownNumbers } from './monthly-summary'
import {
  articleOutlook,
  articleTitle,
  bestWorst,
  bestWorstMonth,
  kindOf,
  planShare,
  planTotal
} from './summary-month'
import { KIND_WORDS } from './summary-period'

/*
 * Texty článků od lokální AI (P27). Čísla počítá vždy kód: model dostane soupis faktů
 * (`articleFactSheet`) a smí použít jen čísla z něj – každé číslo v jeho textu se ověří.
 */

const NBSP = ' '
const eur = (v: number): string => formatMoney(Math.abs(v), 'EUR', 0)
const signedEur = (v: number): string => `${v >= 0 ? '+' : '-'}${eur(v)}`
const pct = (v: number, digits = 2): string => formatPercent(v, digits, true)
const shortDate = (iso: string): string => formatDate(iso).replace(/ \d{4}$/, '')
const pp = (v: number): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v * 100)
    .toFixed(1)
    .replace('.', ',')}${NBSP}p.${NBSP}b.`

/** Nejvýš tolik obchodů a ETF se do soupisu faktů vypíše jednotlivě. */
const MAX_TRADES = 12
const MAX_ETFS = 12

/**
 * Soupis faktů článku jako samostatné věty. Obsahuje všechno, co smí AI v textu použít;
 * ověřování čísel se dělá proti němu.
 */
export function articleFactSheet(f: MonthArticleFacts): string[] {
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const d = f.detail
  const out: string[] = []
  const add = (line: string): void => {
    out.push(line)
  }

  add(
    `Období: ${articleTitle(f)} (${formatDate(f.from)} – ${formatDate(f.to)}), hodnoty jsou k ${formatDate(f.asOf)}.` +
      (f.partial ? ' Období ještě neskončilo.' : '')
  )
  const change = f.valueEnd - f.valueStart
  add(
    `Hodnota portfolia na začátku období ${eur(f.valueStart)}, na konci ${eur(f.valueEnd)}; změna ${signedEur(change)}.`
  )
  add(
    `Vklady minus výběry za ${w.nom}: ${signedEur(f.netDeposits)}. Změna hodnoty samotným trhem (bez vkladů): ${signedEur(f.marketChange)}.` +
      (f.fees > 0 ? ` Poplatky ${eur(f.fees)}.` : '')
  )
  if (f.periodReturn !== null) {
    let line = `Výkon portfolia za ${w.nom} bez vlivu vkladů: ${pct(f.periodReturn)}.`
    if (kind !== 'year' && f.ytdReturn !== null) {
      line += ` Od začátku roku ${pct(f.ytdReturn, 1)}.`
    }
    if (kind !== 'month' && f.prevPeriodReturn != null) {
      line += ` Za ${w.prev} ${pct(f.prevPeriodReturn, 1)}.`
    }
    add(line)
  }
  const dd = f.drawdown
  if (dd && dd.pct < 0) {
    add(
      `Největší pokles během období: ${pct(dd.pct, 1)} (${shortDate(dd.from)} až ${shortDate(dd.to)}).`
    )
  }

  // Nákupy a plán
  const buys = f.trades.filter((t) => t.type === 'BUY')
  const sells = f.trades.filter((t) => t.type === 'SELL')
  add(
    buys.length === 0
      ? `V ${w.loc} se nenakoupilo žádné ETF.`
      : `V ${w.loc} se nakoupilo za ${eur(f.bought)} (nákupů: ${buys.length}).` +
          (f.boughtPrevious !== null ? ` Za ${w.prev} to bylo ${eur(f.boughtPrevious)}.` : '')
  )
  const total = planTotal(f)
  const share = planShare(f)
  if (total !== null && share !== null) {
    add(`Plán nákupů za období ${eur(total)}, splněno ${formatPercent(share, 0)}.`)
  }
  if (f.trades.length <= MAX_TRADES) {
    for (const t of f.trades) {
      add(
        `${t.type === 'BUY' ? 'Nákup' : 'Prodej'} ${shortDate(t.date)} (${t.broker}): ${t.ticker} za ${eur(t.amount)}.`
      )
    }
  } else if (sells.length > 0) {
    add(`Prodejů za ${w.nom} bylo ${sells.length}.`)
  }

  // ETF
  for (const e of f.etfs.slice(0, MAX_ETFS)) {
    const parts = [
      `hodnota ${eur(e.valueEnd)}`,
      `váha ${formatPercent(e.weight, 1)}`,
      e.pct === null ? null : `výkon ${pct(e.pct, 1)}`,
      `příspěvek ${signedEur(e.contribution)}`
    ].filter((p): p is string => p !== null)
    add(`ETF ${e.ticker} (${e.name}): ${parts.join(', ')}.`)
  }
  const { best, worst } = bestWorst(f)
  if (best) {
    add(
      `Nejlépe si vedlo ${best.ticker} (${pct(best.pct!, 1)})` +
        (worst ? `, nejhůře ${worst.ticker} (${pct(worst.pct!, 1)}).` : '.')
    )
  }

  // Po měsících (delší období)
  for (const m of f.months ?? []) {
    add(
      `${formatMonthLong(m.month)}: výkon ${m.periodReturn === null ? 'neznámý' : pct(m.periodReturn, 1)}, změna trhem ${signedEur(m.marketChange)}, vklady ${signedEur(m.netDeposits)}, nakoupeno ${eur(m.bought)}.`
    )
  }
  const months = bestWorstMonth(f)
  if (months.best && months.worst) {
    add(
      `Nejlepší měsíc byl ${formatMonthLong(months.best.month)} (${pct(months.best.periodReturn!, 1)}), nejhorší ${formatMonthLong(months.worst.month)} (${pct(months.worst.periodReturn!, 1)}).`
    )
  }

  // Cíl
  if (f.goal) {
    let line = `K cíli ${formatMoney(f.goal.targetCzk, 'CZK', 0)} má portfolio ${formatPercent(f.goal.progress, 1)}`
    if (f.goal.progressPrev !== null) {
      line += ` (${pp(f.goal.progress - f.goal.progressPrev)} za ${w.nom})`
    }
    add(`${line}.`)
  }
  const proj = d?.projection
  if (proj && proj.months !== null) {
    const year = (m: number): string => addMonths(f.asOf, m).slice(0, 4)
    add(
      `Odhad modelu: při výnosu ${formatPercent(proj.annualReturn, 1)} ročně a ${eur(proj.monthlyEur)} měsíčně se cíle dosáhne kolem roku ${year(proj.months)}` +
        (proj.monthsLow !== null && proj.monthsHigh !== null
          ? ` (rozpětí ${year(proj.monthsLow)}–${year(proj.monthsHigh)}).`
          : '.')
    )
  }

  // Detailní údaje (P25)
  const bm = d?.benchmark
  if (bm) {
    add(
      `Srovnání s ${bm.ticker}: portfolio ${f.periodReturn === null ? 'neznámé' : pct(f.periodReturn)}, ${bm.ticker} ${bm.periodReturn === null ? 'neznámé' : pct(bm.periodReturn)} za ${w.nom}.`
    )
  }
  const r = d?.risk
  if (r) {
    if (r.worstDay) add(`Nejhorší den ${shortDate(r.worstDay.date)}: ${pct(r.worstDay.pct, 1)}.`)
    if (r.bestDay) add(`Nejlepší den ${shortDate(r.bestDay.date)}: ${pct(r.bestDay.pct, 1)}.`)
    if (r.volatility !== null) {
      add(
        `Kolísavost (roční přepočet) ${formatPercent(r.volatility, 1)}` +
          (r.volatilityTypical !== null
            ? `, za posledních 12 měsíců ${formatPercent(r.volatilityTypical, 1)}.`
            : '.')
      )
    }
  }
  for (const a of d?.allocation?.rows ?? []) {
    add(`Alokace ${a.group}: ${formatPercent(a.share, 1)}, cíl ${formatPercent(a.target, 0)}.`)
  }
  if (f.fxStart !== null && f.fxEnd !== null && Math.abs(f.fxEnd - f.fxStart) >= 0.0005) {
    add(
      `Kurz ČNB se změnil z ${f.fxStart.toFixed(3).replace('.', ',')} na ${f.fxEnd.toFixed(3).replace('.', ',')} Kč/€.`
    )
  }
  const tt = d?.timeTest
  if (tt) {
    add(
      `Po časovém testu 3 roky je ${eur(tt.freeValue)} z ${eur(tt.totalValue)}.` +
        (tt.releasing.length > 0 ? ` Příští měsíc ho splní nákupů: ${tt.releasing.length}.` : '')
    )
  }
  if (f.realized) {
    add(
      `Prodeje za období: ${f.realized.count}× za ${eur(f.realized.proceeds)}, realizovaný zisk ${signedEur(f.realized.gain)}.`
    )
  }
  for (const line of articleOutlook(f)) add(`Výhled: ${line}`)
  return out
}

// ---------------------------------------------------------------------------
// Prompty
// ---------------------------------------------------------------------------

const COMMENTARY_SHAPE: Record<AiLength, string> = {
  short: 'Napiš 1 odstavec o 3 až 4 větách.',
  medium: 'Napiš 2 až 3 odstavce, odstavce odděl prázdným řádkem.',
  long: 'Napiš 4 až 6 odstavců, odstavce odděl prázdným řádkem.'
}

const STYLE_HINT: Record<AiStyle, string> = {
  factual: 'Piš věcně a neutrálně, bez emocí a bez zdůrazňování.',
  friendly: 'Piš přátelsky a srozumitelně, ale střídmě; vyhni se přehánění a vykřičníkům.'
}

const PART_TASK: Record<AiPart, (length: AiLength) => string> = {
  highlights: () =>
    'Napiš „V kostce“: 3 až 4 krátké body s nejdůležitějšími zjištěními o období. Každý bod na samostatném řádku, 1 až 2 věty, bez odrážek a číslování.',
  commentary: (length) =>
    `Napiš komentář k období: jak se portfolio vyvíjelo, co ho táhlo a co brzdilo, jak probíhaly nákupy. ${COMMENTARY_SHAPE[length]}`,
  outlook: () =>
    'Napiš „Výhled“: 2 až 3 krátké body o tom, na co se příští měsíc dívat. Čerpej jen z faktů označených „Výhled:“ a z cílové alokace a časového testu. Každý bod na samostatném řádku, bez odrážek a číslování.'
}

export interface PartPromptOptions {
  part: AiPart
  kind: SummaryKind
  length: AiLength
  style: AiStyle
  facts: readonly string[]
  /** Čísla z předchozího pokusu, která nejsou ve faktech (druhý pokus je zakáže). */
  badNumbers?: readonly number[]
}

/** Pokyn pro jazykový model: napsat jednu část článku jen z faktů, čísla nesmí změnit. */
export function buildPartPrompt(o: PartPromptOptions): string {
  const lines = [
    `Jsi pomocník, který píše část ${o.kind === 'month' ? 'měsíčního' : 'souhrnného'} shrnutí investičního portfolia česky; oslovuj majitele portfolia a tykej mu.`,
    'Pravidla:',
    '- Použij výhradně fakta ze seznamu „Fakta“ níže.',
    '- Všechna čísla, částky, procenta a data přepiš přesně tak, jak jsou ve faktech. Nic nepočítej, nezaokrouhluj, nepřevádí měny a nevymýšlej žádná čísla (ani počty, roky a pořadí), která ve faktech nejsou.',
    '- Nepřidávej rady, doporučení ani předpovědi budoucího vývoje trhu.',
    `- ${STYLE_HINT[o.style]}`,
    `- Úkol: ${PART_TASK[o.part](o.length)}`,
    '- Vrať jen výsledný text, bez nadpisu, bez markdownu a bez vysvětlování.'
  ]
  if (o.badNumbers && o.badNumbers.length > 0) {
    const shown = o.badNumbers.slice(0, 6).map((n) => String(n).replace('.', ','))
    lines.push(
      `- Tvůj předchozí pokus obsahoval čísla, která ve faktech nejsou: ${shown.join('; ')}. Napiš text znovu a použij jen čísla z faktů.`
    )
  }
  lines.push('', 'Fakta:', ...o.facts.map((f) => `- ${f}`))
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Zpracování a kontrola výstupu modelu
// ---------------------------------------------------------------------------

const HEADING_ONLY_RE = /^(v kostce|komentář|výhled)\s*[:.]?$/i
const BULLET_RE = /^\s*(?:[-*•–]|•)\s+/
const NUMBERED_RE = /^\s*(\d+)[.)]\s+/

/** Odstraní markdown a rozdělí text na body (řádky) nebo odstavce podle části článku. */
export function parsePartOutput(part: AiPart, raw: string): string[] {
  const text = raw
    .replace(/```[a-z]*\n?|```/gi, '')
    .replace(/\*\*|__/g, '')
    .replace(/^\s*#+\s*/gm, '')
    .trim()
  if (text === '') return []

  if (part === 'commentary') {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
      .filter((p) => p !== '' && !HEADING_ONLY_RE.test(p))
  }

  let lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !HEADING_ONLY_RE.test(l))
    .map((l) => l.replace(BULLET_RE, ''))
  // Číslování „1. … 2. …“ se odstraní jen tehdy, když jde opravdu o seznam 1, 2, 3 …
  const numbers = lines.map((l) => Number(NUMBERED_RE.exec(l)?.[1] ?? NaN))
  if (lines.length >= 2 && numbers.every((n, i) => n === i + 1)) {
    lines = lines.map((l) => l.replace(NUMBERED_RE, ''))
  }
  return lines
}

const ADVICE_RE = /doporuču|radím|měl bys|měl by sis|měl bych|rozhodně (kup|prodej)/i

/** Kolik řádků / odstavců je u dané části ještě přijatelných. */
const SHAPE: Record<AiPart, { min: number; max: number }> = {
  highlights: { min: 2, max: 6 },
  commentary: { min: 1, max: 8 },
  outlook: { min: 1, max: 5 }
}

export type PartCheck =
  { ok: true } | { ok: false; reason: 'empty' | 'shape' | 'advice' | 'numbers'; unknown: number[] }

/** Zkontroluje text části: tvar, žádné rady a hlavně žádné číslo, které není ve faktech. */
export function checkPartOutput(
  part: AiPart,
  facts: readonly string[],
  lines: readonly string[]
): PartCheck {
  if (lines.length === 0) return { ok: false, reason: 'empty', unknown: [] }
  if (lines.length < SHAPE[part].min || lines.length > SHAPE[part].max) {
    return { ok: false, reason: 'shape', unknown: [] }
  }
  const text = lines.join('\n')
  if (ADVICE_RE.test(text)) return { ok: false, reason: 'advice', unknown: [] }
  const unknown = unknownNumbers(facts.join('\n'), text)
  if (unknown.length > 0) return { ok: false, reason: 'numbers', unknown }
  return { ok: true }
}
