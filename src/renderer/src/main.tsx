import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { useApp } from './store'

// Nastavení a data načteme před prvním vykreslením, aby motiv neproblikl.
async function bootstrap(): Promise<void> {
  const [settings, portfolio, prices, summaries] = await Promise.allSettled([
    window.api.getSettings(),
    window.api.getPortfolio(),
    window.api.getPrices(),
    window.api.getSummaries()
  ])
  const state = useApp.getState()
  if (settings.status === 'fulfilled') state.initSettings(settings.value)
  if (portfolio.status === 'fulfilled') state.initPortfolio(portfolio.value)
  else
    state.initPortfolio(
      null,
      String(portfolio.reason instanceof Error ? portfolio.reason.message : portfolio.reason)
    )

  if (prices.status === 'fulfilled') state.initPrices(prices.value)
  // Nečitelná shrnutí = prázdný seznam (soubor si main proces zazálohoval).
  state.initSummaries(summaries.status === 'fulfilled' ? summaries.value : [])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

bootstrap()
