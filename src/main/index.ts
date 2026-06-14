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
import type { AgentRunEvent, AgentRunNode, AgentRunSnapshot, AgentRunStatus, CodexStatusItem, CodexStatusSnapshot, DeepSeekModel, GeminiModel, TerminalLauncherId, TerminalSessionSnapshot } from '../shared/types'
import { getUsageLimits, saveUsageLimits } from './usage-limits'
import { getConnectorInventory } from './connectors'
import { getSkills } from './skills'
import {
  deleteAgentProfile,
  getAgentKnowledge,
  getAgentProfiles,
  getAgentRuns,
  getWorkflowDefinitions,
  getWorkflowRuns,
  saveAgentProfile,
  runAgentProfile,
  setWorkflowRunEmitter,
  startWorkflowRun,
} from './workflows'
import { getAutomationCatalog } from './automations'
import {
  createScheduledAutomation,
  deleteScheduledAutomation,
  getScheduledAutomations,
  initAutomationScheduler,
  runAutomationNow,
  setAutomationEmitter,
  shutdownAutomationScheduler,
  updateScheduledAutomation,
} from './scheduled-automations'
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
import {
  archiveExperimentCase,
  createExperimentAttempt,
  createExperimentCase,
  findExperimentAttemptForTask,
  findExperimentAttemptForTerminal,
  generateExperimentPostmortem,
  getExperiments,
  linkAttemptEvidence,
  recordGuardrailEvent,
  setExperimentsEmitter,
  updateExperimentAttempt,
  updateExperimentCase,
  upsertRunEvidenceFromSnapshot,
} from './experiments'
import { addWorkspaceForProjectPath, getWorkspaceById, getWorkspaceForProjectPath, getWorkspaces } from './workspaces'
import { codexStatusRevision, getCodexStatusSnapshot } from './codex-status'

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

function restartRelay(): void {
  app.relaunch()
  app.exit(0)
}

setWorkflowRunEmitter((run) => {
  sendToWindow(win, 'workflow-run-updated', run)
  reconcileCurrentTasks()
})

setAutomationEmitter((automations) => {
  sendToWindow(win, 'scheduled-automations-updated', automations)
})

setTaskEmitter((tasks) => {
  sendToWindow(win, 'tasks-updated', tasks)
})

