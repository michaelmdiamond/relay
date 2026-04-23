export type SessionStatus = 'in_progress' | 'idle' | 'needs_input' | 'done'

export interface Session {
  id: string
  name: string
  cwd: string
  project: string | null   // null = auto-detect from cwd
  status: SessionStatus
  createdAt: string        // ISO
  lastActivity: string     // ISO
  pid: number | null
  managed: boolean         // true = spawned by sessionboard, has live PTY
  lastLine: string
  // Metadata (git + ports)
  gitBranch?: string
  listeningPorts?: number[]
  // Notification state
  needsAttention: boolean
  notificationText?: string
  lastNotificationAt?: string  // ISO
  // Conversation pin fields (cardType === 'conversation')
  cardType?: 'terminal' | 'conversation'
  conversationId?: string
  conversationSource?: 'cli' | 'desktop' | 'codex'
  conversationFilePath?: string
}

export interface ClaudeConversation {
  id: string
  title: string
  project: string
  cwd: string
  source: 'cli' | 'desktop' | 'codex'
  lastTimestamp: string
  messageCount: number
  filePath: string
  isRecent: boolean
  stage?: SessionStatus
  archived: boolean
}

export interface ClaudeMessage {
  uuid: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface IpcApi {
  // Environment
  getEnv: () => Promise<{ HOME: string; SHELL: string }>

  // Session management
  getSessions: () => Promise<Session[]>
  createSession: (name: string, cwd: string, project: string | null) => Promise<Session>
  attachSession: (pid: number, name: string, project: string | null) => Promise<Session | null>
  removeSession: (id: string) => Promise<void>
  updateSession: (id: string, patch: Partial<Pick<Session, 'name' | 'project' | 'status'>>) => Promise<void>
  killSession: (id: string) => Promise<void>

  // Terminal I/O (for managed sessions)
  writeToPty: (id: string, data: string) => Promise<void>
  resizePty: (id: string, cols: number, rows: number) => Promise<void>

  // Claude session history
  getClaudeConversations: () => Promise<ClaudeConversation[]>
  getClaudeMessages: (filePath: string) => Promise<ClaudeMessage[]>
  pinConversation: (conv: ClaudeConversation, status: SessionStatus) => Promise<Session>
  archiveConversation: (convId: string) => Promise<void>

  // Attention
  dismissAttention: (id: string) => Promise<void>

  // Events
  onSessionsChanged: (cb: (sessions: Session[]) => void) => () => void
  onPtyData: (cb: (id: string, data: string) => void) => () => void
  onFocusUrgentSession: (cb: (id: string) => void) => () => void
}
