import type { PortfolioApi } from '../shared/ipc'

declare global {
  interface Window {
    api: PortfolioApi
  }
}
