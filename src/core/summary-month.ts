import type { Portfolio } from '../shared/model'
import { FX_EUR_CZK, type PriceCache } from '../shared/prices'
import type { MonthArticleFacts, EtfRow, SummaryKind } from '../shared/summary'
import { addDays, addMonths, formatDate, formatMonthLong } from './date'
import { computeLots } from './lots'
import { formatMoney, formatPercent } from './money'
import { computePerformance, toPerfPoints, type CurvePoint } from './performance'
import { calculatePortfolio, valueAtOrBefore, type SeriesPoint } from './portfolio-calc'
import { buildMonthDetail, type DetailOptions } from './summary-detail'
import {
  duePeriods,
  KIND_WORDS,
  missingPeriods,
  periodBounds,
  periodMonths,
  periodReady,
  periodTitle,
  previousPeriod
} from './summary-period'

export interface MonthArticleInput {
  portfolio: Portfolio
  prices: PriceCache
  /** „RRRR-MM“ */
  month: string
  /** Plánovaný měsíční vklad v EUR (Cíl); 0 = bez plánu. */
  planMonthly: number
  targetCzk: number
  /** Předpoklady pro detailní sekce (P25); bez nich článek detailní údaje nemá. */
  detail?: Omit<DetailOptions, 'monthlyEur' | 'targetCzk'>
}

export interface PeriodArticleInput extends Omit<MonthArticleInput, 'month'> {
  kind: SummaryKind
  /** „2026-10“, „2026-Q3“, „2026-H1“ nebo „2026“ */
  period: string
}

const EPS = 1e-9
const round2 = (v: number): number => Math.round(v * 100) / 100

function pointAtOrBefore(series: readonly SeriesPoint[], date: string): SeriesPoint | null {
  let found: SeriesPoint | null = null
  for (const p of series) {
    if (p.date > date) break
    found = p
  }
  return found
}

/** První a poslední den měsíce „RRRR-MM“. */
export function monthBounds(month: string): { from: string; to: string } {
  return periodBounds('month', month)
}

/** Typ období článku (články z P24/P25 typ ve faktech nemají – jsou to měsíce). */
export const kindOf = (f: MonthArticleFacts): SummaryKind => f.kind ?? 'month'

/** Největší pokles od předchozího vrcholu v křivce výkonu (bez vlivu vkladů). */
export function maxDrawdown(
  curve: readonly CurvePoint[]
): { pct: number; from: string; to: string } | null {
  if (curve.length < 2) return null
  let peak = 1 + curve[0].pct
  let peakDate = curve[0].date
  let worst = { pct: 0, from: curve[0].date, to: curve[0].date }
  for (const p of curve) {
    const level = 1 + p.pct
    if (level > peak) {
      peak = level
      peakDate = p.date
    }
    const dd = peak > EPS ? level / peak - 1 : 0
    if (dd < worst.pct) worst = { pct: dd, from: peakDate, to: p.date }
  }
  return worst
}

/** Ověřená čísla pro měsíční článek (viz `buildPeriodFacts`). */
export function buildMonthArticleFacts(input: MonthArticleInput): MonthArticleFacts | null {
  const { month, ...rest } = input
  return buildPeriodFacts({ ...rest, kind: 'month', period: month })
}

/**
 * Spočítá ověřená čísla pro článek za období (vždy celé portfolio, všichni brokeři).
 * Vrací `null`, když období leží mimo data (před prvním obchodem nebo po posledním kurzu).
 */
