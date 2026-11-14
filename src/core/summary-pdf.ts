import { addMonths, formatDate, formatDateTime, formatMonthLong } from './date'
import { formatMoney, formatPercent, formatSignedMoney } from './money'
import { esc } from './report-html'
import {
  articleCommentary,
  articleHighlights,
  articleOutlook,
  articleTitle,
  bestWorstMonth,
  kindOf,
  planShare,
  planTotal
} from './summary-month'
import { KIND_WORDS } from './summary-period'
import { AI_PART_LABELS, AI_PARTS } from '../shared/ai'
import {
  DETAIL_SECTIONS,
  type MonthArticleFacts,
  type MonthDetail,
  type SummaryArticle,
  type SummarySection
} from '../shared/summary'

/*
 * PDF článku Shrnutí portfolia (P28): celý článek jako samostatná HTML stránka pro tisk na A4
 * (stejný základ jako měsíční report z P21: bez skriptů a bez externích zdrojů). Obsah odpovídá
 * článku na obrazovce – stejné sekce ve stejném pořadí podle nastavení rozsahu. Grafy dodá
 * vykreslovač jako obrázky (data:image/…); každý text se escapuje, protože část textu píše AI.
 */

export interface ArticlePdfOptions {
  /** Zapnuté sekce (Nastavení → Shrnutí portfolia). */
  sections: readonly SummarySection[]
  /** Grafy jako obrázky `data:image/…`; chybí-li, sekce s grafem se vynechá. */
  charts?: { course?: string; waterfall?: string }
}

const eur = (v: number, digits = 0): string => formatMoney(v, 'EUR', digits)
const signed = (v: number, digits = 0): string => formatSignedMoney(v, 'EUR', digits)
const tone = (v: number): string => (v > 0 ? 'pos' : v < 0 ? 'neg' : '')
const shortDate = (iso: string): string => formatDate(iso).replace(/ \d{4}$/, '')
const pctOrDash = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '–' : formatPercent(v, digits, true)
const pp = (v: number, digits: number): string =>
  `${v >= 0 ? '+' : '-'}${Math.abs(v * 100)
    .toFixed(digits)
    .replace('.', ',')} p. b.`
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

const STYLE = `
  @page { size: A4; margin: 15mm 13mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.45 "Segoe UI", Arial, sans-serif; color: #1a1f36; margin: 0; }
  h1 { font-size: 21pt; margin: 0 0 3pt; }
  h2 { font-size: 12pt; margin: 0 0 5pt; }
  h3 { font-size: 9pt; margin: 0 0 4pt; text-transform: uppercase; letter-spacing: .05em; color: #5b6485; }
  section, .box, .kpi, table, tr { break-inside: avoid; }
  section { margin-top: 15pt; }
  .meta { color: #5b6485; font-size: 9.5pt; }
  .tag { display: inline-block; border: 1pt solid #6366f1; color: #6366f1; border-radius: 9pt; padding: 0 6pt; font-size: 8.5pt; }
  .tag.sky { border-color: #0ea5e9; color: #0ea5e9; }
  .tag.plain { border-color: #c4cbe3; color: #5b6485; }
  .warn { color: #b45309; }
  .box { border: 1pt solid #d9deef; border-radius: 6pt; padding: 8pt 10pt; }
  .box.hi { border-left: 3pt solid #6366f1; background: #f4f5ff; }
  .box p { margin: 0 0 5pt; } .box p:last-child { margin-bottom: 0; }
  ul { margin: 0; padding-left: 16pt; } li { margin-bottom: 3pt; }
  .kpis { display: flex; gap: 7pt; margin-top: 12pt; }
  .kpi { flex: 1; border: 1pt solid #d9deef; border-radius: 6pt; padding: 6pt 8pt; }
  .kpi .t { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; color: #5b6485; }
  .kpi .v { font-size: 14pt; font-weight: 700; white-space: nowrap; }
  .kpi .s { font-size: 8.5pt; color: #5b6485; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th { text-align: left; font-size: 8pt; color: #5b6485; border-bottom: 1pt solid #c4cbe3; padding: 3pt 4pt; }
  td { padding: 3.5pt 4pt; border-bottom: .5pt solid #e6e9f5; vertical-align: top; }
  .r { text-align: right; white-space: nowrap; } th.r { text-align: right; }
  .sub { display: block; font-size: 8.5pt; color: #5b6485; }
  .pos { color: #15803d; } .neg { color: #b91c1c; }
  tr.total td { font-weight: 700; border-top: 1pt solid #c4cbe3; border-bottom: 0; }
  .note { margin: 5pt 0 0; font-size: 8.5pt; color: #5b6485; }
  .chart { display: block; width: 100%; height: auto; }
  .bar { position: relative; height: 8pt; background: #e6e9f5; border-radius: 4pt; margin: 3pt 0 6pt; }
  .bar i { position: absolute; left: 0; top: 0; bottom: 0; background: #0ea5e9; border-radius: 4pt; }
  .bar i.goal { background: #6366f1; }
  .bar b { position: absolute; top: -2pt; bottom: -2pt; width: 1.5pt; background: #1a1f36; }
  .bar b.prev { background: #f59e0b; }
  .row { display: flex; justify-content: space-between; gap: 8pt; font-size: 9.5pt; }
  footer { margin-top: 18pt; padding-top: 6pt; border-top: 1pt solid #d9deef; font-size: 8.5pt; color: #6b7394; }
`

