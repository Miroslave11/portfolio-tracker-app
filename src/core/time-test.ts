import { addDays, daysBetween } from './date'
import { timeTestFreeFrom, type Lot } from './lots'

/** Zbývající část nákupu s informací o časovém testu a dnešní hodnotě. */
export interface TimeTestLot {
  lot: Lot
  /** První den, kdy je prodej těchto kusů osvobozený. */
  freeFrom: string
  free: boolean
  /** Hodnota zbývajících kusů dnes a jejich pořizovací cena (v měně výstupu). */
  value: number
  cost: number
  gain: number
  /** Kolik z tříleté lhůty už uplynulo (0–1). */
  progress: number
  /** Kolik dní zbývá do uvolnění (0 = už volné). */
  daysLeft: number
}

export interface FundTimeTest {
  securityKey: string
  /** Tickery, které k fondu patří (např. „EUNL.DE / IWDA.AS“). */
  label: string
  freeShares: number
  freeValue: number
  waitingShares: number
  waitingValue: number
  /** Nejbližší datum, kdy se uvolní další kusy (pokud nějaké čekají). */
  nextFreeFrom: string | null
}

export interface TimeTestSummary {
  lots: TimeTestLot[]
  totalValue: number
  freeValue: number
  waitingValue: number
  /** Hodnota, která se uvolní během následujících 12 měsíců. */
  freeWithinYearValue: number
  /** Nejbližší ještě neuvolněný nákup. */
  next: TimeTestLot | null
  byFund: FundTimeTest[]
  /** Hodnota podle roku uvolnění; `year: null` = volné už dnes. */
  byYear: { year: number | null; value: number }[]
}

export interface TimeTestOptions {
  /** Dnešní cena kusu daného ETF (EUR); bez ní se použije pořizovací cena. */
  priceOf: (securityId: string) => number | undefined
  /** Přepočet: hodnota dnes (kurz dnes) a pořizovací cena (kurz ke dni nákupu). Výchozí EUR. */
  rateToday?: number
  rateAt?: (date: string) => number
}

/** Rozdělí otevřené nákupy na volné a čekající na časový test (k dnešnímu dni). */
export function timeTestSummary(
  openLots: readonly Lot[],
  today: string,
  options: TimeTestOptions
): TimeTestSummary {
  const rateToday = options.rateToday ?? 1
  const rateAt = options.rateAt ?? (() => 1)
  const yearLater = addDays(today, 365)

  const lots: TimeTestLot[] = openLots
    .map((lot) => {
      const freeFrom = timeTestFreeFrom(lot.date)
      const price = options.priceOf(lot.securityId) ?? lot.costPerShare
      const value = lot.remaining * price * rateToday
      const cost = lot.remaining * lot.costPerShare * rateAt(lot.date)
      const total = Math.max(1, daysBetween(lot.date, freeFrom))
      const daysLeft = Math.max(0, daysBetween(today, freeFrom))
      return {
        lot,
        freeFrom,
        free: today >= freeFrom,
        value,
        cost,
        gain: value - cost,
        progress: Math.min(1, Math.max(0, daysBetween(lot.date, today) / total)),
        daysLeft
      }
    })
    .sort((a, b) => a.lot.date.localeCompare(b.lot.date) || a.lot.id.localeCompare(b.lot.id))

  const sum = (xs: TimeTestLot[]): number => xs.reduce((s, x) => s + x.value, 0)
  const waiting = lots.filter((l) => !l.free)

  // Po fondech (ISIN); díky FIFO jsou volné kusy vždy ty nejstarší, takže je lze prodat první.
  const funds = new Map<string, FundTimeTest & { ids: Set<string> }>()
  for (const l of lots) {
    const f = funds.get(l.lot.securityKey) ?? {
      securityKey: l.lot.securityKey,
      label: '',
      ids: new Set<string>(),
      freeShares: 0,
      freeValue: 0,
      waitingShares: 0,
      waitingValue: 0,
      nextFreeFrom: null
    }
    f.ids.add(l.lot.securityId)
    if (l.free) {
      f.freeShares += l.lot.remaining
      f.freeValue += l.value
    } else {
      f.waitingShares += l.lot.remaining
      f.waitingValue += l.value
      if (!f.nextFreeFrom || l.freeFrom < f.nextFreeFrom) f.nextFreeFrom = l.freeFrom
    }
    funds.set(l.lot.securityKey, f)
  }
  const byFund = [...funds.values()]
    .map(({ ids, ...f }) => ({ ...f, label: [...ids].sort().join(' / ') }))
    .sort((a, b) => b.freeValue + b.waitingValue - (a.freeValue + a.waitingValue))

  const years = new Map<number, number>()
  for (const l of waiting) {
    const y = Number(l.freeFrom.slice(0, 4))
    years.set(y, (years.get(y) ?? 0) + l.value)
  }
  const byYear = [
    { year: null, value: sum(lots.filter((l) => l.free)) },
    ...[...years.entries()].sort((a, b) => a[0] - b[0]).map(([year, value]) => ({ year, value }))
  ]

  const next = waiting.slice().sort((a, b) => a.freeFrom.localeCompare(b.freeFrom))[0] ?? null
  return {
    lots,
    totalValue: sum(lots),
    freeValue: sum(lots.filter((l) => l.free)),
    waitingValue: sum(waiting),
    freeWithinYearValue: sum(waiting.filter((l) => l.freeFrom <= yearLater)),
    next,
    byFund,
    byYear
  }
}
