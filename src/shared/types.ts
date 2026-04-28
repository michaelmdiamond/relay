export type ModelChoice = 'auto' | 'haiku' | 'sonnet' | 'opus' | 'codex'

export type AnthropicModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'

export type CodexModel = 'gpt-5.3-codex'

export type AnyModel = AnthropicModel | CodexModel

export type Provider = 'anthropic' | 'openai'

export interface RoutingDecision {
  model: AnyModel
  modelLabel: string
  reason: string
  autoSelected: boolean
  provider: Provider
}

export interface OpenAICredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number   // ms since epoch
  email?: string
  accountId?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  routing?: RoutingDecision
  streaming?: boolean
  error?: string
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
}

export interface ChatApi {
  getApiKeyStatus: () => Promise<{ configured: boolean }>
  setApiKey: (key: string) => Promise<void>
  getConversations: () => Promise<Conversation[]>
  sendMessage: (conversationId: string, content: string, modelChoice: ModelChoice) => Promise<void>
  newConversation: () => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>

  getOpenAIAuthStatus: () => Promise<{ connected: boolean; email?: string }>
  startOpenAILogin: () => Promise<void>
  disconnectOpenAI: () => Promise<void>

  onChunk: (cb: (conversationId: string, messageId: string, chunk: string) => void) => () => void
  onMessageDone: (cb: (conversationId: string, message: ChatMessage) => void) => () => void
  onError: (cb: (conversationId: string, messageId: string, error: string) => void) => () => void
}

declare global {
  interface Window {
    api: ChatApi
  }
}
