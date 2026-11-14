import { z } from 'zod'
import type { PricePoint } from '../../shared/prices'

const chartSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string(),
            gmtoffset: z.number().default(0),
            regularMarketPrice: z.number().optional(),
            regularMarketTime: z.number().optional()
          }),
          timestamp: z.array(z.number()).optional(),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()).optional() }))
          })
        })
      )
      .nullable(),
    error: z
      .object({ code: z.string().optional(), description: z.string().optional() })
      .nullable()
      .optional()
  })
})

export interface YahooSeries {
  currency: string
  points: PricePoint[]
  quote: { price: number; time: string } | null
}

/** Neoficiální chart API Yahoo Finance: denní svíčky od `fromIso` do `to`. */
export function yahooChartUrl(ticker: string, fromIso: string, to: Date): string {
  const period1 = Math.floor(Date.parse(`${fromIso}T00:00:00Z`) / 1000)
  const period2 = Math.floor(to.getTime() / 1000) + 86_400
  return (
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history`
  )
}

/** Datum obchodního dne podle časové zóny burzy (časová značka je čas otevření burzy). */
function exchangeDate(timestamp: number, gmtOffsetSeconds: number): string {
  return new Date((timestamp + gmtOffsetSeconds) * 1000).toISOString().slice(0, 10)
}

/** Převede odpověď Yahoo Finance na denní závěrečné kurzy. Dny bez obchodování se vynechají. */
export function parseYahooChart(json: unknown): YahooSeries {
  const parsed = chartSchema.safeParse(json)
  if (!parsed.success) throw new Error('Neočekávaná odpověď z Yahoo Finance')
  const { result, error } = parsed.data.chart
  if (!result || result.length === 0) {
    throw new Error(error?.description ?? 'Yahoo Finance nevrátil žádná data')
  }

  const r = result[0]
  const timestamps = r.timestamp ?? []
  const closes = r.indicators.quote[0]?.close ?? []
  const byDate = new Map<string, number>()
  for (let i = 0; i < Math.min(timestamps.length, closes.length); i++) {
    const close = closes[i]
    if (close === null || !(close > 0)) continue
    byDate.set(exchangeDate(timestamps[i], r.meta.gmtoffset), close)
  }
  const points = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))

  const { regularMarketPrice: price, regularMarketTime: time } = r.meta
  return {
    currency: r.meta.currency,
    points,
    quote:
      price !== undefined && price > 0 && time !== undefined
        ? { price, time: new Date(time * 1000).toISOString() }
        : null
  }
}

const dividendsSchema = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string(),
            gmtoffset: z.number().default(0),
            regularMarketPrice: z.number().optional()
          }),
          timestamp: z.array(z.number()).optional(),
          indicators: z
            .object({
              adjclose: z
                .array(z.object({ adjclose: z.array(z.number().nullable()).optional() }))
                .optional()
            })
            .optional(),
          events: z
            .object({
              dividends: z
                .record(z.string(), z.object({ amount: z.number(), date: z.number() }))
                .optional()
            })
            .optional()
        })
      )
      .nullable(),
    error: z
      .object({ code: z.string().optional(), description: z.string().optional() })
      .nullable()
      .optional()
  })
})

export interface YahooDividends {
  currency: string
  /** Aktuální kurz (pro dividendový výnos); `null`, když ho Yahoo nevrátí. */
  price: number | null
  /** Výplaty [ex-date, částka na kus], vzestupně. */
  events: [string, number][]
  /**
   * Měsíční kurzy upravené o dividendy (adjclose) – pro skutečný celkový výnos fondu.
   * [datum začátku měsíce, kurz], vzestupně.
   */
  adjMonthly: [string, number][]
}

/** Historie výplat dividend (měsíční interval, od roku 2010 – stačí na růst za 10 let). */
export function yahooDividendsUrl(ticker: string, to: Date): string {
  const period1 = Math.floor(Date.parse('2010-01-01T00:00:00Z') / 1000)
  const period2 = Math.floor(to.getTime() / 1000) + 86_400
  return (
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1mo&events=div`
  )
}

export function parseYahooDividends(json: unknown): YahooDividends {
  const parsed = dividendsSchema.safeParse(json)
  if (!parsed.success) throw new Error('Neočekávaná odpověď z Yahoo Finance')
  const { result, error } = parsed.data.chart
  if (!result || result.length === 0) {
    throw new Error(error?.description ?? 'Yahoo Finance nevrátil žádná data')
  }
  const r = result[0]
  const byDate = new Map<string, number>()
  for (const d of Object.values(r.events?.dividends ?? {})) {
    if (!(d.amount > 0)) continue
    const date = exchangeDate(d.date, r.meta.gmtoffset)
    byDate.set(date, (byDate.get(date) ?? 0) + d.amount)
  }
  const adj = new Map<string, number>()
  const ts = r.timestamp ?? []
  const closes = r.indicators?.adjclose?.[0]?.adjclose ?? []
  for (let i = 0; i < Math.min(ts.length, closes.length); i++) {
    const v = closes[i]
    if (v === null || !(v > 0)) continue
    adj.set(exchangeDate(ts[i], r.meta.gmtoffset), v)
  }
  const price = r.meta.regularMarketPrice
  return {
    currency: r.meta.currency,
    price: price !== undefined && price > 0 ? price : null,
    events: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)),
    adjMonthly: [...adj.entries()].sort(([a], [b]) => a.localeCompare(b))
  }
}
