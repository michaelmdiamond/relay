import { contextBridge, ipcRenderer } from 'electron'
import type { ChatApi, TerminalApi } from '../shared/types'

const api: ChatApi = {
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  getConnectorInventory: () => ipcRenderer.invoke('get-connector-inventory'),
  getUsageLimits: () => ipcRenderer.invoke('get-usage-limits'),
  saveUsageLimits: (limits) => ipcRenderer.invoke('save-usage-limits', limits),
  getAgentProfiles: () => ipcRenderer.invoke('get-agent-profiles'),
  saveAgentProfile: (profile) => ipcRenderer.invoke('save-agent-profile', profile),
  getWorkflowDefinitions: () => ipcRenderer.invoke('get-workflow-definitions'),
  getWorkflowRuns: () => ipcRenderer.invoke('get-workflow-runs'),
  startWorkflowRun: (workflowId, goal) => ipcRenderer.invoke('start-workflow-run', workflowId, goal),
  sendMessage: (conversationId, content, modelChoice, options) =>
    ipcRenderer.invoke('send-message', conversationId, content, modelChoice, options),
  newConversation: () => ipcRenderer.invoke('new-conversation'),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),
  updateConversationMemory: (conversationId, memory) =>
    ipcRenderer.invoke('update-conversation-memory', conversationId, memory),
  compactConversation: (conversationId) => ipcRenderer.invoke('compact-conversation', conversationId),
  estimateTokens: (text) => ipcRenderer.invoke('estimate-tokens', text),

  getOpenAIAuthStatus: () => ipcRenderer.invoke('get-openai-auth-status'),
  startOpenAILogin: () => ipcRenderer.invoke('start-openai-login'),
  disconnectOpenAI: () => ipcRenderer.invoke('disconnect-openai'),

  getGeminiKeyStatus: () => ipcRenderer.invoke('get-gemini-key-status'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  disconnectGemini: () => ipcRenderer.invoke('disconnect-gemini'),
  getGeminiModel: () => ipcRenderer.invoke('get-gemini-model'),
  setGeminiModel: (model) => ipcRenderer.invoke('set-gemini-model', model),

  getOllamaStatus: () => ipcRenderer.invoke('get-ollama-status'),
  setOllamaConfig: (baseUrl, model) => ipcRenderer.invoke('set-ollama-config', baseUrl, model),
  disconnectOllama: () => ipcRenderer.invoke('disconnect-ollama'),
  checkOllamaReachable: () => ipcRenderer.invoke('check-ollama-reachable'),
  getOllamaModels: (baseUrl) => ipcRenderer.invoke('get-ollama-models', baseUrl),

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

  onWorkflowRunUpdated: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, run: unknown) => cb(run as never)
    ipcRenderer.on('workflow-run-updated', listener)
    return () => ipcRenderer.off('workflow-run-updated', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)

const terminalApi: TerminalApi = {
  createTerminal: (id, launcherId, cwd) => ipcRenderer.invoke('terminal-create', id, launcherId, cwd),
  sendTerminalInput: (id, data) => ipcRenderer.invoke('terminal-input', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('terminal-resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.invoke('terminal-kill', id),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  onTerminalData: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('terminal-data', listener)
    return () => ipcRenderer.off('terminal-data', listener)
  },

  onTerminalExit: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, code: number) => cb(id, code)
    ipcRenderer.on('terminal-exit', listener)
    return () => ipcRenderer.off('terminal-exit', listener)
  },
}

contextBridge.exposeInMainWorld('terminalApi', terminalApi)
