import { describe, expect, it } from 'vitest'
import { addDays, formatDateTime } from '../date'
import { cnbYearUrl, parseCnbYear } from './cnb'
import { latestQuote, mergePoints } from './series'
import { parseYahooChart, parseYahooDividends, yahooChartUrl, yahooDividendsUrl } from './yahoo'

/** Zkrácená skutečná odpověď Yahoo Finance pro SXR8.DE (Xetra, CET = +3600 s). */
const yahooSample = {
  chart: {
    result: [
      {
        meta: {
          currency: 'EUR',
          symbol: 'SXR8.DE',
          gmtoffset: 3600,
          regularMarketPrice: 745.44,
          regularMarketTime: 1794501349
        },
        timestamp: [1762329600, 1762416000, 1762502400, 1762761600],
        indicators: {
          quote: [{ close: [634.0800170898438, null, 614.1400146484375, 627.47998046875] }]
        }
      }
    ],
    error: null
  }
}

describe('parseYahooChart', () => {
  it('převede svíčky na dvojice [datum, kurz] a vynechá dny bez obchodování', () => {
    const s = parseYahooChart(yahooSample)
    expect(s.currency).toBe('EUR')
    expect(s.points).toEqual([
      ['2025-11-05', 634.0800170898438],
      ['2025-11-07', 614.1400146484375],
      ['2025-11-10', 627.47998046875]
    ])
  })

  it('vrátí poslední kotovaný kurz s časem burzy', () => {
    const s = parseYahooChart(yahooSample)
    expect(s.quote).toEqual({ price: 745.44, time: '2026-11-12T16:35:49.000Z' })
  })

  it('časová značka = otevření burzy → datum se nesmí posunout přes půlnoc', () => {
    // 2025-07-14 07:00 UTC (9:00 CEST, +7200 s) i 2025-12-01 08:00 UTC (9:00 CET, +3600 s)
    const s = parseYahooChart({
      chart: {
        result: [
          {
            meta: { currency: 'EUR', gmtoffset: 7200 },
            timestamp: [Date.UTC(2025, 6, 14, 7) / 1000, Date.UTC(2025, 11, 1, 8) / 1000],
            indicators: { quote: [{ close: [100, 101] }] }
          }
        ]
      }
    })
    expect(s.points.map((p) => p[0])).toEqual(['2025-07-14', '2025-12-01'])
  })

  it('bez ceny v meta je quote null; nulové a záporné kurzy se ignorují', () => {
    const s = parseYahooChart({
      chart: {
        result: [
          {
            meta: { currency: 'EUR', gmtoffset: 0 },
            timestamp: [1762329600, 1762416000],
            indicators: { quote: [{ close: [0, -5] }] }
          }
        ]
      }
    })
    expect(s.quote).toBeNull()
    expect(s.points).toEqual([])
  })

  it('chyba „ticker nenalezen“ vrátí srozumitelnou zprávu', () => {
    expect(() =>
      parseYahooChart({
        chart: {
          result: null,
          error: { code: 'Not Found', description: 'No data found, symbol may be delisted' }
        }
      })
    ).toThrow('No data found')
  })

  it('nesmyslná odpověď → chyba, ne pád', () => {
    expect(() => parseYahooChart({ ahoj: 1 })).toThrow(/Neočekávaná odpověď/)
    expect(() => parseYahooChart(null)).toThrow()
  })
})

describe('yahooChartUrl', () => {
  it('sestaví adresu s obdobím a escapuje ticker', () => {
    const url = yahooChartUrl('SXR8.DE', '2018-10-01', new Date('2026-11-12T10:00:00Z'))
    expect(url).toContain('/v8/finance/chart/SXR8.DE?')
    expect(url).toContain('period1=1538352000')
    expect(url).toContain('interval=1d')
    expect(yahooChartUrl('A B', '2020-01-01', new Date())).toContain('/chart/A%20B?')
  })
})

/** Zkrácený roční soubor ČNB – ve verzi pro 2026 chybí BGN, EUR je proto na jiné pozici. */
const cnb2025 =
  'Date|1 AUD|1 BGN|1 EUR|100 HUF\n02.01.2025|15.145|12.872|25.175|6.097\n03.01.2025|15.195|12.861|25.155|6.064\n'
const cnb2026 =
  'Date|1 AUD|1 EUR|100 HUF\n10.11.2026|14.981|24.335|6.704\n12.11.2026|15.011|24.385|6.674\n'

