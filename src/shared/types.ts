export type ModelChoice = 'auto' | 'haiku' | 'sonnet' | 'opus' | 'codex' | 'gemini' | 'deepseek' | 'ollama' | 'cursor'

export type AnthropicModel =
  | 'claude-haiku-4-5-20251001'
  | 'claude-sonnet-4-6'
  | 'claude-opus-4-7'

export const CODEX_MODELS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
] as const

export type CodexModel = typeof CODEX_MODELS[number] | (string & {})

export type GeminiModel =
  | 'gemini-2.5-pro'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-flash-lite'

export type DeepSeekModel =
  | 'deepseek-v4-flash'
  | 'deepseek-v4-pro'

export type AnyModel = AnthropicModel | CodexModel | GeminiModel | DeepSeekModel

export type Provider = 'anthropic' | 'openai' | 'google' | 'deepseek' | 'ollama' | 'cursor'
export type ConnectorProvider = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'cursor'
export type ConnectorStatus = 'connected' | 'configured' | 'installed'

export interface RoutingDecision {
  model: string
  modelLabel: string
  reason: string
  autoSelected: boolean
  provider: Provider
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  effectiveInputTokens?: number
}

export type ChatMode = 'quick' | 'deep' | 'code' | 'review' | 'brainstorm' | 'compare'

export interface ContextAttachment {
  id: string
  title: string
  content: string
  tokenEstimate?: number
}

export interface ConversationMemory {
  summary?: string
  pinnedFacts?: string[]
  decisions?: string[]
  activeGoal?: string
  filesTouched?: string[]
  updatedAt?: string
}

export type ThreadStatus = 'active' | 'paused' | 'completed' | 'archived'

export interface ThreadWorkspaceSnapshot {
  workspaceId?: string
  projectName?: string
  projectPath?: string
  gitRemote?: string
  gitBranch?: string
  gitCommit?: string
  capturedAt: string
}

export interface ThreadResumeState {
  userGoal?: string
  currentState?: string
  decisions: string[]
  constraints: string[]
  filesTouched: string[]
  commandsRun: string[]
  testsRun: string[]
  blockers: string[]
  openQuestions: string[]
  nextSteps: string[]
  updatedAt: string
  generatedFromMessageId?: string
}

export interface ThreadToolEventSummary {
  id: string
  kind: 'terminal' | 'task' | 'workflow' | 'file' | 'git' | 'external'
  title: string
  detail?: string
  status?: 'succeeded' | 'failed' | 'canceled' | 'unknown'
  createdAt: string
  relatedId?: string
}

export interface ContextPacketFile {
  path: string
  reason: string
  included: boolean
  tokenEstimate: number
  contentPreview?: string
}

export interface ContextPacket {
  id: string
  createdAt: string
  taskBrief: string
  activeGoal?: string
  conversationSummary?: string
  relevantMessages: Array<{
    role: 'user' | 'assistant'
    content: string
    tokenEstimate: number
  }>
  pinnedFacts: string[]
  decisions: string[]
  files: ContextPacketFile[]
  attachments: ContextAttachment[]
  constraints: string[]
  expectedOutput: string
  tokenEstimate: number
}

export interface WorkerResult {
  summary: string
  findings: string[]
  filesRead: string[]
  filesChanged: string[]
  decisions: string[]
  risks: string[]
  suggestedNextSteps: string[]
}

export interface SkillEntry {
  id: string
  provider: 'claude' | 'codex'
  name: string
  description: string
  body: string
}

export interface SendMessageOptions {
  mode?: ChatMode
  attachments?: ContextAttachment[]
  skill?: SkillEntry
}

export interface RequestDiagnostics {
  mode: ChatMode
  provider: Provider
  model: string
  usedPreviousResponseId?: boolean
  sentMessageCount: number
  originalMessageCount: number
  systemContextTokenEstimate: number
  attachedContextTokenEstimate: number
  contextPacketTokenEstimate?: number
  contextPacketFileCount?: number
  contextPacketMessageCount?: number
  usedMemorySummary: boolean
}

export interface UsageLimitSettings {
  overallMonthlyTokens?: number
  anthropicMonthlyTokens?: number
  openaiMonthlyTokens?: number
  googleMonthlyTokens?: number
  deepseekMonthlyTokens?: number
  ollamaMonthlyTokens?: number
}

export interface ConnectorEntry {
  id: string
  name: string
  status: ConnectorStatus
  detail?: string
}

