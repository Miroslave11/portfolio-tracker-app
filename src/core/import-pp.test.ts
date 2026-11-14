import { describe, expect, it } from 'vitest'
import { portfolioSchema } from '../shared/model'
import { importPortfolioPerformance } from './import-pp'

/** Malý anonymní export se všemi zvláštnostmi, které se vyskytují ve skutečných datech. */
function fixture(): { version: number; transactions: Record<string, unknown>[] } {
  return {
    version: 1,
    transactions: [
      {
        type: 'PURCHASE',
        account: 'Degiro - EUR cash',
        portfolio: 'Degiro - EUR portfolio',
        date: '2023-02-08',
        currency: 'EUR',
        amount: 120.0,
        shares: 2,
        security: { name: 'VUSA.DE', isin: 'IE00B3XXRP09', ticker: 'VUSA.DE', currency: 'EUR' }
      },
      {
        type: 'PURCHASE',
        account: 'XTB - EUR cash',
        portfolio: 'XTB - EUR portfolio',
        date: '2024-07-26',
        currency: 'EUR',
        amount: 250.5,
        shares: 3,
        // bez ISIN – má se doplnit z katalogu (stejný fond jako IWDA.AS)
        security: { name: 'EUNL.DE', ticker: 'EUNL.DE', currency: 'EUR' }
      },
      {
        type: 'PURCHASE',
        account: 'XTB - EUR cash',
        portfolio: 'XTB - EUR portfolio',
        date: '2025-02-04',
        currency: 'EUR',
        amount: 3200.4,
        shares: 3,
        // název s mezerou na konci
        security: { name: 'SXRV.DE ', isin: 'IE00B53SZB19', ticker: 'SXRV.DE', currency: 'EUR' }
      },
      {
        type: 'PURCHASE',
        account: 'Freedom24',
        portfolio: 'Freedom24',
        date: '2026-06-15',
        currency: 'EUR',
        amount: 700.25,
        shares: 50,
        // název se liší od tickeru
        security: { name: 'SPYL.EU', isin: 'IE000XZSV718', ticker: 'SPYL.DE', currency: 'EUR' }
      },
      {
        type: 'PURCHASE',
        account: 'Degiro - EUR cash',
        portfolio: 'Degiro - EUR portfolio',
        date: '2023-04-05',
        currency: 'EUR',
        amount: 950.6,
        shares: 15,
        security: { name: 'IWDA.AS', isin: 'IE00B4L5Y983', ticker: 'IWDA.AS', currency: 'EUR' }
      },
      {
        type: 'SALE',
        account: 'Degiro - EUR cash',
        portfolio: 'Degiro - EUR portfolio',
        date: '2023-09-12',
        currency: 'EUR',
        amount: 130.2,
        shares: 2,
        security: { name: 'VUSA.DE', isin: 'IE00B3XXRP09', ticker: 'VUSA.DE', currency: 'EUR' }
      },
      {
        type: 'DEPOSIT',
        account: 'Degiro - EUR cash',
        date: '2023-02-08',
        currency: 'EUR',
        amount: 120.0
      },
      {
        type: 'DEPOSIT',
        account: 'Degiro - EUR cash',
        date: '2023-04-05',
        currency: 'EUR',
        amount: 950.6
      },
      {
        type: 'REMOVAL',
        account: 'Degiro - EUR cash',
        date: '2023-09-12',
        currency: 'EUR',
        amount: 130.2
      },
      {
        type: 'DEPOSIT',
        account: 'XTB - EUR cash',
        date: '2024-07-22',
        currency: 'EUR',
        amount: 250.5
      },
      {
        type: 'DEPOSIT',
        account: 'Degiro - EUR cash',
        date: '2025-01-20',
        currency: 'EUR',
        amount: 2100,
        note: 'poznámka k vkladu'
      }
    ]
  }
}

