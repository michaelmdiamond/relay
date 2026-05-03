import { create } from 'zustand'
import type { ChatMessage, Conversation, ConversationMemory, ModelChoice } from '../../../shared/types'

interface ChatStore {
  conversations: Conversation[]
  activeId: string | null
  activePane: 'conversation' | 'usage' | 'connections'
  modelChoice: ModelChoice
  sending: boolean

  setConversations: (convs: Conversation[]) => void
  setActiveId: (id: string | null) => void
  setActivePane: (pane: 'conversation' | 'usage' | 'connections') => void
  setModelChoice: (choice: ModelChoice) => void
  setSending: (v: boolean) => void

  addMessage: (convId: string, message: ChatMessage) => void
  addStreamingPlaceholder: (convId: string, msgId: string, routing: ChatMessage['routing']) => void
  appendChunk: (convId: string, msgId: string, chunk: string) => void
  finalizeMessage: (convId: string, message: ChatMessage) => void
  appendError: (convId: string, msgId: string, error: string) => void
  removeMessage: (convId: string, msgId: string) => void
  updateMemory: (convId: string, memory: ConversationMemory) => void
  replaceConversation: (conv: Conversation) => void
  prependConversation: (conv: Conversation) => void
  removeConversation: (id: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  conversations: [],
  activeId: null,
  activePane: 'conversation',
  modelChoice: 'auto',
  sending: false,

  setConversations: (conversations) => set({ conversations }),
  setActiveId: (activeId) => set({ activeId, activePane: 'conversation' }),
  setActivePane: (activePane) => set({ activePane }),
  setModelChoice: (modelChoice) => set({ modelChoice }),
  setSending: (sending) => set({ sending }),

  addMessage: (convId, message) => set(state => ({
    conversations: state.conversations.map(c =>
      c.id === convId
        ? {
            ...c,
            title: c.messages.length === 0 && message.role === 'user'
              ? (message.content.trim().split('\n')[0].slice(0, 60) || c.title)
              : c.title,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, message],
          }
        : c
    ),
  })),

  addStreamingPlaceholder: (convId, msgId, routing) => set(state => ({
    conversations: state.conversations.map(c =>
      c.id === convId
        ? {
            ...c,
            updatedAt: new Date().toISOString(),
            messages: [...c.messages, {
              id: msgId,
              role: 'assistant' as const,
              content: '',
              createdAt: new Date().toISOString(),
              routing,
              streaming: true,
            }],
          }
        : c
    ),
  })),

  appendChunk: (convId, msgId, chunk) => set(state => ({
    conversations: state.conversations.map(c => {
      if (c.id !== convId) return c
      const existing = c.messages.find(m => m.id === msgId)
      if (existing) {
        return {
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.map(m => m.id === msgId ? { ...m, content: m.content + chunk } : m),
        }
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
        updatedAt: new Date().toISOString(),
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
        updatedAt: new Date().toISOString(),
        messages: exists ? c.messages.map(m => m.id === _msgId ? errMsg : m) : [...c.messages, errMsg],
      }
    }),
  })),

  removeMessage: (convId, msgId) => set(state => ({
    conversations: state.conversations.map(c =>
      c.id === convId
        ? { ...c, updatedAt: new Date().toISOString(), messages: c.messages.filter(m => m.id !== msgId) }
        : c
    ),
  })),

  updateMemory: (convId, memory) => set(state => ({
    conversations: state.conversations.map(c =>
      c.id === convId
        ? { ...c, memory: { ...(c.memory ?? {}), ...memory, updatedAt: new Date().toISOString() } }
        : c
    ),
  })),

  replaceConversation: (conv) => set(state => ({
    conversations: state.conversations.map(c => c.id === conv.id ? conv : c),
  })),

  prependConversation: (conv) => set(state => ({
    conversations: [conv, ...state.conversations],
  })),

  removeConversation: (id) => set(state => ({
    conversations: state.conversations.filter(c => c.id !== id),
    activeId: state.activeId === id ? (state.conversations.find(c => c.id !== id)?.id ?? null) : state.activeId,
  })),
}))
