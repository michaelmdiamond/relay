import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, Tray } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
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
  cloneImportedConversation,
  sendMessage,
  updateConversationMemory,
  updateThreadResumeState,
  updateThreadStatus,
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
import type { CodexStatusItem, CodexStatusSnapshot, DeepSeekModel, DispatchRecommendation, GeminiModel, TerminalLauncherId, TerminalSessionSnapshot } from '../shared/types'
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
import { getAutomationCatalog } from './automations'
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
import { getWorkspaceById, getWorkspaceForProjectPath, getWorkspaces } from './workspaces'
import { codexStatusRevision, getCodexStatusSnapshot } from './codex-status'
import { getDispatchRecommendation, type DispatchContext } from './dispatcher'

app.setName('Relay')
process.title = 'Relay'
nativeTheme.themeSource = 'dark'
// Suppress Chromium's verbose CoreText/font-fallback noise on macOS Sequoia
app.commandLine.appendSwitch('log-level', '3')

let win: BrowserWindow | null = null
let tray: Tray | null = null
let pendingCodexFocusConversationId: string | null = null

function sendToWindow(target: BrowserWindow | null, channel: string, ...args: unknown[]): void {
  if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return
  target.webContents.send(channel, ...args)
}

setWorkflowRunEmitter((run) => {
  sendToWindow(win, 'workflow-run-updated', run)
  reconcileCurrentTasks()
})

