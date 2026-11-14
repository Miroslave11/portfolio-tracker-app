/** Pole obchodu: z libovolných dvou se třetí dopočítá. */
export type TradeField = 'shares' | 'price' | 'amount'

export type TradeValues = Partial<Record<TradeField, number>>

const round = (value: number, digits: number): number => {
  const f = 10 ** digits
  return Math.round((value + Number.EPSILON) * f) / f
}

/**
 * Převede text z formuláře na číslo: povolí mezery (i nezlomitelné) jako oddělovač tisíců
 * a čárku nebo tečku jako desetinný oddělovač („1 234,56“, „16.70“). Jinak `null`.
 */
export function parseNumber(input: string): number | null {
  const text = input.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (text === '') return null
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/** Číslo do políčka formuláře: česká čárka, bez zbytečných nul na konci. */
export function formatInput(value: number, maxDigits: number): string {
  return round(value, maxDigits)
    .toFixed(maxDigits)
    .replace(/\.?0+$/, '')
    .replace('.', ',')
}

/**
 * Dopočítá třetí hodnotu obchodu ze dvou naposledy zadaných polí (`order` = pořadí zadávání,
 * poslední je nejnovější). Částka se zaokrouhluje na centy, kusy na 6 a cena na 4 desetinná místa.
 */
export function resolveTrade(
  values: TradeValues,
  order: readonly TradeField[]
): { values: TradeValues; derived: TradeField | null } {
  const filled = (f: TradeField): boolean => (values[f] ?? 0) > 0
  const lastTwo: TradeField[] = []
  for (let i = order.length - 1; i >= 0 && lastTwo.length < 2; i--) {
    if (filled(order[i]) && !lastTwo.includes(order[i])) lastTwo.push(order[i])
  }
  if (lastTwo.length < 2) return { values: { ...values }, derived: null }

  const all: TradeField[] = ['shares', 'price', 'amount']
  const derived = all.find((f) => !lastTwo.includes(f))!
  const out: TradeValues = { ...values }
  const { shares, price, amount } = values
  if (derived === 'amount') out.amount = round(shares! * price!, 2)
  else if (derived === 'shares') out.shares = round(amount! / price!, 6)
  else out.price = round(amount! / shares!, 4)
  return { values: out, derived }
}

/** Rozepsaný stav tří polí obchodu ve formuláři. */
export interface TradeInputState {
  texts: Record<TradeField, string>
  /** Pořadí, v jakém uživatel pole upravoval (poslední = nejnovější). */
  order: TradeField[]
  /** Uživatel cenu sám zadal – předvyplněný tržní kurz se pak už nepoužívá. */
  priceTouched: boolean
}

export const EMPTY_TRADE_INPUT: TradeInputState = {
  texts: { shares: '', price: '', amount: '' },
  order: [],
  priceTouched: false
}

const FIELD_DIGITS: Record<TradeField, number> = { shares: 6, price: 4, amount: 2 }

export interface DerivedTrade {
  values: TradeValues
  /** Které pole je dopočtené (jen zobrazené, ne zadané). */
  derived: TradeField | null
  /** Pole s textem, který není platné nezáporné číslo. */
  invalid: TradeField[]
  /** Cena je předvyplněná z tržního kurzu. */
  prefilled: boolean
  /** Text pro políčko formuláře (u dopočteného pole vypočtená hodnota). */
  shown(field: TradeField): string
}

/**
 * Z rozepsaných textů a tržního kurzu určí hodnoty obchodu: dokud uživatel cenu nezadá,
 * použije se tržní kurz; ze dvou naposledy zadaných polí se dopočítá třetí.
 */
export function deriveTrade(state: TradeInputState, market: number | null): DerivedTrade {
  const prefilled = !state.priceTouched && market !== null && market > 0
  const effTexts: Record<TradeField, string> = {
    ...state.texts,
    price: prefilled ? formatInput(market!, 4) : state.texts.price
  }
  const effOrder: TradeField[] = prefilled
    ? ['price', ...state.order.filter((f) => f !== 'price')]
    : state.order

  const values: TradeValues = {}
  const invalid: TradeField[] = []
  for (const f of ['shares', 'price', 'amount'] as TradeField[]) {
    const raw = effTexts[f].trim()
    if (!raw) continue
    const n = parseNumber(raw)
    if (n === null || n < 0) invalid.push(f)
    else values[f] = n
  }
  const resolved = resolveTrade(values, effOrder)
  return {
    values: resolved.values,
    derived: resolved.derived,
    invalid,
    prefilled,
    shown: (f) =>
      resolved.derived === f && resolved.values[f] !== undefined
        ? formatInput(resolved.values[f]!, FIELD_DIGITS[f])
        : effTexts[f]
  }
}

/** Nový stav po úpravě jednoho pole (úprava ceny vypne předvyplnění z kurzu). */
export function editTradeField(
  state: TradeInputState,
  field: TradeField,
  text: string
): TradeInputState {
  return {
    texts: { ...state.texts, [field]: text },
    order: [...state.order.filter((f) => f !== field), ...(text.trim() ? [field] : [])],
    priceTouched: state.priceTouched || field === 'price'
  }
}
