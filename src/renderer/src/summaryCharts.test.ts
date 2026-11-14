import { describe, expect, it } from 'vitest'
import { monthArticleFactsSchema } from '../../shared/summary'
import { articleChartImages } from './summaryCharts'

const facts = monthArticleFactsSchema.parse({
  period: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  asOf: '2026-10-31',
  partial: false,
  valueStart: 1000,
  valueEnd: 1575,
  valueEndCzk: null,
  fxStart: null,
  fxEnd: null,
  netDeposits: 500,
  marketChange: 75,
  priceChange: 75,
  dividends: 0,
  fees: 2,
  periodReturn: 0.05,
  ytdReturn: null,
  drawdown: { pct: -0.03, from: '2026-10-10', to: '2026-10-14' },
  bought: 500,
  buyCount: 1,
  boughtPrevious: null,
  planMonthly: null,
  boughtYtd: 500,
  monthsYtd: 10,
  daily: [
    ['2026-10-01', 1000],
    ['2026-10-05', 1500],
    ['2026-10-14', 1450],
    ['2026-10-31', 1575]
  ],
  trades: [
    { date: '2026-10-05', type: 'BUY', broker: 'F24', ticker: 'EUNL', amount: 500, shares: 5 }
  ],
  dividendList: [],
  dividendsYtd: 0,
  dividends12m: 0,
  etfs: [],
  goal: null
})

describe('articleChartImages', () => {
  it('vykreslí oba grafy jako SVG obrázky bez okna (pro PDF)', () => {
    const { course, waterfall } = articleChartImages(facts)
    for (const uri of [course, waterfall]) {
      expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true)
      const svg = decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    }
    // Rozklad změny má popisky sloupců
    const waterfallSvg = decodeURIComponent(waterfall.slice(waterfall.indexOf(',') + 1))
    expect(waterfallSvg).toContain('Změna cen')
    expect(waterfallSvg).toContain('Poplatky')
  })
})