setTaskEmitter((tasks) => {
  sendToWindow(win, 'tasks-updated', tasks)
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

  win.on('closed', () => {
    win = null
  })
  win.webContents.once('did-finish-load', () => {
    if (!pendingCodexFocusConversationId) return
    sendToWindow(win, 'focus-codex-thread', pendingCodexFocusConversationId)
    pendingCodexFocusConversationId = null
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const STATE_LABEL: Record<CodexStatusItem['state'], string> = {
  active: 'Active',
  completed: 'Done',
  idle: 'Idle',
  interrupted: 'Stopped',
  stale: 'Stale',
}

function formatStatusAge(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'unknown'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function truncateMenuText(value: string, maxLength = 64): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, maxLength - 3)}...`
}

function statusSummary(snapshot: CodexStatusSnapshot): string {
  if (snapshot.activeCount > 0) {
    return `${snapshot.activeCount} active ${snapshot.activeCount === 1 ? 'agent' : 'agents'}`
  }
  if (snapshot.items.length > 0) return 'No active agents'
  return 'No agents found'
}

function trayIcon(): Electron.NativeImage {
  const candidates = [
    path.join(app.getAppPath(), 'build', 'icon', 'icon.icns'),
    path.join(process.resourcesPath, 'icon.icns'),
    path.join(process.resourcesPath, 'build', 'icon', 'icon.icns'),
  ]
  const iconPath = candidates.find((candidate) => fs.existsSync(candidate))
  const image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty()
  const sized = image.isEmpty() ? image : image.resize({ width: 18, height: 18 })
  if (process.platform === 'darwin') sized.setTemplateImage(true)
  return sized
}

function focusCodexThreadById(threadId: string): void {
  if (!threadId.trim()) return
  const conversationId = `codex:${threadId}`
  if (!win) {
    pendingCodexFocusConversationId = conversationId
    createWindow()
  }
  if (win?.isMinimized()) win.restore()
  win?.show()
  win?.focus()
  if (pendingCodexFocusConversationId !== conversationId) {
    sendToWindow(win, 'focus-codex-thread', conversationId)
  }
}

function showMainWindow(): void {
  if (!win) createWindow()
  if (win?.isMinimized()) win.restore()
  win?.show()
  win?.focus()
}

function buildStatusMenu(snapshot: CodexStatusSnapshot): MenuItemConstructorOptions[] {
  const statusItems: MenuItemConstructorOptions[] = snapshot.items.slice(0, 8).map((item) => ({
    label: `${STATE_LABEL[item.state]} · ${truncateMenuText(item.agentNickname || item.title, 42)} · ${formatStatusAge(item.lastActivityAt)}`,
    sublabel: truncateMenuText(item.lastMessage || item.cwd || 'Open this Codex thread in Relay'),
    click: () => focusCodexThreadById(item.id),
  }))

  return [
    {
      label: `Relay Codex: ${statusSummary(snapshot)}`,
      enabled: false,
    },
    { type: 'separator' },
    ...(statusItems.length > 0 ? statusItems : [{ label: 'No Codex agents found', enabled: false }]),
    { type: 'separator' },
    {
      label: 'Open Relay',
      click: showMainWindow,
    },
    {
      label: 'Refresh Status',
      click: () => {
        codexStatusSnapshot = getCodexStatusSnapshot()
        codexStatusStateRevision = codexStatusRevision(codexStatusSnapshot)
        emitCodexStatusSnapshot()
      },
    },
    { role: 'quit', label: 'Quit Relay' },
  ]
}

function updateTrayStatus(snapshot: CodexStatusSnapshot): void {
  if (!tray) return
  tray.setToolTip(`Relay Codex: ${statusSummary(snapshot)}`)
  tray.setTitle(process.platform === 'darwin' && snapshot.activeCount > 0 ? `Relay ${snapshot.activeCount}` : '')
  tray.setContextMenu(Menu.buildFromTemplate(buildStatusMenu(snapshot)))
}

function createTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setIgnoreDoubleClickEvents(true)
  tray.on('click', () => {
    tray?.popUpContextMenu()
  })
  updateTrayStatus(codexStatusSnapshot)
}

// ── IPC ────────────────────────────────────────────────

ipcMain.handle('get-api-key-status', () => ({ configured: isApiKeyConfigured() }))
ipcMain.handle('set-api-key', (_e, key: string) => saveApiKey(key))
ipcMain.handle('get-workspaces', () => getWorkspaces(getConversations(terminalSnapshots(), getTasks()), getTasks()))
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
  const inferredWorkspaceId = task.workspaceId ?? getWorkspaceForProjectPath(task.projectPath)?.id
  const session = createTerminalSession(
    `${launcherId}-${randomUUID()}`,
    launcherId,
    `${task.title.slice(0, 36) || 'Task'} - ${launcherId}`,
    task.projectPath,
    task.id,
    inferredWorkspaceId,
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
  const inferredWorkspaceId = task.workspaceId ?? getWorkspaceForProjectPath(task.projectPath)?.id
  const run = startWorkflowRun(workflow.id, task.brief.trim() || task.title, inferredWorkspaceId)
  linkWorkflowRunToTask(task.id, run.id)
  reconcileCurrentTasks()
  return run
})
ipcMain.handle('get-dispatch-recommendation', (_e, taskId: string) => {
  const openAI = isOpenAIConnected()
  const gemini = isGeminiConnected()
  const deepSeek = isDeepSeekConnected()
  const ollama = getOllamaConfig()
  const cursor = isCursorConnected()
  const ctx: DispatchContext = {
    openAIConnected: openAI.connected,
    geminiConnected: gemini.configured,
    deepSeekConnected: deepSeek.configured,
    ollamaConfigured: isOllamaConfigured(),
    cursorConfigured: cursor.configured,
    ollamaModel: ollama?.model,
  }
  return getDispatchRecommendation(taskId, ctx)
})
ipcMain.handle('dispatch-task', (_e, taskId: string, rec: DispatchRecommendation) => {
  const task = getTasks().find((t) => t.id === taskId)
  if (!task) throw new Error('Task not found.')

  if (rec.agent === 'workflow') {
    const workflow = getWorkflowDefinitions()[0]
    if (!workflow) throw new Error('No workflow definition found.')
    const inferredWorkspaceId = task.workspaceId ?? getWorkspaceForProjectPath(task.projectPath)?.id
    const run = startWorkflowRun(workflow.id, rec.launchPrompt, inferredWorkspaceId)
    linkWorkflowRunToTask(task.id, run.id)
    updateTaskState(task.id, 'running')
    reconcileCurrentTasks()
    return { kind: 'workflow' as const, workflowName: run.workflowName }
  }

  const launcherId = rec.agent as TerminalLauncherId
  const inferredWorkspaceId = task.workspaceId ?? getWorkspaceForProjectPath(task.projectPath)?.id
  const session = createTerminalSession(
    `${launcherId}-${randomUUID()}`,
    launcherId,
    `${task.title.slice(0, 36) || 'Task'} - ${launcherId}`,
    task.projectPath,
    task.id,
    inferredWorkspaceId,
  )
  linkTerminalToTask(task.id, session.id)
  updateTaskState(task.id, 'running')
  setTimeout(() => {
    ptyProcesses.get(session.id)?.write(`${rec.launchPrompt}\n`)
  }, 2500)
  reconcileCurrentTasks()
  return { kind: 'terminal' as const, sessionId: session.id, sessionName: session.name }
})
ipcMain.handle('update-conversation-memory', (_e, conversationId: string, memory) => updateConversationMemory(conversationId, memory))
ipcMain.handle('compact-conversation', (_e, conversationId: string) => compactConversation(conversationId))
ipcMain.handle('estimate-tokens', (_e, text: string) => estimateTokens(text))
ipcMain.handle('get-agent-profiles', () => getAgentProfiles())
ipcMain.handle('save-agent-profile', (_e, profile) => saveAgentProfile(profile))
ipcMain.handle('get-workflow-definitions', () => getWorkflowDefinitions())
ipcMain.handle('get-workflow-runs', () => getWorkflowRuns())
ipcMain.handle('start-workflow-run', (_e, workflowId: string, goal: string, workspaceId?: string) => startWorkflowRun(workflowId, goal, workspaceId))
ipcMain.handle('get-automation-catalog', () => getAutomationCatalog())
ipcMain.handle('new-conversation', (_e, workspaceId?: string) => {
  const workspace = getWorkspaceById(workspaceId)
  return newConversation({
    workspaceId: workspace?.id,
    projectName: workspace?.name,
    projectPath: workspace?.projectPath,
    preserveEmptyProject: workspace?.kind === 'general',
  })
})
ipcMain.handle('delete-conversation', (_e, id: string) => deleteConversation(id))
ipcMain.handle('update-thread-status', (_e, id: string, status) => updateThreadStatus(id, status))
ipcMain.handle('update-thread-resume-state', (_e, id: string, state) => updateThreadResumeState(id, state))
ipcMain.handle('clone-imported-conversation', (_e, sourceId: string) => cloneImportedConversation(sourceId))

ipcMain.handle('get-openai-auth-status', () => isOpenAIConnected())
ipcMain.handle('start-openai-login', () => startLogin())
ipcMain.handle('disconnect-openai', () => { clearCredentials(); resetModelCache() })
ipcMain.handle('get-codex-model', () => getCodexModel())
ipcMain.handle('set-codex-model', (_e, model: string) => saveCodexModel(model))
ipcMain.handle('get-codex-models', () => listCodexModels())
ipcMain.handle('get-codex-status', () => getCodexStatusSnapshot())
ipcMain.handle('focus-codex-thread', (_e, threadId: string) => {
  focusCodexThreadById(threadId)
})

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
let codexStatusSnapshot = getCodexStatusSnapshot()
let codexStatusStateRevision = codexStatusRevision(codexStatusSnapshot)

function emitConversationSnapshot(): void {
  sendToWindow(win, 'conversations-updated', getConversations(terminalSnapshots(), getTasks()))
}

function refreshCodexConversationSnapshot(): void {
  const nextRevision = getCodexConversationRevision()
  if (nextRevision === codexConversationRevision) return
  codexConversationRevision = nextRevision
  emitConversationSnapshot()
}

function emitCodexStatusSnapshot(): void {
  sendToWindow(win, 'codex-status-updated', codexStatusSnapshot)
  updateTrayStatus(codexStatusSnapshot)
}

ipcMain.handle('send-message', (_e, conversationId: string, content: string, modelChoice: string, options) => {
  // Cancel any in-flight request for this conversation before starting a new one
  activeControllers.get(conversationId)?.abort()
  const controller = new AbortController()
  activeControllers.set(conversationId, controller)

  sendMessage(conversationId, content, modelChoice as never, controller.signal, {
    streamStart: (convId, msgId, routing) => sendToWindow(win, 'chat-stream-start', convId, msgId, routing),
    chunk: (convId, msgId, chunk) => sendToWindow(win, 'chat-chunk', convId, msgId, chunk),
    done: (convId, message) => {
      activeControllers.delete(conversationId)
      sendToWindow(win, 'chat-message-done', convId, message)
    },
    error: (convId, msgId, error) => {
      activeControllers.delete(conversationId)
      sendToWindow(win, 'chat-error', convId, msgId, error)
    },
    cancel: (convId, msgId) => {
      activeControllers.delete(conversationId)
      sendToWindow(win, 'chat-canceled', convId, msgId)
    },
  }, options)
})

ipcMain.handle('cancel-message', (_e, conversationId: string) => {
  activeControllers.get(conversationId)?.abort()
  activeControllers.delete(conversationId)
})

// ── Terminal / PTY ────────────────────────────────────────────

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

function appendOutputPreview(currentPreview: string, data: string): string {
  const cleanLines = stripAnsi(data)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  if (cleanLines.length === 0) return currentPreview
  return [...currentPreview.split('\n').filter(Boolean), ...cleanLines].slice(-3).join('\n').slice(-500)
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
  session.lastOutputPreview = appendOutputPreview(session.lastOutputPreview ?? '', data)
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

function createTerminalSession(id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string, workspaceId?: string): TerminalSessionSnapshot {
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
    workspaceId,
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
    sendToWindow(win, 'terminal-data', id, data, sequence)
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
    sendToWindow(win, 'terminal-data', id, exitMessage, sequence)
    sendToWindow(win, 'terminal-exit', id, exitCode)
    reconcileCurrentTasks()
  })
  const snapshot = terminalSessionSnapshot(session)
  sendToWindow(win, 'terminal-created', snapshot)
  return snapshot
}

ipcMain.handle('terminal-create', (_e, id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string, workspaceId?: string) => {
  const selectedWorkspace = getWorkspaceById(workspaceId)
  const inferredWorkspaceId = selectedWorkspace?.kind === 'repo'
    ? selectedWorkspace.id
    : getWorkspaceForProjectPath(cwd)?.id ?? workspaceId
  const session = createTerminalSession(id, launcherId, name, cwd, taskId, inferredWorkspaceId)
  if (taskId) linkTerminalToTask(taskId, session.id)
  reconcileCurrentTasks()
  return session
})

ipcMain.on('terminal-input', (_e, id: string, data: string) => {
  const proc = ptyProcesses.get(id)
  if (!proc) {
    const message = '\r\n\x1b[31m[Terminal session is not running]\x1b[0m\r\n'
    const sequence = appendTerminalOutput(id, message)
    sendToWindow(win, 'terminal-data', id, message, sequence)
    return
  }
  proc.write(data)
})

ipcMain.on('terminal-resize', (_e, id: string, cols: number, rows: number) => {
  ptyProcesses.get(id)?.resize(cols, rows)
})

ipcMain.handle('terminal-kill', (_e, id: string) => {
  try { ptyProcesses.get(id)?.kill() } catch { /* already dead */ }
  ptyProcesses.delete(id)
  terminalSessions.delete(id)
})

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(app.getAppPath(), 'build', 'icon', 'icon_1024.png')
    if (fs.existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }
  createWindow()
  createTray()
  codexConversationRevision = getCodexConversationRevision()
  if (isOllamaConfigured()) ensureOllamaRunning().catch(() => {})
  reconcileCurrentTasks()
  setInterval(reconcileCurrentTasks, 30_000)
  setInterval(refreshCodexConversationSnapshot, CODEX_CONVERSATION_REFRESH_MS)
  app.on('activate', () => {
    if (!win) createWindow()
  })
})

app.on('before-quit', () => {
  stopOllamaProcess()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