setExperimentsEmitter((snapshot) => {
  sendToWindow(win, 'experiments-updated', snapshot)
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

function createApplicationMenu(): void {
  const appMenu: MenuItemConstructorOptions = process.platform === 'darwin'
    ? {
        label: app.name,
        submenu: [
          { label: 'Restart Relay', accelerator: 'CommandOrControl+Shift+R', click: restartRelay },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit', label: 'Quit Relay' },
        ],
      }
    : {
        label: 'File',
        submenu: [
          { label: 'Restart Relay', accelerator: 'CommandOrControl+Shift+R', click: restartRelay },
          { type: 'separator' },
          { role: 'quit', label: 'Quit Relay' },
        ],
      }

  Menu.setApplicationMenu(Menu.buildFromTemplate([
    appMenu,
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
      ],
    },
  ]))
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
      label: 'Restart Relay',
      click: restartRelay,
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

// ── IPC ──────────────────────────────────────────────────────────

ipcMain.handle('get-api-key-status', () => ({ configured: isApiKeyConfigured() }))
ipcMain.handle('set-api-key', (_e, key: string) => saveApiKey(key))
ipcMain.handle('get-workspaces', () => getWorkspaces(getConversations(terminalSnapshots(), getTasks()), getTasks()))
ipcMain.handle('add-workspace-for-path', (_e, projectPath: string) => addWorkspaceForProjectPath(projectPath))
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
ipcMain.handle('get-experiments', () => getExperiments())
ipcMain.handle('create-experiment-case', (_e, input) => createExperimentCase(input))
ipcMain.handle('update-experiment-case', (_e, id: string, input) => updateExperimentCase(id, input))
ipcMain.handle('archive-experiment-case', (_e, id: string) => archiveExperimentCase(id))
ipcMain.handle('create-experiment-attempt', (_e, experimentId: string, input) => createExperimentAttempt(experimentId, input))
ipcMain.handle('update-experiment-attempt', (_e, id: string, input) => updateExperimentAttempt(id, input))
ipcMain.handle('link-attempt-evidence', (_e, attemptId: string, links) => linkAttemptEvidence(attemptId, links))
ipcMain.handle('generate-experiment-postmortem', (_e, experimentId: string, input) => generateExperimentPostmortem(experimentId, input))
ipcMain.handle('update-conversation-memory', (_e, conversationId: string, memory) => updateConversationMemory(conversationId, memory))
ipcMain.handle('compact-conversation', (_e, conversationId: string) => compactConversation(conversationId))
ipcMain.handle('estimate-tokens', (_e, text: string) => estimateTokens(text))
ipcMain.handle('restart-app', () => restartRelay())
ipcMain.handle('get-agent-profiles', () => getAgentProfiles())
ipcMain.handle('save-agent-profile', (_e, profile) => saveAgentProfile(profile))
ipcMain.handle('delete-agent-profile', (_e, id: string) => deleteAgentProfile(id))
ipcMain.handle('get-agent-knowledge', (_e, agentId: string) => getAgentKnowledge(agentId))
ipcMain.handle('get-agent-runs', (_e, agentId: string) => getAgentRuns(agentId))
ipcMain.handle('run-agent-profile', (_e, input) => runAgentProfile(input))
ipcMain.handle('get-workflow-definitions', () => getWorkflowDefinitions())
ipcMain.handle('get-workflow-runs', () => getWorkflowRuns())
ipcMain.handle('start-workflow-run', (_e, workflowId: string, goal: string, workspaceId?: string) => startWorkflowRun(workflowId, goal, workspaceId))
ipcMain.handle('get-automation-catalog', () => getAutomationCatalog())
ipcMain.handle('get-scheduled-automations', () => getScheduledAutomations())
ipcMain.handle('create-scheduled-automation', (_e, input) => createScheduledAutomation(input))
ipcMain.handle('update-scheduled-automation', (_e, id: string, input) => updateScheduledAutomation(id, input))
ipcMain.handle('delete-scheduled-automation', (_e, id: string) => deleteScheduledAutomation(id))
ipcMain.handle('run-automation-now', (_e, id: string) => runAutomationNow(id))
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
const AGENT_RUN_EVENT_LIMIT = 200
const ptyProcesses = new Map<string, pty.IPty>()
const terminalSessions = new Map<string, TerminalSessionState>()
const agentRuns = new Map<string, AgentRunSnapshot>()
const terminalAgentRunIds = new Map<string, string>()
const terminalOutputTimers = new Map<string, ReturnType<typeof setTimeout>>()
const terminalOutputPreviews = new Map<string, string>()
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

function previewText(value: string): string {
  return stripAnsi(value)
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .slice(-2)
    .join('\n')
    .slice(-240)
}

function cleanOutputLines(value: string): string[] {
  return stripAnsi(value)
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
}

function compactTerminalLine(line: string): string {
  return line
    .replace(/^[•›\s└─│]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function eventExists(run: AgentRunSnapshot, event: Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'>): boolean {
  const key = [
    event.type,
    event.tool ?? '',
    event.path ?? '',
    event.message ?? '',
    event.summary ?? '',
    event.result ?? '',
    event.text ?? '',
  ].join('|')
  return run.events.slice(-24).some((existing) => [
    existing.type,
    existing.tool ?? '',
    existing.path ?? '',
    existing.message ?? '',
    existing.summary ?? '',
    existing.result ?? '',
    existing.text ?? '',
  ].join('|') === key)
}

function appendUniqueAgentRunEvent(runId: string, event: Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'>): AgentRunSnapshot | null {
  const run = agentRuns.get(runId)
  if (!run || eventExists(run, event)) return run ?? null
  return appendAgentRunEvent(runId, event)
}

function inferActivityEventFromLine(agent: AgentRunNode, line: string): Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'> | null {
  const text = compactTerminalLine(line)
  if (!text || text.length < 3) return null

  const fileMatch = text.match(/^(Edited|Created|Deleted)\s+(.+?)(?:\s+\([^)]+\))?$/i)
  if (fileMatch) {
    const verb = fileMatch[1].toLowerCase()
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'file_touched',
      path: fileMatch[2],
      action: verb === 'created' ? 'create' : verb === 'deleted' ? 'delete' : 'edit',
      summary: `${fileMatch[1]} ${fileMatch[2]}`,
    }
  }

  const commandMatch = text.match(/^(?:Ran|Run)\s+(.+)$/i)
  if (commandMatch) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'tool_started',
      tool: 'terminal',
      summary: commandMatch[1].slice(0, 220),
    }
  }

  if (/^(Searching the web|Searched\b|Search\b)/i.test(text)) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'tool_started',
      tool: 'web',
      summary: text.slice(0, 220),
    }
  }

  if (/^(Read|List|Open|Explored)\b/i.test(text)) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'tool_started',
      tool: 'workspace',
      summary: text.slice(0, 220),
    }
  }

  if (/\b(?:npm|pnpm|yarn|bun|cargo|go|pytest|python|uv|swift|xcodebuild)\s+(?:run\s+)?(?:test|build|typecheck|check|lint)\b/i.test(text)) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'tool_started',
      tool: 'verification',
      summary: text.slice(0, 220),
    }
  }

  if (/^(Implemented|Fixed|Verified|Verification|Blocked|Failed|Error|Done|Completed)\b/i.test(text)) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'agent_status',
      status: /^Blocked\b/i.test(text) ? 'blocked' : 'running',
      message: text.slice(0, 260),
    }
  }

  if (/^(I('|’)m|I will|I’ll|I found|I need|I don('|’)t|The )/i.test(text) && text.length <= 280) {
    return {
      agentId: agent.id,
      parentAgentId: agent.parentAgentId,
      type: 'agent_status',
      status: 'running',
      message: text,
    }
  }

  return null
}

