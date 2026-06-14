import { contextBridge, ipcRenderer } from 'electron'
import type { ChatApi, TerminalApi } from '../shared/types'

const api: ChatApi = {
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  addWorkspaceForPath: (projectPath) => ipcRenderer.invoke('add-workspace-for-path', projectPath),
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  getConnectorInventory: () => ipcRenderer.invoke('get-connector-inventory'),
  getSkills: () => ipcRenderer.invoke('get-skills'),
  restartApp: () => ipcRenderer.invoke('restart-app'),
  getUsageLimits: () => ipcRenderer.invoke('get-usage-limits'),
  saveUsageLimits: (limits) => ipcRenderer.invoke('save-usage-limits', limits),
  getTasks: () => ipcRenderer.invoke('get-tasks'),
  createTask: (input) => ipcRenderer.invoke('create-task', input),
  updateTask: (id, input) => ipcRenderer.invoke('update-task', id, input),
  updateTaskState: (id, state) => ipcRenderer.invoke('update-task-state', id, state),
  archiveTask: (id) => ipcRenderer.invoke('archive-task', id),
  promoteConversationToTask: (conversationId, input) => ipcRenderer.invoke('promote-conversation-to-task', conversationId, input),
  startTaskTerminal: (taskId, launcherId) => ipcRenderer.invoke('start-task-terminal', taskId, launcherId),
  startTaskWorkflow: (taskId) => ipcRenderer.invoke('start-task-workflow', taskId),
  getExperiments: () => ipcRenderer.invoke('get-experiments'),
  createExperimentCase: (input) => ipcRenderer.invoke('create-experiment-case', input),
  updateExperimentCase: (id, input) => ipcRenderer.invoke('update-experiment-case', id, input),
  archiveExperimentCase: (id) => ipcRenderer.invoke('archive-experiment-case', id),
  createExperimentAttempt: (experimentId, input) => ipcRenderer.invoke('create-experiment-attempt', experimentId, input),
  updateExperimentAttempt: (id, input) => ipcRenderer.invoke('update-experiment-attempt', id, input),
  linkAttemptEvidence: (attemptId, links) => ipcRenderer.invoke('link-attempt-evidence', attemptId, links),
  generateExperimentPostmortem: (experimentId, input) => ipcRenderer.invoke('generate-experiment-postmortem', experimentId, input),
  getAgentProfiles: () => ipcRenderer.invoke('get-agent-profiles'),
  saveAgentProfile: (profile) => ipcRenderer.invoke('save-agent-profile', profile),
  deleteAgentProfile: (id) => ipcRenderer.invoke('delete-agent-profile', id),
  getAgentKnowledge: (agentId) => ipcRenderer.invoke('get-agent-knowledge', agentId),
  getAgentRuns: (agentId) => ipcRenderer.invoke('get-agent-runs', agentId),
  runAgentProfile: (input) => ipcRenderer.invoke('run-agent-profile', input),
  getWorkflowDefinitions: () => ipcRenderer.invoke('get-workflow-definitions'),
  getWorkflowRuns: () => ipcRenderer.invoke('get-workflow-runs'),
  startWorkflowRun: (workflowId, goal, workspaceId) => ipcRenderer.invoke('start-workflow-run', workflowId, goal, workspaceId),
  getAutomationCatalog: () => ipcRenderer.invoke('get-automation-catalog'),
  getScheduledAutomations: () => ipcRenderer.invoke('get-scheduled-automations'),
  createScheduledAutomation: (input) => ipcRenderer.invoke('create-scheduled-automation', input),
  updateScheduledAutomation: (id, input) => ipcRenderer.invoke('update-scheduled-automation', id, input),
  deleteScheduledAutomation: (id) => ipcRenderer.invoke('delete-scheduled-automation', id),
  runAutomationNow: (id) => ipcRenderer.invoke('run-automation-now', id),
  sendMessage: (conversationId, content, modelChoice, options) =>
    ipcRenderer.invoke('send-message', conversationId, content, modelChoice, options),
  newConversation: (workspaceId) => ipcRenderer.invoke('new-conversation', workspaceId),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  updateThreadStatus: (id, status) => ipcRenderer.invoke('update-thread-status', id, status),
  updateThreadResumeState: (id, state) => ipcRenderer.invoke('update-thread-resume-state', id, state),
  cloneImportedConversation: (sourceId) => ipcRenderer.invoke('clone-imported-conversation', sourceId),
  updateConversationMemory: (conversationId, memory) =>
    ipcRenderer.invoke('update-conversation-memory', conversationId, memory),
  compactConversation: (conversationId) => ipcRenderer.invoke('compact-conversation', conversationId),
  estimateTokens: (text) => ipcRenderer.invoke('estimate-tokens', text),

  getOpenAIAuthStatus: () => ipcRenderer.invoke('get-openai-auth-status'),
  startOpenAILogin: () => ipcRenderer.invoke('start-openai-login'),
  disconnectOpenAI: () => ipcRenderer.invoke('disconnect-openai'),
  getCodexModel: () => ipcRenderer.invoke('get-codex-model'),
  setCodexModel: (model) => ipcRenderer.invoke('set-codex-model', model),
  getCodexModels: () => ipcRenderer.invoke('get-codex-models'),
  getCodexStatus: () => ipcRenderer.invoke('get-codex-status'),
  focusCodexThread: (threadId) => ipcRenderer.invoke('focus-codex-thread', threadId),

  getGeminiKeyStatus: () => ipcRenderer.invoke('get-gemini-key-status'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  disconnectGemini: () => ipcRenderer.invoke('disconnect-gemini'),
  getGeminiModel: () => ipcRenderer.invoke('get-gemini-model'),
  setGeminiModel: (model) => ipcRenderer.invoke('set-gemini-model', model),

  getDeepSeekKeyStatus: () => ipcRenderer.invoke('get-deepseek-key-status'),
  setDeepSeekKey: (key) => ipcRenderer.invoke('set-deepseek-key', key),
  disconnectDeepSeek: () => ipcRenderer.invoke('disconnect-deepseek'),
  getDeepSeekModel: () => ipcRenderer.invoke('get-deepseek-model'),
  setDeepSeekModel: (model) => ipcRenderer.invoke('set-deepseek-model', model),

  getOllamaStatus: () => ipcRenderer.invoke('get-ollama-status'),
  setOllamaConfig: (baseUrl, model) => ipcRenderer.invoke('set-ollama-config', baseUrl, model),
  disconnectOllama: () => ipcRenderer.invoke('disconnect-ollama'),
  checkOllamaReachable: () => ipcRenderer.invoke('check-ollama-reachable'),
  getOllamaModels: (baseUrl) => ipcRenderer.invoke('get-ollama-models', baseUrl),
  pullOllamaModel: (model, baseUrl) => ipcRenderer.invoke('pull-ollama-model', model, baseUrl),

  getCursorKeyStatus: () => ipcRenderer.invoke('get-cursor-key-status'),
  setCursorKey: (key) => ipcRenderer.invoke('set-cursor-key', key),
  disconnectCursor: () => ipcRenderer.invoke('disconnect-cursor'),
  getCursorModel: () => ipcRenderer.invoke('get-cursor-model'),
  setCursorModel: (model) => ipcRenderer.invoke('set-cursor-model', model),
  getCursorModels: () => ipcRenderer.invoke('get-cursor-models'),

  cancelMessage: (conversationId) => ipcRenderer.invoke('cancel-message', conversationId),

  onStreamStart: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, convId: string, msgId: string, routing: unknown) =>
      cb(convId, msgId, routing as never)
    ipcRenderer.on('chat-stream-start', listener)
    return () => ipcRenderer.off('chat-stream-start', listener)
  },

  onChunk: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, convId: string, msgId: string, chunk: string) =>
      cb(convId, msgId, chunk)
    ipcRenderer.on('chat-chunk', listener)
    return () => ipcRenderer.off('chat-chunk', listener)
  },

  onMessageDone: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, convId: string, message: unknown) =>
      cb(convId, message as never)
    ipcRenderer.on('chat-message-done', listener)
    return () => ipcRenderer.off('chat-message-done', listener)
  },

  onError: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, convId: string, msgId: string, error: string) =>
      cb(convId, msgId, error)
    ipcRenderer.on('chat-error', listener)
    return () => ipcRenderer.off('chat-error', listener)
  },

  onCanceled: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, convId: string, msgId: string) =>
      cb(convId, msgId)
    ipcRenderer.on('chat-canceled', listener)
    return () => ipcRenderer.off('chat-canceled', listener)
  },

  onConversationsUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, conversations: unknown) => cb(conversations as never)
    ipcRenderer.on('conversations-updated', listener)
    return () => ipcRenderer.off('conversations-updated', listener)
  },

  onTasksUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, tasks: unknown) => cb(tasks as never)
    ipcRenderer.on('tasks-updated', listener)
    return () => ipcRenderer.off('tasks-updated', listener)
  },

  onExperimentsUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, snapshot: unknown) => cb(snapshot as never)
    ipcRenderer.on('experiments-updated', listener)
    return () => ipcRenderer.off('experiments-updated', listener)
  },

  onCodexStatusUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, snapshot: unknown) => cb(snapshot as never)
    ipcRenderer.on('codex-status-updated', listener)
    return () => ipcRenderer.off('codex-status-updated', listener)
  },

  onCodexThreadFocusRequested: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, conversationId: string) => cb(conversationId)
    ipcRenderer.on('focus-codex-thread', listener)
    return () => ipcRenderer.off('focus-codex-thread', listener)
  },

  onWorkflowRunUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, run: unknown) => cb(run as never)
    ipcRenderer.on('workflow-run-updated', listener)
    return () => ipcRenderer.off('workflow-run-updated', listener)
  },

  onScheduledAutomationsUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, automations: unknown) => cb(automations as never)
    ipcRenderer.on('scheduled-automations-updated', listener)
    return () => ipcRenderer.off('scheduled-automations-updated', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

const terminalApi: TerminalApi = {
  listTerminalSessions: () => ipcRenderer.invoke('terminal-list'),
  getTerminalBuffer: (id) => ipcRenderer.invoke('terminal-buffer', id),
  getAgentRunForTerminal: (id) => ipcRenderer.invoke('terminal-agent-run', id),
  createTerminal: (id, launcherId, name, cwd, taskId, workspaceId) => ipcRenderer.invoke('terminal-create', id, launcherId, name, cwd, taskId, workspaceId),
  sendTerminalInput: (id, data) => ipcRenderer.send('terminal-input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.send('terminal-resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.invoke('terminal-kill', id),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  onTerminalCreated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, session: unknown) => cb(session as never)
    ipcRenderer.on('terminal-created', listener)
    return () => ipcRenderer.off('terminal-created', listener)
  },

  onTerminalData: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, data: string, sequence: number) => cb(id, data, sequence)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.off('terminal-data', listener)
  },

  onTerminalExit: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.off('terminal-exit', listener)
  },

  onAgentRunUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, run: unknown) => cb(run as never)
    ipcRenderer.on('agent-run-updated', listener)
    return () => ipcRenderer.off('agent-run-updated', listener)
  },
}

contextBridge.exposeInMainWorld('terminalApi', terminalApi)
