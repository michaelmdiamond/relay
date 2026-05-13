import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
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
  getCodexConversationRevision,
} from './chat'
import { isOpenAIConnected, startLogin, clearCredentials } from './openai-auth'
import { getCodexModel, listCodexModels, resetModelCache, saveCodexModel } from './openai-codex'
import { isGeminiConnected, saveGeminiKey, disconnectGemini as clearGeminiCredentials, getGeminiModel, saveGeminiModel } from './gemini-auth'
import { disconnectDeepSeek as clearDeepSeekCredentials, getDeepSeekModel, isDeepSeekConnected, saveDeepSeekKey, saveDeepSeekModel } from './deepseek-auth'
import { isOllamaConfigured, getOllamaConfig, saveOllamaConfig, disconnectOllama } from './ollama-config'
import { ensureOllamaRunning, stopOllamaProcess, checkOllamaReachable, startAndGetModels, pullOllamaModel } from './ollama-process'
import { disconnectCursor, getCursorModel, isCursorConnected, saveCursorKey, saveCursorModel } from './cursor-auth'
import { listCursorModels, validateCursorKey } from './cursor-agent'
import type { DeepSeekModel, GeminiModel, TerminalLauncherId, TerminalSessionSnapshot } from '../shared/types'
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
import {
  archiveTask,
  createTask,
  getTasks,
  linkTerminalToTask,
  linkWorkflowRunToTask,
  promoteConversationToTask,
  reconcileTasks,
  setTaskEmitter,
  updateTask,
  updateTaskState,
} from './tasks'

app.setName('Relay')
process.title = 'Relay'
nativeTheme.themeSource = 'dark'
// Suppress Chromium's verbose CoreText/font-fallback noise on macOS Sequoia
app.commandLine.appendSwitch('log-level', '3')

let win: BrowserWindow | null = null

setWorkflowRunEmitter((run) => {
  win?.webContents.send('workflow-run-updated', run)
  reconcileCurrentTasks()
})