const section = (title: string, body: string): string =>
  `<section><h2>${esc(title)}</h2><div class="box">${body}</div></section>`
const note = (html: string): string => `<p class="note">${html}</p>`
const empty = (text: string): string => `<p class="note" style="margin:0">${esc(text)}</p>`

function table(
  heads: readonly string[],
  rows: readonly (readonly string[])[],
  /** Od kterého sloupce se zarovnává doprava. */
  rightFrom = 1
): string {
  const th = heads.map((h, i) => `<th${i >= rightFrom ? ' class="r"' : ''}>${esc(h)}</th>`).join('')
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells.map((c, i) => `<td${i >= rightFrom ? ' class="r"' : ''}>${c}</td>`).join('')}</tr>`
    )
    .join('')
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>`
}

/** Dvousloupcová tabulka „popisek – hodnota“; hodnota je už escapovaná. */
const kv = (rows: readonly (readonly [string, string, string?])[]): string =>
  `<table><tbody>${rows
    .map(
      ([label, value, cls]) =>
        `<tr><td>${esc(label)}</td><td class="r ${cls ?? ''}">${value}</td></tr>`
    )
    .join('')}</tbody></table>`

function kpi(title: string, value: string, sub = '', cls = ''): string {
  return `<div class="kpi"><div class="t">${esc(title)}</div><div class="v ${cls}">${esc(value)}</div>${
    sub ? `<div class="s">${esc(sub)}</div>` : ''
  }</div>`
}

/** Obrázek grafu; povolí se jen `data:image/…` (nic z vnějšku). */
function chartImg(src: string | undefined, label: string): string {
  return src && /^data:image\/(svg\+xml|png)[;,]/.test(src)
    ? `<img class="chart" src="${esc(src)}" alt="${esc(label)}">`
    : ''
}

// ---------------------------------------------------------------------------
// Sekce
// ---------------------------------------------------------------------------

function etfsSection(f: MonthArticleFacts): string {
  const isMonth = kindOf(f) === 'month'
  const etfTotal = f.etfs.reduce((s, e) => s + e.valueEnd, 0)
  const contribTotal = f.etfs.reduce((s, e) => s + e.contribution, 0)
  const rows = f.etfs.map((e) => [
    `<b>${esc(e.ticker)}</b>${e.estimated ? ' *' : ''}<span class="sub">${esc(e.name)}</span>`,
    esc(eur(e.valueEnd)),
    esc(formatPercent(e.weight, 1)),
    `<span class="${e.pct === null ? '' : tone(e.pct)}">${esc(e.pct === null ? '–' : formatPercent(e.pct, 1, true))}</span>`,
    `<span class="${tone(e.contribution)}">${esc(signed(e.contribution))}</span>`,
    `${e.bought > 0 ? esc(eur(e.bought)) : '—'}${e.sold > 0 ? `<span class="sub neg">prodej ${esc(eur(e.sold))}</span>` : ''}`
  ])
  rows.push([
    '<b>Celkem</b>',
    `<b>${esc(eur(etfTotal))}</b>`,
    '100 %',
    `<b class="${f.periodReturn === null ? '' : tone(f.periodReturn)}">${esc(pctOrDash(f.periodReturn))}</b>`,
    `<b class="${tone(contribTotal)}">${esc(signed(contribTotal))}</b>`,
    `<b>${esc(eur(f.bought))}</b>`
  ])
  const heads = [
    'ETF',
    'Hodnota',
    'Váha',
    isMonth ? 'Výkon v měsíci' : 'Výkon za období',
    'Příspěvek',
    'Nakoupeno'
  ]
  return section(
    'Jednotlivá ETF',
    table(heads, rows) +
      note(
        esc(
          'Příspěvek = o kolik ETF změnilo hodnotu portfolia bez vlivu nákupů a prodejů.' +
            (f.fees > 0 ? ` Poplatky ${eur(f.fees, 2)} nejsou u žádného ETF.` : '') +
            (Math.abs(f.valueEnd - etfTotal) >= 1
              ? ` Hotovost na účtech: ${eur(f.valueEnd - etfTotal)}.`
              : '')
        )
      )
  )
}

