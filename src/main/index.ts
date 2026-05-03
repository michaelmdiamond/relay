import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import * as pty from 'node-pty'
import {
  isApiKeyConfigured,
  saveApiKey,
  getConversations,
  newConversation,
  deleteConversation,
  sendMessage,
  updateConversationMemory,
  compactConversation,
  estimateTokens,
} from './chat'
import { isOpenAIConnected, startLogin, clearCredentials } from './openai-auth'
import { resetModelCache } from './openai-codex'
import { isGeminiConnected, saveGeminiKey, disconnectGemini as clearGeminiCredentials, getGeminiModel, saveGeminiModel } from './gemini-auth'
import { isOllamaConfigured, getOllamaConfig, saveOllamaConfig, disconnectOllama } from './ollama-config'
import { ensureOllamaRunning, stopOllamaProcess, checkOllamaReachable, startAndGetModels } from './ollama-process'
import { disconnectCursor, getCursorModel, isCursorConnected, saveCursorKey, saveCursorModel } from './cursor-auth'
import { listCursorModels, validateCursorKey } from './cursor-agent'
import type { GeminiModel, TerminalLauncherId } from '../shared/types'
import { getUsageLimits, saveUsageLimits } from './usage-limits'
import { getConnectorInventory } from './connectors'
import { getSkills } from './skills'
import {
  getAgentProfiles,
  getWorkflowDefinitions,
  getWorkflowRuns,
  saveAgentProfile,
  setWorkflowRunEmitter,
  startWorkflowRun,
} from './workflows'

app.setName('Relay')
nativeTheme.themeSource = 'dark'
// Suppress Chromium's verbose CoreText/font-fallback noise on macOS Sequoia
app.commandLine.appendSwitch('log-level', '3')

let win: BrowserWindow | null = null

setWorkflowRunEmitter((run) => {
  win?.webContents.send('workflow-run-updated', run)
})

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
ipcMain.handle('get-connector-inventory', () => getConnectorInventory())
ipcMain.handle('get-skills', () => getSkills())
ipcMain.handle('get-usage-limits', () => getUsageLimits())
ipcMain.handle('save-usage-limits', (_e, limits) => saveUsageLimits(limits))
ipcMain.handle('update-conversation-memory', (_e, conversationId: string, memory) => updateConversationMemory(conversationId, memory))
ipcMain.handle('compact-conversation', (_e, conversationId: string) => compactConversation(conversationId))
ipcMain.handle('estimate-tokens', (_e, text: string) => estimateTokens(text))
ipcMain.handle('get-agent-profiles', () => getAgentProfiles())
ipcMain.handle('save-agent-profile', (_e, profile) => saveAgentProfile(profile))
ipcMain.handle('get-workflow-definitions', () => getWorkflowDefinitions())
ipcMain.handle('get-workflow-runs', () => getWorkflowRuns())
ipcMain.handle('start-workflow-run', (_e, workflowId: string, goal: string) => startWorkflowRun(workflowId, goal))
ipcMain.handle('new-conversation', () => newConversation())
ipcMain.handle('delete-conversation', (_e, id: string) => deleteConversation(id))

ipcMain.handle('get-openai-auth-status', () => isOpenAIConnected())
ipcMain.handle('start-openai-login', () => startLogin())
ipcMain.handle('disconnect-openai', () => { clearCredentials(); resetModelCache() })

ipcMain.handle('get-gemini-key-status', () => isGeminiConnected())
ipcMain.handle('set-gemini-key', (_e, key: string) => saveGeminiKey(key))
ipcMain.handle('disconnect-gemini', () => clearGeminiCredentials())
ipcMain.handle('get-gemini-model', () => getGeminiModel())
ipcMain.handle('set-gemini-model', (_e, model: GeminiModel) => saveGeminiModel(model))

ipcMain.handle('get-ollama-status', () => {
  const cfg = getOllamaConfig()
  return { configured: isOllamaConfigured(), model: cfg?.model, baseUrl: cfg?.baseUrl }
})
ipcMain.handle('set-ollama-config', (_e, baseUrl: string, model: string) => {
  saveOllamaConfig(baseUrl, model)
  ensureOllamaRunning().catch(() => {})
})
ipcMain.handle('disconnect-ollama', () => {
  disconnectOllama()
  stopOllamaProcess()
})
ipcMain.handle('check-ollama-reachable', () => checkOllamaReachable())
ipcMain.handle('get-ollama-models', (_e, baseUrl?: string) => startAndGetModels(baseUrl))
ipcMain.handle('get-cursor-key-status', () => isCursorConnected())
ipcMain.handle('set-cursor-key', async (_e, key: string) => {
  saveCursorKey(key)
  try {
    await validateCursorKey(key)
  } catch (error) {
    disconnectCursor()
    throw error
  }
})
ipcMain.handle('disconnect-cursor', () => disconnectCursor())
ipcMain.handle('get-cursor-model', () => getCursorModel())
ipcMain.handle('set-cursor-model', (_e, model: string) => saveCursorModel(model))
ipcMain.handle('get-cursor-models', () => listCursorModels())