export interface ConnectorProviderSnapshot {
  provider: ConnectorProvider
  label: string
  subtitle: string
  items: ConnectorEntry[]
}

export interface ConnectorInventory {
  providers: ConnectorProviderSnapshot[]
  scannedAt: string
}

export interface CursorModelOption {
  id: string
  displayName: string
  description?: string
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
  createdAt?: string
  routing?: RoutingDecision
  usage?: TokenUsage
  openAIResponseId?: string
  requestDiagnostics?: RequestDiagnostics
  contextPacket?: ContextPacket
  streaming?: boolean
  error?: string
}

export type ConversationSource = 'relay' | 'claude' | 'codex'

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: string
  updatedAt?: string
  status?: ThreadStatus
  workspaceId?: string
  projectName?: string
  projectPath?: string
  workspaceSnapshot?: ThreadWorkspaceSnapshot
  source?: ConversationSource
  readOnly?: boolean
  mode?: ChatMode
  memory?: ConversationMemory
  resumeState?: ThreadResumeState
  toolEventSummaries?: ThreadToolEventSummary[]
  archivedAt?: string
  completedAt?: string
  sourceConversationId?: string
  externalLink?: ExternalConversationLink
}

export type TerminalLauncherId = 'codex' | 'claude' | 'gemini' | 'deepseek' | 'cursor' | 'local' | 'shell'
export type TerminalSessionStatus = 'running' | 'exited'

export type DispatchAgent = TerminalLauncherId | 'workflow'

export interface DispatchRecommendation {
  taskId: string
  agent: DispatchAgent
  agentLabel: string
  reason: string
  launchPrompt: string
}

export interface ExternalConversationLink {
  terminalSessionId?: string
  terminalName?: string
  terminalStatus?: TerminalSessionStatus
  terminalLastActivityAt?: string
  taskId?: string
  taskTitle?: string
}

export interface TerminalSessionSnapshot {
  id: string
  launcherId: TerminalLauncherId
  name: string
  workspaceId?: string
  cwd?: string
  status?: TerminalSessionStatus
  lastActivityAt?: string
  lastOutputPreview?: string
  exitCode?: number
  taskId?: string
}

export interface TerminalBufferSnapshot {
  output: string
  sequence: number
}

export type TaskState = 'idea' | 'running' | 'blocked' | 'review' | 'done'
export type TaskSignal = 'active' | 'idle' | 'waiting' | 'exited' | 'failed' | 'stale' | 'complete'

export interface TaskItem {
  id: string
  title: string
  brief: string
  state: TaskState
  workspaceId?: string
  projectName?: string
  projectPath?: string
  sourceConversationId?: string
  terminalSessionIds: string[]
  workflowRunIds: string[]
  createdAt: string
  updatedAt: string
  archivedAt?: string
  lastActivityAt?: string
  signal?: TaskSignal
  signalReason?: string
  suggestedState?: TaskState
}

export interface TaskCreateInput {
  title: string
  brief?: string
  state?: TaskState
  workspaceId?: string
  projectName?: string
  projectPath?: string
  sourceConversationId?: string
  terminalSessionIds?: string[]
  workflowRunIds?: string[]
}

export interface TaskUpdateInput {
  title?: string
  brief?: string
  state?: TaskState
  workspaceId?: string
  projectName?: string
  projectPath?: string
  sourceConversationId?: string
  terminalSessionIds?: string[]
  workflowRunIds?: string[]
  archivedAt?: string
}

export interface PromoteConversationToTaskInput {
  title?: string
  brief?: string
  state?: TaskState
}

export type WorkflowAgentProvider = 'anthropic' | 'openai' | 'google'
export type WorkflowAgentRole = 'implementer' | 'reviewer'
export type WorkflowRunStatus = 'queued' | 'running' | 'completed' | 'failed'
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed'
export type WorkflowStepKind = 'implement' | 'review'
export type WorkflowVerdict = 'approve' | 'request_changes' | 'escalate'

export interface AgentProfile {
  id: string
  name: string
  provider: WorkflowAgentProvider
  model: string
  role: WorkflowAgentRole
  systemPrompt: string
  enabled: boolean
}

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  implementerAgentId: string
  reviewerAgentId: string
  maxReviewRounds: number
}

export interface WorkflowArtifact {
  goal: string
  changedFiles: string[]
  diffSummary: string
  testStatus: string
  openQuestions: string
  requestedAction?: string
  summary?: string
  verdict?: WorkflowVerdict
}

