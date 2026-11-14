import { formatDate, formatMonthLong } from './date'
import { formatMoney, formatPercent, formatSignedMoney, type MoneyCurrency } from './money'

/** Data měsíčního reportu; sekce, které se nemají vypsat, jsou `undefined`. */
export interface ReportData {
  /** Měsíc reportu „RRRR-MM“. */
  month: string
  currency: MoneyCurrency
  /** Datum vytvoření (RRRR-MM-DD). */
  generatedAt: string
  /** Popis výběru, např. „všichni brokeři“ nebo „Freedom24“. */
  scope: string
  summary?: {
    asOf: string
    value: number
    invested: number
    profit: number
    profitPct: number | null
    irr: number | null
  }
  investments?: {
    byBroker: { name: string; total: number; buys: number }[]
    total: number
    buys: number
    previousMonthTotal: number | null
    average12: number | null
  }
  positions?: {
    rows: {
      ticker: string
      name: string
      shares: number
      value: number
      share: number
      unrealized: number
    }[]
    byIndex: { label: string; value: number; share: number }[]
    total: number
  }
  performance?: {
    total: { from: string; to: string; ttwror: number | null; irr: number | null } | null
    month: { from: string; to: string; ttwror: number | null; profit: number } | null
    years: { year: number; profit: number | null; ttwror: number | null; irr: number | null }[]
  }
}