describe('importPortfolioPerformance – normalizace', () => {
  const { portfolio, report } = importPortfolioPerformance(fixture())

  it('projde bez chyb a vrátí platný datový model', () => {
    expect(report.errors).toEqual([])
    expect(portfolio).not.toBeNull()
    expect(() => portfolioSchema.parse(portfolio)).not.toThrow()
  })

  it('sloučí hotovostní a cenný účet do jednoho účtu na brokera', () => {
    expect(portfolio!.accounts.map((a) => a.id).sort()).toEqual(['degiro', 'freedom24', 'xtb'])
    expect(portfolio!.accounts.find((a) => a.id === 'xtb')?.name).toBe('XTB')
    expect(report.notes.join('\n')).toContain(
      '„XTB - EUR cash“ a „XTB - EUR portfolio“ sloučeny do jednoho účtu XTB'
    )
  })

  it('vytvoří jeden cenný papír na ticker, bez mezer v názvech', () => {
    const ids = portfolio!.securities.map((s) => s.id).sort()
    expect(ids).toEqual(['EUNL.DE', 'IWDA.AS', 'SPYL.DE', 'SXRV.DE', 'VUSA.DE'])
    expect(portfolio!.securities.every((s) => s.name === s.name.trim())).toBe(true)
  })

  it('doplní chybějící ISIN z katalogu a pozná stejný fond na dvou burzách', () => {
    const eunl = portfolio!.securities.find((s) => s.id === 'EUNL.DE')!
    expect(eunl.isin).toBe('IE00B4L5Y983')
    expect(report.notes.join('\n')).toContain('EUNL.DE a IWDA.AS jsou tentýž fond')
  })

  it('používá ticker z dat, ne název (SPYL.EU → SPYL.DE)', () => {
    const spyl = portfolio!.securities.find((s) => s.id === 'SPYL.DE')!
    expect(spyl.yahooTicker).toBe('SPYL.DE')
    expect(portfolio!.securities.some((s) => s.id === 'SPYL.EU')).toBe(false)
  })

  it('doplní index a typ fondu (VUSA vyplácí dividendy)', () => {
    const vusa = portfolio!.securities.find((s) => s.id === 'VUSA.DE')!
    expect(vusa.indexGroup).toBe('S&P 500')
    expect(vusa.distributing).toBe(true)
  })

  it('přemapuje typy a seřadí podle data s průběžnými ID', () => {
    const tx = portfolio!.transactions
    expect(tx.map((t) => t.type)).toEqual([
      'BUY',
      'DEPOSIT',
      'BUY',
      'DEPOSIT',
      'SELL',
      'WITHDRAWAL',
      'DEPOSIT',
      'BUY',
      'DEPOSIT',
      'BUY',
      'BUY'
    ])
    expect(tx.map((t) => t.date)).toEqual([...tx.map((t) => t.date)].sort())
    expect(tx[0].id).toBe('t00001')
    expect(tx.at(-1)!.id).toBe('t00011')
  })

  it('zachová poznámku a spočítá souhrny', () => {
    expect(portfolio!.transactions.find((t) => t.note)?.note).toBe('poznámka k vkladu')
    expect(report.total).toBe(11)
    expect(report.byType).toEqual({ BUY: 5, SELL: 1, DEPOSIT: 4, WITHDRAWAL: 1 })
    // Degiro: 120 + 950,60 + 2100 − 130,20 = 3040,40; XTB 250,50
    expect(report.accounts.find((a) => a.id === 'degiro')!.netDeposits).toBe(3040.4)
    expect(report.totalNetDeposits).toBe(3290.9)
    expect(report.totalBought).toBe(5221.75)
    expect(report.dateFrom).toBe('2023-02-08')
    expect(report.dateTo).toBe('2026-06-15')
  })
})

describe('importPortfolioPerformance – chyby a varování', () => {
  it('odmítne soubor, který není export z Portfolio Performance', () => {
    const { portfolio, report } = importPortfolioPerformance({ foo: 1 })
    expect(portfolio).toBeNull()
    expect(report.errors[0]).toContain('Portfolio Performance')
  })

  it('neplatné datum je chyba a import se zablokuje', () => {
    const data = fixture()
    data.transactions[0].date = '2023-02-30'
    const { portfolio, report } = importPortfolioPerformance(data)
    expect(portfolio).toBeNull()
    expect(report.errors.join('\n')).toContain('Transakce č. 1')
  })

  it('záporná nebo nulová částka je chyba', () => {
    const data = fixture()
    data.transactions[6].amount = -5
    expect(importPortfolioPerformance(data).portfolio).toBeNull()
  })

  it('nepodporovaný typ se přeskočí s varováním', () => {
    const data = fixture()
    data.transactions.push({
      type: 'TAXES',
      account: 'XTB - EUR cash',
      date: '2025-01-01',
      currency: 'EUR',
      amount: 5
    })
    const { portfolio, report } = importPortfolioPerformance(data)
    expect(portfolio).not.toBeNull()
    expect(portfolio!.transactions).toHaveLength(11)
    expect(report.skippedTypes).toEqual({ TAXES: 1 })
    expect(report.warnings.join('\n')).toContain('TAXES')
  })

  it('prodej většího počtu kusů, než je drženo, vyvolá varování', () => {
    const data = fixture()
    data.transactions[5].shares = 99
    const { portfolio, report } = importPortfolioPerformance(data)
    expect(portfolio).not.toBeNull()
    expect(report.warnings.join('\n')).toContain('překračuje držený počet')
  })

  it('prázdný seznam transakcí je chyba', () => {
    const { portfolio, report } = importPortfolioPerformance({ version: 1, transactions: [] })
    expect(portfolio).toBeNull()
    expect(report.errors[0]).toContain('žádné použitelné transakce')
  })

  it('neznámý ETF bez ISIN dostane varování a skupinu „Neurčeno“', () => {
    const data = fixture()
    data.transactions.push({
      type: 'PURCHASE',
      account: 'XTB - EUR cash',
      date: '2026-01-01',
      currency: 'EUR',
      amount: 100,
      shares: 1,
      security: { name: 'ZZZZ.DE', ticker: 'ZZZZ.DE', currency: 'EUR' }
    })
    const { portfolio, report } = importPortfolioPerformance(data)
    expect(portfolio!.securities.find((s) => s.id === 'ZZZZ.DE')?.indexGroup).toBe('Neurčeno')
    expect(report.warnings.join('\n')).toContain('Bez ISIN')
  })
})