const activeControllers = new Map<string, AbortController>()

ipcMain.handle('send-message', (_e, conversationId: string, content: string, modelChoice: string, options) => {
  // Cancel any in-flight request for this conversation before starting a new one
  activeControllers.get(conversationId)?.abort()
  const controller = new AbortController()
  activeControllers.set(conversationId, controller)

  sendMessage(conversationId, content, modelChoice as never, controller.signal, {
    streamStart: (convId, msgId, routing) => win?.webContents.send('chat-stream-start', convId, msgId, routing),
    chunk: (convId, msgId, chunk) => win?.webContents.send('chat-chunk', convId, msgId, chunk),
    done: (convId, message) => {
      activeControllers.delete(conversationId)
      win?.webContents.send('chat-message-done', convId, message)
    },
    error: (convId, msgId, error) => {
      activeControllers.delete(conversationId)
      win?.webContents.send('chat-error', convId, msgId, error)
    },
    cancel: (convId, msgId) => {
      activeControllers.delete(conversationId)
      win?.webContents.send('chat-canceled', convId, msgId)
    },
  }, options)
})

ipcMain.handle('cancel-message', (_e, conversationId: string) => {
  activeControllers.get(conversationId)?.abort()
  activeControllers.delete(conversationId)
})

// ── Terminal / PTY ────────────────────────────────────────────────

function findCliTool(name: string): string {
  const home = process.env.HOME ?? ''
  const appName = name.charAt(0).toUpperCase() + name.slice(1)
  const candidates = [
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    `${home}/.npm-global/bin/${name}`,
    `${home}/.local/bin/${name}`,
    `/Applications/${appName}.app/Contents/Resources/${name}`,
    `${home}/Applications/${appName}.app/Contents/Resources/${name}`,
  ]
  const known = candidates.find(p => fs.existsSync(p))
  if (known) return known
  try {
    const shell = process.env.SHELL ?? '/bin/zsh'
    const found = execSync(`${shell} -l -c "command -v ${name}"`, { env: process.env }).toString().trim()
    if (found && fs.existsSync(found)) return found
  } catch { /* not in PATH */ }
  return name // bare fallback — shell will surface "not found" clearly
}

const ptyProcesses = new Map<string, pty.IPty>()

ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder',
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('terminal-create', (_e, id: string, launcherId: TerminalLauncherId, cwd?: string) => {
  const shell = process.env.SHELL ?? '/bin/zsh'
  const codexBin = findCliTool('codex')
  const claudeBin = findCliTool('claude')
  const geminiBin = findCliTool('gemini')
  const cursorAgentBin = findCliTool('cursor-agent')
  const launcherMap: Record<TerminalLauncherId, { file: string; args: string[] }> = {
    codex: { file: shell, args: ['-l', '-c', `exec "${codexBin}"`] },
    claude: { file: shell, args: ['-l', '-c', `exec "${claudeBin}"`] },
    gemini: { file: shell, args: ['-l', '-c', `exec "${geminiBin}"`] },
    cursor: { file: shell, args: ['-l', '-c', `exec "${cursorAgentBin}"`] },
    shell: { file: shell, args: ['-l'] },
  }
  const { file, args } = launcherMap[launcherId]
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd ?? process.env.HOME ?? '/',
    env: process.env as Record<string, string>,
  })
  ptyProcesses.set(id, proc)
  proc.onData((data) => win?.webContents.send('terminal-data', id, data))
  proc.onExit(({ exitCode }) => {
    ptyProcesses.delete(id)
    win?.webContents.send('terminal-exit', id, exitCode)
  })
})

ipcMain.handle('terminal-input', (_e, id: string, data: string) => {
  ptyProcesses.get(id)?.write(data)
})

ipcMain.handle('terminal-resize', (_e, id: string, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows)
})

ipcMain.handle('terminal-kill', (_e, id: string) => {
  try { ptyProcesses.get(id)?.kill() } catch { /* already dead */ }
  ptyProcesses.delete(id)
})

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow()
  if (isOllamaConfigured()) ensureOllamaRunning().catch(() => {})
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => stopOllamaProcess())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
