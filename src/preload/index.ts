import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, Session } from '../shared/types'

const api: IpcApi = {
  getEnv: () => ipcRenderer.invoke('get-env'),
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: (name, cwd, project) => ipcRenderer.invoke('create-session', name, cwd, project),
  attachSession: (pid, name, project) => ipcRenderer.invoke('attach-session', pid, name, project),
  removeSession: (id) => ipcRenderer.invoke('remove-session', id),
  updateSession: (id, patch) => ipcRenderer.invoke('update-session', id, patch),
  killSession: (id) => ipcRenderer.invoke('kill-session', id),
  writeToPty: (id, data) => ipcRenderer.invoke('write-pty', id, data),
  resizePty: (id, cols, rows) => ipcRenderer.invoke('resize-pty', id, cols, rows),

  onSessionsChanged: (cb: (sessions: Session[]) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, sessions: Session[]) => cb(sessions)
    ipcRenderer.on('sessions-changed', listener)
    return () => ipcRenderer.off('sessions-changed', listener)
  },

  getClaudeConversations: () => ipcRenderer.invoke('get-claude-conversations'),
  getClaudeMessages: (filePath: string) => ipcRenderer.invoke('get-claude-messages', filePath),
  pinConversation: (conv, status) => ipcRenderer.invoke('pin-conversation', conv, status),
  archiveConversation: (convId: string) => ipcRenderer.invoke('archive-conversation', convId),

  onPtyData: (cb: (id: string, data: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string, data: string) => cb(id, data)
    ipcRenderer.on('pty-data', listener)
    return () => ipcRenderer.off('pty-data', listener)
  },

  dismissAttention: (id: string) => ipcRenderer.invoke('dismiss-attention', id),

  onFocusUrgentSession: (cb: (id: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, id: string) => cb(id)
    ipcRenderer.on('focus-urgent-session', listener)
    return () => ipcRenderer.off('focus-urgent-session', listener)
  },
}

contextBridge.exposeInMainWorld('api', api)
