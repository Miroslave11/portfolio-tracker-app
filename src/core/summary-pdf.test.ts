import { describe, expect, it } from 'vitest'
import {
  monthArticleFactsSchema,
  SUMMARY_SECTIONS,
  summaryArticleSchema,
  type SummaryArticle,
  type SummarySection
} from '../shared/summary'
import { buildArticleHtml } from './summary-pdf'

const DETAIL = {
  benchmark: { ticker: 'EUNL.DE', name: 'MSCI World', periodReturn: 0.04, ytdReturn: 0.07 },
  risk: {
    worstDay: { date: '2026-10-12', pct: -0.012 },
    bestDay: { date: '2026-10-20', pct: 0.015 },
    volatility: 0.1,
    volatilityTypical: 0.14
  },
  allocation: {
    rows: [
      { group: 'MSCI World', share: 0.7, target: 0.6, buy: 0 },
      { group: 'S&P 500', share: 0.3, target: 0.4, buy: 500 }
    ],
    monthlyEur: 500,
    monthsToTarget: 4
  },
  projection: { annualReturn: 0.07, monthlyEur: 500, months: 120, monthsLow: 100, monthsHigh: 150 },
  timeTest: {
    totalValue: 1575,
    freeValue: 300,
    nextMonth: '2026-11',
    releasing: [{ ticker: 'EUNL', buyDate: '2023-11-03', freeFrom: '2026-11-04', value: 200 }],
    freeShareYearEnd: 0.25
  }
}

const BASE = {
  period: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  asOf: '2026-10-31',
  partial: false,
  valueStart: 1000,
  valueEnd: 1575,
  valueEndCzk: 38_000,
  fxStart: 24.5,
  fxEnd: 24.1,
  netDeposits: 500,
  marketChange: 75,
  priceChange: 75,
  dividends: 0,
  fees: 0,
  periodReturn: 0.05,
  ytdReturn: 0.08,
  drawdown: null,
  bought: 500,
  buyCount: 1,
  boughtPrevious: 400,
  planMonthly: 500,
  boughtYtd: 3000,
  monthsYtd: 10,
  daily: [],
  trades: [
    { date: '2026-10-05', type: 'BUY', broker: 'Freedom24', ticker: 'EUNL', amount: 500, shares: 5 }
  ],
  dividendList: [],
  dividendsYtd: 0,
  dividends12m: 0,
  etfs: [
    {
      ticker: 'EUNL',
      name: 'iShares <MSCI> World',
      valueStart: 1000,
      valueEnd: 1575,
      weight: 1,
      bought: 500,
      sold: 0,
      dividends: 0,
      contribution: 75,
      pct: 0.05,
      estimated: false
    }
  ],
  goal: { targetCzk: 5_000_000, valueCzk: 38_000, progress: 0.0076, progressPrev: 0.004 }
}

function article(extra: Record<string, unknown> = {}, withDetail = true): SummaryArticle {
  const kind = (extra['kind'] as string | undefined) ?? 'month'
  return summaryArticleSchema.parse({
    id: `${kind}-${(extra['period'] as string | undefined) ?? '2026-10'}`,
    kind,
    period: (extra['period'] as string | undefined) ?? '2026-10',
    createdAt: '2026-11-01T08:00:00.000Z',
    facts: monthArticleFactsSchema.parse({
      ...BASE,
      ...extra,
      ...(withDetail ? { detail: DETAIL } : {})
    })
  })
}

const IMG = 'data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E'
const ALL: readonly SummarySection[] = SUMMARY_SECTIONS

