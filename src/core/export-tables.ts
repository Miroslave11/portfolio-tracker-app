import { TX_TYPE_LABELS, type Account, type Security, type Transaction } from '../shared/model'
import type { ExportCell, ExportTable } from '../shared/export'
import type { InvestmentStats } from './investments'
import type { RealizedSale } from './lots'
import type { YearRow as PerfYearRow } from './performance'
import type { Position } from './portfolio-calc'

/** Názvy listů Excelu (Excel dovoluje nejvýš 31 znaků). */
export const SHEET = {
  transactions: 'Transakce',
  monthly: 'Měsíční investice',
  positions: 'Pozice',
  performance: 'Výkon po letech',
  sales: 'Realizované prodeje'
} as const

interface Meta {
  accounts: readonly Account[]
  securities: readonly Security[]
}

/** Transakce v pořadí, v jakém je uživatel vidí (filtr, řazení). */
export function transactionsTable(transactions: readonly Transaction[], meta: Meta): ExportTable {
  const accounts = new Map(meta.accounts.map((a) => [a.id, a.name]))
  const securities = new Map(meta.securities.map((s) => [s.id, s]))
  return {
    name: SHEET.transactions,
    columns: [
      { label: 'Datum', type: 'date' },
      { label: 'Broker', type: 'text' },
      { label: 'Typ', type: 'text' },
      { label: 'ETF', type: 'text' },
      { label: 'Název ETF', type: 'text' },
      { label: 'ISIN', type: 'text' },
      { label: 'Kusy', type: 'number' },
      { label: 'Částka na kus', type: 'number' },
      { label: 'Částka', type: 'money' },
      { label: 'Měna', type: 'text' },
      { label: 'Poplatek', type: 'money' },
      { label: 'Daň', type: 'money' },
      { label: 'Poznámka', type: 'text' }
    ],
    rows: transactions.map((t): ExportCell[] => {
      const sec = t.securityId ? securities.get(t.securityId) : undefined
      return [
        t.date,
        accounts.get(t.accountId) ?? t.accountId,
        TX_TYPE_LABELS[t.type],
        t.securityId ?? null,
        sec?.name ?? null,
        sec?.isin ?? null,
        t.shares ?? null,
        t.shares ? t.amount / t.shares : null,
        t.amount,
        t.currency,
        t.fee ?? null,
        t.tax ?? null,
        t.note ?? null
      ]
    })
  }
}

/**
 * Měsíční investice podle brokerů v měně, ve které jsou `stats` spočítané (`currencyLabel`).
 * `czkTotals` (měsíc → součet v Kč kurzem z dne nákupů) přidá sloupec s Kč navíc.
 */
export function monthlyInvestmentsTable(
  stats: InvestmentStats,
  accounts: readonly Account[],
  options: { currencyLabel?: string; czkTotals?: ReadonlyMap<string, number> | null } = {}
): ExportTable {
  const { currencyLabel = 'EUR', czkTotals = null } = options
  const used = accounts.filter((a) => stats.months.some((m) => (m.byAccount[a.id] ?? 0) > 0))
  return {
    name: SHEET.monthly,
    columns: [
      { label: 'Měsíc', type: 'text' },
      ...used.map((a) => ({ label: `${a.name} (${currencyLabel})`, type: 'money' as const })),
      { label: `Celkem (${currencyLabel})`, type: 'money' },
      ...(czkTotals ? [{ label: 'Celkem (Kč)', type: 'money' as const }] : []),
      { label: 'Počet nákupů', type: 'integer' }
    ],
    rows: stats.months.map((m): ExportCell[] => [
      m.month,
      ...used.map((a) => m.byAccount[a.id] ?? 0),
      m.total,
      ...(czkTotals ? [czkTotals.get(m.month) ?? null] : []),
      m.buys
    ])
  }
}

/** Držené pozice; sloupec s hodnotou v Kč jen s kurzem EUR/CZK. */
export function positionsTable(
  positions: readonly Position[],
  securities: readonly Security[],
  fxRate: number | null
): ExportTable {
  const meta = new Map(securities.map((s) => [s.id, s]))
  return {
    name: SHEET.positions,
    columns: [
      { label: 'ETF', type: 'text' },
      { label: 'Název ETF', type: 'text' },
      { label: 'ISIN', type: 'text' },
      { label: 'Skupina indexu', type: 'text' },
      { label: 'Kusy', type: 'number' },
      { label: 'Kurz (EUR)', type: 'number' },
      { label: 'Hodnota (EUR)', type: 'money' },
      { label: 'Pořizovací cena (EUR)', type: 'money' },
      { label: 'Nerealizovaný zisk (EUR)', type: 'money' },
      { label: 'Zisk (%)', type: 'percent' },
      ...(fxRate ? [{ label: 'Hodnota (Kč)', type: 'money' as const }] : [])
    ],
    rows: positions.map((p): ExportCell[] => {
      const s = meta.get(p.securityId)
      return [
        p.securityId,
        s?.name ?? null,
        s?.isin ?? null,
        s?.indexGroup ?? null,
        p.shares,
        p.price,
        p.value,
        p.costBasis,
        p.unrealized,
        p.unrealizedPct,
        ...(fxRate ? [p.value * fxRate] : [])
      ]
    })
  }
}

/** Výkon po kalendářních letech (zisk, TTWROR, IRR) v dané měně. */
export function performanceYearsTable(rows: readonly PerfYearRow[], currency: string): ExportTable {
  return {
    name: SHEET.performance,
    columns: [
      { label: 'Rok', type: 'integer' },
      { label: 'Od', type: 'date' },
      { label: 'Do', type: 'date' },
      { label: `Zisk (${currency})`, type: 'money' },
      { label: 'TTWROR', type: 'percent' },
      { label: 'IRR p.a.', type: 'percent' }
    ],
    rows: rows.map(({ year, result: r }): ExportCell[] => [
      year,
      r?.from ?? null,
      r?.to ?? null,
      r?.profit ?? null,
      r?.ttwror ?? null,
      r?.irr ?? null
    ])
  }
}

/** Realizované prodeje (FIFO) včetně části osvobozené časovým testem. */
export function realizedSalesTable(sales: readonly RealizedSale[], meta: Meta): ExportTable {
  const accounts = new Map(meta.accounts.map((a) => [a.id, a.name]))
  return {
    name: SHEET.sales,
    columns: [
      { label: 'Datum prodeje', type: 'date' },
      { label: 'Broker', type: 'text' },
      { label: 'ETF', type: 'text' },
      { label: 'Kusy', type: 'number' },
      { label: 'Příjem (EUR)', type: 'money' },
      { label: 'Náklad (EUR)', type: 'money' },
      { label: 'Zisk (EUR)', type: 'money' },
      { label: 'Z toho osvobozeno časovým testem (EUR)', type: 'money' },
      { label: 'Příjem (Kč)', type: 'money' },
      { label: 'Náklad (Kč)', type: 'money' },
      { label: 'Zisk (Kč)', type: 'money' }
    ],
    rows: sales.map((s): ExportCell[] => [
      s.date,
      accounts.get(s.accountId) ?? s.accountId,
      s.securityId,
      s.shares,
      s.proceeds,
      s.cost,
      s.gain,
      s.exemptGain,
      s.proceedsCzk,
      s.costCzk,
      s.gainCzk
    ])
  }
}