setTaskEmitter((tasks) => {
  win?.webContents.send('tasks-updated', tasks)
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
ipcMain.handle('get-conversations', () => getConversations(terminalSnapshots(), getTasks()))
ipcMain.handle('get-connector-inventory', () => getConnectorInventory())
ipcMain.handle('get-skills', () => getSkills())
ipcMain.handle('get-usage-limits', () => getUsageLimits())
ipcMain.handle('save-usage-limits', (_e, limits) => saveUsageLimits(limits))
ipcMain.handle('get-tasks', () => {
  reconcileCurrentTasks()
  return getTasks()
})
ipcMain.handle('create-task', (_e, input) => {
  const task = createTask(input)
  reconcileCurrentTasks()
  return task
})
ipcMain.handle('update-task', (_e, id: string, input) => {
  const task = updateTask(id, input)
  reconcileCurrentTasks()
  return task
})
ipcMain.handle('update-task-state', (_e, id: string, state) => {
  const task = updateTaskState(id, state)
  reconcileCurrentTasks()
  return task
})
ipcMain.handle('archive-task', (_e, id: string) => {
  const task = archiveTask(id)
  reconcileCurrentTasks()
  return task
})
ipcMain.handle('promote-conversation-to-task', (_e, conversationId: string, input) => {
  const conversation = getConversations(terminalSnapshots(), getTasks()).find((conv) => conv.id === conversationId)
  if (!conversation) throw new Error('Conversation not found.')
  const task = promoteConversationToTask(conversation, input)
  reconcileCurrentTasks()
  return task
})
ipcMain.handle('start-task-terminal', (_e, taskId: string, launcherId: TerminalLauncherId) => {
  const task = getTasks().find((entry) => entry.id === taskId)
  if (!task) throw new Error('Task not found.')
  const session = createTerminalSession(
    `${launcherId}-${randomUUID()}`,
    launcherId,
    `${task.title.slice(0, 36) || 'Task'} - ${launcherId}`,
    task.projectPath,
    task.id,
  )
  linkTerminalToTask(task.id, session.id)
  reconcileCurrentTasks()
  return session
})
ipcMain.handle('start-task-workflow', (_e, taskId: string) => {
  const task = getTasks().find((entry) => entry.id === taskId)
  if (!task) throw new Error('Task not found.')
  const workflow = getWorkflowDefinitions()[0]
  if (!workflow) throw new Error('Workflow definition not found.')
  const run = startWorkflowRun(workflow.id, task.brief.trim() || task.title)
  linkWorkflowRunToTask(task.id, run.id)
  reconcileCurrentTasks()
  return run
})
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
ipcMain.handle('get-codex-model', () => getCodexModel())
ipcMain.handle('set-codex-model', (_e, model: string) => saveCodexModel(model))
ipcMain.handle('get-codex-models', () => listCodexModels())

ipcMain.handle('get-gemini-key-status', () => isGeminiConnected())
ipcMain.handle('set-gemini-key', (_e, key: string) => saveGeminiKey(key))
ipcMain.handle('disconnect-gemini', () => clearGeminiCredentials())
ipcMain.handle('get-gemini-model', () => getGeminiModel())
ipcMain.handle('set-gemini-model', (_e, model: GeminiModel) => saveGeminiModel(model))

ipcMain.handle('get-deepseek-key-status', () => isDeepSeekConnected())
ipcMain.handle('set-deepseek-key', (_e, key: string) => saveDeepSeekKey(key))
ipcMain.handle('disconnect-deepseek', () => clearDeepSeekCredentials())
ipcMain.handle('get-deepseek-model', () => getDeepSeekModel())
ipcMain.handle('set-deepseek-model', (_e, model: DeepSeekModel) => saveDeepSeekModel(model))

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
ipcMain.handle('pull-ollama-model', (_e, model: string, baseUrl?: string) => pullOllamaModel(model, baseUrl))
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
const CODEX_CONVERSATION_REFRESH_MS = 4_000
let codexConversationRevision = ''

function emitConversationSnapshot(): void {
  win?.webContents.send('conversations-updated', getConversations(terminalSnapshots(), getTasks()))
}

function refreshCodexConversationSnapshot(): void {
  const nextRevision = getCodexConversationRevision()
  if (nextRevision === codexConversationRevision) return
  codexConversationRevision = nextRevision
  emitConversationSnapshot()
}

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

interface TerminalSessionState extends TerminalSessionSnapshot {
  output: string
  outputSequence: number
}

const TERMINAL_BUFFER_LIMIT = 200_000
const ptyProcesses = new Map<string, pty.IPty>()
const terminalSessions = new Map<string, TerminalSessionState>()
let taskReconcileTimer: ReturnType<typeof setTimeout> | null = null

function terminalEnvironment(): Record<string, string> {
  const home = process.env.HOME ?? ''
  const pathEntries = [
    `${home}/.npm-global/bin`,
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    process.env.PATH ?? '',
  ].filter(Boolean)

  return {
    ...(process.env as Record<string, string>),
    PATH: pathEntries.join(':'),
  }
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

function terminalSessionSnapshot(session: TerminalSessionState): TerminalSessionSnapshot {
  const { output: _output, outputSequence: _outputSequence, ...snapshot } = session
  return snapshot
}

function terminalSnapshots(): TerminalSessionSnapshot[] {
  return Array.from(terminalSessions.values()).map(terminalSessionSnapshot)
}

function reconcileCurrentTasks(): void {
  reconcileTasks(terminalSnapshots(), getWorkflowRuns())
}

function scheduleTaskReconcile(): void {
  if (taskReconcileTimer) return
  taskReconcileTimer = setTimeout(() => {
    taskReconcileTimer = null
    reconcileCurrentTasks()
  }, 1000)
}

function appendTerminalOutput(id: string, data: string) {
  const session = terminalSessions.get(id)
  if (!session) return 0
  session.outputSequence += 1
  session.output = `${session.output}${data}`
  session.lastActivityAt = new Date().toISOString()
  const cleanPreview = stripAnsi(session.output).replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean).slice(-3).join('\n')
  session.lastOutputPreview = cleanPreview.slice(-500)
  if (session.output.length > TERMINAL_BUFFER_LIMIT) {
    session.output = session.output.slice(session.output.length - TERMINAL_BUFFER_LIMIT)
  }
  scheduleTaskReconcile()
  return session.outputSequence
}

ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Select Folder',
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('terminal-list', () => terminalSnapshots())

ipcMain.handle('terminal-buffer', (_e, id: string) => {
  const session = terminalSessions.get(id)
  return { output: session?.output ?? '', sequence: session?.outputSequence ?? 0 }
})

function createTerminalSession(id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string): TerminalSessionSnapshot {
  const existing = terminalSessions.get(id)
  if (existing) return terminalSessionSnapshot(existing)

  const shell = process.env.SHELL ?? '/bin/zsh'
  const codexBin = findCliTool('codex')
  const claudeBin = findCliTool('claude')
  const geminiBin = findCliTool('gemini')
  const deepSeekBin = findCliTool('deepseek')
  const cursorAgentBin = findCliTool('cursor-agent')
  const ollamaBin = findCliTool('ollama')
  const ollamaConfig = getOllamaConfig()
  const localAgentCommand = ollamaConfig?.model
    ? `exec ${shellQuote(ollamaBin)} run ${shellQuote(ollamaConfig.model)}`
    : `printf '%s\\n' 'No Local/Ollama model is configured yet. Configure Local in Relay settings, or run: ollama run <model>'; exec ${shellQuote(shell)} -l`
  const launcherMap: Record<TerminalLauncherId, { file: string; args: string[] }> = {
    codex: { file: shell, args: ['-l', '-c', `exec "${codexBin}"`] },
    claude: { file: shell, args: ['-l', '-c', `exec "${claudeBin}"`] },
    gemini: { file: shell, args: ['-l', '-c', `exec "${geminiBin}"`] },
    deepseek: { file: shell, args: ['-l', '-c', `exec "${deepSeekBin}" run`] },
    cursor: { file: shell, args: ['-l', '-c', `exec "${cursorAgentBin}"`] },
    local: { file: shell, args: ['-l', '-c', localAgentCommand] },
    shell: { file: shell, args: ['-l'] },
  }
  const { file, args } = launcherMap[launcherId]
  const session: TerminalSessionState = {
    id,
    launcherId,
    name,
    cwd,
    taskId,
    status: 'running',
    lastActivityAt: new Date().toISOString(),
    lastOutputPreview: '',
    output: '',
    outputSequence: 0,
  }
  terminalSessions.set(id, session)
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd ?? process.env.HOME ?? '/',
    env: terminalEnvironment(),
  })
  ptyProcesses.set(id, proc)
  proc.onData((data) => {
    const sequence = appendTerminalOutput(id, data)
    win?.webContents.send('terminal-data', id, data, sequence)
  })
  proc.onExit(({ exitCode }) => {
    ptyProcesses.delete(id)
    const current = terminalSessions.get(id)
    if (current) {
      current.status = 'exited'
      current.exitCode = exitCode
    }
    const exitMessage = `\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`
    const sequence = appendTerminalOutput(id, exitMessage)
    win?.webContents.send('terminal-data', id, exitMessage, sequence)
    win?.webContents.send('terminal-exit', id, exitCode)
    reconcileCurrentTasks()
  })
  const snapshot = terminalSessionSnapshot(session)
  win?.webContents.send('terminal-created', snapshot)
  return snapshot
}