function inferActivityEventsFromTerminalOutput(sessionId: string, data: string): void {
  const run = agentRunForTerminal(sessionId)
  const agent = run?.agents.find((entry) => entry.role === 'main') ?? run?.agents[0]
  if (!run || !agent) return
  for (const line of cleanOutputLines(data)) {
    const event = inferActivityEventFromLine(agent, line)
    if (!event) continue
    appendUniqueAgentRunEvent(run.id, event)
  }
}

function terminalSessionSnapshot(session: TerminalSessionState): TerminalSessionSnapshot {
  const { output: _output, outputSequence: _outputSequence, ...snapshot } = session
  return snapshot
}

function terminalSnapshots(): TerminalSessionSnapshot[] {
  return Array.from(terminalSessions.values()).map(terminalSessionSnapshot)
}

function emitAgentRunUpdated(run: AgentRunSnapshot): void {
  sendToWindow(win, 'agent-run-updated', run)
}

function agentRunForTerminal(terminalSessionId: string): AgentRunSnapshot | null {
  const runId = terminalAgentRunIds.get(terminalSessionId)
  return runId ? agentRuns.get(runId) ?? null : null
}

function updateAgentRun(runId: string, updater: (run: AgentRunSnapshot) => AgentRunSnapshot): AgentRunSnapshot | null {
  const current = agentRuns.get(runId)
  if (!current) return null
  const next = updater(current)
  agentRuns.set(runId, next)
  upsertRunEvidenceFromSnapshot(next)
  emitAgentRunUpdated(next)
  return next
}

function appendAgentRunEvent(runId: string, event: Omit<AgentRunEvent, 'id' | 'runId' | 'createdAt'>): AgentRunSnapshot | null {
  return updateAgentRun(runId, (run) => {
    const now = new Date().toISOString()
    const nextEvent: AgentRunEvent = {
      ...event,
      id: `${runId}-event-${randomUUID()}`,
      runId,
      createdAt: now,
    }
    const agents = run.agents.map((agent): AgentRunNode => {
      if (agent.id !== event.agentId) return agent
      const nextStatus = event.status ?? agent.status
      const nextFiles = event.path ? [...new Set([...agent.filesTouched, event.path])] : agent.filesTouched
      return {
        ...agent,
        status: nextStatus,
        message: event.message ?? event.summary ?? event.result ?? agent.message,
        updatedAt: now,
        completedAt: nextStatus === 'done' || nextStatus === 'failed' ? now : agent.completedAt,
        filesTouched: nextFiles,
        lastOutputPreview: event.text ? previewText(event.text) || agent.lastOutputPreview : agent.lastOutputPreview,
      }
    })
    const status = agents.some((agent) => agent.status === 'failed')
      ? 'failed'
      : agents.every((agent) => agent.status === 'done')
        ? 'done'
        : agents.some((agent) => agent.status === 'blocked')
          ? 'blocked'
          : 'running'
    return {
      ...run,
      status,
      updatedAt: now,
      agents,
      events: [...run.events, nextEvent].slice(-AGENT_RUN_EVENT_LIMIT),
    }
  })
}

