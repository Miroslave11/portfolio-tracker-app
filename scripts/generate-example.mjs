/* eslint-disable @typescript-eslint/explicit-function-return-type -- skript v čistém JavaScriptu */
// Vygeneruje VYMYŠLENÉ ukázkové portfolio ve formátu exportu z Portfolio Performance.
// Žádná skutečná data: částky vznikají z umělých cen a deterministického generátoru náhodných čísel.
// Použití: node scripts/generate-example.mjs   →   examples/ukazka-portfolio-performance.json
import { mkdirSync, writeFileSync } from 'node:fs'

// Deterministický generátor (stejný výstup při každém spuštění)
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(2024)

const SECURITIES = {
  'EUNL.DE': {
    name: 'iShares Core MSCI World UCITS ETF (Acc)',
    isin: 'IE00B4L5Y983',
    start: 70,
    end: 118
  },
  'SXR8.DE': {
    name: 'iShares Core S&P 500 UCITS ETF (Acc)',
    isin: 'IE00B5BMR087',
    start: 390,
    end: 640
  },
  'SXRV.DE': {
    name: 'iShares NASDAQ 100 UCITS ETF (Acc)',
    isin: 'IE00B53SZB19',
    start: 80,
    end: 140
  },
  'EXUS.DE': {
    name: 'Xtrackers MSCI World ex USA UCITS ETF 1C',
    isin: 'IE0006WW1TQ4',
    start: 24,
    end: 31
  }
}

const ACCOUNTS = [
  { cash: 'XTB - EUR cash', portfolio: 'XTB - EUR portfolio', tickers: ['EUNL.DE', 'SXR8.DE'] },
  {
    cash: 'Degiro - EUR cash',
    portfolio: 'Degiro - EUR portfolio',
    tickers: ['SXRV.DE', 'EUNL.DE']
  },
  { cash: 'Freedom24', portfolio: 'Freedom24', tickers: ['SXR8.DE', 'EXUS.DE'] }
]

const FIRST = { year: 2023, month: 1 }
const LAST = { year: 2026, month: 10 }
const months = []
for (let y = FIRST.year, m = FIRST.month; y < LAST.year || (y === LAST.year && m <= LAST.month);) {
  months.push({ y, m })
  if (++m > 12) {
    m = 1
    y++
  }
}

const pad = (n) => String(n).padStart(2, '0')
const round2 = (n) => Math.round(n * 100) / 100
const priceOf = (ticker, i) => {
  const s = SECURITIES[ticker]
  const trend = s.start + ((s.end - s.start) * i) / (months.length - 1)
  const wave = 1 + 0.05 * Math.sin(i / 3 + ticker.length) + (rnd() - 0.5) * 0.03
  return trend * wave
}

const transactions = []
const security = (ticker) => ({
  name: ticker,
  isin: SECURITIES[ticker].isin,
  ticker,
  currency: 'EUR'
})

function buy(account, ticker, date, budget, i) {
  const price = priceOf(ticker, i)
  const shares = Math.max(1, Math.round(budget / price))
  const amount = round2(shares * price)
  transactions.push({
    type: 'PURCHASE',
    account: account.cash,
    portfolio: account.portfolio,
    date,
    currency: 'EUR',
    amount,
    shares,
    security: security(ticker)
  })
  transactions.push({ type: 'DEPOSIT', account: account.cash, date, currency: 'EUR', amount })
  return { ticker, shares, amount }
}

const bought = []
months.forEach(({ y, m }, i) => {
  // Každý měsíc jeden pravidelný nákup u „hlavního“ brokera, občas druhý u jiného
  const main = ACCOUNTS[i % 3]
  const day = 3 + Math.floor(rnd() * 20)
  const date = `${y}-${pad(m)}-${pad(day)}`
  const budget = 350 + Math.floor(rnd() * 5) * 100
  const t = main.tickers[Math.floor(rnd() * main.tickers.length)]
  bought.push({ date, ...buy(main, t, date, budget, i), account: main })
  if (i % 4 === 3) {
    const other = ACCOUNTS[(i + 1) % 3]
    const d2 = `${y}-${pad(m)}-${pad(Math.min(28, day + 5))}`
    const t2 = other.tickers[Math.floor(rnd() * other.tickers.length)]
    bought.push({
      date: d2,
      ...buy(other, t2, d2, 250 + Math.floor(rnd() * 4) * 100, i),
      account: other
    })
  }
})

// Jeden prodej a výběr (ukáže FIFO a časový test): část nejstaršího nákupu EUNL.DE u XTB
const sellSource = bought.find((b) => b.ticker === 'EUNL.DE' && b.account.cash.startsWith('XTB'))
if (sellSource && sellSource.shares >= 2) {
  const shares = Math.floor(sellSource.shares / 2)
  const price = priceOf('EUNL.DE', months.length - 1)
  const amount = round2(shares * price)
  transactions.push({
    type: 'SALE',
    account: sellSource.account.cash,
    portfolio: sellSource.account.portfolio,
    date: '2026-05-12',
    currency: 'EUR',
    amount,
    shares,
    security: security('EUNL.DE')
  })
  transactions.push({
    type: 'REMOVAL',
    account: sellSource.account.cash,
    date: '2026-05-12',
    currency: 'EUR',
    amount
  })
}

transactions.sort((a, b) => a.date.localeCompare(b.date))
mkdirSync(new URL('../examples/', import.meta.url), { recursive: true })
writeFileSync(
  new URL('../examples/ukazka-portfolio-performance.json', import.meta.url),
  JSON.stringify({ version: 1, transactions }, null, 2) + '\n'
)
console.log(`Ukázka: ${transactions.length} transakcí, ${months.length} měsíců`)