export interface WorkflowStepRun {
  id: string
  kind: WorkflowStepKind
  status: WorkflowStepStatus
  agentId: string
  agentName: string
  round: number
  input: string
  output: string
  startedAt?: string
  completedAt?: string
  error?: string
  artifact?: WorkflowArtifact
}

export interface WorkflowRun {
  id: string
  workflowId: string
  workflowName: string
  goal: string
  workspaceId?: string
  status: WorkflowRunStatus
  createdAt: string
  updatedAt: string
  currentRound: number
  maxRounds: number
  finalVerdict?: WorkflowVerdict
  summary?: string
  steps: WorkflowStepRun[]
}

export type AutomationCatalogSource = 'relay' | 'codex' | 'claude'
export type AutomationCatalogKind = 'agent' | 'workflow' | 'scheduled-task'
export type AutomationCatalogStatus = 'active' | 'paused' | 'available' | 'detected'

export interface AutomationCatalogItem {
  id: string
  source: AutomationCatalogSource
  kind: AutomationCatalogKind
  title: string
  description: string
  status: AutomationCatalogStatus
  cadence?: string
  model?: string
  destination?: string
  external?: boolean
}

export interface AutomationProviderSummary {
  source: Exclude<AutomationCatalogSource, 'relay'>
  label: string
  status: 'connected' | 'detected' | 'unavailable'
  detail: string
  itemCount: number
}

export interface AutomationCatalogSnapshot {
  generatedAt: string
  items: AutomationCatalogItem[]
  providers: AutomationProviderSummary[]
}

export interface Workspace {
  id: string
  name: string
  kind: 'repo' | 'general'
  projectPath?: string
  createdAt: string
  updatedAt: string
}

export type CodexThreadState = 'active' | 'completed' | 'idle' | 'interrupted' | 'stale'

export interface CodexStatusItem {
  id: string
  title: string
  cwd?: string
  source?: string
  modelProvider?: string
  agentNickname?: string
  agentRole?: string
  model?: string
  reasoningEffort?: string
  updatedAt: string
  lastActivityAt: string
  state: CodexThreadState
  lastMessage?: string
}

export interface CodexStatusSnapshot {
  generatedAt: string
  activeCount: number
  items: CodexStatusItem[]
}

export interface TerminalApi {
  listTerminalSessions: () => Promise<TerminalSessionSnapshot[]>
  getTerminalBuffer: (id: string) => Promise<TerminalBufferSnapshot>
  createTerminal: (id: string, launcherId: TerminalLauncherId, name: string, cwd?: string, taskId?: string, workspaceId?: string) => Promise<TerminalSessionSnapshot>
  sendTerminalInput: (id: string, data: string) => void
  resizeTerminal: (id: string, cols: number, rows: number) => void
  killTerminal: (id: string) => Promise<void>
  selectDirectory: () => Promise<string | null>
  onTerminalCreated: (cb: (session: TerminalSessionSnapshot) => void) => () => void
  onTerminalData: (cb: (id: string, data: string, sequence: number) => void) => () => void
  onTerminalExit: (cb: (id: string, code: number) => void) => () => void
}

export interface ChatApi {
  getApiKeyStatus: () => Promise<{ configured: boolean }>
  setApiKey: (key: string) => Promise<void>
  getWorkspaces: () => Promise<Workspace[]>
  getConversations: () => Promise<Conversation[]>
  getConnectorInventory: () => Promise<ConnectorInventory>
  getSkills: () => Promise<SkillEntry[]>
  getUsageLimits: () => Promise<UsageLimitSettings>
  saveUsageLimits: (limits: UsageLimitSettings) => Promise<UsageLimitSettings>
  getTasks: () => Promise<TaskItem[]>
  createTask: (input: TaskCreateInput) => Promise<TaskItem>
  updateTask: (id: string, input: TaskUpdateInput) => Promise<TaskItem | null>
  updateTaskState: (id: string, state: TaskState) => Promise<TaskItem | null>
  archiveTask: (id: string) => Promise<TaskItem | null>
  promoteConversationToTask: (conversationId: string, input?: PromoteConversationToTaskInput) => Promise<TaskItem>
  startTaskTerminal: (taskId: string, launcherId: TerminalLauncherId) => Promise<TerminalSessionSnapshot>
  startTaskWorkflow: (taskId: string) => Promise<WorkflowRun>
  getDispatchRecommendation: (taskId: string) => Promise<DispatchRecommendation>
  dispatchTask: (taskId: string, rec: DispatchRecommendation) => Promise<{ kind: 'terminal'; sessionId: string; sessionName: string } | { kind: 'workflow'; workflowName: string }>
  sendMessage: (conversationId: string, content: string, modelChoice: ModelChoice, options?: SendMessageOptions) => Promise<void>
  newConversation: (workspaceId?: string) => Promise<Conversation>
  deleteConversation: (id: string) => Promise<void>
  updateThreadStatus: (id: string, status: ThreadStatus) => Promise<Conversation | null>
  updateThreadResumeState: (id: string, state: Partial<ThreadResumeState>) => Promise<Conversation | null>
  cloneImportedConversation: (sourceId: string) => Promise<Conversation>
  updateConversationMemory: (conversationId: string, memory: ConversationMemory) => Promise<Conversation | null>
  compactConversation: (conversationId: string) => Promise<Conversation | null>
  estimateTokens: (text: string) => Promise<number>

