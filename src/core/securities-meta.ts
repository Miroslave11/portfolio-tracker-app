import { securityMetaPatchSchema, type Portfolio, type SecurityMetaPatch } from '../shared/model'

/** Vrátí portfolio s upravenou skupinou indexu / barvou vybraných ETF (vstup se nemění). */
export function applySecurityMeta(portfolio: Portfolio, patchInput: unknown): Portfolio {
  const patch: SecurityMetaPatch = securityMetaPatchSchema.parse(patchInput)
  const known = new Set(portfolio.securities.map((s) => s.id))
  const unknown = patch.ids.filter((id) => !known.has(id))
  if (unknown.length > 0) throw new Error(`Neznámé ETF: ${unknown.join(', ')}`)
  const ids = new Set(patch.ids)
  return {
    ...portfolio,
    securities: portfolio.securities.map((s) =>
      ids.has(s.id)
        ? {
            ...s,
            ...(patch.indexGroup !== undefined ? { indexGroup: patch.indexGroup } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {})
          }
        : s
    )
  }
}