describe('parseCnbYear', () => {
  it('najde sloupec EUR podle názvu, ne podle pozice (v 2025 i 2026)', () => {
    expect(parseCnbYear(cnb2025, 'EUR')).toEqual([
      ['2025-01-02', 25.175],
      ['2025-01-03', 25.155]
    ])
    expect(parseCnbYear(cnb2026, 'EUR')).toEqual([
      ['2026-11-10', 24.335],
      ['2026-11-12', 24.385]
    ])
  })

  it('přepočítá kurz na 1 jednotku (100 HUF)', () => {
    expect(parseCnbYear(cnb2026, 'HUF')[0]).toEqual(['2026-11-10', 0.06704])
  })

  it('chybějící měna a prázdný soubor jsou chyby', () => {
    expect(() => parseCnbYear(cnb2026, 'USD')).toThrow(/chybí měna USD/)
    expect(() => parseCnbYear('', 'EUR')).toThrow()
  })

  it('přeskočí poškozené řádky a zvládne CRLF', () => {
    const text =
      'Date|1 EUR\r\n02.01.2025|25,175\r\nneplatný řádek\r\n03.01.2025|\r\n04.01.2025|25.1\r\n'
    expect(parseCnbYear(text, 'EUR')).toEqual([
      ['2025-01-02', 25.175],
      ['2025-01-04', 25.1]
    ])
  })

  it('adresa obsahuje rok', () => {
    expect(cnbYearUrl(2026)).toMatch(/year\.txt\?year=2026$/)
  })
})

describe('mergePoints', () => {
  it('nové body přepíšou staré a výsledek je seřazený bez duplicit', () => {
    const merged = mergePoints(
      [
        ['2025-01-01', 1],
        ['2025-01-03', 3]
      ],
      [
        ['2025-01-03', 3.5],
        ['2025-01-02', 2]
      ]
    )
    expect(merged).toEqual([
      ['2025-01-01', 1],
      ['2025-01-02', 2],
      ['2025-01-03', 3.5]
    ])
  })
})

describe('latestQuote', () => {
  it('poslední kurz a změna proti předchozímu dni', () => {
    const q = latestQuote({
      prices: [
        ['2026-11-11', 100],
        ['2026-11-12', 102]
      ]
    })
    expect(q).toMatchObject({ price: 102, date: '2026-11-12', previousPrice: 100 })
    expect(q!.changePct).toBeCloseTo(2, 10)
  })

  it('jediný bod nebo žádná data', () => {
    expect(latestQuote({ prices: [['2026-11-12', 5]] })!.changePct).toBeNull()
    expect(latestQuote({ prices: [] })).toBeNull()
    expect(latestQuote(undefined)).toBeNull()
  })
})

describe('datum', () => {
  it('addDays přes hranice měsíce a roku', () => {
    expect(addDays('2026-01-05', -10)).toBe('2025-12-26')
    expect(addDays('2026-02-27', 2)).toBe('2026-03-01')
  })

  it('formatDateTime v místním čase', () => {
    expect(formatDateTime(new Date(2026, 10, 12, 7, 5).toISOString())).toBe('12. 11. 2026 07:05')
  })
})

describe('parseYahooDividends', () => {
  it('převede výplaty na data burzy, sečte výplaty ve stejný den a seřadí', () => {
    const json = {
      chart: {
        result: [
          {
            meta: { currency: 'USD', gmtoffset: -14400, regularMarketPrice: 35.9 },
            events: {
              dividends: {
                x: { amount: 0.267, date: Date.UTC(2026, 8, 23, 13, 30) / 1000 },
                y: { amount: 0.253, date: Date.UTC(2026, 5, 24, 13, 30) / 1000 },
                z: { amount: 0, date: Date.UTC(2026, 2, 25, 13, 30) / 1000 }
              }
            }
          }
        ],
        error: null
      }
    }
    expect(parseYahooDividends(json)).toEqual({
      currency: 'USD',
      price: 35.9,
      events: [
        ['2026-06-24', 0.253],
        ['2026-09-23', 0.267]
      ],
      adjMonthly: []
    })
  })

  it('měsíční kurzy upravené o dividendy (adjclose), prázdné hodnoty vynechá', () => {
    const t = (m: number): number => Date.UTC(2026, m, 1, 4) / 1000
    const json = {
      chart: {
        result: [
          {
            meta: { currency: 'USD', gmtoffset: -14400, regularMarketPrice: 36 },
            timestamp: [t(1), t(0), t(2)],
            indicators: { adjclose: [{ adjclose: [31, 30, null] }] }
          }
        ],
        error: null
      }
    }
    expect(parseYahooDividends(json).adjMonthly).toEqual([
      ['2026-01-01', 30],
      ['2026-02-01', 31]
    ])
  })

  it('bez dividend prázdný seznam; chyba Yahoo → výjimka', () => {
    expect(
      parseYahooDividends({ chart: { result: [{ meta: { currency: 'EUR' } }], error: null } })
    ).toEqual({ currency: 'EUR', price: null, events: [], adjMonthly: [] })
    expect(() =>
      parseYahooDividends({ chart: { result: null, error: { description: 'No data found' } } })
    ).toThrow('No data found')
    expect(yahooDividendsUrl('SCHD', new Date('2026-11-13T00:00:00Z'))).toContain(
      '/chart/SCHD?period1=1262304000&'
    )
  })
})