export function buildPeriodFacts(input: PeriodArticleInput): MonthArticleFacts | null {
  const { portfolio, prices, kind, period } = input
  const { from, to } = periodBounds(kind, period)
  const prevEnd = addDays(from, -1)

  const full = calculatePortfolio({ portfolio, prices })
  if (!full.summary) return null
  const asOf = to < full.summary.asOf ? to : full.summary.asOf
  if (asOf < from) return null
  const end = pointAtOrBefore(full.series, asOf)
  if (!end) return null
  const start = pointAtOrBefore(full.series, prevEnd)
  // Poslední měsíc období: od něj se počítá „od začátku roku“ a „příští měsíc“.
  const lastMonth = asOf.slice(0, 7)
  const firstDate = full.summary.firstDate
  const firstMonth = firstDate.slice(0, 7)

  const fxRates = prices.fx[FX_EUR_CZK]?.rates ?? []
  const fxAt = (d: string): number | null =>
    fxRates.length ? (valueAtOrBefore(fxRates, d) ?? fxRates[0][1]) : null

  const inPeriod = (d: string): boolean => d > prevEnd && d <= asOf
  const txs = portfolio.transactions
  const accounts = new Map(portfolio.accounts.map((a) => [a.id, a.name]))
  const names = new Map(portfolio.securities.map((s) => [s.id, s.name]))

  const valueStart = start?.value ?? 0
  const valueEnd = end.value
  const netDeposits = end.invested - (start?.invested ?? 0)
  const marketChange = valueEnd - valueStart - netDeposits

  let dividends = 0
  let fees = 0
  const dividendList: MonthArticleFacts['dividendList'] = []
  const trades: MonthArticleFacts['trades'] = []
  for (const t of txs) {
    if (!inPeriod(t.date)) continue
    if (t.type === 'DIVIDEND') {
      dividends += t.amount
      dividendList.push({ date: t.date, ticker: t.securityId ?? '', amount: round2(t.amount) })
    } else if (t.type === 'FEE') {
      fees += t.amount
    } else if ((t.type === 'BUY' || t.type === 'SELL') && t.securityId && t.shares) {
      trades.push({
        date: t.date,
        type: t.type,
        broker: accounts.get(t.accountId) ?? '',
        ticker: t.securityId,
        amount: round2(t.amount),
        shares: t.shares
      })
    }
  }
  const byDate = (a: { date: string }, b: { date: string }): number => a.date.localeCompare(b.date)
  dividendList.sort(byDate)
  trades.sort(byDate)

  // Nákupy: období, předchozí období stejného typu a od začátku roku.
  const boughtBetween = (fromIncl: string, toIncl: string): number =>
    txs
      .filter((t) => t.type === 'BUY' && t.date >= fromIncl && t.date <= toIncl)
      .reduce((s, t) => s + t.amount, 0)
  const buys = trades.filter((t) => t.type === 'BUY')
  const bought = buys.reduce((s, t) => s + t.amount, 0)
  const prev = periodBounds(kind, previousPeriod(kind, period))
  const boughtPrevious = prev.to >= firstDate ? round2(boughtBetween(prev.from, prev.to)) : null
  const year = lastMonth.slice(0, 4)
  const ytdFirstMonth = firstMonth > `${year}-01` ? firstMonth : `${year}-01`
  let boughtYtd = 0
  let monthsYtd = 0
  for (let m = `${ytdFirstMonth}-01`; m.slice(0, 7) <= lastMonth; m = addMonths(m, 1)) {
    boughtYtd += boughtBetween(m, addDays(addMonths(m, 1), -1))
    monthsYtd++
  }
  // Měsíce období, ve kterých už portfolio existovalo (pro porovnání s plánem).
  const monthsWithData = periodMonths(kind, period).filter((m) => m >= firstMonth && m <= lastMonth)

  const dividendsSince = (fromExclusive: string): number =>
    txs
      .filter((t) => t.type === 'DIVIDEND' && t.date > fromExclusive && t.date <= asOf)
      .reduce((s, t) => s + t.amount, 0)

  // Výkon bez vlivu vkladů: období, od začátku roku, předchozí období a průběh.
  const points = toPerfPoints(full.series, 'EUR')
  const perf = points ? computePerformance(points, prevEnd, asOf) : null
  const ytdPerf = points ? computePerformance(points, `${Number(year) - 1}-12-31`, asOf) : null
  const prevPerf =
    points && prev.to >= firstDate
      ? computePerformance(points, addDays(prev.from, -1), prev.to)
      : null

  // Jednotlivá ETF: hodnota na začátku a konci, nákupy, prodeje a dividendy v období.
  const positionsAt = (d: string): Map<string, { value: number; estimated: boolean }> => {
    const calc = calculatePortfolio({ portfolio, prices, asOf: d })
    return new Map((calc.summary?.positions ?? []).map((p) => [p.securityId, p]))
  }
  const endPos = positionsAt(asOf)
  const startPos = prevEnd >= firstDate ? positionsAt(prevEnd) : new Map()
  const ids = new Set<string>([...startPos.keys(), ...endPos.keys()])
  for (const t of txs) if (t.securityId && inPeriod(t.date)) ids.add(t.securityId)
  const holdingsEnd = [...endPos.values()].reduce((s, p) => s + p.value, 0)

  const etfs: EtfRow[] = []
  for (const id of ids) {
    let rowBought = 0
    let rowSold = 0
    let rowDividends = 0
    for (const t of txs) {
      if (t.securityId !== id || !inPeriod(t.date)) continue
      if (t.type === 'BUY') rowBought += t.amount
      else if (t.type === 'SELL') rowSold += t.amount
      else if (t.type === 'DIVIDEND') rowDividends += t.amount
    }
    const before = startPos.get(id)
    const after = endPos.get(id)
    const vStart = before?.value ?? 0
    const vEnd = after?.value ?? 0
    const contribution = vEnd - vStart - rowBought + rowSold + rowDividends
    const base = vStart + rowBought
    etfs.push({
      ticker: id,
      name: names.get(id) ?? id,
      valueStart: round2(vStart),
      valueEnd: round2(vEnd),
      weight: holdingsEnd > EPS ? vEnd / holdingsEnd : 0,
      bought: round2(rowBought),
      sold: round2(rowSold),
      dividends: round2(rowDividends),
      contribution: round2(contribution),
      pct: base > 1 ? contribution / base : null,
      estimated: !!(before?.estimated || after?.estimated)
    })
  }
  etfs.sort((a, b) => b.valueEnd - a.valueEnd || a.ticker.localeCompare(b.ticker))

  const daily: [string, number][] = full.series
    .filter((p) => p.date >= from && p.date <= asOf)
    .map((p) => [p.date, round2(p.value)])

  // Delší období: tabulka po měsících.
  const months =
    kind === 'month'
      ? undefined
      : monthsWithData.map((m) => {
          const b = monthBounds(m)
          const mEnd = b.to < asOf ? b.to : asOf
          const s = pointAtOrBefore(full.series, addDays(b.from, -1))
          const e = pointAtOrBefore(full.series, mEnd)!
          const deposits = e.invested - (s?.invested ?? 0)
          const mPerf = points ? computePerformance(points, addDays(b.from, -1), mEnd) : null
          return {
            month: m,
            valueEnd: round2(e.value),
            netDeposits: round2(deposits),
            marketChange: round2(e.value - (s?.value ?? 0) - deposits),
            periodReturn: mPerf?.ttwror ?? null,
            bought: round2(boughtBetween(b.from, b.to))
          }
        })

  // Realizovaný zisk z prodejů v období (informativně, bez výše daně).
  const upToEnd: Portfolio = { ...portfolio, transactions: txs.filter((t) => t.date <= asOf) }
  const sales = computeLots(upToEnd).sales.filter((s) => inPeriod(s.date))
  const realized =
    sales.length === 0
      ? null
      : {
          count: sales.length,
          proceeds: round2(sales.reduce((s, x) => s + x.proceeds, 0)),
          gain: round2(sales.reduce((s, x) => s + x.gain, 0)),
          exemptGain: round2(sales.reduce((s, x) => s + x.exemptGain, 0))
        }

  const target = input.targetCzk
  const goal =
    end.valueCzk !== null && target > 0
      ? {
          targetCzk: target,
          valueCzk: round2(end.valueCzk),
          progress: end.valueCzk / target,
          progressPrev: start?.valueCzk != null ? start.valueCzk / target : start ? null : 0
        }
      : null

  const fxEnd = fxAt(asOf)
  const detail = input.detail
    ? buildMonthDetail({
        ...input.detail,
        monthlyEur: input.planMonthly,
        targetCzk: target,
        portfolio,
        prices,
        month: lastMonth,
        to,
        asOf,
        prevEnd,
        points,
        positions: new Map([...endPos].map(([id, p]) => [id, p.value])),
        valueEndCzk: end.valueCzk,
        fxEnd
      })
    : undefined

  return {
    kind,
    period,
    from,
    to,
    asOf,
    partial: asOf < to,
    valueStart: round2(valueStart),
    valueEnd: round2(valueEnd),
    valueEndCzk: end.valueCzk === null ? null : round2(end.valueCzk),
    fxStart: start ? fxAt(prevEnd) : null,
    fxEnd,
    netDeposits: round2(netDeposits),
    marketChange: round2(marketChange),
    priceChange: round2(marketChange - dividends + fees),
    dividends: round2(dividends),
    fees: round2(fees),
    periodReturn: perf?.ttwror ?? null,
    ytdReturn: ytdPerf?.ttwror ?? null,
    prevPeriodReturn: prevPerf?.ttwror ?? null,
    drawdown: perf ? maxDrawdown(perf.curve) : null,
    bought: round2(bought),
    buyCount: buys.length,
    boughtPrevious,
    planMonthly: input.planMonthly > 0 ? input.planMonthly : null,
    periodMonths: Math.max(1, monthsWithData.length),
    boughtYtd: round2(boughtYtd),
    monthsYtd: Math.max(1, monthsYtd),
    daily,
    trades,
    dividendList,
    dividendsYtd: round2(dividendsSince(`${Number(year) - 1}-12-31`)),
    dividends12m: round2(dividendsSince(addMonths(to, -12))),
    etfs,
    goal,
    realized,
    ...(months ? { months } : {}),
    ...(detail ? { detail } : {})
  }
}