function addAgentRunNode(runId: string, node: AgentRunNode, eventMessage: string): AgentRunSnapshot | null {
  const added = updateAgentRun(runId, (run) => {
    if (run.agents.some((agent) => agent.id === node.id || agent.title === node.title)) return run
    const now = new Date().toISOString()
    return {
      ...run,
      status: 'running',
      updatedAt: now,
      agents: [...run.agents, node],
    }
  })
  const current = agentRuns.get(runId)
  const agent = current?.agents.find((entry) => entry.id === node.id || entry.title === node.title)
  if (!agent || current?.events.some((event) => event.agentId === agent.id && event.type === 'agent_started')) return added
  return appendAgentRunEvent(runId, {
    agentId: agent.id,
    parentAgentId: agent.parentAgentId,
    type: 'agent_started',
    title: agent.title,
    status: 'running',
    message: eventMessage,
  })
}

function createAgentRunForTerminal(session: TerminalSessionState): AgentRunSnapshot {
  const existing = agentRunForTerminal(session.id)
  if (existing) return existing
  const now = new Date().toISOString()
  const agentId = `${session.id}:main`
  const run: AgentRunSnapshot = {
    id: `terminal-run-${session.id}`,
    terminalSessionId: session.id,
    workspaceId: session.workspaceId,
    title: session.name,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    agents: [{
      id: agentId,
      title: session.name,
      provider: session.launcherId,
      role: 'main',
      status: 'running',
      message: session.cwd ? `Running in ${session.cwd}` : 'Terminal session started.',
      startedAt: now,
      updatedAt: now,
      filesTouched: [],
    }],
    events: [],
  }
  agentRuns.set(run.id, run)
  terminalAgentRunIds.set(session.id, run.id)
  appendAgentRunEvent(run.id, {
    agentId,
    type: 'agent_started',
    title: session.name,
    status: 'running',
    message: session.cwd ? `Running in ${session.cwd}` : 'Terminal session started.',
  })
  return agentRuns.get(run.id) ?? run
}

function updateTerminalAgentStatus(sessionId: string, status: AgentRunStatus, message: string): void {
  const run = agentRunForTerminal(sessionId)
  const agent = run?.agents[0]
  if (!run || !agent) return
  appendAgentRunEvent(run.id, {
    agentId: agent.id,
    type: status === 'done' || status === 'failed' ? 'agent_finished' : 'agent_status',
    status,
    message,
    result: message,
  })
}

function inferSubagentsFromTerminalOutput(sessionId: string, data: string): void {
  const run = agentRunForTerminal(sessionId)
  const mainAgent = run?.agents.find((agent) => agent.role === 'main') ?? run?.agents[0]
  if (!run || !mainAgent) return
  const lines = cleanOutputLines(data)
  for (const line of lines) {
    if (!/(sub[-\s]?agent|worker|delegate|spawn(?:ed|ing)?|launch(?:ed|ing)?.*(agent|worker|task)|task agent)/i.test(line)) continue
    const title = line
      .replace(/^[\W_]+/, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
    const nodeId = `${sessionId}:sub:${Buffer.from(title).toString('base64url').slice(0, 24)}`
    addAgentRunNode(run.id, {
      id: nodeId,
      title,
      provider: mainAgent.provider,
      role: 'subagent',
      parentAgentId: mainAgent.id,
      status: 'running',
      message: 'Reported by terminal output.',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      filesTouched: [],
    }, 'Reported by terminal output.')
  }
}

function scheduleTerminalOutputEvent(sessionId: string, data: string): void {
  const preview = previewText(data)
  if (!preview) return
  terminalOutputPreviews.set(sessionId, preview)
  inferSubagentsFromTerminalOutput(sessionId, data)
  inferActivityEventsFromTerminalOutput(sessionId, data)
  if (terminalOutputTimers.has(sessionId)) return
  terminalOutputTimers.set(sessionId, setTimeout(() => {
    terminalOutputTimers.delete(sessionId)
    const text = terminalOutputPreviews.get(sessionId)
    terminalOutputPreviews.delete(sessionId)
    if (!text) return
    const run = agentRunForTerminal(sessionId)
    const agent = run?.agents.find((entry) => entry.role === 'main') ?? run?.agents[0]
    if (!run || !agent) return
    appendAgentRunEvent(run.id, {
      agentId: agent.id,
      type: 'tool_output',
      text,
      stream: 'stdout',
    })
  }, 750))
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

ipcMain.handle('terminal-agent-run', (_e, id: string) => agentRunForTerminal(id))

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
  createAgentRunForTerminal(session)
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
    scheduleTerminalOutputEvent(id, data)
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
    updateTerminalAgentStatus(id, exitCode === 0 ? 'done' : 'failed', `Process exited with code ${exitCode}.`)
    sendToWindow(win, 'terminal-data', id, exitMessage, sequence)
    sendToWindow(win, 'terminal-exit', id, exitCode)
    reconcileCurrentTasks()
  })
  const snapshot = terminalSessionSnapshot(session)
  sendToWindow(win, 'terminal-created', snapshot)
  return snapshot
}

