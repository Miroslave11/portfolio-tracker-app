import { z } from 'zod'

const pricePoint = z.tuple([z.iso.date(), z.number().positive().finite()])
export type PricePoint = z.infer<typeof pricePoint>

/** Denní závěrečné kurzy jednoho ETF (z burzy, kde se obchoduje). */
export const priceSeriesSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  /** Kdy se kurzy naposledy úspěšně stáhly (ISO čas). */
  fetchedAt: z.iso.datetime(),
  /** Od kterého data je historie stažená celá (pro doplnění, když přibude starší obchod). */
  coveredFrom: z.iso.date(),
  /** Čas posledního kotovaného kurzu z burzy. */
  quoteTime: z.iso.datetime().optional(),
  prices: z.array(pricePoint)
})
export type PriceSeries = z.infer<typeof priceSeriesSchema>

/** Denní kurz měny z ČNB (kolik Kč stojí 1 jednotka měny). */
export const fxSeriesSchema = z.object({
  fetchedAt: z.iso.datetime(),
  coveredFrom: z.iso.date(),
  rates: z.array(pricePoint)
})
export type FxSeries = z.infer<typeof fxSeriesSchema>

/** Měsíční index spotřebitelských cen (Eurostat HICP, 2015 = 100). */
export const inflationSeriesSchema = z.object({
  fetchedAt: z.iso.datetime(),
  /** Od kterého měsíce se data žádala (pro rozhodnutí, zda stáhnout znovu). */
  coveredFrom: z.string().optional(),
  points: z.array(
    z.tuple([z.string().regex(/^[0-9]{4}-[0-9]{2}$/), z.number().positive().finite()])
  )
})
export type InflationSeries = z.infer<typeof inflationSeriesSchema>

/** Historie výplat dividend jednoho ETF (pro kalkulačku čerpání z dividend). */
export const dividendSeriesSchema = z.object({
  /** Měna z Yahoo – může být i „GBp“ (pence), proto bez přísné kontroly. */
  currency: z.string().min(1).max(8),
  fetchedAt: z.iso.datetime(),
  /** Kurz v době stažení (pro dividendový výnos). */
  price: z.number().positive().finite().nullable(),
  /** [ex-date, částka na kus v měně fondu] */
  events: z.array(z.tuple([z.iso.date(), z.number().positive().finite()])),
  /** Měsíční kurzy upravené o dividendy (pro skutečný celkový výnos); starší cache je nemá. */
  adjMonthly: z.array(z.tuple([z.iso.date(), z.number().positive().finite()])).optional()
})
export type DividendSeries = z.infer<typeof dividendSeriesSchema>

export const priceCacheSchema = z.object({
  version: z.literal(1),
  securities: z.record(z.string(), priceSeriesSchema),
  /** Klíč např. „EURCZK“. */
  fx: z.record(z.string(), fxSeriesSchema),
  /** Inflace: EA = eurozóna (pro EUR), CZ = Česko (pro Kč). Starší cache ji nemá. */
  inflation: z
    .object({ EA: inflationSeriesSchema.optional(), CZ: inflationSeriesSchema.optional() })
    .optional(),
  /** Dividendy podle Yahoo tickeru (jen pro kalkulačku čerpání). Starší cache je nemá. */
  dividends: z
    .record(z.string(), dividendSeriesSchema)
    .optional()
    // Poškozená data dividend nesmí zneplatnit celou cache kurzů.
    .catch(undefined)
})
export type PriceCache = z.infer<typeof priceCacheSchema>

export const EMPTY_PRICE_CACHE: PriceCache = { version: 1, securities: {}, fx: {} }

export const FX_EUR_CZK = 'EURCZK'

export interface PriceUpdateItem {
  ok: boolean
  error?: string
  /** Kolik nových dnů přibylo. */
  added: number
  lastDate: string | null
}

export interface PriceUpdateReport {
  startedAt: string
  finishedAt: string
  securities: ({ id: string } & PriceUpdateItem)[]
  fx: PriceUpdateItem
  /** Stažení inflace (Eurostat); chybí, pokud se nestahovala. */
  inflation?: PriceUpdateItem
  /** Stažení dividend pro kalkulačku čerpání; chybí, pokud se nestahovaly. */
  dividends?: { id: string } & PriceUpdateItem
}

export interface PriceUpdateResult {
  cache: PriceCache
  report: PriceUpdateReport
}
