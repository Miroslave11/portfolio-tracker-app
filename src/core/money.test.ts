import { describe, expect, it } from 'vitest'
import { formatMoney, formatPercent, formatSignedMoney, roundMoney } from './money'

/** Intl používá nezlomitelné mezery – pro porovnání je nahradíme obyčejnými. */
const plain = (s: string): string => s.replace(/[\u00a0\u202f]/g, ' ')

describe('roundMoney', () => {
  it('zaokrouhlí na centy', () => {
    expect(roundMoney(1.005)).toBe(1.01)
    expect(roundMoney(0.1 + 0.2)).toBe(0.3)
    expect(roundMoney(-2.345)).toBe(-2.34)
  })
})

describe('formatMoney', () => {
  it('formátuje EUR v české lokalizaci', () => {
    expect(plain(formatMoney(1234.5))).toBe('1 234,50 €')
  })

  it('počet desetinných míst lze zafixovat (souhrny bez haléřů)', () => {
    expect(plain(formatMoney(78449.6, 'EUR', 0))).toBe('78 450 €')
    expect(plain(formatMoney(1897123.4, 'CZK', 0))).toBe('1 897 123 Kč')
  })
})

describe('formatSignedMoney', () => {
  it('kladné hodnoty dostanou „+“, záporné mají mínus, nula nic', () => {
    expect(plain(formatSignedMoney(16384, 'EUR', 0))).toBe('+16 384 €')
    expect(plain(formatSignedMoney(-250, 'EUR', 0))).toMatch(/^[-−]250 €$/)
    expect(plain(formatSignedMoney(0, 'EUR', 0))).toBe('0 €')
  })
})

describe('formatPercent', () => {
  it('zlomek na procenta s českou čárkou', () => {
    expect(plain(formatPercent(0.264))).toBe('26,40 %')
    expect(plain(formatPercent(0.004, 2, true))).toBe('+0,40 %')
    expect(plain(formatPercent(-0.0123, 1, true))).toMatch(/^[-−]1,2 %$/)
  })
})