/** Escapování textu do HTML – do reportu se dostávají názvy z dat uživatele. */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const STYLE = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font: 11pt/1.45 "Segoe UI", Arial, sans-serif; color: #1a1f36; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 2pt; }
  h2 { font-size: 12.5pt; margin: 20pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #6366f1; }
  .meta { color: #5b6485; font-size: 10pt; margin-bottom: 4pt; }
  .kpis { display: flex; gap: 8pt; margin: 6pt 0; }
  .kpi { flex: 1; border: 1pt solid #d9deef; border-radius: 6pt; padding: 7pt 9pt; }
  .kpi .t { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; color: #5b6485; }
  .kpi .v { font-size: 15pt; font-weight: 700; }
  .kpi .s { font-size: 9pt; color: #5b6485; }
  table { width: 100%; border-collapse: collapse; margin-top: 4pt; font-size: 10pt; }
  th { text-align: left; font-size: 8.5pt; text-transform: uppercase; color: #5b6485; border-bottom: 1pt solid #c4cbe3; padding: 3pt 4pt; }
  td { padding: 3.5pt 4pt; border-bottom: .5pt solid #e6e9f5; }
  .r { text-align: right; white-space: nowrap; }
  th.r { text-align: right; }
  .pos { color: #15803d; } .neg { color: #b91c1c; }
  tr.total td { font-weight: 700; border-top: 1pt solid #c4cbe3; border-bottom: 0; }
  .note { margin-top: 18pt; font-size: 8.5pt; color: #6b7394; }
`

const tone = (v: number): string => (v > 0 ? 'pos' : v < 0 ? 'neg' : '')

function kpi(title: string, value: string, sub = '', cls = ''): string {
  return `<div class="kpi"><div class="t">${esc(title)}</div><div class="v ${cls}">${esc(value)}</div>${
    sub ? `<div class="s">${esc(sub)}</div>` : ''
  }</div>`
}

/** Měsíční report jako samostatná HTML stránka pro tisk na A4 (bez skriptů a externích zdrojů). */
export function buildReportHtml(d: ReportData): string {
  const money = (v: number, digits = 0): string => formatMoney(v, d.currency, digits)
  const signed = (v: number, digits = 0): string => formatSignedMoney(v, d.currency, digits)
  const pct = (v: number | null, signedPct = false): string =>
    v === null ? '–' : formatPercent(v, 1, signedPct)
  const parts: string[] = []

  if (d.summary) {
    const s = d.summary
    parts.push(
      `<h2>Souhrn</h2><div class="kpis">` +
        kpi('Hodnota portfolia', money(s.value), `k ${formatDate(s.asOf)}`) +
        kpi('Vloženo', money(s.invested)) +
        kpi(
          'Zisk',
          signed(s.profit),
          s.profitPct === null
            ? ''
            : `${pct(s.profitPct, true)}${s.irr === null ? '' : ` · IRR ${pct(s.irr)} p.a.`}`,
          tone(s.profit)
        ) +
        `</div>`
    )
  }

  if (d.investments) {
    const i = d.investments
    const rows = i.byBroker
      .map(
        (b) =>
          `<tr><td>${esc(b.name)}</td><td class="r">${b.buys}</td><td class="r">${esc(money(b.total))}</td></tr>`
      )
      .join('')
    const compare: string[] = []
    if (i.previousMonthTotal !== null)
      compare.push(`předchozí měsíc ${money(i.previousMonthTotal)}`)
    if (i.average12 !== null) compare.push(`průměr za 12 měsíců ${money(i.average12)}`)
    parts.push(
      `<h2>Investice v měsíci ${esc(formatMonthLong(d.month))}</h2>` +
        (i.buys === 0
          ? `<p>V tomto měsíci nebyl proveden žádný nákup.</p>`
          : `<table><tr><th>Broker</th><th class="r">Nákupů</th><th class="r">Nakoupeno</th></tr>${rows}` +
            `<tr class="total"><td>Celkem</td><td class="r">${i.buys}</td><td class="r">${esc(money(i.total))}</td></tr></table>`) +
        (compare.length ? `<p class="meta">Pro srovnání: ${esc(compare.join(' · '))}.</p>` : '')
    )
  }

  if (d.positions) {
    const p = d.positions
    const rows = p.rows
      .map(
        (r) =>
          `<tr><td><b>${esc(r.ticker)}</b><br><span class="meta">${esc(r.name)}</span></td>` +
          `<td class="r">${esc(String(Math.round(r.shares * 1e4) / 1e4).replace('.', ','))}</td>` +
          `<td class="r">${esc(money(r.value))}</td><td class="r">${esc(pct(r.share))}</td>` +
          `<td class="r ${tone(r.unrealized)}">${esc(signed(r.unrealized))}</td></tr>`
      )
      .join('')
    const idx = p.byIndex
      .map(
        (r) =>
          `<tr><td>${esc(r.label)}</td><td class="r">${esc(money(r.value))}</td><td class="r">${esc(pct(r.share))}</td></tr>`
      )
      .join('')
    parts.push(
      `<h2>Pozice a alokace</h2>` +
        `<table><tr><th>ETF</th><th class="r">Kusy</th><th class="r">Hodnota</th><th class="r">Podíl</th><th class="r">Nerealizovaný zisk</th></tr>${rows}` +
        `<tr class="total"><td>Celkem</td><td></td><td class="r">${esc(money(p.total))}</td><td class="r">100 %</td><td></td></tr></table>` +
        `<p class="meta" style="margin-top:10pt">Podle indexu</p>` +
        `<table><tr><th>Index</th><th class="r">Hodnota</th><th class="r">Podíl</th></tr>${idx}</table>`
    )
  }

  if (d.performance) {
    const f = d.performance
    const kp: string[] = []
    if (f.month) {
      kp.push(
        kpi(
          `Výkon v měsíci`,
          pct(f.month.ttwror, true),
          `zisk ${signed(f.month.profit)} · ${formatDate(f.month.from)} – ${formatDate(f.month.to)}`,
          tone(f.month.ttwror ?? 0)
        )
      )
    }
    if (f.total) {
      kp.push(
        kpi(
          'TTWROR od začátku',
          pct(f.total.ttwror, true),
          `${formatDate(f.total.from)} – ${formatDate(f.total.to)}`
        ),
        kpi('IRR p.a.', pct(f.total.irr), 'peněžně vážený')
      )
    }
    const years = f.years
      .map(
        (y) =>
          `<tr><td>${y.year}</td><td class="r ${tone(y.profit ?? 0)}">${y.profit === null ? '–' : esc(signed(y.profit))}</td>` +
          `<td class="r">${esc(pct(y.ttwror, true))}</td><td class="r">${esc(pct(y.irr))}</td></tr>`
      )
      .join('')
    parts.push(
      `<h2>Výkon</h2><div class="kpis">${kp.join('')}</div>` +
        (years
          ? `<table><tr><th>Rok</th><th class="r">Zisk</th><th class="r">TTWROR</th><th class="r">IRR p.a.</th></tr>${years}</table>`
          : '')
    )
  }

  return (
    `<!doctype html><html lang="cs"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">` +
    `<title>Měsíční report ${esc(formatMonthLong(d.month))}</title><style>${STYLE}</style></head><body>` +
    `<h1>Měsíční report – ${esc(formatMonthLong(d.month))}</h1>` +
    `<div class="meta">Portfolio Tracker · ${esc(d.scope)} · měna ${d.currency === 'CZK' ? 'Kč' : 'EUR'} · vytvořeno ${esc(formatDate(d.generatedAt))}</div>` +
    parts.join('') +
    `<p class="note">Informativní přehled vytvořený z tvých dat a stažených kurzů; nejde o daňové ani investiční poradenství.</p>` +
    `</body></html>`
  )
}