function purchasesSection(f: MonthArticleFacts): string {
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const isMonth = kind === 'month'
  const maxTrades = isMonth ? Infinity : 12
  const share = planShare(f)
  let body: string
  if (f.trades.length === 0) body = empty(`V ${w.loc} žádný obchod.`)
  else if (f.trades.length > maxTrades) {
    body = `<p>${esc(
      `V ${w.loc} proběhlo ${f.trades.length} obchodů, nákupy celkem ${eur(f.bought)}. Rozpis po měsících je v tabulce Po měsících.`
    )}</p>`
  } else {
    body = table(
      ['Datum', 'Broker', 'ETF', 'Částka'],
      f.trades.map((t) => [
        esc(shortDate(t.date)),
        esc(t.broker),
        `${esc(t.ticker)}${t.type === 'SELL' ? ' <span class="neg">prodej</span>' : ''}`,
        esc(eur(t.amount))
      ]),
      3
    )
  }
  const plan =
    share === null
      ? 'Měsíční plán (měsíční vklad) nastavíš na obrazovce Cíl.'
      : `${
          isMonth
            ? `Plán ${eur(f.planMonthly!)} / měsíc`
            : `Plán za ${w.nom} ${eur(planTotal(f)!)} (${f.periodMonths ?? 1} × ${eur(f.planMonthly!)})`
        } → splněno ${formatPercent(share, 0)}. Od začátku roku nakoupeno ${eur(f.boughtYtd)} z plánovaných ${eur(f.planMonthly! * f.monthsYtd)}.`
  return section('Nákupy vs. plán', body + note(esc(plan)))
}

function monthsSection(f: MonthArticleFacts): string {
  const { best, worst } = bestWorstMonth(f)
  const rows = (f.months ?? []).map((m) => [
    `${esc(formatMonthLong(m.month))}${m === best ? ' <span class="pos">▲</span>' : m === worst ? ' <span class="neg">▼</span>' : ''}`,
    `<span class="${tone(m.periodReturn ?? 0)}">${esc(pctOrDash(m.periodReturn))}</span>`,
    `<span class="${tone(m.marketChange)}">${esc(eur(m.marketChange))}</span>`,
    esc(eur(m.netDeposits)),
    m.bought > 0 ? esc(eur(m.bought)) : '—',
    esc(eur(m.valueEnd))
  ])
  return section(
    'Po měsících',
    table(['Měsíc', 'Výkon', 'Trh', 'Vloženo', 'Nakoupeno', 'Hodnota na konci'], rows) +
      note(
        'Výkon je bez vlivu vkladů, Trh = změna hodnoty bez vkladů. ▲ nejlepší, ▼ nejhorší měsíc.'
      )
  )
}

