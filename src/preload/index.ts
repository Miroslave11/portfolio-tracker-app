import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type PortfolioApi } from '../shared/ipc'

const api: PortfolioApi = {
  getAppVersion: () => ipcRenderer.invoke(IPC.appVersion),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  getPortfolio: () => ipcRenderer.invoke(IPC.portfolioGet),
  previewImport: () => ipcRenderer.invoke(IPC.importPreview),
  commitImport: (previewId) => ipcRenderer.invoke(IPC.importCommit, previewId),
  updateSecurityMeta: (patch) => ipcRenderer.invoke(IPC.securityMetaUpdate, patch),
  addTransactions: (drafts) => ipcRenderer.invoke(IPC.transactionsAdd, drafts),
  updateTransaction: (request) => ipcRenderer.invoke(IPC.transactionUpdate, request),
  deleteTransaction: (request) => ipcRenderer.invoke(IPC.transactionDelete, request),
  openFolder: (which) => ipcRenderer.invoke(IPC.openFolder, which),
  getPrices: () => ipcRenderer.invoke(IPC.pricesGet),
  updatePrices: () => ipcRenderer.invoke(IPC.pricesUpdate),
  exportFile: (request) => ipcRenderer.invoke(IPC.exportSave, request),
  aiStatus: () => ipcRenderer.invoke(IPC.aiStatus),
  aiRewrite: (request) => ipcRenderer.invoke(IPC.aiRewrite, request),
  aiWriteArticle: (request) => ipcRenderer.invoke(IPC.aiArticle, request),
  getSummaries: () => ipcRenderer.invoke(IPC.summariesGet),
  saveSummaries: (articles) => ipcRenderer.invoke(IPC.summariesSave, articles)
}

contextBridge.exposeInMainWorld('api', api)
