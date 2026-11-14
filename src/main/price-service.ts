import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { addDays } from '../core/date'
import { cnbYearUrl, parseCnbYear } from '../core/prices/cnb'
import { hicpUrl, INFLATION_AREAS, parseHicp } from '../core/prices/hicp'
import { classifyNetworkError, NetworkError } from '../core/prices/network-error'
import { mergePoints } from '../core/prices/series'
import {
  parseYahooChart,
  parseYahooDividends,
  yahooChartUrl,
  yahooDividendsUrl
} from '../core/prices/yahoo'
import type { Portfolio } from '../shared/model'
import {
  EMPTY_PRICE_CACHE,
  FX_EUR_CZK,
  priceCacheSchema,
  type PriceCache,
  type PriceUpdateItem,
  type PriceUpdateReport,
  type PriceUpdateResult
} from '../shared/prices'
import { writeJsonAtomic } from './json-file'

export const PRICES_FILE = 'prices.json'

/** Kolik dní před posledním staženým dnem se data stahují znovu (opravy zpětně). */
const OVERLAP_DAYS = 7
/** Kolik dní před prvním obchodem se kurzy stahují (aby měl první nákup kurz i po víkendu). */
const LEAD_DAYS = 10

export interface HttpResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}
export type Fetcher = (url: string, headers: Record<string, string>) => Promise<HttpResponse>

export const defaultFetcher: Fetcher = (url, headers) =>
  fetch(url, { headers, signal: AbortSignal.timeout(20_000) })

// Yahoo Finance odmítá požadavky bez User-Agent (HTTP 429). Obecný identifikátor prohlížeče.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PortfolioTracker/0.1' }

export interface UpdateOptions {
  fetcher?: Fetcher
  now?: Date
  /** Pauza před opakováním po chybě 429/5xx (v testech 0). */
  retryDelayMs?: number
  /** Další Yahoo tickery mimo portfolio (např. benchmark); stahují se od prvního obchodu. */
  extraTickers?: string[]
  /** Stahovat i inflaci z Eurostatu (nejvýš jednou za 12 hodin). */
  inflation?: boolean
  /** Yahoo ticker, jehož historie dividend se stáhne (nejvýš jednou za 24 hodin). */
  dividendTicker?: string
}

/** Cache kurzů jsou odvozená data – poškozený soubor se zahodí a stáhne se znovu. */
export async function loadPriceCache(dir: string): Promise<PriceCache> {
  try {
    const raw = await readFile(join(dir, PRICES_FILE), 'utf-8')
    return priceCacheSchema.parse(JSON.parse(raw))
  } catch {
    return structuredClone(EMPTY_PRICE_CACHE)
  }
}

function httpErrorMessage(status: number, what: string): string {
  if (status === 404) return `${what}: nenalezeno (404)`
  if (status === 429) return `${what}: server dočasně odmítá požadavky (429), zkus to později`
  return `${what}: chyba serveru (HTTP ${status})`
}

async function fetchText(
  fetcher: Fetcher,
  url: string,
  what: string,
  retryDelayMs: number
): Promise<string> {
  let lastError: Error = new Error(`${what}: neznámá chyba`)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelayMs))
    try {
      const res = await fetcher(url, HEADERS)
      if (res.ok) return await res.text()
      lastError = new Error(httpErrorMessage(res.status, what))
      // Opakuje se jen při přetížení/výpadku serveru, ne když ticker neexistuje.
      if (res.status !== 429 && res.status < 500) throw lastError
    } catch (err) {
      if (err === lastError) throw err
      lastError = new NetworkError(what, classifyNetworkError(err))
    }
  }
  throw lastError
}

function earliestDate(dates: string[]): string | null {
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
}

/**
 * Stáhne chybějící kurzy ETF (Yahoo Finance) a kurz EUR/CZK (ČNB), sloučí je s cache
 * a uloží. Chyba jednoho zdroje nezastaví ostatní; stará data zůstanou zachovaná.
 */