function benchmarkSection(f: MonthArticleFacts, d: MonthDetail): string {
  const b = d.benchmark
  const word = KIND_WORDS[kindOf(f)].nom
  const diff =
    b?.periodReturn != null && f.periodReturn !== null ? f.periodReturn - b.periodReturn : null
  const body = !b
    ? empty('Benchmark nemá stažené kurzy. Vybereš ho na obrazovce Výkon.')
    : table(
        ['', capital(word), 'Od začátku roku'],
        [
          [
            '<b>Moje portfolio</b>',
            `<span class="${tone(f.periodReturn ?? 0)}">${esc(pctOrDash(f.periodReturn))}</span>`,
            `<span class="${tone(f.ytdReturn ?? 0)}">${esc(pctOrDash(f.ytdReturn, 1))}</span>`
          ],
          [
            `${esc(b.ticker)}${b.name !== b.ticker ? `<span class="sub">${esc(b.name)}</span>` : ''}`,
            `<span class="${tone(b.periodReturn ?? 0)}">${esc(pctOrDash(b.periodReturn))}</span>`,
            `<span class="${tone(b.ytdReturn ?? 0)}">${esc(pctOrDash(b.ytdReturn, 1))}</span>`
          ]
        ]
      )
  return section(
    'Srovnání s trhem',
    body +
      note(
        `${diff !== null ? `Rozdíl za ${esc(word)}: <b class="${tone(diff)}">${esc(pp(diff, 2))}</b>. ` : ''}Benchmark = vývoj ceny jednoho ETF (vybereš ho na obrazovce Výkon).`
      )
  )
}

function riskSection(f: MonthArticleFacts, d: MonthDetail): string {
  const r = d.risk
  const dd = f.drawdown
  const mood =
    r.volatility !== null && r.volatilityTypical !== null
      ? r.volatility < r.volatilityTypical * 0.9
        ? 'Tento měsíc byl klidnější než obvykle.'
        : r.volatility > r.volatilityTypical * 1.1
          ? 'Tento měsíc byl rozkolísanější než obvykle.'
          : 'Kolísání bylo podobné jako obvykle.'
      : ''
  const day = (m: { date: string; pct: number } | null): string =>
    m ? esc(`${formatPercent(m.pct, 1, true)} (${shortDate(m.date)})`) : '–'
  return section(
    'Riziko',
    kv([
      [
        'Největší pokles',
        dd && dd.pct < 0
          ? esc(`${formatPercent(dd.pct, 1, true)} (${shortDate(dd.from)} → ${shortDate(dd.to)})`)
          : 'žádný',
        dd && dd.pct < 0 ? 'neg' : ''
      ],
      ['Nejhorší den', day(r.worstDay), r.worstDay ? 'neg' : ''],
      ['Nejlepší den', day(r.bestDay), r.bestDay ? 'pos' : ''],
      [
        'Kolísavost (roční přepočet)',
        esc(
          `${r.volatility === null ? '–' : formatPercent(r.volatility, 1)}${
            r.volatilityTypical !== null ? ` · běžně ${formatPercent(r.volatilityTypical, 1)}` : ''
          }`
        )
      ]
    ]) +
      note(
        esc(
          `Vše bez vlivu vkladů. Kolísavost = jak moc hodnota skáče nahoru a dolů; „běžně“ = za posledních 12 měsíců. ${mood}`.trim()
        )
      )
  )
}

function allocationSection(d: MonthDetail): string {
  const a = d.allocation
  if (!a) {
    return section(
      'Alokace vs. cílová alokace',
      empty('Cílovou alokaci nastavíš na obrazovce Alokace → Cílová alokace.')
    )
  }
  const buys = a.rows.filter((r) => r.buy >= 0.5).sort((x, y) => y.buy - x.buy)
  const bars = a.rows
    .map((r) => {
      const dev = r.share - r.target
      return (
        `<div class="row"><b>${esc(r.group)}</b><span>${esc(formatPercent(r.share, 1))} ` +
        `<span class="${Math.abs(dev) >= 0.02 ? 'warn' : 'meta'}">(cíl ${esc(formatPercent(r.target, 0))})</span></span></div>` +
        `<div class="bar"><i style="width:${Math.min(100, r.share * 100).toFixed(1)}%"></i>` +
        `<b style="left:${Math.min(100, r.target * 100).toFixed(1)}%"></b></div>`
      )
    })
    .join('')
  return section(
    'Alokace vs. cílová alokace',
    bars +
      note(
        esc(
          `Svislá čárka = cíl. ${
            buys.length > 0
              ? `Rozdělení dalšího nákupu ${eur(a.monthlyEur)} jen dokupováním: ${buys
                  .map((r) => `${r.group} ${eur(r.buy)}`)
                  .join(', ')}. `
              : ''
          }Nejde o investiční doporučení.`
        )
      )
  )
}

