import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut } from 'electron'

app.setName('Relay')
import * as path from 'path'
import { SessionManager } from './session-manager'
import { startIpcServer } from './ipc-server'
import { loadClaudeConversations, loadClaudeMessages } from './claude-sessions'

nativeTheme.themeSource = 'dark'

let win: BrowserWindow | null = null
const manager = new SessionManager()

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Forward session changes to renderer
  manager.on('sessions-changed', (sessions) => {
    win?.webContents.send('sessions-changed', sessions)
  })
  manager.on('pty-data', (id: string, data: string) => {
    win?.webContents.send('pty-data', id, data)
  })
}

// ── IPC handlers ──────────────────────────────────────────────────

ipcMain.handle('get-env', () => ({ HOME: process.env.HOME ?? '', SHELL: process.env.SHELL ?? '/bin/zsh' }))
ipcMain.handle('get-sessions', () => manager.getAll())

ipcMain.handle('create-session', (_e, name: string, cwd: string, project: string | null) => {
  return manager.create(name, cwd, project)
})

ipcMain.handle('attach-session', (_e, pid: number, name: string, project: string | null) => {
  return manager.attach(pid, name, project)
})

ipcMain.handle('remove-session', (_e, id: string) => manager.remove(id))

ipcMain.handle('update-session', (_e, id: string, patch: object) => manager.update(id, patch as never))

ipcMain.handle('kill-session', (_e, id: string) => manager.kill(id))

ipcMain.handle('write-pty', (_e, id: string, data: string) => manager.writeToPty(id, data))

ipcMain.handle('get-claude-conversations', () => loadClaudeConversations())
ipcMain.handle('get-claude-messages', (_e, filePath: string) => loadClaudeMessages(filePath))
ipcMain.handle('pin-conversation', (_e, conv, status) => manager.pinConversation(conv, status))
ipcMain.handle('archive-conversation', (_e, convId: string) => manager.archiveConversation(convId))

ipcMain.handle('resize-pty', (_e, id: string, cols: number, rows: number) => {
  manager.resizePty(id, cols, rows)
})

ipcMain.handle('dismiss-attention', (_e, id: string) => manager.dismissAttention(id))

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  const socketServer = startIpcServer(manager)
  createWindow()

  // Auto-pin recent conversations to the kanban
  try {
    const convs = loadClaudeConversations()
    manager.autoPinRecent(convs)
  } catch (e) {
    console.error('[AutoPin] failed:', e)
  }

  // Cmd+Shift+U → jump to most urgent session
  globalShortcut.register('CommandOrControl+Shift+U', () => {
    const urgent = manager.urgentSession()
    if (urgent) {
      win?.show()
      win?.webContents.send('focus-urgent-session', urgent.id)
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  app.on('before-quit', () => {
    globalShortcut.unregisterAll()
    manager.destroy()
    socketServer.close()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