  getOpenAIAuthStatus: () => Promise<{ connected: boolean; email?: string }>
  startOpenAILogin: () => Promise<void>
  disconnectOpenAI: () => Promise<void>
  getCodexModel: () => Promise<string>
  setCodexModel: (model: string) => Promise<void>
  getCodexModels: () => Promise<{ models: string[]; error?: string }>
  getCodexStatus: () => Promise<CodexStatusSnapshot>
  focusCodexThread: (threadId: string) => Promise<void>

  getGeminiKeyStatus: () => Promise<{ configured: boolean }>
  setGeminiKey: (key: string) => Promise<void>
  disconnectGemini: () => Promise<void>
  getGeminiModel: () => Promise<GeminiModel>
  setGeminiModel: (model: GeminiModel) => Promise<void>

  getDeepSeekKeyStatus: () => Promise<{ configured: boolean }>
  setDeepSeekKey: (key: string) => Promise<void>
  disconnectDeepSeek: () => Promise<void>
  getDeepSeekModel: () => Promise<DeepSeekModel>
  setDeepSeekModel: (model: DeepSeekModel) => Promise<void>

  getOllamaStatus: () => Promise<{ configured: boolean; model?: string; baseUrl?: string }>
  setOllamaConfig: (baseUrl: string, model: string) => Promise<void>
  disconnectOllama: () => Promise<void>
  checkOllamaReachable: () => Promise<boolean>
  getOllamaModels: (baseUrl?: string) => Promise<{ models: string[]; error?: string }>
  pullOllamaModel: (model: string, baseUrl?: string) => Promise<{ ok: boolean; error?: string }>

  getCursorKeyStatus: () => Promise<{ configured: boolean; userEmail?: string; apiKeyName?: string }>
  setCursorKey: (key: string) => Promise<void>
  disconnectCursor: () => Promise<void>
  getCursorModel: () => Promise<string>
  setCursorModel: (model: string) => Promise<void>
  getCursorModels: () => Promise<{ models: CursorModelOption[]; error?: string }>

  cancelMessage: (conversationId: string) => Promise<void>

  onStreamStart: (cb: (conversationId: string, messageId: string, routing: RoutingDecision) => void) => () => void
  onChunk: (cb: (conversationId: string, messageId: string, chunk: string) => void) => () => void
  onMessageDone: (cb: (conversationId: string, message: ChatMessage) => void) => () => void
  onError: (cb: (conversationId: string, messageId: string, error: string) => void) => () => void
  onCanceled: (cb: (conversationId: string, messageId: string) => void) => () => void
  onConversationsUpdated: (cb: (conversations: Conversation[]) => void) => () => void
  onTasksUpdated: (cb: (tasks: TaskItem[]) => void) => () => void
  onCodexStatusUpdated: (cb: (snapshot: CodexStatusSnapshot) => void) => () => void
  onCodexThreadFocusRequested: (cb: (conversationId: string) => void) => () => void

  getAgentProfiles: () => Promise<AgentProfile[]>
  saveAgentProfile: (profile: AgentProfile) => Promise<AgentProfile[]>
  getWorkflowDefinitions: () => Promise<WorkflowDefinition[]>
  getWorkflowRuns: () => Promise<WorkflowRun[]>
  startWorkflowRun: (workflowId: string, goal: string, workspaceId?: string) => Promise<WorkflowRun>
  getAutomationCatalog: () => Promise<AutomationCatalogSnapshot>
  onWorkflowRunUpdated: (cb: (run: WorkflowRun) => void) => () => void
}

declare global {
  interface Window {
    api: ChatApi
    terminalApi: TerminalApi
  }
}