function goalSection(f: MonthArticleFacts, d: MonthDetail | undefined): string {
  const g = f.goal!
  const w = KIND_WORDS[kindOf(f)]
  const yearIn = (months: number): string => addMonths(f.asOf, months).slice(0, 4)
  const p = d?.projection
  const change =
    g.progressPrev === null
      ? ''
      : ` <span class="${tone(g.progress - g.progressPrev)}">(${g.progress >= g.progressPrev ? '+' : '-'}${esc(
          Math.abs((g.progress - g.progressPrev) * 100)
            .toFixed(1)
            .replace('.', ',')
        )} p. b.)</span>`
  let projection = ''
  if (p) {
    projection =
      p.months === null
        ? 'Při předpokladech z obrazovky Cíl se cíle do 50 let nedosáhne.'
        : `Při výnosu ${formatPercent(p.annualReturn, 1)} ročně a ${eur(p.monthlyEur)} měsíčně vychází dosažení cíle kolem roku ${yearIn(p.months)}${
            p.monthsLow !== null
              ? p.monthsHigh !== null
                ? ` (rozpětí ${yearIn(p.monthsLow)}–${yearIn(p.monthsHigh)} při výnosu ±3 p. b.)`
                : ` (nejdříve ${yearIn(p.monthsLow)})`
              : ''
          }. Je to odhad modelu, ne jistota.`
  }
  return section(
    `Cesta k cíli ${formatMoney(g.targetCzk, 'CZK', 0)}`,
    `<div class="row"><span><b>${esc(formatMoney(g.valueCzk, 'CZK', 0))}</b> z ${esc(formatMoney(g.targetCzk, 'CZK', 0))}</span>` +
      `<span><b>${esc(formatPercent(g.progress, 1))}</b>${change}</span></div>` +
      `<div class="bar"><i class="goal" style="width:${Math.min(100, g.progress * 100).toFixed(1)}%"></i>` +
      (g.progressPrev !== null
        ? `<b class="prev" style="left:${Math.min(100, g.progressPrev * 100).toFixed(1)}%"></b>`
        : '') +
      `</div>` +
      note(
        esc(
          `Oranžová čárka = stav na začátku ${w.gen}.${
            f.fxEnd !== null
              ? ` Přepočteno kurzem ČNB ${f.fxEnd.toFixed(3).replace('.', ',')} Kč/€.`
              : ''
          }`
        )
      ) +
      (projection ? `<p style="margin:6pt 0 0">${esc(projection)}</p>` : '')
  )
}

function yearReviewSection(f: MonthArticleFacts): string {
  const prevYear = String(Number(f.period.slice(0, 4)) - 1)
  const goal = f.goal
  const realized = f.realized ?? null
  const rows: [string, string, string?][] = [
    ['Výkon za rok (bez vkladů)', esc(pctOrDash(f.periodReturn)), tone(f.periodReturn ?? 0)],
    [
      `Výkon v roce ${prevYear}`,
      f.prevPeriodReturn == null ? 'bez dat' : esc(pctOrDash(f.prevPeriodReturn)),
      tone(f.prevPeriodReturn ?? 0)
    ],
    ['Nakoupeno za rok', esc(eur(f.bought))],
    [
      `Nakoupeno v roce ${prevYear}`,
      f.boughtPrevious === null ? 'bez dat' : esc(eur(f.boughtPrevious))
    ],
    ['Vloženo (vklady − výběry)', esc(eur(f.netDeposits))],
    ['Změna hodnoty trhem', esc(eur(f.marketChange)), tone(f.marketChange)]
  ]
  if (goal && goal.progressPrev !== null) {
    rows.push([
      'Posun k cíli za rok',
      esc(
        `${formatPercent(goal.progressPrev, 1)} → ${formatPercent(goal.progress, 1)} (${pp(goal.progress - goal.progressPrev, 1)})`
      ),
      tone(goal.progress - goal.progressPrev)
    ])
  }
  rows.push([
    'Prodeje',
    realized
      ? esc(
          `${realized.count}× za ${eur(realized.proceeds)}, realizovaný zisk ${eur(realized.gain)}`
        )
      : 'žádné'
  ])
  return section(
    'Rok v číslech',
    kv(rows) +
      note(
        esc(
          `Realizovaný zisk je jen informativní (FIFO jako na obrazovce Daně), neřeší výši daně.${
            realized && realized.exemptGain !== 0
              ? ` Z toho po časovém testu ${eur(realized.exemptGain)}.`
              : ''
          }`
        )
      )
  )
}