function recordTerminalGuardrailLaunch(session: TerminalSessionSnapshot): void {
  const attempt = findExperimentAttemptForTerminal(session.id) ?? (session.taskId ? findExperimentAttemptForTask(session.taskId) : null)
  if (!attempt) return
  recordGuardrailEvent({
    attemptId: attempt.id,
    experimentId: attempt.experimentId,
    terminalSessionId: session.id,
    policyId: 'default-passive-policy',
    severity: 'info',
    action: 'terminal_launch',
    detail: `Passive guardrails attached to ${session.name}${session.cwd ? ` in ${session.cwd}` : ''}.`,
  })
}

function riskyTerminalInput(data: string): string | null {
  const compact = data.replace(/\r/g, '\n')
  if (/rm\s+-rf\s+(?:\/|\*)/.test(compact)) return 'destructive remove command'
  if (/git\s+reset\s+--hard/.test(compact)) return 'hard git reset'
  if (/git\s+push\s+--force/.test(compact)) return 'force push'
  if (/\bsudo\b/.test(compact)) return 'privileged command'
  if (/curl\b[\s\S]{0,120}\|\s*(?:sh|bash)/.test(compact)) return 'remote shell pipe'
  if (/chmod\s+-R\s+777/.test(compact)) return 'broad permission change'
  return null
}

ipcMain.handle('terminal-create', (_e, id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string, workspaceId?: string) => {
  const selectedWorkspace = getWorkspaceById(workspaceId)
  const inferredWorkspaceId = selectedWorkspace?.kind === 'repo'
    ? selectedWorkspace.id
    : getWorkspaceForProjectPath(cwd)?.id ?? workspaceId
  const session = createTerminalSession(id, launcherId, name, cwd, taskId, inferredWorkspaceId)
  if (taskId) linkTerminalToTask(taskId, session.id)
  recordTerminalGuardrailLaunch(session)
  reconcileCurrentTasks()
  return session
})

ipcMain.on('terminal-input', (_e, id: string, data: string) => {
  const riskyAction = riskyTerminalInput(data)
  if (riskyAction) {
    const attempt = findExperimentAttemptForTerminal(id)
    if (attempt) {
      recordGuardrailEvent({
        attemptId: attempt.id,
        experimentId: attempt.experimentId,
        terminalSessionId: id,
        policyId: 'default-passive-policy',
        severity: 'warning',
        action: riskyAction,
        detail: `Passive guardrail warning for terminal input: ${riskyAction}.`,
      })
    }
  }
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
  const timer = terminalOutputTimers.get(id)
  if (timer) clearTimeout(timer)
  terminalOutputTimers.delete(id)
  terminalOutputPreviews.delete(id)
  updateTerminalAgentStatus(id, 'failed', 'Terminal session was closed.')
})

// ── App lifecycle ─────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const dockIconPath = path.join(app.getAppPath(), 'build', 'icon', 'icon_1024.png')
    if (fs.existsSync(dockIconPath)) {
      app.dock.setIcon(dockIconPath)
    }
  }
  createApplicationMenu()
  createWindow()
  createTray()
  codexConversationRevision = getCodexConversationRevision()
  initAutomationScheduler()
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
  shutdownAutomationScheduler()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