// ---------------------------------------------------------------------------
// Která období vytvořit
// ---------------------------------------------------------------------------

/**
 * Den, do kterého jsou stažené kurzy všech dnes držených ETF (nejstarší z jejich posledních
 * kurzů), aby článek nevznikl s kurzem, který u některého ETF ještě chybí. ETF bez jediného
 * kurzu se přeskočí (ocení se cenou obchodu). Bez držených ETF poslední kurz vůbec.
 */
export function latestPriceDate(portfolio: Portfolio, prices: PriceCache): string | null {
  const shares = new Map<string, number>()
  for (const t of portfolio.transactions) {
    if (!t.securityId || t.shares === undefined) continue
    const d = t.type === 'BUY' ? t.shares : t.type === 'SELL' ? -t.shares : 0
    shares.set(t.securityId, (shares.get(t.securityId) ?? 0) + d)
  }
  const lastOf = (id: string): string | undefined => prices.securities[id]?.prices.at(-1)?.[0]
  const held = [...shares].filter(([, n]) => n > EPS).map(([id]) => lastOf(id))
  const dates = held.filter((d): d is string => !!d)
  if (dates.length > 0) return dates.sort()[0]
  const any = [...shares.keys()].map(lastOf).filter((d): d is string => !!d)
  return any.length ? any.sort().at(-1)! : null
}