function fxSection(f: MonthArticleFacts): string {
  const ok = f.fxStart !== null && f.fxEnd !== null
  const effect = ok ? f.valueEnd * (f.fxEnd! - f.fxStart!) : 0
  const rate = (v: number): string => v.toFixed(3).replace('.', ',')
  const body = !ok
    ? empty('Kurz ČNB pro toto období není stažený.')
    : `<p style="margin:0">${esc(
        `Kurz ČNB se změnil z ${rate(f.fxStart!)} na ${rate(f.fxEnd!)} Kč/€ (${formatPercent(f.fxEnd! / f.fxStart! - 1, 1, true)}). V korunách to hodnotě portfolia ${effect >= 0 ? 'přidalo' : 'ubralo'} zhruba ${formatMoney(Math.abs(effect), 'CZK', 0)} navíc k výkonu investic.`
      )}</p>`
  return section('Vliv kurzu EUR/CZK', body + note('Odhad: hodnota na konci období × změna kurzu.'))
}

function taxesSection(d: MonthDetail): string {
  const t = d.timeTest
  if (!t) return section('Daně – časový test 3 roky', empty('Žádné otevřené nákupy.'))
  const intro = `Po časovém testu je ${eur(t.freeValue)} (${formatPercent(t.totalValue > 0 ? t.freeValue / t.totalValue : 0, 1)} portfolia). ${
    t.releasing.length === 0
      ? `Příští měsíc (${formatMonthLong(t.nextMonth)}) časový test nesplní žádný nákup.`
      : `Příští měsíc (${formatMonthLong(t.nextMonth)}) ho splní ${t.releasing.length}× nákup:`
  }`
  const rows =
    t.releasing.length > 0
      ? `<div style="margin-top:5pt">${table(
          ['ETF', 'Nákup', 'Volné od', 'Hodnota'],
          t.releasing.map((r) => [
            esc(r.ticker),
            esc(formatDate(r.buyDate)),
            esc(formatDate(r.freeFrom)),
            esc(eur(r.value))
          ]),
          3
        )}</div>`
      : ''
  return section(
    'Daně – časový test 3 roky',
    `<p style="margin:0">${esc(intro)}</p>${rows}` +
      note(
        esc(
          `Do konce roku ${t.nextMonth.slice(0, 4)} bude po testu ${formatPercent(t.freeShareYearEnd, 0)} portfolia (při dnešních cenách). Jen informativně, neřeší výši daně.`
        )
      )
  )
}

const bullets = (lines: readonly string[]): string =>
  `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`

