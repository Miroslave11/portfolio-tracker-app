import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type PortfolioApi } from '../shared/ipc'
import type { UpdateState } from '../shared/update'

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
  saveSummaries: (articles) => ipcRenderer.invoke(IPC.summariesSave, articles),
  getUpdateState: () => ipcRenderer.invoke(IPC.updateGet),
  checkForUpdates: () => ipcRenderer.invoke(IPC.updateCheck),
  installUpdate: () => ipcRenderer.invoke(IPC.updateInstall),
  onUpdateState: (listener) => {
    const handler = (_e: IpcRendererEvent, state: UpdateState): void => listener(state)
    ipcRenderer.on(IPC.updateEvent, handler)
    return () => ipcRenderer.removeListener(IPC.updateEvent, handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