ipcMain.handle('terminal-create', (_e, id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string) => {
  const session = createTerminalSession(id, launcherId, name, cwd, taskId)
  if (taskId) linkTerminalToTask(taskId, session.id)
  reconcileCurrentTasks()
  return session
})

ipcMain.handle('terminal-input', (_e, id: string, data: string) => {
  const proc = ptyProcesses.get(id)
  if (!proc) {
    const message = '\r\n\x1b[31m[Terminal session is not running]\x1b[0m\r\n'
    const sequence = appendTerminalOutput(id, message)
    win?.webContents.send('terminal-data', id, message, sequence)
    return false
  }
  proc.write(data)
  return true
})

ipcMain.handle('terminal-resize', (_e, id: string, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows)
})

ipcMain.handle('terminal-kill', (_e, id: string) => {
  try { ptyProcesses.get(id)?.kill() } catch { /* already dead */ }
  ptyProcesses.delete(id)
  terminalSessions.delete(id)
})

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(app.getAppPath(), 'build', 'icon', 'icon_1024.png')
    if (fs.existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }
  createWindow()
  codexConversationRevision = getCodexConversationRevision()
  if (isOllamaConfigured()) ensureOllamaRunning().catch(() => {})
  reconcileCurrentTasks()
  setInterval(reconcileCurrentTasks, 30_000)
  setInterval(refreshCodexConversationSnapshot, CODEX_CONVERSATION_REFRESH_MS)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => stopOllamaProcess())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