describe('buildArticleHtml', () => {
  it('měsíční článek: nadpis, V kostce, čísla a vybrané sekce', () => {
    const html = buildArticleHtml(article(), {
      sections: ALL,
      charts: { course: IMG, waterfall: IMG }
    })
    expect(html).toContain('<h1>Říjen 2026</h1>')
    expect(html).toContain('V kostce')
    expect(html).toContain('text: šablona')
    for (const h of [
      'Komentář',
      'Jednotlivá ETF',
      'Nákupy vs. plán',
      'Srovnání s trhem',
      'Riziko',
      'Alokace vs. cílová alokace',
      'Cesta k cíli',
      'Vliv kurzu EUR/CZK',
      'Daně – časový test 3 roky',
      'Na co se dívat příští měsíc',
      'Odkud se vzala změna'
    ]) {
      expect(html).toContain(h)
    }
    // U měsíce není tabulka po měsících ani Rok v číslech
    expect(html).not.toContain('Po měsících')
    expect(html).not.toContain('Rok v číslech')
    expect(html.match(/<img /g)).toHaveLength(2)
  })

  it('rozsah: vynechá sekce, které nejsou zapnuté', () => {
    const html = buildArticleHtml(article(), {
      sections: ['etfs', 'goal'],
      charts: { course: IMG, waterfall: IMG }
    })
    expect(html).toContain('Jednotlivá ETF')
    expect(html).toContain('Cesta k cíli')
    for (const h of ['Komentář', 'Riziko', 'Srovnání s trhem', 'Nákupy vs. plán', '<img ']) {
      expect(html).not.toContain(h)
    }
    // „V kostce“ a hlavní čísla jsou vždy
    expect(html).toContain('V kostce')
    expect(html).toContain('Výkon (TTWROR)')
  })

  it('text z AI i názvy z dat se escapují, nic se nespustí', () => {
    const a = article()
    a.ai = {
      model: 'm',
      createdAt: '2026-11-01T09:00:00.000Z',
      highlights: ['<script>alert(1)</script> hodnota 1 575 €', '<b>tučně</b>'],
      commentary: ['Odstavec s "uvozovkami" & <i>tagem</i>.'],
      outlook: ['<img src=x onerror=alert(1)>'],
      rejected: []
    }
    const html = buildArticleHtml(a, { sections: ALL })
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&quot;uvozovkami&quot; &amp; &lt;i&gt;tagem&lt;/i&gt;')
    // název ETF z dat uživatele
    expect(html).toContain('iShares &lt;MSCI&gt; World')
    expect(html).toContain('text: AI · čísla ověřena ✓')
    expect(html).toContain('AI napsala: V kostce, Komentář, Výhled')
  })

  it('grafy: jen data:image, jakýkoli jiný zdroj se nevloží', () => {
    const opts = { sections: ['course', 'waterfall'] as SummarySection[] }
    const bad = buildArticleHtml(article(), {
      ...opts,
      charts: { course: 'https://example.com/x.png', waterfall: 'javascript:alert(1)' }
    })
    expect(bad).not.toContain('example.com')
    expect(bad).not.toContain('javascript:')
    expect(bad).not.toContain('<img ')
    const good = buildArticleHtml(article(), { ...opts, charts: { course: IMG } })
    expect(good.match(/<img /g)).toHaveLength(1)
    expect(good).toContain(`src="${IMG}"`)
  })

  it('stránka nemá skripty ani vnější zdroje (CSP povolí jen vložené obrázky)', () => {
    const html = buildArticleHtml(article(), { sections: ALL, charts: { course: IMG } })
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('img-src data:')
    expect(html).not.toMatch(/<script|<link|https?:\/\//)
  })

  it('kvartál: tabulka po měsících s nejlepším a nejhorším měsícem', () => {
    const months = [
      {
        month: '2026-07',
        valueEnd: 1100,
        netDeposits: 500,
        marketChange: 20,
        periodReturn: 0.02,
        bought: 500
      },
      {
        month: '2026-08',
        valueEnd: 1700,
        netDeposits: 500,
        marketChange: -10,
        periodReturn: -0.01,
        bought: 0
      },
      {
        month: '2026-09',
        valueEnd: 2300,
        netDeposits: 500,
        marketChange: 100,
        periodReturn: 0.05,
        bought: 500
      }
    ]
    const html = buildArticleHtml(
      article({ kind: 'quarter', period: '2026-Q3', periodMonths: 3, months }),
      { sections: ALL }
    )
    expect(html).toContain('3. kvartál 2026')
    expect(html).toContain('Po měsících')
    expect(html).toContain('<span class="pos">▲</span>')
    expect(html).toContain('<span class="neg">▼</span>')
    expect(html).not.toContain('Rok v číslech')
  })

  it('rok: Rok v číslech s prodeji a posunem k cíli', () => {
    const html = buildArticleHtml(
      article({
        kind: 'year',
        period: '2026',
        periodMonths: 12,
        months: [],
        prevPeriodReturn: 0.06,
        realized: { count: 2, proceeds: 3000, gain: 400, exemptGain: 100 }
      }),
      { sections: ALL }
    )
    expect(html).toContain('<h1>Rok 2026</h1>')
    expect(html).toContain('Rok v číslech')
    expect(html).toContain('2× za')
    expect(html).toContain('Z toho po časovém testu')
    expect(html).toContain('Posun k cíli za rok')
  })

  it('starší článek bez detailu: sekce z detailu se vynechají a ukáže se poznámka', () => {
    const html = buildArticleHtml(article({}, false), { sections: ALL })
    expect(html).toContain('vznikl ve starší verzi')
    for (const h of [
      'Srovnání s trhem',
      'Riziko',
      'Alokace vs.',
      'Daně – časový test',
      'Na co se dívat'
    ]) {
      expect(html).not.toContain(h)
    }
    expect(html).toContain('Jednotlivá ETF')
  })

  it('chybějící údaje (bez benchmarku, cílů a kurzu) = sekce s poznámkou, ne chyba', () => {
    const a = article({ fxStart: null, fxEnd: null, goal: null })
    a.facts.detail = {
      ...DETAIL,
      benchmark: null,
      allocation: null,
      timeTest: null,
      projection: null
    }
    const html = buildArticleHtml(a, { sections: ALL })
    expect(html).toContain('Benchmark nemá stažené kurzy')
    expect(html).toContain('Cílovou alokaci nastavíš')
    expect(html).toContain('Žádné otevřené nákupy')
    expect(html).toContain('Kurz ČNB pro toto období není stažený')
    expect(html).not.toContain('Cesta k cíli')
  })
})