export async function updatePrices(
  dir: string,
  portfolio: Portfolio | null,
  options: UpdateOptions = {}
): Promise<PriceUpdateResult> {
  const fetcher = options.fetcher ?? defaultFetcher
  const now = options.now ?? new Date()
  const retryDelayMs = options.retryDelayMs ?? 1500
  const startedAt = now.toISOString()
  const today = startedAt.slice(0, 10)

  const cache = await loadPriceCache(dir)
  const report: PriceUpdateReport = {
    startedAt,
    finishedAt: startedAt,
    securities: [],
    fx: { ok: true, added: 0, lastDate: null }
  }
  let changed = false

  const securities = portfolio?.securities ?? []
  const transactions = portfolio?.transactions ?? []

  // Benchmark a jiné tickery mimo portfolio se stahují stejně (v EUR, od prvního obchodu).
  const firstTxOverall = earliestDate(transactions.map((t) => t.date))
  const targets = [
    ...securities.map((s) => ({
      id: s.id,
      yahooTicker: s.yahooTicker,
      currency: s.currency,
      // ETF zvolené jako benchmark potřebuje historii od úplně prvního obchodu portfolia.
      firstTx: (options.extraTickers ?? []).includes(s.id)
        ? firstTxOverall
        : earliestDate(transactions.filter((t) => t.securityId === s.id).map((t) => t.date))
    })),
    ...(securities.length > 0 ? (options.extraTickers ?? []) : [])
      .filter((t) => !securities.some((s) => s.id === t))
      .map((t) => ({ id: t, yahooTicker: t, currency: 'EUR', firstTx: firstTxOverall }))
  ]

  // --- ETF z Yahoo Finance ---
  // Po výpadku spojení k Yahoo se ostatní ETF nezkouší (zbytečně by se čekalo na každé zvlášť).
  let yahooDown: NetworkError | null = null
  for (const sec of targets) {
    const firstTx = sec.firstTx
    const wantedFrom = addDays(firstTx ?? addDays(today, -365), -LEAD_DAYS)
    const existing = cache.securities[sec.id]
    const needFull = !existing || existing.coveredFrom > wantedFrom
    const lastCached = existing?.prices.at(-1)?.[0]
    const from = needFull || !lastCached ? wantedFrom : addDays(lastCached, -OVERLAP_DAYS)

    const item: PriceUpdateItem & { id: string } = {
      id: sec.id,
      ok: true,
      added: 0,
      lastDate: lastCached ?? null
    }
    if (yahooDown) {
      item.ok = false
      item.error = `${sec.id}: ${yahooDown.reason}`
      report.securities.push(item)
      continue
    }
    try {
      const text = await fetchText(
        fetcher,
        yahooChartUrl(sec.yahooTicker, from, now),
        sec.id,
        retryDelayMs
      )
      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`${sec.id}: odpověď není platný JSON`)
      }
      const fresh = parseYahooChart(json)
      if (fresh.currency !== sec.currency) {
        throw new Error(
          `${sec.id}: kurz je v měně ${fresh.currency}, ale ETF je evidováno v ${sec.currency}`
        )
      }
      if (fresh.points.length === 0 && !existing) {
        throw new Error(`${sec.id}: Yahoo Finance nevrátil žádné kurzy`)
      }
      const before = new Set((existing?.prices ?? []).map((p) => p[0]))
      const merged = mergePoints(needFull ? [] : (existing?.prices ?? []), fresh.points)
      item.added = merged.filter((p) => !before.has(p[0])).length
      item.lastDate = merged.at(-1)?.[0] ?? null
      cache.securities[sec.id] = {
        currency: fresh.currency,
        fetchedAt: startedAt,
        coveredFrom: existing && !needFull ? existing.coveredFrom : wantedFrom,
        quoteTime: fresh.quote?.time ?? existing?.quoteTime,
        prices: merged
      }
      changed = true
    } catch (err) {
      item.ok = false
      item.error = err instanceof Error ? err.message : String(err)
      if (err instanceof NetworkError) yahooDown = err
    }
    report.securities.push(item)
  }

  // --- kurz EUR/CZK z ČNB (jen pokud je co přepočítávat) ---
  if (securities.length > 0) {
    const firstTxOverall = earliestDate(transactions.map((t) => t.date)) ?? today
    const wantedFromYear = Number(addDays(firstTxOverall, -LEAD_DAYS).slice(0, 4))
    const existing = cache.fx[FX_EUR_CZK]
    const needFull = !existing || Number(existing.coveredFrom.slice(0, 4)) > wantedFromYear
    const lastCached = existing?.rates.at(-1)?.[0]
    const startYear =
      needFull || !lastCached
        ? wantedFromYear
        : Number(addDays(lastCached, -OVERLAP_DAYS).slice(0, 4))
    const endYear = Number(today.slice(0, 4))

    const fx: PriceUpdateItem = { ok: true, added: 0, lastDate: lastCached ?? null }
    let rates = needFull ? [] : (existing?.rates ?? [])
    const before = new Set((existing?.rates ?? []).map((p) => p[0]))
    let completed = true
    try {
      for (let year = startYear; year <= endYear; year++) {
        const text = await fetchText(
          fetcher,
          cnbYearUrl(year),
          `Kurz EUR/CZK (ČNB ${year})`,
          retryDelayMs
        )
        rates = mergePoints(rates, parseCnbYear(text, 'EUR'))
      }
    } catch (err) {
      completed = false
      fx.ok = false
      fx.error = err instanceof Error ? err.message : String(err)
    }
    if (rates.length > 0 && rates !== existing?.rates) {
      fx.added = rates.filter((p) => !before.has(p[0])).length
      fx.lastDate = rates.at(-1)?.[0] ?? null
      const keepFrom = existing && !needFull ? existing.coveredFrom : `${startYear}-01-01`
      cache.fx[FX_EUR_CZK] = {
        fetchedAt: completed ? startedAt : (existing?.fetchedAt ?? startedAt),
        // Při částečném selhání se „pokrytí“ nezmění, příští aktualizace stáhne vše znovu.
        coveredFrom: completed ? keepFrom : (existing?.coveredFrom ?? `${endYear + 1}-01-01`),
        rates
      }
      changed = true
    }
    report.fx = fx
  }

  // --- inflace z Eurostatu (měsíční data, stačí jednou za 12 hodin) ---
  if (options.inflation && securities.length > 0) {
    const sinceMonth = `${(earliestDate(transactions.map((t) => t.date)) ?? today).slice(0, 4)}-01`
    const item: PriceUpdateItem = { ok: true, added: 0, lastDate: null }
    const errors: string[] = []
    for (const area of INFLATION_AREAS) {
      const existing = cache.inflation?.[area]
      const fresh =
        existing &&
        (existing.coveredFrom ?? existing.points[0]?.[0] ?? '9999') <= sinceMonth &&
        now.getTime() - Date.parse(existing.fetchedAt) < 12 * 3600_000
      if (fresh) {
        item.lastDate = existing.points.at(-1)?.[0] ?? item.lastDate
        continue
      }
      const what = `Inflace (${area === 'EA' ? 'eurozóna' : 'Česko'})`
      try {
        const text = await fetchText(fetcher, hicpUrl(area, sinceMonth), what, retryDelayMs)
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error(`${what}: odpověď není platný JSON`)
        }
        const points = parseHicp(json)
        if (points.length === 0) throw new Error(`${what}: Eurostat nevrátil žádná data`)
        const before = new Set((existing?.points ?? []).map((p) => p[0]))
        item.added += points.filter((p) => !before.has(p[0])).length
        item.lastDate = points.at(-1)![0]
        cache.inflation = {
          ...cache.inflation,
          [area]: { fetchedAt: startedAt, coveredFrom: sinceMonth, points }
        }
        changed = true
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err))
      }
    }
    if (errors.length > 0) {
      item.ok = false
      item.error = errors.join(' · ')
    }
    report.inflation = item
  }

  // --- historie dividend pro kalkulačku čerpání (stačí jednou denně) ---
  if (options.dividendTicker) {
    const id = options.dividendTicker
    const existing = cache.dividends?.[id]
    const item: { id: string } & PriceUpdateItem = {
      id,
      ok: true,
      added: 0,
      lastDate: existing?.events.at(-1)?.[0] ?? null
    }
    // Starší cache bez měsíčních kurzů (adjMonthly) se stáhne znovu hned.
    const fresh =
      existing?.adjMonthly !== undefined &&
      now.getTime() - Date.parse(existing.fetchedAt) < 24 * 3600_000
    if (!fresh) {
      const what = `Dividendy ${id}`
      try {
        if (yahooDown) throw new Error(`${what}: ${yahooDown.reason}`)
        const text = await fetchText(fetcher, yahooDividendsUrl(id, now), what, retryDelayMs)
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          throw new Error(`${what}: odpověď není platný JSON`)
        }
        const data = parseYahooDividends(json)
        if (data.events.length === 0) throw new Error(`${what}: fond nevyplácí dividendy`)
        const before = new Set((existing?.events ?? []).map((e) => e[0]))
        item.added = data.events.filter((e) => !before.has(e[0])).length
        item.lastDate = data.events.at(-1)![0]
        cache.dividends = {
          ...cache.dividends,
          [id]: {
            currency: data.currency,
            fetchedAt: startedAt,
            price: data.price,
            events: data.events,
            adjMonthly: data.adjMonthly
          }
        }
        changed = true
      } catch (err) {
        item.ok = false
        item.error = err instanceof Error ? err.message : String(err)
      }
    }
    report.dividends = item
  }

  if (changed) {
    await mkdir(dir, { recursive: true })
    await writeJsonAtomic(join(dir, PRICES_FILE), cache)
  }
  report.finishedAt = new Date().toISOString()
  return { cache, report }
}
