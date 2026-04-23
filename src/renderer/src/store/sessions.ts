import { create } from 'zustand'
import type { Session, SessionStatus, ClaudeConversation } from '../../../../../shared/types'

type ViewMode = 'status' | 'project'
export type MainView = 'kanban' | 'terminal' | 'transcript'

interface SessionStore {
  sessions: Session[]
  viewMode: ViewMode
  mainView: MainView
  activeTerminalId: string | null
  activeConversation: ClaudeConversation | null

  setSessions: (s: Session[]) => void
  setViewMode: (m: ViewMode) => void
  setMainView: (v: MainView) => void
  setActiveTerminal: (id: string | null) => void
  setActiveConversation: (c: ClaudeConversation | null) => void

  // Optimistic updates
  updateSessionStatus: (id: string, status: SessionStatus) => void
  updateSessionProject: (id: string, project: string) => void
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  viewMode: 'status',
  mainView: 'kanban',
  activeTerminalId: null,
  activeConversation: null,

  setSessions: (sessions) => set({ sessions }),
  setViewMode: (viewMode) => set({ viewMode }),
  setMainView: (mainView) => set({ mainView }),
  setActiveTerminal: (activeTerminalId) => set({ activeTerminalId }),
  setActiveConversation: (activeConversation) => set({ activeConversation }),

  updateSessionStatus: (id, status) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, status } : s)),
    })),

  updateSessionProject: (id, project) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, project } : s)),
    })),
}))