/** Měsíc skončil a kurzy pokrývají jeho konec (viz `periodReady`). */
export function monthReady(month: string, latestPrice: string | null, today: string): boolean {
  return periodReady('month', month, latestPrice, today)
}

/** Všechny skončené měsíce od prvního obchodu, které ještě nemají článek (nejstarší první). */
export function missingMonths(
  existing: ReadonlySet<string>,
  firstDate: string,
  latestPrice: string | null,
  today: string
): string[] {
  return missingPeriods('month', existing, firstDate, latestPrice, today)
}

/** Automatické „dohnání“ měsíců (viz `duePeriods`). */
export function dueMonths(
  existing: ReadonlySet<string>,
  firstDate: string,
  latestPrice: string | null,
  today: string
): string[] {
  return duePeriods('month', existing, firstDate, latestPrice, today)
}

// ---------------------------------------------------------------------------
// Šablonový text (každé číslo pochází z faktů)
// ---------------------------------------------------------------------------

const NBSP = ' '
const eur = (v: number): string => formatMoney(Math.abs(v), 'EUR', 0)
const signedEur = (v: number): string => `${v >= 0 ? '+' : '-'}${eur(v)}`
const pct = (v: number, digits = 2): string => formatPercent(v, digits, true)
const shortDate = (iso: string): string => formatDate(iso).replace(/ \d{4}$/, '')
const pp = (v: number): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v * 100)
    .toFixed(1)
    .replace('.', ',')}${NBSP}p.${NBSP}b.`

/** „Říjen 2026“, „3. kvartál 2026“, „1. pololetí 2026“, „Rok 2025“. */
export function articleTitle(f: MonthArticleFacts): string {
  return periodTitle(kindOf(f), f.period)
}

/** Plán nákupů za období (měsíční plán × měsíce s daty); `null` bez plánu. */
export function planTotal(f: MonthArticleFacts): number | null {
  return f.planMonthly ? f.planMonthly * (f.periodMonths ?? 1) : null
}

/** Kolik procent plánu nákupů za období bylo nakoupeno; `null` bez plánu. */
export function planShare(f: MonthArticleFacts): number | null {
  const plan = planTotal(f)
  return plan ? f.bought / plan : null
}

/** Nejlepší a nejhorší ETF podle výkonu (jen se spočitatelným výkonem a skutečným kurzem). */
export function bestWorst(f: MonthArticleFacts): { best: EtfRow | null; worst: EtfRow | null } {
  const rows = f.etfs
    .filter((e) => e.pct !== null && !e.estimated)
    .sort((a, b) => b.pct! - a.pct! || a.ticker.localeCompare(b.ticker))
  return { best: rows[0] ?? null, worst: rows.length >= 2 ? rows[rows.length - 1] : null }
}

/** Nejlepší a nejhorší měsíc delšího období podle výkonu. */
export function bestWorstMonth(f: MonthArticleFacts): {
  best: NonNullable<MonthArticleFacts['months']>[number] | null
  worst: NonNullable<MonthArticleFacts['months']>[number] | null
} {
  const rows = (f.months ?? []).filter((m) => m.periodReturn !== null)
  if (rows.length < 2) return { best: null, worst: null }
  const sorted = [...rows].sort((a, b) => b.periodReturn! - a.periodReturn!)
  return { best: sorted[0], worst: sorted[sorted.length - 1] }
}

/** „V kostce“: 3–4 krátké body. */
export function articleHighlights(f: MonthArticleFacts): string[] {
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const lines: string[] = []
  const change = f.valueEnd - f.valueStart
  const market =
    f.marketChange >= 0 ? `trh přidal ${eur(f.marketChange)}` : `trh ubral ${eur(f.marketChange)}`
  let first = `Portfolio ${change >= 0 ? 'vzrostlo' : 'kleslo'} na ${eur(f.valueEnd)} (${signedEur(change)}).`
  if (Math.abs(f.netDeposits) >= 0.5) {
    first +=
      f.netDeposits > 0
        ? ` Z toho ${eur(f.netDeposits)} jsi vložil a ${market}.`
        : ` Vybral jsi ${eur(f.netDeposits)} a ${market}.`
  } else {
    first += ` Bez nových vkladů ${market}.`
  }
  lines.push(first)

  if (f.periodReturn !== null) {
    let line = `Výkon samotných investic (bez vkladů) byl ${pct(f.periodReturn)}`
    const extra: string[] = []
    if (kind !== 'year' && f.ytdReturn !== null)
      extra.push(`od začátku roku ${pct(f.ytdReturn, 1)}`)
    if (kind !== 'month' && f.prevPeriodReturn != null) {
      extra.push(`${w.prev} ${pct(f.prevPeriodReturn, 1)}`)
    }
    line += extra.length ? `, ${extra.join(', ')}.` : '.'
    lines.push(line)
  }

  const parts: string[] = []
  if (f.goal) {
    let g = `K cíli ${formatMoney(f.goal.targetCzk, 'CZK', 0)} máš ${formatPercent(f.goal.progress, 1)}`
    if (f.goal.progressPrev !== null) {
      g += ` (${pp(f.goal.progress - f.goal.progressPrev)} za ${w.nom})`
    }
    parts.push(`${g}.`)
  }
  const share = planShare(f)
  if (share !== null) {
    parts.push(
      f.buyCount === 0
        ? `V ${w.loc} jsi nic nenakoupil.`
        : kind === 'month'
          ? `Měsíční plán nákupů splněn na ${formatPercent(share, 0)}.`
          : `Plán nákupů za ${w.nom} (${eur(planTotal(f)!)}) splněn na ${formatPercent(share, 0)}.`
    )
  }
  if (parts.length) lines.push(parts.join(' '))
  if (f.partial) {
    lines.push(`Období ještě neskončilo, hodnoty jsou k ${formatDate(f.asOf)}.`)
  }
  return lines
}

/** Nejvýš tolik nákupů se v komentáři vypíše jednotlivě, víc se jen sečte. */
const LISTED_BUYS = 6

/** „Komentář“: několik vět o průběhu období, bez dividend (šablona; v P27 ho může psát lokální AI). */
export function articleCommentary(f: MonthArticleFacts): string[] {
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const paragraphs: string[] = []

  const buys = f.trades.filter((t) => t.type === 'BUY')
  const sells = f.trades.filter((t) => t.type === 'SELL')
  let p1 =
    buys.length === 0
      ? `V ${w.loc} jsi nenakoupil žádné ETF.`
      : buys.length > LISTED_BUYS
        ? `V ${w.loc} jsi nakoupil za ${eur(f.bought)} (${buys.length}× nákup).`
        : `V ${w.loc} jsi nakoupil za ${eur(f.bought)}: ${buys
            .map((t) => `${t.ticker} ${eur(t.amount)} (${shortDate(t.date)})`)
            .join(', ')}.`
  if (sells.length > 0) {
    p1 += ` Prodal jsi ${sells.map((t) => `${t.ticker} za ${eur(t.amount)}`).join(', ')}.`
  }
  const dd = f.drawdown
  if (dd && dd.pct <= -0.01) {
    p1 += ` Největší pokles během ${w.gen} byl ${pct(dd.pct, 1)} (${shortDate(dd.from)} až ${shortDate(dd.to)}).`
  } else if (dd) {
    p1 += ` Bylo to klidné období, největší pokles byl jen ${pct(dd.pct, 1)}.`
  }
  paragraphs.push(p1)

  const { best, worst } = bestWorst(f)
  const top = f.etfs
    .filter((e) => !e.estimated)
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0]
  const p2: string[] = []
  if (best) {
    let s = `Nejlépe si vedlo ${best.ticker} (${pct(best.pct!, 1)})`
    if (worst) s += `, nejhůře ${worst.ticker} (${pct(worst.pct!, 1)})`
    p2.push(`${s}.`)
  }
  if (top && Math.abs(top.contribution) >= 1) {
    p2.push(
      `Nejvíc ${top.contribution >= 0 ? 'přidalo' : 'ubralo'} ${top.ticker}: ${signedEur(top.contribution)}.`
    )
  }
  const months = bestWorstMonth(f)
  if (months.best && months.worst) {
    p2.push(
      `Nejlepší měsíc byl ${formatMonthLong(months.best.month)} (${pct(months.best.periodReturn!, 1)}), nejhorší ${formatMonthLong(months.worst.month)} (${pct(months.worst.periodReturn!, 1)}).`
    )
  }
  if (p2.length) paragraphs.push(p2.join(' '))
  return paragraphs
}

/** „Výhled na další měsíc“: plánovaný nákup, alokace a časový test (jen informativně). */
export function articleOutlook(f: MonthArticleFacts): string[] {
  const d = f.detail
  const out: string[] = []
  const alloc = d?.allocation
  if (f.planMonthly) {
    let line = `Plánovaný nákup ${eur(f.planMonthly)}.`
    const buys = (alloc?.rows ?? []).filter((r) => r.buy >= 0.5).sort((a, b) => b.buy - a.buy)
    if (alloc && buys.length > 0) {
      line += ` Podle cílové alokace (${eur(alloc.monthlyEur)}) jen dokupováním: ${buys
        .map((r) => `${r.group} ${eur(r.buy)}`)
        .join(', ')}.`
    }
    out.push(line)
  }
  if (alloc) {
    // Přednostně skupina nad cílem (ta se dokupováním srovnává nejdéle), jinak nejvíc pod cílem.
    const byDev = [...alloc.rows].sort((a, b) => b.share - b.target - (a.share - a.target))
    const over = byDev[0]
    const worst = over && over.share - over.target >= 0.02 ? over : byDev[byDev.length - 1]
    const dev = worst ? worst.share - worst.target : 0
    if (worst && Math.abs(dev) >= 0.02) {
      const gap = `${Math.abs(dev * 100)
        .toFixed(1)
        .replace('.', ',')}${NBSP}p.${NBSP}b.`
      if (dev > 0) {
        out.push(
          alloc.monthsToTarget === null
            ? `${worst.group} je ${gap} nad cílem a samotným dokupováním se nesrovná.`
            : `${worst.group} je ${gap} nad cílem; jen dokupováním se alokace srovná zhruba za ${alloc.monthsToTarget}${NBSP}měs.`
        )
      } else {
        out.push(`${worst.group} je ${gap} pod cílem.`)
      }
    }
  }
  const tt = d?.timeTest
  if (tt && tt.releasing.length > 0) {
    const value = tt.releasing.reduce((s, r) => s + r.value, 0)
    out.push(
      `Příští měsíc (${formatMonthLong(tt.nextMonth)}) splní časový test ${tt.releasing.length}× nákup v dnešní hodnotě ${eur(value)}.`
    )
  }
  if (out.length === 0) out.push('Na další měsíc z dat nic zvláštního nevychází.')
  return out
}
