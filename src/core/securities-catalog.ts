/**
 * Katalog známých ETF (klíč = ticker). Slouží k doplnění údajů, které chybí
 * v exportu (ISIN, index, zda fond vyplácí dividendy). Hodnoty z dat uživatele
 * mají vždy přednost; index a název půjde upravit v Nastavení (přírůstek P6).
 */
export interface CatalogEntry {
  isin: string
  name: string
  indexGroup: string
  distributing: boolean
  color: string
}

const WORLD: CatalogEntry = {
  isin: 'IE00B4L5Y983',
  name: 'iShares Core MSCI World UCITS ETF (Acc)',
  indexGroup: 'MSCI World',
  distributing: false,
  color: '#0ea5e9'
}

export const CATALOG: Readonly<Record<string, CatalogEntry>> = {
  'SXR8.DE': {
    isin: 'IE00B5BMR087',
    name: 'iShares Core S&P 500 UCITS ETF (Acc)',
    indexGroup: 'S&P 500',
    distributing: false,
    color: '#6366f1'
  },
  'VUSA.DE': {
    isin: 'IE00B3XXRP09',
    name: 'Vanguard S&P 500 UCITS ETF (Dist)',
    indexGroup: 'S&P 500',
    distributing: true,
    color: '#f43f5e'
  },
  'SPYL.DE': {
    isin: 'IE000XZSV718',
    name: 'SPDR S&P 500 UCITS ETF (Acc)',
    indexGroup: 'S&P 500',
    distributing: false,
    color: '#8b5cf6'
  },
  'IWDA.AS': WORLD,
  'EUNL.DE': WORLD,
  'SXRV.DE': {
    isin: 'IE00B53SZB19',
    name: 'iShares NASDAQ 100 UCITS ETF (Acc)',
    indexGroup: 'Nasdaq 100',
    distributing: false,
    color: '#f59e0b'
  },
  'EXUS.DE': {
    isin: 'IE0006WW1TQ4',
    name: 'Xtrackers MSCI World ex USA UCITS ETF 1C',
    indexGroup: 'World ex-USA',
    distributing: false,
    color: '#10b981'
  }
}

export const UNKNOWN_INDEX_GROUP = 'Neurčeno'
export const FALLBACK_SECURITY_COLOR = '#8b92a5'
