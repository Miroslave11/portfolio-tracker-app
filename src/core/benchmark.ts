import type { PricePoint } from '../shared/prices'
import type { PerfPoint } from './performance'
import { valueAtOrBefore } from './portfolio-calc'

export interface BenchmarkSimulation {
  /** Hypotetické portfolio: stejné vklady/výběry ve stejné dny, vše v jednom ETF (EUR). */
  points: PerfPoint[]
  /** První den, kdy má benchmark kurz (dřív vklady čekají jako hotovost). */
  firstPriceDate: string | null
  /** Počet dní, kdy byly vklady jen v hotovosti, protože benchmark ještě neměl kurz. */
  daysWithoutPrice: number
}

/**
 * „Co kdybys každý vklad hned koupil v jednom ETF?“ – pro každý den vezme vklad (+) nebo
 * výběr (−) skutečného portfolia a nakoupí/prodá za něj kusy benchmarku kurzem toho dne.
 * Dokud benchmark nemá kurz, peníze leží jako hotovost a nakoupí se v první den s kurzem.
 */
export function simulateBenchmark(
  portfolio: readonly PerfPoint[],
  prices: readonly PricePoint[]
): BenchmarkSimulation {
  let shares = 0
  let cash = 0
  let daysWithoutPrice = 0
  const points: PerfPoint[] = []
  for (const p of portfolio) {
    cash += p.flow
    const price = prices.length ? valueAtOrBefore(prices, p.date) : null
    if (price && price > 0) {
      // Volná hotovost (i záporná při výběru) se hned převede na kusy.
      shares += cash / price
      cash = 0
    } else if (Math.abs(cash) > 1e-9) {
      daysWithoutPrice++
    }
    points.push({ date: p.date, value: shares * (price ?? 0) + cash, flow: p.flow })
  }
  return {
    points,
    firstPriceDate: prices.length ? prices[0][0] : null,
    daysWithoutPrice
  }
}

/** Přepočet hypotetického portfolia do Kč: hodnota kurzem dne, toky převezme ze skutečného portfolia v Kč. */
export function benchmarkInCzk(
  eur: readonly PerfPoint[],
  czkFlows: readonly PerfPoint[],
  fxAt: (date: string) => number
): PerfPoint[] {
  return eur.map((p, i) => ({
    date: p.date,
    value: p.value * fxAt(p.date),
    flow: czkFlows[i]?.flow ?? 0
  }))
}
