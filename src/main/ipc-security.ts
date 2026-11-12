import type { BrowserWindow, IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

export function isTrustedRendererUrl(candidate: string, expected: string): boolean {
  try {
    const actual = new URL(candidate), trusted = new URL(expected)
    return actual.protocol === trusted.protocol && actual.host === trusted.host &&
      actual.pathname === trusted.pathname && !actual.username && !actual.password
  } catch { return false }
}

export function createTrustedIpc(ipc: Pick<IpcMain, 'handle' | 'on'>, getWindow: () => BrowserWindow | null, expectedUrl: string) {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => {
    const window = getWindow()
    return !!window && !window.isDestroyed() && event.sender === window.webContents &&
      event.senderFrame === window.webContents.mainFrame && !!event.senderFrame &&
      isTrustedRendererUrl(event.senderFrame.url, expectedUrl)
  }
  return {
    handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) {
      ipc.handle(channel, (event, ...args) => {
        if (!trusted(event)) throw new Error('Untrusted IPC sender')
        return listener(event, ...args)
      })
    },
    on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void) {
      ipc.on(channel, (event, ...args) => { if (trusted(event)) listener(event, ...args) })
    },
  }
}

export function externalBrowserUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}
