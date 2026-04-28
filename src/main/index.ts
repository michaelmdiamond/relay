import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import * as path from 'path'
import {
  isApiKeyConfigured,
  saveApiKey,
  getConversations,
  newConversation,
  deleteConversation,
  sendMessage,
} from './chat'
import { isOpenAIConnected, startLogin, clearCredentials } from './openai-auth'
import { resetModelCache } from './openai-codex'

app.setName('Relay')
nativeTheme.themeSource = 'dark'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 700,
    minHeight: 500,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC ──────────────────────────────────────────────────────────

ipcMain.handle('get-api-key-status', () => ({ configured: isApiKeyConfigured() }))
ipcMain.handle('set-api-key', (_e, key: string) => saveApiKey(key))
ipcMain.handle('get-conversations', () => getConversations())
ipcMain.handle('new-conversation', () => newConversation())
ipcMain.handle('delete-conversation', (_e, id: string) => deleteConversation(id))

ipcMain.handle('get-openai-auth-status', () => isOpenAIConnected())
ipcMain.handle('start-openai-login', () => startLogin())
ipcMain.handle('disconnect-openai', () => { clearCredentials(); resetModelCache() })

ipcMain.handle('send-message', (_e, conversationId: string, content: string, modelChoice: string) => {
  sendMessage(conversationId, content, modelChoice as never, {
    chunk: (convId, msgId, chunk) => win?.webContents.send('chat-chunk', convId, msgId, chunk),
    done: (convId, message) => win?.webContents.send('chat-message-done', convId, message),
    error: (convId, msgId, error) => win?.webContents.send('chat-error', convId, msgId, error),
  })
})

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