/** Celý článek jako HTML pro tisk na A4 (bez skriptů a externích zdrojů). */
export function buildArticleHtml(article: SummaryArticle, opts: ArticlePdfOptions): string {
  const f = article.facts
  const d = f.detail
  const on = (s: SummarySection): boolean => opts.sections.includes(s)
  const kind = kindOf(f)
  const w = KIND_WORDS[kind]
  const isMonth = kind === 'month'
  const ai = article.ai
  const aiParts = AI_PARTS.filter((p) => (ai?.[p]?.length ?? 0) > 0)
  const highlights = ai?.highlights?.length ? ai.highlights : articleHighlights(f)
  const commentary = ai?.commentary?.length ? ai.commentary : articleCommentary(f)
  const outlook = ai?.outlook?.length ? ai.outlook : articleOutlook(f)
  const change = f.valueEnd - f.valueStart
  const missingDetail = !d && DETAIL_SECTIONS.some(on)

  const parts: string[] = []

  parts.push(
    `<h1>${esc(articleTitle(f))}</h1>` +
      `<div class="meta"><span class="tag sky">shrnutí za ${esc(w.nom)}</span> vytvořeno ${esc(formatDateTime(article.createdAt))} · ` +
      (isMonth ? '' : `${esc(formatDate(f.from))} – ${esc(formatDate(f.to))} · `) +
      `hodnoty k ${esc(formatDate(f.asOf))}${f.partial ? ' <span class="warn">(období ještě neskončilo)</span>' : ''}</div>` +
      `<div class="meta" style="margin-top:4pt">${
        aiParts.length > 0
          ? `<span class="tag">text: AI · čísla ověřena ✓</span> AI napsala: ${esc(aiParts.map((p) => AI_PART_LABELS[p]).join(', '))}`
          : '<span class="tag plain">text: šablona</span>'
      }</div>`
  )

  parts.push(`<section><div class="box hi"><h3>V kostce</h3>${bullets(highlights)}</div></section>`)

  parts.push(
    `<div class="kpis">` +
      kpi(
        'Hodnota',
        eur(f.valueEnd),
        f.valueEndCzk !== null ? `≈ ${formatMoney(f.valueEndCzk, 'CZK', 0)}` : ''
      ) +
      kpi(`Změna za ${w.nom}`, signed(change), 'včetně vkladů', tone(change)) +
      kpi(
        'Výkon (TTWROR)',
        f.periodReturn === null ? '–' : formatPercent(f.periodReturn, 2, true),
        'bez vlivu vkladů',
        f.periodReturn === null ? '' : tone(f.periodReturn)
      ) +
      kpi(
        'Nakoupeno',
        eur(f.bought),
        `${f.buyCount}× nákup${f.boughtPrevious !== null ? ` · předtím ${eur(f.boughtPrevious)}` : ''}`
      ) +
      `</div>`
  )

  if (missingDetail) {
    parts.push(
      `<p class="note warn">Tento článek vznikl ve starší verzi a nemá údaje pro detailní sekce (srovnání s trhem, riziko, alokace, časový test, výhled). V aplikaci je doplníš tlačítkem „Vytvořit znovu“.</p>`
    )
  }

  if (on('commentary')) {
    parts.push(section('Komentář', commentary.map((p) => `<p>${esc(p)}</p>`).join('')))
  }

  const course = on('course') ? chartImg(opts.charts?.course, 'Hodnota portfolia během období') : ''
  if (course) {
    parts.push(
      section(
        `Průběh ${w.gen}`,
        course +
          note(
            'Hodnota portfolia včetně nákupů. Zelené body = nákupy, červený pruh = největší pokles (bez vlivu vkladů).'
          )
      )
    )
  }

  const waterfall = on('waterfall')
    ? chartImg(opts.charts?.waterfall, 'Rozklad změny hodnoty portfolia')
    : ''
  if (waterfall) {
    parts.push(
      section(
        'Odkud se vzala změna',
        waterfall +
          note(
            esc(
              `Osa nezačíná nulou, aby byly rozdíly vidět.${
                f.fees > 0 ? ` Trh celkem = ${signed(f.marketChange)} (změna cen − poplatky).` : ''
              }`
            )
          )
      )
    )
  }

  if (on('etfs')) parts.push(etfsSection(f))
  if (on('purchases')) parts.push(purchasesSection(f))
  if (!isMonth && on('months')) parts.push(monthsSection(f))
  if (d && on('benchmark')) parts.push(benchmarkSection(f, d))
  if (d && on('risk')) parts.push(riskSection(f, d))
  if (d && on('allocation')) parts.push(allocationSection(d))
  if (on('goal') && f.goal) parts.push(goalSection(f, d))
  if (kind === 'year' && on('yearReview')) parts.push(yearReviewSection(f))
  if (on('fx')) parts.push(fxSection(f))
  if (d && on('taxes')) parts.push(taxesSection(d))
  if (d && on('outlook')) {
    parts.push(
      section(
        'Na co se dívat příští měsíc',
        bullets(outlook) +
          note('Shrnuto z plánu, cílové alokace a časového testu. Nejde o investiční doporučení.')
      )
    )
  }

  parts.push(
    `<footer>Čísla spočítala aplikace z transakcí a kurzů (Yahoo, ČNB) v den vytvoření článku a článek se už sám nemění. ${
      aiParts.length > 0
        ? esc(
            `Části textu (${aiParts.map((p) => AI_PART_LABELS[p]).join(', ')}) napsala umělá inteligence a každé číslo v nich se ověřilo proti výpočtu; zbytek textu je ze šablony.`
          )
        : 'Text je sestavený šablonou z vypočtených čísel.'
    } Nejde o finanční poradenství.</footer>`
  )

  return (
    `<!doctype html><html lang="cs"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">` +
    `<title>${esc(articleTitle(f))}</title><style>${STYLE}</style></head><body>` +
    parts.join('') +
    `</body></html>`
  )
}
