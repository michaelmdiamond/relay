import { create } from 'zustand'
import type { ChatMessage, Conversation, ModelChoice } from '../../../shared/types'

interface ChatStore {
  conversations: Conversation[]
  activeId: string | null
  modelChoice: ModelChoice
  sending: boolean

  setConversations: (convs: Conversation[]) => void
  setActiveId: (id: string | null) => void
  setModelChoice: (choice: ModelChoice) => void
  setSending: (v: boolean) => void

  addMessage: (convId: string, message: ChatMessage) => void
  appendChunk: (convId: string, msgId: string, chunk: string) => void
  finalizeMessage: (convId: string, message: ChatMessage) => void
  appendError: (convId: string, msgId: string, error: string) => void
  prependConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeId: null,
  modelChoice: 'auto',
  sending: false,

  setConversations: (conversations) => set({ conversations }),
  setActiveId: (activeId) => set({ activeId }),
  setModelChoice: (modelChoice) => set({ modelChoice }),
  setSending: (sending) => set({ sending }),

  addMessage: (convId, message) => set(state => ({
    conversations: state.conversations.map(c =>
      c.id === convId ? { ...c, messages: [...c.messages, message] } : c
    ),
  })),

  appendChunk: (convId, msgId, chunk) => set(state => ({
    conversations: state.conversations.map(c => {
      if (c.id !== convId) return c
      const existing = c.messages.find(m => m.id === msgId)
      if (existing) {
        return { ...c, messages: c.messages.map(m => m.id === msgId ? { ...m, content: m.content + chunk } : m) }
      }
      return c
    }),
  })),

  finalizeMessage: (convId, message) => set(state => ({
    conversations: state.conversations.map(c => {
      if (c.id !== convId) return c
      const exists = c.messages.some(m => m.id === message.id)
      return {
        ...c,
        messages: exists
          ? c.messages.map(m => m.id === message.id ? message : m)
          : [...c.messages, message],
      }
    }),
  })),

  appendError: (convId, _msgId, error) => set(state => ({
    conversations: state.conversations.map(c => {
      if (c.id !== convId) return c
      const errMsg: ChatMessage = {
        id: _msgId,
        role: 'assistant',
        content: '',
        error,
        streaming: false,
      }
      const exists = c.messages.some(m => m.id === _msgId)
      return {
        ...c,
        messages: exists ? c.messages.map(m => m.id === _msgId ? errMsg : m) : [...c.messages, errMsg],
      }
    }),
  })),

  prependConversation: (conv) => set(state => ({
    conversations: [conv, ...state.conversations],
  })),

  removeConversation: (id) => set(state => ({
    conversations: state.conversations.filter(c => c.id !== id),
    activeId: state.activeId === id ? (state.conversations.find(c => c.id !== id)?.id ?? null) : state.activeId,
  })),
}))
