import { useMemo } from 'react'
import { averageInflation, deflateCalc, makeDeflator, type Deflator } from '../../core/inflation'
import { calculatePortfolio, type CalcResult, type SeriesPoint } from '../../core/portfolio-calc'
import { useApp } from './store'

export interface InflationInfo {
  /** Uživatel chce hodnoty po inflaci. */
  requested: boolean
  /** Režim po inflaci je opravdu zapnutý (data o inflaci jsou k dispozici). */
  active: boolean
  eur: Deflator | null
  czk: Deflator | null
  /** Průměrná roční inflace od prvního obchodu (eurozóna / Česko). */
  averageEur: number | null
  averageCzk: number | null
  /** Poslední zveřejněný měsíc indexu (RRRR-MM). */
  lastMonth: string | null
}

/** Přepočet na dnešní ceny podle nastavení a stažených dat o inflaci. */
export function useInflation(firstDate?: string): InflationInfo {
  const requested = useApp((s) => s.settings.realValues)
  const inflation = useApp((s) => s.prices.inflation)
  return useMemo(() => {
    const ea = inflation?.EA?.points ?? []
    const cz = inflation?.CZ?.points ?? []
    const eur = makeDeflator(ea)
    const czk = makeDeflator(cz)
    return {
      requested,
      active: requested && !!eur && !!czk,
      eur,
      czk,
      averageEur: firstDate ? averageInflation(ea, firstDate) : null,
      averageCzk: firstDate ? averageInflation(cz, firstDate) : null,
      lastMonth: ea.at(-1)?.[0] ?? null
    }
  }, [requested, inflation, firstDate])
}

export type DisplayCalc = CalcResult & {
  /** Řada v nominálních hodnotách (pro výpočty, které si inflaci řeší samy). */
  nominalSeries: SeriesPoint[]
  /** Hodnoty jsou přepočtené na dnešní ceny. */
  real: boolean
}

/**
 * Výpočet portfolia pro aktuální filtr brokera; přepočítá se při změně dat nebo kurzů.
 * V režimu „po inflaci“ jsou hodnoty a vloženo v dnešních cenách.
 */
export function usePortfolioCalc(): DisplayCalc | null {
  const portfolio = useApp((s) => s.portfolio)
  const prices = useApp((s) => s.prices)
  const brokerFilter = useApp((s) => s.brokerFilter)
  const inflation = useInflation()

  return useMemo(() => {
    if (!portfolio) return null
    const accountIds =
      brokerFilter === 'all'
        ? null
        : new Set(portfolio.accounts.filter((a) => a.name === brokerFilter).map((a) => a.id))
    const nominal = calculatePortfolio({ portfolio, prices, accountIds })
    const shown = inflation.active ? deflateCalc(nominal, inflation.eur, inflation.czk) : nominal
    return { ...shown, nominalSeries: nominal.series, real: inflation.active }
  }, [portfolio, prices, brokerFilter, inflation.active, inflation.eur, inflation.czk])
}
