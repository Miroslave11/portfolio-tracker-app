import { BrowserWindow } from 'electron'

/**
 * Vykreslí HTML v neviditelném okně a uloží ho jako PDF (A4). Okno nemá skripty,
 * nesmí nikam navigovat ani otevírat další okna; HTML navíc nese vlastní CSP bez vnějších zdrojů.
 */
export async function htmlToPdf(html: string): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: false
    }
  })
  try {
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      preferCSSPageSize: true
    })
  } finally {
    win.destroy()
  }
}
