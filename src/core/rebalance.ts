/**
 * Rebalancing jen dokupováním: měsíční nákup se rozdělí mezi indexy, které jsou pod cílovým
 * podílem. Nic se neprodává (prodej by mohl znamenat daň – časový test 3 roky).
 *
 * Rozdělení „vyrovnáváním hladiny“: nejvíc podvážené indexy (nejnižší poměr hodnota / cíl)
 * se dokupují první, dokud se nesrovnají s dalšími; tak se největší odchylka zmenšuje nejrychleji.
 */

export interface RebalanceTarget {
  group: string
  /** Cílový podíl 0–1. */
  share: number
}

export interface RebalanceRow {
  group: string
  value: number
  /** Současný podíl 0–1. */
  share: number
  /** Cílový podíl 0–1 (0, pokud pro skupinu cíl není). */
  target: number
  /** Odchylka současného podílu od cíle (0,05 = +5 p. b.). */
  deviation: number
  /** Doporučený nákup (≥ 0). */
  buy: number
  /** Podíl po nákupu. */
  shareAfter: number
}

const EPS = 1e-9

/** Součet cílových podílů (pro kontrolu 100 %). */
export function targetsSum(targets: readonly RebalanceTarget[]): number {
  return targets.reduce((s, t) => s + t.share, 0)
}

/**
 * Rozdělí `contribution` mezi skupiny tak, aby se co nejvíc přiblížily cíli (jen nákupy).
 * Cíle se normalizují na součet 1; skupiny s nulovým cílem nic nedostanou.
 */
export function allocateContribution(
  values: ReadonlyMap<string, number>,
  targets: readonly RebalanceTarget[],
  contribution: number
): Map<string, number> {
  const buys = new Map<string, number>()
  const sum = targetsSum(targets)
  const active = targets.filter((t) => t.share > EPS)
  for (const t of targets) buys.set(t.group, 0)
  if (contribution <= EPS || sum <= EPS || active.length === 0) return buys

  // Hladina L: skupina g má po nákupu hodnotu max(v_g, t_g · L). Hledá se L, při kterém
  // součet nákupů = vklad. Skupiny se přidávají podle rostoucího poměru v_g / t_g.
  const items = active
    .map((t) => {
      const w = t.share / sum
      const v = Math.max(0, values.get(t.group) ?? 0)
      return { group: t.group, w, v, ratio: v / w }
    })
    .sort((a, b) => a.ratio - b.ratio)

  let wSum = 0
  let vSum = 0
  let level = 0
  for (let i = 0; i < items.length; i++) {
    wSum += items[i].w
    vSum += items[i].v
    level = (contribution + vSum) / wSum
    const next = items[i + 1]
    if (!next || level <= next.ratio) break
  }
  for (const it of items) buys.set(it.group, Math.max(0, it.w * level - it.v))
  return buys
}

/** Zaokrouhlí částky na celé `step` tak, aby součet přesně odpovídal `total` (největší zbytky). */
export function roundToTotal(values: readonly number[], total: number, step = 1): number[] {
  const units = Math.round(total / step)
  const raw = values.map((v) => Math.max(0, v) / step)
  const floors = raw.map(Math.floor)
  let rest = units - floors.reduce((s, x) => s + x, 0)
  const order = raw.map((r, i) => ({ i, frac: r - floors[i] })).sort((a, b) => b.frac - a.frac)
  const out = [...floors]
  for (const { i } of order) {
    if (rest <= 0) break
    if (raw[i] <= EPS) continue
    out[i]++
    rest--
  }
  return out.map((x) => x * step)
}

/**
 * Tabulka cíl vs. skutečnost s doporučeným nákupem. Řádky: všechny skupiny s hodnotou nebo
 * s cílem (pořadí: podle cíle, pak podle hodnoty).
 */
export function computeRebalance(
  values: ReadonlyMap<string, number>,
  targets: readonly RebalanceTarget[],
  contribution: number
): RebalanceRow[] {
  const sum = targetsSum(targets)
  const targetOf = new Map(targets.map((t) => [t.group, sum > EPS ? t.share / sum : 0]))
  const groups = [...new Set([...targets.map((t) => t.group), ...values.keys()])]
  const total = groups.reduce((s, g) => s + Math.max(0, values.get(g) ?? 0), 0)
  const rawBuys = allocateContribution(values, targets, contribution)
  const rounded = roundToTotal(
    groups.map((g) => rawBuys.get(g) ?? 0),
    [...rawBuys.values()].some((b) => b > EPS) ? contribution : 0
  )
  const after = total + rounded.reduce((s, b) => s + b, 0)

  return groups
    .map((group, i) => {
      const value = Math.max(0, values.get(group) ?? 0)
      const share = total > EPS ? value / total : 0
      const target = targetOf.get(group) ?? 0
      const buy = rounded[i]
      return {
        group,
        value,
        share,
        target,
        deviation: share - target,
        buy,
        shareAfter: after > EPS ? (value + buy) / after : 0
      }
    })
    .sort((a, b) => b.target - a.target || b.value - a.value)
}

/**
 * Za kolik měsíců pravidelného nákupu (bez pohybu kurzů) se všechny skupiny dostanou do
 * tolerance od cíle; `null` = ani za `maxMonths` (např. velká nadváha a malý vklad).
 */
export function monthsToTarget(
  values: ReadonlyMap<string, number>,
  targets: readonly RebalanceTarget[],
  contribution: number,
  tolerance = 0.01,
  maxMonths = 240
): number | null {
  const sum = targetsSum(targets)
  if (sum <= EPS) return null
  const current = new Map(values)
  const groups = [...new Set([...targets.map((t) => t.group), ...values.keys()])]
  const targetOf = new Map(targets.map((t) => [t.group, t.share / sum]))
  const within = (): boolean => {
    const total = groups.reduce((s, g) => s + (current.get(g) ?? 0), 0)
    if (total <= EPS) return false
    return groups.every(
      (g) => Math.abs((current.get(g) ?? 0) / total - (targetOf.get(g) ?? 0)) <= tolerance + EPS
    )
  }
  for (let m = 0; m <= maxMonths; m++) {
    if (within()) return m
    if (contribution <= EPS) return null
    const buys = allocateContribution(current, targets, contribution)
    for (const [g, b] of buys) current.set(g, (current.get(g) ?? 0) + b)
  }
  return null
}
