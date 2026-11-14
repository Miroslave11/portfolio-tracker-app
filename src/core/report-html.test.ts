import { describe, expect, it } from 'vitest'
import { buildReportHtml, esc, type ReportData } from './report-html'

const base: ReportData = {
  month: '2026-10',
  currency: 'EUR',
  generatedAt: '2026-11-13',
  scope: 'všichni brokeři',
  summary: {
    asOf: '2026-11-13',
    value: 83_000,
    invested: 62_000,
    profit: 21_000,
    profitPct: 0.3387,
    irr: 0.133
  },
  investments: {
    byBroker: [
      { name: 'XTB', total: 1000, buys: 2 },
      { name: 'Freedom24', total: 500, buys: 1 }
    ],
    total: 1500,
    buys: 3,
    previousMonthTotal: 1400,
    average12: 1450
  },
  positions: {
    rows: [
      {
        ticker: 'EUNL.DE',
        name: 'iShares <b>Core</b> MSCI World',
        shares: 10.123456,
        value: 1000,
        share: 1,
        unrealized: 200
      }
    ],
    byIndex: [{ label: 'MSCI World', value: 1000, share: 1 }],
    total: 1000
  },
  performance: {
    total: { from: '2018-10-01', to: '2026-11-13', ttwror: 1.866, irr: 0.133 },
    month: { from: '2026-10-01', to: '2026-10-31', ttwror: 0.021, profit: 1500 },
    years: [{ year: 2025, profit: 5000, ttwror: 0.12, irr: 0.11 }]
  }
}

describe('esc', () => {
  it('escapuje HTML znaky', () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;'
    )
  })
})

describe('buildReportHtml', () => {
  it('obsahuje všechny sekce, měsíc česky a hodnoty ve formátu aplikace', () => {
    const html = buildReportHtml(base)
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('Měsíční report – říjen 2026')
    for (const h of ['Souhrn', 'Investice v měsíci říjen 2026', 'Pozice a alokace', 'Výkon']) {
      expect(html).toContain(`<h2>${h}</h2>`)
    }
    expect(html).toContain('XTB')
    expect(html).toContain('Freedom24')
    expect(html).toContain('13. 11. 2026')
    expect(html).toContain('předchozí měsíc')
    expect(html).toMatch(/83\s000\s€/)
  })

  it('názvy z dat se escapují a nejsou tam žádné skripty ani vnější zdroje', () => {
    const html = buildReportHtml(base)
    expect(html).toContain('iShares &lt;b&gt;Core&lt;/b&gt; MSCI World')
    expect(html).not.toContain('<b>Core</b>')
    expect(html).not.toMatch(/<script|<link|<img|<iframe|src=|href=/i)
    expect(html).toContain("default-src 'none'")
  })

  it('vynechané sekce se nevypíšou; měsíc bez nákupu to řekne', () => {
    const html = buildReportHtml({
      ...base,
      summary: undefined,
      positions: undefined,
      performance: undefined,
      investments: { ...base.investments!, buys: 0, total: 0, byBroker: [] }
    })
    expect(html).not.toContain('<h2>Souhrn</h2>')
    expect(html).not.toContain('Pozice a alokace')
    expect(html).not.toContain('<h2>Výkon</h2>')
    expect(html).toContain('nebyl proveden žádný nákup')
  })

  it('měna Kč se promítne do záhlaví i částek', () => {
    const html = buildReportHtml({ ...base, currency: 'CZK' })
    expect(html).toContain('měna Kč')
    expect(html).toMatch(/83\s000\sKč/)
  })
})
