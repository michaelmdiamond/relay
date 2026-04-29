import { contextBridge, ipcRenderer } from 'electron'
import type { ChatApi } from '../shared/types'

const api: ChatApi = {
  getApiKeyStatus: () => ipcRenderer.invoke('get-api-key-status'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
  getConversations: () => ipcRenderer.invoke('get-conversations'),
  sendMessage: (conversationId, content, modelChoice) =>
    ipcRenderer.invoke('send-message', conversationId, content, modelChoice),
  newConversation: () => ipcRenderer.invoke('new-conversation'),
  deleteConversation: (id) => ipcRenderer.invoke('delete-conversation', id),

  getOpenAIAuthStatus: () => ipcRenderer.invoke('get-openai-auth-status'),
  startOpenAILogin: () => ipcRenderer.invoke('start-openai-login'),
  disconnectOpenAI: () => ipcRenderer.invoke('disconnect-openai'),

  getGeminiKeyStatus: () => ipcRenderer.invoke('get-gemini-key-status'),
  setGeminiKey: (key) => ipcRenderer.invoke('set-gemini-key', key),
  disconnectGemini: () => ipcRenderer.invoke('disconnect-gemini'),
  getGeminiModel: () => ipcRenderer.invoke('get-gemini-model'),
  setGeminiModel: (model) => ipcRenderer.invoke('set-gemini-model', model),

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
}

contextBridge.exposeInMainWorld('api', api)
