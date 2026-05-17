import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { ChatMessage, ChatMode, ContextAttachment, ContextPacket, Conversation, ConversationMemory, ExternalConversationLink, ModelChoice, RequestDiagnostics, SendMessageOptions, TerminalSessionSnapshot, TaskItem, ThreadResumeState, ThreadStatus, ThreadWorkspaceSnapshot, TokenUsage } from '../shared/types'
import { route } from './router'
import { isOpenAIConnected } from './openai-auth'
import { getCodexModel, streamCodexMessage } from './openai-codex'
import { isGeminiConnected, getGeminiModel } from './gemini-auth'
import { streamGeminiMessage } from './gemini'
import { getDeepSeekModel, isDeepSeekConnected } from './deepseek-auth'
import { streamDeepSeekMessage } from './deepseek'
import { isOllamaConfigured, getOllamaConfig } from './ollama-config'
import { streamOllamaMessage } from './ollama'
import { getCursorModel, isCursorConnected } from './cursor-auth'
import { streamCursorAgentMessage } from './cursor-agent'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'
import { writePrivateJson } from './private-json'

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const STORE_PATH = path.join(app.getPath('userData'), 'conversations.json')
const CLAUDE_ROOT = path.join(process.env.HOME ?? '', '.claude')
const CODEX_ROOT = path.join(process.env.HOME ?? '', '.codex')

interface CodexThreadRow {
  id: string
  title: string
  cwd: string
  updated_at: string
  first_user_message: string
  rollout_path: string
}

interface ImportedUsage {
  input_tokens?: number | null
  output_tokens?: number | null
  total_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  cached_input_tokens?: number | null
}

interface FileRevision {
  size: number
  mtimeMs: number
}

const codexImportCache = new Map<string, { revision: string; conversation: Conversation | null }>()
const claudeImportCache = new Map<string, { revision: string; conversation: Conversation | null }>()

function fileRevision(filePath?: string): FileRevision | null {
  if (!filePath) return null
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return null
    return { size: stat.size, mtimeMs: stat.mtimeMs }
  } catch {
    return null
  }
}

function revisionKey(revision: FileRevision | null): string {
  return revision ? `${revision.size}:${revision.mtimeMs}` : ''
}

function codexRowRevision(row: CodexThreadRow): string {
  return [
    row.title,
    row.cwd,
    row.updated_at,
    row.first_user_message,
    row.rollout_path,
    revisionKey(fileRevision(row.rollout_path)),
  ].join('|')
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
}

function safeReadJsonLines(filePath: string): unknown[] {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line))
  } catch {
    return []
  }
}

function normalizeThreadStatus(value: unknown): ThreadStatus {
  if (value === 'paused' || value === 'completed' || value === 'archived') return value
  return 'active'
}

function directoryForPath(candidatePath: string): string | null {
  try {
    const resolved = path.resolve(candidatePath)
    const stats = fs.statSync(resolved)
    return stats.isDirectory() ? resolved : path.dirname(resolved)
  } catch {
    return null
  }
}

function safeGit(projectPath: string | undefined, args: string[]): string | undefined {
  if (!projectPath) return undefined
  const cwd = directoryForPath(projectPath)
  if (!cwd) return undefined
  try {
    return execFileSync('git', ['-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() || undefined
  } catch {
    return undefined
  }
}

function captureWorkspaceSnapshot(input: {
  workspaceId?: string
  projectName?: string
  projectPath?: string
}, existing?: Partial<ThreadWorkspaceSnapshot>): ThreadWorkspaceSnapshot {
  const projectPath = normalizeString(existing?.projectPath) ?? normalizeString(input.projectPath)
  return {
    workspaceId: normalizeString(existing?.workspaceId) ?? normalizeString(input.workspaceId),
    projectName: normalizeString(existing?.projectName) ?? normalizeString(input.projectName),
    projectPath,
    gitRemote: normalizeString(existing?.gitRemote) ?? safeGit(projectPath, ['remote', 'get-url', 'origin']),
    gitBranch: normalizeString(existing?.gitBranch) ?? safeGit(projectPath, ['branch', '--show-current']),
    gitCommit: normalizeString(existing?.gitCommit) ?? safeGit(projectPath, ['rev-parse', '--short', 'HEAD']),
    capturedAt: normalizeString(existing?.capturedAt) ?? nowIso(),
  }
}

function emptyResumeState(memory?: ConversationMemory, updatedAt = nowIso()): ThreadResumeState {
  return {
    userGoal: normalizeString(memory?.activeGoal),
    currentState: normalizeString(memory?.summary),
    decisions: normalizeStringArray(memory?.decisions),
    constraints: [],
    filesTouched: normalizeStringArray(memory?.filesTouched),
    commandsRun: [],
    testsRun: [],
    blockers: [],
    openQuestions: [],
    nextSteps: [],
    updatedAt,
  }
}

function normalizeResumeState(value: unknown, memory?: ConversationMemory, updatedAt = nowIso()): ThreadResumeState {
  if (!value || typeof value !== 'object') return emptyResumeState(memory, updatedAt)
  const raw = value as Partial<ThreadResumeState>
  return {
    userGoal: normalizeString(raw.userGoal) ?? normalizeString(memory?.activeGoal),
    currentState: normalizeString(raw.currentState) ?? normalizeString(memory?.summary),
    decisions: normalizeStringArray(raw.decisions).length ? normalizeStringArray(raw.decisions) : normalizeStringArray(memory?.decisions),
    constraints: normalizeStringArray(raw.constraints),
    filesTouched: normalizeStringArray(raw.filesTouched).length ? normalizeStringArray(raw.filesTouched) : normalizeStringArray(memory?.filesTouched),
    commandsRun: normalizeStringArray(raw.commandsRun),
    testsRun: normalizeStringArray(raw.testsRun),
    blockers: normalizeStringArray(raw.blockers),
    openQuestions: normalizeStringArray(raw.openQuestions),
    nextSteps: normalizeStringArray(raw.nextSteps),
    updatedAt: normalizeString(raw.updatedAt) ?? updatedAt,
    generatedFromMessageId: normalizeString(raw.generatedFromMessageId),
  }
}

function normalizeStoredMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((message) => {
    if (!message.streaming) return message
    return {
      ...message,
      streaming: false,
      error: message.error ?? 'Relay closed before this response completed.',
    }
  })
}

function normalizeConversation(conv: Conversation, fallbackProject = getDefaultProject()): Conversation {
  const updatedAt = conv.updatedAt ?? conv.createdAt
  const memory = conv.memory ?? {}
  return {
    ...conv,
    messages: normalizeStoredMessages(conv.messages ?? []),
    updatedAt,
    status: normalizeThreadStatus(conv.status),
    projectName: conv.projectName ?? fallbackProject.name,
    projectPath: conv.projectPath ?? fallbackProject.projectPath,
    workspaceSnapshot: captureWorkspaceSnapshot({
      workspaceId: conv.workspaceId,
      projectName: conv.projectName ?? fallbackProject.name,
      projectPath: conv.projectPath ?? fallbackProject.projectPath,
    }, conv.workspaceSnapshot),
    source: conv.source ?? 'relay',
    readOnly: conv.readOnly ?? false,
    mode: conv.mode ?? 'quick',
    memory,
    resumeState: normalizeResumeState(conv.resumeState, memory, updatedAt),
    toolEventSummaries: Array.isArray(conv.toolEventSummaries) ? conv.toolEventSummaries : [],
  }
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.trim().length / 4)
}

function normalizeUsage(inputTokens: number, outputTokens: number, totalTokens?: number, cachedInputTokens?: number): TokenUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: totalTokens ?? (inputTokens + outputTokens),
    ...(cachedInputTokens ? { cachedInputTokens, effectiveInputTokens: Math.max(0, inputTokens - cachedInputTokens) } : {}),
  }
}

function getDefaultProject(): { name: string; projectPath: string } {
  const projectPath = process.cwd()
  return {
    name: path.basename(projectPath) || 'general',
    projectPath,
  }
}

function readConfig(): { apiKey?: string } {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} }
}

function writeConfig(cfg: { apiKey?: string }): void {
  writePrivateJson(CONFIG_PATH, cfg)
}

function readStore(): Conversation[] {
  try {
    const fallbackProject = getDefaultProject()
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Conversation[]
    return raw.map((conv) => normalizeConversation(conv, fallbackProject))
  } catch {
    return []
  }
}

function writeStore(convs: Conversation[]): void {
  writePrivateJson(STORE_PATH, convs)
}

function deriveProjectFromPath(projectPath?: string): { name?: string; projectPath?: string } {
  if (!projectPath) return {}
  return {
    name: path.basename(projectPath) || projectPath,
    projectPath,
  }
}

function modeInstruction(mode: ChatMode = 'quick'): string {
  const instructions: Record<ChatMode, string> = {
    quick: 'Mode: Quick. Prefer concise answers and ask only essential clarifying questions.',
    deep: 'Mode: Deep. Reason carefully, surface tradeoffs, and include verification steps when useful.',
    code: 'Mode: Code. Prioritize concrete implementation details, tests, and file-level next actions.',
    review: 'Mode: Review. Lead with risks, bugs, regressions, and missing tests before summaries.',
    brainstorm: 'Mode: Brainstorm. Offer several distinct options and help the user choose a direction.',
    compare: 'Mode: Compare. Structure the answer as a comparison across plausible approaches or providers.',
  }
  return instructions[mode]
}

function formatMemory(memory?: ConversationMemory): string {
  if (!memory) return ''
  const parts: string[] = []
  if (memory.activeGoal) parts.push(`Active goal: ${memory.activeGoal}`)
  if (memory.summary) parts.push(`Conversation summary: ${memory.summary}`)
  if (memory.pinnedFacts?.length) parts.push(`Pinned facts:\n${memory.pinnedFacts.map(f => `- ${f}`).join('\n')}`)
  if (memory.decisions?.length) parts.push(`Decisions:\n${memory.decisions.map(f => `- ${f}`).join('\n')}`)
  if (memory.filesTouched?.length) parts.push(`Files touched:\n${memory.filesTouched.map(f => `- ${f}`).join('\n')}`)
  return parts.join('\n\n')
}

function formatAttachments(attachments?: ContextAttachment[]): string {
  if (!attachments?.length) return ''
  return attachments.map(item => `Context: ${item.title}\n${item.content}`).join('\n\n')
}

function listBlock(label: string, values: string[] | undefined): string {
  if (!values?.length) return ''
  return `${label}:\n${values.map(value => `- ${value}`).join('\n')}`
}

function formatWorkspaceSnapshot(snapshot?: ThreadWorkspaceSnapshot): string {
  if (!snapshot) return ''
  const lines = [
    snapshot.projectName ? `- Project: ${snapshot.projectName}` : '',
    snapshot.projectPath ? `- Path: ${snapshot.projectPath}` : '',
    snapshot.gitBranch ? `- Branch at last update: ${snapshot.gitBranch}` : '',
    snapshot.gitCommit ? `- Commit at last update: ${snapshot.gitCommit}` : '',
  ].filter(Boolean)
  return lines.length ? `Workspace:\n${lines.join('\n')}` : ''
}

function formatToolEventSummaries(conversation: Conversation): string {
  const summaries = (conversation.toolEventSummaries ?? [])
    .slice(-6)
    .map((summary) => {
      const suffix = summary.detail ? ` - ${summary.detail}` : ''
      const status = summary.status ? ` [${summary.status}]` : ''
      return `${summary.title}${status}${suffix}`
    })
  return listBlock('Known tool results', summaries)
}

function hasDurableResumeContext(conversation: Conversation): boolean {
  const resume = conversation.resumeState
  const hasPriorAssistantTurn = conversation.messages.some((message) => message.role === 'assistant' && !message.error)
  const hasStructuredResume = !!(
    resume?.currentState ||
    resume?.decisions.length ||
    resume?.constraints.length ||
    resume?.filesTouched.length ||
    resume?.commandsRun.length ||
    resume?.testsRun.length ||
    resume?.blockers.length ||
    resume?.openQuestions.length ||
    resume?.nextSteps.length
  )
  return !!(
    conversation.memory?.summary ||
    hasPriorAssistantTurn ||
    hasStructuredResume ||
    conversation.toolEventSummaries?.length ||
    conversation.sourceConversationId ||
    (conversation.status && conversation.status !== 'active')
  )
}

function formatResumeContext(conversation: Conversation): string {
  if (!hasDurableResumeContext(conversation)) return ''

  const resume = normalizeResumeState(
    conversation.resumeState,
    conversation.memory,
    conversation.updatedAt ?? conversation.createdAt,
  )
  const blocks = [
    'Relay reconstructed this thread from durable local state so it can be continued later.',
    formatWorkspaceSnapshot(conversation.workspaceSnapshot),
    resume.userGoal ? `Goal:\n${resume.userGoal}` : '',
    resume.currentState ? `Current state:\n${resume.currentState}` : '',
    listBlock('Decisions', resume.decisions),
    listBlock('Constraints', resume.constraints),
    listBlock('Files touched', resume.filesTouched),
    listBlock('Commands run', resume.commandsRun),
    listBlock('Tests run', resume.testsRun),
    listBlock('Blockers', resume.blockers),
    listBlock('Open questions', resume.openQuestions),
    formatToolEventSummaries(conversation),
    listBlock('Next steps', resume.nextSteps),
  ].filter(Boolean)

  return blocks.length ? `Relay resume context:\n\n${blocks.join('\n\n')}` : ''
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function extractFileReferences(text: string): string[] {
  const matches = [...text.matchAll(/(?:^|[\s`'"])([\w@./-]+\.(?:ts|tsx|js|jsx|json|css|scss|md|mdx|py|go|rs|toml|yml|yaml|html|sql|sh|mjs|cjs))(?:$|[\s`'",:;.)\]])/g)]
  return matches.map(match => match[1]).filter(item => !item.startsWith('http'))
}

function readContextFile(projectPath: string | undefined, filePath: string): ContextPacket['files'][number] {
  const normalized = filePath.startsWith('@/') ? filePath.slice(2) : filePath.startsWith('./') ? filePath.slice(2) : filePath
  const absolutePath = path.isAbsolute(normalized)
    ? normalized
    : path.join(projectPath ?? process.cwd(), normalized)

  try {
    const stat = fs.statSync(absolutePath)
    if (!stat.isFile()) {
      return { path: filePath, reason: 'mentioned in conversation', included: false, tokenEstimate: 0 }
    }

    const raw = fs.readFileSync(absolutePath, 'utf8')
    const contentPreview = raw.length > 8000 ? `${raw.slice(0, 8000)}\n\n[Relay truncated this file preview.]` : raw
    return {
      path: filePath,
      reason: 'mentioned in conversation',
      included: true,
      tokenEstimate: estimateTokens(contentPreview),
      contentPreview,
    }
  } catch {
    return { path: filePath, reason: 'mentioned in conversation', included: false, tokenEstimate: 0 }
  }
}

function buildContextPacket(conv: Conversation, taskBrief: string, options: SendMessageOptions = {}): ContextPacket {
  const cleanMessages = conv.messages.filter(message => !message.streaming && !message.error && !message.id.startsWith('context-'))
  const recentMessages = cleanMessages.slice(-6).map(message => ({
    role: message.role,
    content: message.content.slice(0, 2000),
    tokenEstimate: estimateTokens(message.content.slice(0, 2000)),
  }))
  const memory = conv.memory ?? {}
  const resume = normalizeResumeState(conv.resumeState, memory, conv.updatedAt ?? conv.createdAt)
  const fileRefs = uniqueValues([
    ...extractFileReferences(taskBrief),
    ...extractFileReferences(resume.currentState ?? memory.summary ?? ''),
    ...(memory.filesTouched ?? []),
    ...(resume.filesTouched ?? []),
  ]).slice(0, 8)
  const files = fileRefs.map(filePath => readContextFile(conv.projectPath, filePath))
  const attachments = options.attachments ?? []
  const constraints = [
    modeInstruction(options.mode ?? conv.mode ?? 'quick'),
    'Use the retrieved context as a working set, not as the whole truth.',
    'If needed context is missing, inspect files or ask for it instead of guessing.',
  ]

  const tokenEstimate = [
    taskBrief,
    resume.userGoal ?? memory.activeGoal ?? '',
    resume.currentState ?? memory.summary ?? '',
    ...recentMessages.map(message => message.content),
    ...(memory.pinnedFacts ?? []),
    ...(resume.decisions.length ? resume.decisions : (memory.decisions ?? [])),
    ...files.map(file => file.contentPreview ?? ''),
    ...attachments.map(attachment => attachment.content),
    ...constraints,
  ].reduce((total, item) => total + estimateTokens(item), 0)

  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    taskBrief,
    activeGoal: resume.userGoal ?? memory.activeGoal,
    conversationSummary: resume.currentState ?? memory.summary,
    relevantMessages: recentMessages,
    pinnedFacts: memory.pinnedFacts ?? [],
    decisions: resume.decisions.length ? resume.decisions : (memory.decisions ?? []),
    files,
    attachments,
    constraints,
    expectedOutput: 'Answer the user directly. When making code changes, mention important files, verification, risks, and next steps.',
    tokenEstimate,
  }
}

function formatContextPacket(packet: ContextPacket): string {
  const blocks = [
    `Task brief:\n${packet.taskBrief}`,
    packet.activeGoal ? `Active goal:\n${packet.activeGoal}` : '',
    packet.conversationSummary ? `Conversation summary:\n${packet.conversationSummary}` : '',
    packet.pinnedFacts.length ? `Pinned facts:\n${packet.pinnedFacts.map(item => `- ${item}`).join('\n')}` : '',
    packet.decisions.length ? `Decisions:\n${packet.decisions.map(item => `- ${item}`).join('\n')}` : '',
    packet.relevantMessages.length
      ? `Recent relevant messages:\n${packet.relevantMessages.map(message => `${message.role}: ${message.content}`).join('\n\n')}`
      : '',
    packet.files.length
      ? `Retrieved file context:\n${packet.files.map(file => file.included
        ? `File: ${file.path}\n${file.contentPreview}`
        : `File: ${file.path}\n[Not included: file could not be read or is not a regular file.]`).join('\n\n')}`
      : '',
    packet.attachments.length ? formatAttachments(packet.attachments) : '',
    `Constraints:\n${packet.constraints.map(item => `- ${item}`).join('\n')}`,
    `Expected output:\n${packet.expectedOutput}`,
  ].filter(Boolean)

  return `Relay context packet (${packet.id}):\n\n${blocks.join('\n\n')}`
}

function buildSystemContext(conv: Conversation, options?: SendMessageOptions, contextPacket?: ContextPacket): string {
  const resumeContext = formatResumeContext(conv)
  if (contextPacket) {
    return [resumeContext, formatContextPacket(contextPacket)].filter(Boolean).join('\n\n')
  }
  const skillBlock = options?.skill
    ? `Active skill — ${options.skill.name} (${options.skill.provider}):\n\n${options.skill.body}`
    : ''
  const blocks = [
    resumeContext,
    modeInstruction(options?.mode ?? conv.mode ?? 'quick'),
    skillBlock,
    formatMemory(conv.memory),
    formatAttachments(options?.attachments),
  ].filter(Boolean)

  return blocks.length ? `Relay context for this turn:\n\n${blocks.join('\n\n')}` : ''
}

function optimizeHistory(messages: ChatMessage[], memory?: ConversationMemory): ChatMessage[] {
  const cleanMessages = messages.filter(message => !message.id.startsWith('context-'))
  if (!memory?.summary) return cleanMessages

  const lastTurns: ChatMessage[] = []
  let userTurns = 0

  for (let index = cleanMessages.length - 1; index >= 0; index -= 1) {
    const message = cleanMessages[index]
    lastTurns.unshift(message)
    if (message.role === 'user') userTurns += 1
    if (userTurns >= 4 && message.role === 'user') break
  }

  return lastTurns
}

function compactMemory(messages: ChatMessage[], memory: ConversationMemory = {}): ConversationMemory {
  const transcript = messages
    .filter(m => !m.streaming && !m.error)
    .slice(0, Math.max(0, messages.length - 8))
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  if (!transcript.trim()) {
    return { ...memory, updatedAt: new Date().toISOString() }
  }

  const prior = memory.summary ? `${memory.summary}\n` : ''
  const compact = `${prior}${transcript}`
    .replace(/\s+/g, ' ')
    .slice(-2400)

  const files = new Set(memory.filesTouched ?? [])
  for (const match of transcript.matchAll(/(?:^|\s)([\w./-]+\.(?:ts|tsx|js|jsx|json|css|md|py|go|rs|toml|yml|yaml))/g)) {
    files.add(match[1])
  }

  return {
    ...memory,
    summary: compact,
    filesTouched: [...files].slice(-20),
    updatedAt: new Date().toISOString(),
  }
}

function deriveResumeState(conversation: Conversation, messages: ChatMessage[] = conversation.messages): ThreadResumeState {
  const current = normalizeResumeState(conversation.resumeState, conversation.memory, conversation.updatedAt ?? conversation.createdAt)
  const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant' && !message.streaming && !message.error)
  const latestUser = [...messages].reverse().find((message) => message.role === 'user')
  const transcript = messages
    .filter((message) => !message.streaming && !message.error)
    .map((message) => message.content)
    .join('\n')
  const files = new Set([
    ...current.filesTouched,
    ...(conversation.memory?.filesTouched ?? []),
    ...extractFileReferences(transcript),
  ])

  return {
    ...current,
    userGoal: current.userGoal ?? normalizeString(conversation.memory?.activeGoal) ?? normalizeString(latestUser?.content),
    currentState: normalizeString(conversation.memory?.summary) ?? current.currentState ?? normalizeString(latestAssistant?.content),
    decisions: current.decisions.length ? current.decisions : normalizeStringArray(conversation.memory?.decisions),
    filesTouched: [...files].slice(-20),
    updatedAt: nowIso(),
    generatedFromMessageId: latestAssistant?.id ?? current.generatedFromMessageId,
  }
}

function importedConversationSummary(conversation: Conversation): string {
  const transcript = conversation.messages
    .slice(-8)
    .map((message) => `${message.role}: ${message.content}`)
    .join('\n\n')
    .replace(/\s+/g, ' ')
    .trim()
  const prefix = `Imported ${conversation.source ?? 'external'} history from "${conversation.title}".`
  return `${prefix}${transcript ? ` Recent context: ${transcript}` : ''}`.slice(-2400)
}

function importedRouting(model: string | undefined, provider: 'anthropic' | 'openai'): ChatMessage['routing'] | undefined {
  if (!model) return undefined
  if (provider === 'anthropic') {
    const modelLabel = model.includes('haiku')
      ? 'Haiku'
      : model.includes('sonnet')
        ? 'Sonnet'
        : model.includes('opus')
          ? 'Opus'
          : model
    return {
      model,
      modelLabel,
      reason: 'imported from Claude history',
      autoSelected: false,
      provider,
    }
  }

  return {
    model,
    modelLabel: model.includes('codex') ? 'Codex' : model,
    reason: 'imported from Codex history',
    autoSelected: false,
    provider,
  }
}

function normalizeImportedUsage(usage?: ImportedUsage): TokenUsage | undefined {
  if (!usage) return undefined

  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const cachedInputTokens =
    usage.cached_input_tokens ??
    (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)
  const totalTokens = usage.total_tokens ?? (inputTokens + outputTokens)

  if (!inputTokens && !outputTokens && !cachedInputTokens && !totalTokens) return undefined

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cachedInputTokens ? { cachedInputTokens } : {}),
  }
}

function extractClaudeText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (!item || typeof item !== 'object') return ''
        const record = item as { type?: string; text?: string }
        return record.type === 'text' && typeof record.text === 'string' ? record.text : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }
  return ''
}

function importClaudeConversations(): Conversation[] {
  const projectsDir = path.join(CLAUDE_ROOT, 'projects')
  if (!fs.existsSync(projectsDir)) return []

  const files = fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap((entry) => {
      const dirPath = path.join(projectsDir, entry.name)
      try {
        return fs.readdirSync(dirPath)
          .filter(name => name.endsWith('.jsonl'))
          .map(name => path.join(dirPath, name))
      } catch {
        return []
      }
    })

  const activeFiles = new Set(files)
  for (const filePath of claudeImportCache.keys()) {
    if (!activeFiles.has(filePath)) claudeImportCache.delete(filePath)
  }

  return files
    .map((filePath) => {
      const revision = revisionKey(fileRevision(filePath))
      const cached = claudeImportCache.get(filePath)
      if (cached?.revision === revision) return cached.conversation

      const conversation = importClaudeConversation(filePath)
      claudeImportCache.set(filePath, { revision, conversation })
      return conversation
    })
    .filter((conversation): conversation is Conversation => !!conversation)
}

function importClaudeConversation(filePath: string): Conversation | null {
  const rows = safeReadJsonLines(filePath)
  const messages: ChatMessage[] = []
  let createdAt = ''
  let updatedAt = ''
  let title = ''
  let projectPath = ''
  let sessionId = path.basename(filePath, '.jsonl')

  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const record = row as {
      type?: string
      timestamp?: string
      sessionId?: string
      cwd?: string
      message?: {
        role?: 'user' | 'assistant'
        content?: unknown
        model?: string
        usage?: ImportedUsage
      }
    }

    if (record.sessionId) sessionId = record.sessionId
    if (record.cwd && !projectPath) projectPath = record.cwd
    if (record.timestamp && !createdAt) createdAt = record.timestamp
    if (record.timestamp) updatedAt = record.timestamp

    if (record.type !== 'user' && record.type !== 'assistant') continue
    const role = record.message?.role
    if (role !== 'user' && role !== 'assistant') continue

    const text = extractClaudeText(record.message?.content)
    if (!text) continue

    if (!title && role === 'user') title = deriveTitle(text)
    messages.push({
      id: randomUUID(),
      role,
      content: text,
      createdAt: record.timestamp,
      routing: role === 'assistant' ? importedRouting(record.message?.model, 'anthropic') : undefined,
      usage: role === 'assistant' ? normalizeImportedUsage(record.message?.usage) : undefined,
    })
  }

  if (messages.length === 0) return null
  const project = deriveProjectFromPath(projectPath)
  return normalizeConversation({
    id: `claude:${sessionId}`,
    title: title || 'Claude conversation',
    messages,
    createdAt: createdAt || updatedAt || new Date().toISOString(),
    updatedAt: updatedAt || createdAt || new Date().toISOString(),
    projectName: project.name,
    projectPath: project.projectPath,
    source: 'claude',
    readOnly: true,
  })
}

function readCodexThreadRows(): CodexThreadRow[] {
  const dbPath = path.join(CODEX_ROOT, 'state_5.sqlite')
  if (!fs.existsSync(dbPath)) return []
  try {
    const output = execFileSync('sqlite3', [
      '-json',
      dbPath,
      "select id,title,cwd,datetime(updated_at,'unixepoch') as updated_at,first_user_message,rollout_path from threads where archived=0 order by updated_at desc limit 200;",
    ], { encoding: 'utf8' })
    return JSON.parse(output) as CodexThreadRow[]
  } catch {
    return []
  }
}

export function getCodexConversationRevision(): string {
  return readCodexThreadRows()
    .map((row) => {
      const rolloutRevision = revisionKey(fileRevision(row.rollout_path))

      return [
        row.id,
        row.title,
        row.cwd,
        row.updated_at,
        row.first_user_message,
        row.rollout_path,
        rolloutRevision,
      ].join('|')
    })
    .join('\n')
}

function extractCodexText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const record = item as { type?: string; text?: string }
      return (record.type === 'input_text' || record.type === 'output_text') && typeof record.text === 'string'
        ? record.text
        : ''
    })
    .filter(Boolean)
    .join('\n\n')
    .trim()
}

function importCodexConversation(row: CodexThreadRow): Conversation | null {
  if (!row.rollout_path || !fs.existsSync(row.rollout_path)) return null
  const entries = safeReadJsonLines(row.rollout_path)
  const messages: ChatMessage[] = []
  let createdAt = ''
  let importedModel = 'gpt-5.3-codex'
  let pendingAssistantIndex: number | null = null

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as {
      timestamp?: string
      type?: string
      payload?: {
        type?: string
        role?: string
        content?: unknown
        phase?: string
        info?: {
          last_token_usage?: {
            input_tokens?: number
            cached_input_tokens?: number
            output_tokens?: number
            total_tokens?: number
          }
        }
      }
      model?: string
      payload_model?: string
    }

    if (record.timestamp && !createdAt) createdAt = record.timestamp
    if (record.type === 'session_meta') {
      const sessionMeta = entry as { payload?: { model_slug?: string; model?: string } }
      importedModel = sessionMeta.payload?.model_slug ?? sessionMeta.payload?.model ?? importedModel
      continue
    }
    if (record.type === 'event_msg' && record.payload?.type === 'token_count') {
      if (pendingAssistantIndex !== null) {
        const usage = normalizeImportedUsage(record.payload.info?.last_token_usage)
        if (usage) messages[pendingAssistantIndex].usage = usage
      }
      continue
    }
    if (record.type !== 'response_item') continue
    if (record.payload?.type !== 'message') continue
    if (record.payload.role !== 'user' && record.payload.role !== 'assistant') continue

    const text = extractCodexText(record.payload.content)
    if (!text) continue

    if (record.payload.role === 'user' && text.includes('<environment_context>')) continue

    messages.push({
      id: randomUUID(),
      role: record.payload.role,
      content: text,
      createdAt: record.timestamp,
      routing: record.payload.role === 'assistant' ? importedRouting(importedModel, 'openai') : undefined,
    })

    pendingAssistantIndex = record.payload.role === 'assistant' ? messages.length - 1 : null
  }

  if (messages.length === 0) return null
  const project = deriveProjectFromPath(row.cwd)
  return normalizeConversation({
    id: `codex:${row.id}`,
    title: row.title || deriveTitle(row.first_user_message || messages[0]?.content || 'Codex conversation'),
    messages,
    createdAt: createdAt || row.updated_at || new Date().toISOString(),
    updatedAt: row.updated_at || createdAt || new Date().toISOString(),
    projectName: project.name,
    projectPath: project.projectPath,
    source: 'codex',
    readOnly: true,
  })
}

function importCodexConversations(): Conversation[] {
  const rows = readCodexThreadRows()
  const activeIds = new Set(rows.map((row) => row.id))
  for (const id of codexImportCache.keys()) {
    if (!activeIds.has(id)) codexImportCache.delete(id)
  }

  return rows
    .map((row) => {
      const revision = codexRowRevision(row)
      const cached = codexImportCache.get(row.id)
      if (cached?.revision === revision) return cached.conversation

      const conversation = importCodexConversation(row)
      codexImportCache.set(row.id, { revision, conversation })
      return conversation
    })
    .filter((conv): conv is Conversation => !!conv)
}

function withinMatchingWindow(left?: string, right?: string, minutes = 30): boolean {
  if (!left || !right) return false
  const leftTime = new Date(left).getTime()
  const rightTime = new Date(right).getTime()
  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return false
  return Math.abs(leftTime - rightTime) <= minutes * 60 * 1000
}

function codexExternalLink(
  conversation: Conversation,
  terminals: TerminalSessionSnapshot[],
  tasks: TaskItem[]
): ExternalConversationLink | undefined {
  const candidates = terminals
    .filter((terminal) => terminal.launcherId === 'codex')
    .filter((terminal) => !conversation.projectPath || !terminal.cwd || terminal.cwd === conversation.projectPath)
    .filter((terminal) => withinMatchingWindow(conversation.updatedAt ?? conversation.createdAt, terminal.lastActivityAt, 90))
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))

  const terminal = candidates[0]
  if (!terminal) return undefined

  const task = terminal.taskId
    ? tasks.find((entry) => entry.id === terminal.taskId)
    : undefined

  return {
    terminalSessionId: terminal.id,
    terminalName: terminal.name,
    terminalStatus: terminal.status,
    terminalLastActivityAt: terminal.lastActivityAt,
    taskId: task?.id,
    taskTitle: task?.title,
  }
}

function linkCodexConversations(
  conversations: Conversation[],
  terminals: TerminalSessionSnapshot[],
  tasks: TaskItem[]
): Conversation[] {
  if (!terminals.length) return conversations
  return conversations.map((conversation) => {
    if (conversation.source !== 'codex') return conversation
    const externalLink = codexExternalLink(conversation, terminals, tasks)
    return externalLink ? { ...conversation, externalLink } : conversation
  })
}

function getExternalConversations(terminals: TerminalSessionSnapshot[] = [], tasks: TaskItem[] = []): Conversation[] {
  return [
    ...importClaudeConversations(),
    ...linkCodexConversations(importCodexConversations(), terminals, tasks),
  ]
}

function sortConversations(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const aStamp = a.updatedAt ?? a.createdAt
    const bStamp = b.updatedAt ?? b.createdAt
    return bStamp.localeCompare(aStamp)
  })
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY ?? readConfig().apiKey
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

export function isApiKeyConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY ?? readConfig().apiKey)
}

export function saveApiKey(key: string): void {
  writeConfig({ ...readConfig(), apiKey: key })
}

export function getConversations(terminals: TerminalSessionSnapshot[] = [], tasks: TaskItem[] = []): Conversation[] {
  return sortConversations([...readStore(), ...getExternalConversations(terminals, tasks)])
}

export function newConversation(input: { workspaceId?: string; projectName?: string; projectPath?: string; preserveEmptyProject?: boolean } = {}): Conversation {
  const project = input.preserveEmptyProject
    ? {
        name: input.projectName ?? 'General',
        projectPath: undefined,
      }
    : input.projectPath
    ? {
        name: input.projectName ?? (path.basename(input.projectPath) || input.projectPath),
        projectPath: input.projectPath,
      }
    : getDefaultProject()
  const conv: Conversation = {
    id: randomUUID(),
    title: 'New conversation',
    messages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'active',
    workspaceId: input.workspaceId,
    projectName: project.name,
    projectPath: project.projectPath,
    workspaceSnapshot: captureWorkspaceSnapshot({
      workspaceId: input.workspaceId,
      projectName: project.name,
      projectPath: project.projectPath,
    }),
    source: 'relay',
    readOnly: false,
    mode: 'quick',
    memory: {},
    resumeState: emptyResumeState(),
    toolEventSummaries: [],
  }
  const store = readStore()
  store.unshift(conv)
  writeStore(store)
  return conv
}

export function deleteConversation(id: string): void {
  writeStore(readStore().filter(c => c.id !== id))
}

export function updateThreadStatus(id: string, status: ThreadStatus): Conversation | null {
  return updateConversation(id, c => {
    const timestamp = nowIso()
    return {
      ...c,
      status,
      archivedAt: status === 'archived' ? timestamp : undefined,
      completedAt: status === 'completed' ? timestamp : status === 'active' || status === 'paused' ? undefined : c.completedAt,
      updatedAt: timestamp,
      resumeState: {
        ...normalizeResumeState(c.resumeState, c.memory, c.updatedAt ?? c.createdAt),
        updatedAt: timestamp,
      },
    }
  })
}

export function updateThreadResumeState(id: string, state: Partial<ThreadResumeState>): Conversation | null {
  return updateConversation(id, c => ({
    ...c,
    resumeState: normalizeResumeState({
      ...normalizeResumeState(c.resumeState, c.memory, c.updatedAt ?? c.createdAt),
      ...state,
      updatedAt: nowIso(),
    }, c.memory),
    updatedAt: nowIso(),
  }))
}

export function cloneImportedConversation(sourceId: string): Conversation {
  const source = getConversations().find((conversation) => conversation.id === sourceId)
  if (!source) throw new Error('Source conversation not found.')

  const createdAt = nowIso()
  const summary = importedConversationSummary(source)
  const memory: ConversationMemory = {
    summary,
    activeGoal: source.memory?.activeGoal,
    decisions: source.memory?.decisions ?? [],
    filesTouched: [
      ...(source.memory?.filesTouched ?? []),
      ...extractFileReferences(summary),
    ].slice(-20),
    updatedAt: createdAt,
  }
  const conv: Conversation = normalizeConversation({
    id: randomUUID(),
    title: source.title.startsWith('Continue: ') ? source.title : `Continue: ${source.title}`,
    messages: [],
    createdAt,
    updatedAt: createdAt,
    status: 'active',
    workspaceId: source.workspaceId,
    projectName: source.projectName,
    projectPath: source.projectPath,
    workspaceSnapshot: captureWorkspaceSnapshot(source),
    source: 'relay',
    readOnly: false,
    mode: source.mode ?? 'quick',
    memory,
    resumeState: {
      ...emptyResumeState(memory, createdAt),
      currentState: summary,
      nextSteps: ['Continue from imported history.'],
      updatedAt: createdAt,
    },
    toolEventSummaries: [{
      id: randomUUID(),
      kind: 'external',
      title: `Cloned ${source.source ?? 'external'} history`,
      detail: source.title,
      status: 'succeeded',
      createdAt,
      relatedId: source.id,
    }],
    sourceConversationId: source.id,
  })

  const store = readStore()
  store.unshift(conv)
  writeStore(store)
  return conv
}

export function updateConversationMemory(id: string, memory: ConversationMemory): Conversation | null {
  return updateConversation(id, c => ({
    ...c,
    memory: {
      ...(c.memory ?? {}),
      ...memory,
      updatedAt: new Date().toISOString(),
    },
    resumeState: deriveResumeState({ ...c, memory: { ...(c.memory ?? {}), ...memory } }),
    updatedAt: new Date().toISOString(),
  }))
}

export function compactConversation(id: string): Conversation | null {
  return updateConversation(id, c => ({
    ...c,
    memory: compactMemory(c.messages, c.memory),
    resumeState: deriveResumeState({ ...c, memory: compactMemory(c.messages, c.memory) }),
    updatedAt: new Date().toISOString(),
  }))
}

function updateConversation(id: string, updater: (c: Conversation) => Conversation): Conversation | null {
  const store = readStore()
  const idx = store.findIndex(c => c.id === id)
  if (idx === -1) return null
  store[idx] = updater(store[idx])
  writeStore(store)
  return store[idx]
}

function deriveTitle(content: string): string {
  const first = content.trim().split('\n')[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

function normalizeAnthropicUsage(usage?: {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}): TokenUsage | undefined {
  if (!usage) return undefined

  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const cachedInputTokens = (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0)

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens + cachedInputTokens,
    ...(cachedInputTokens ? { cachedInputTokens } : {}),
  }
}

export async function sendMessage(
  conversationId: string,
  content: string,
  modelChoice: ModelChoice,
  signal: AbortSignal,
  emit: {
    streamStart: (convId: string, msgId: string, routing: ChatMessage['routing']) => void
    chunk: (convId: string, msgId: string, chunk: string) => void
    done: (convId: string, message: ChatMessage) => void
    error: (convId: string, msgId: string, error: string) => void
    cancel: (convId: string, msgId: string) => void
  },
  options: SendMessageOptions = {}
): Promise<void> {
  // Add user message
  const userMsg: ChatMessage = { id: randomUUID(), role: 'user', content, createdAt: new Date().toISOString() }
  let conv = updateConversation(conversationId, c => {
    const messages = [...c.messages, userMsg]
    return {
      ...c,
      mode: options.mode ?? c.mode ?? 'quick',
      title: c.messages.length === 0 ? deriveTitle(content) : c.title,
      messages,
      resumeState: deriveResumeState({ ...c, messages }, messages),
      updatedAt: new Date().toISOString(),
    }
  })
  if (!conv) return

  // Route — pass connection state for all free providers
  const { connected: openAIConnected } = isOpenAIConnected()
  const { configured: geminiConnected } = isGeminiConnected()
  const { configured: deepSeekConnected } = isDeepSeekConnected()
  const codexModel = getCodexModel()
  const geminiModel = getGeminiModel()
  const deepSeekModel = getDeepSeekModel()
  const ollamaConfigured = isOllamaConfigured()
  const ollamaModel = getOllamaConfig()?.model ?? ''
  const { configured: cursorConfigured } = isCursorConnected()
  const routing = route(conv.messages, modelChoice, openAIConnected, geminiConnected, codexModel, geminiModel, deepSeekConnected, deepSeekModel, ollamaConfigured, ollamaModel, cursorConfigured, getCursorModel())

  // If routing to Anthropic but no key configured, bail early with a clear message
  if (routing.provider === 'anthropic' && !isApiKeyConfigured()) {
    const errId = randomUUID()
    emit.error(conversationId, errId, 'No Anthropic API key configured. Add your key in settings.')
    return
  }

  // Placeholder assistant message
  const assistantId = randomUUID()
  const placeholder: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    createdAt: new Date().toISOString(),
    routing,
    streaming: true,
  }
  conv = updateConversation(conversationId, c => ({
    ...c,
    updatedAt: new Date().toISOString(),
    messages: [...c.messages, placeholder],
  }))!

  // Tell the renderer to create the streaming placeholder immediately
  emit.streamStart(conversationId, assistantId, routing)

  // Build message history excluding the empty placeholder
  const historyMessages = conv.messages.filter(m => m.id !== assistantId)
  const contextPacket = buildContextPacket(conv, content, options)
  const systemContext = buildSystemContext(conv, options, contextPacket)
  const optimizedHistoryMessages = optimizeHistory(historyMessages, conv.memory)
  const requestDiagnostics: RequestDiagnostics = {
    mode: options.mode ?? conv.mode ?? 'quick',
    provider: routing.provider,
    model: routing.model,
    usedPreviousResponseId: routing.provider === 'openai' && !![...optimizedHistoryMessages].slice(0, -1).reverse().find(message => message.role === 'assistant')?.openAIResponseId,
    sentMessageCount: optimizedHistoryMessages.length,
    originalMessageCount: historyMessages.length,
    systemContextTokenEstimate: estimateTokens(systemContext),
    attachedContextTokenEstimate: estimateTokens(formatAttachments(options.attachments)),
    contextPacketTokenEstimate: contextPacket.tokenEstimate,
    contextPacketFileCount: contextPacket.files.length,
    contextPacketMessageCount: contextPacket.relevantMessages.length,
    usedMemorySummary: !!conv.memory?.summary,
  }

  function finalizePartial(content: string, usage?: TokenUsage, openAIResponseId?: string): void {
    const finalMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content,
      createdAt: placeholder.createdAt,
      routing,
      usage,
      openAIResponseId,
      requestDiagnostics,
      contextPacket,
      streaming: false,
    }
    updateConversation(conversationId, c => {
      const messages = c.messages.map(m => m.id === assistantId ? finalMsg : m)
      const memory = messages.length > 14 ? compactMemory(messages, c.memory) : c.memory
      return {
        ...c,
        memory,
        resumeState: deriveResumeState({ ...c, memory }, messages),
        updatedAt: nowIso(),
        messages,
      }
    })
    emit.done(conversationId, finalMsg)
  }

  function cancelPlaceholder(): void {
    updateConversation(conversationId, c => ({
      ...c,
      updatedAt: new Date().toISOString(),
      messages: c.messages.filter(m => m.id !== assistantId),
    }))
    emit.cancel(conversationId, assistantId)
  }

  if (routing.provider === 'ollama') {
    let accumulated = ''
    await streamOllamaMessage(optimizedHistoryMessages, {
      chunk: (text) => {
        if (signal.aborted) return
        accumulated += text
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText, usage) => { finalizePartial(fullText, usage) },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal, systemContext)
    if (signal.aborted) {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
    }
    return
  }

  if (routing.provider === 'cursor') {
    let accumulated = ''
    await streamCursorAgentMessage(optimizedHistoryMessages, conv.projectPath ?? process.cwd(), {
      chunk: (text) => {
        if (signal.aborted) return
        accumulated += text
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText, usage) => { finalizePartial(fullText, usage) },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal, systemContext)
    if (signal.aborted) {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
    }
    return
  }

  if (routing.provider === 'google') {
    let accumulated = ''
    await streamGeminiMessage(optimizedHistoryMessages, {
      chunk: (text) => {
        if (signal.aborted) return
        accumulated += text
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText, usage) => {
        finalizePartial(fullText, usage)
      },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal, routing.model as import('../shared/types').GeminiModel, systemContext)
    if (signal.aborted) {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
    }
    return
  }

  if (routing.provider === 'deepseek') {
    let accumulated = ''
    await streamDeepSeekMessage(optimizedHistoryMessages, {
      chunk: (text) => {
        if (signal.aborted) return
        accumulated += text
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText, usage) => {
        finalizePartial(fullText, usage)
      },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal, routing.model as import('../shared/types').DeepSeekModel, systemContext)
    if (signal.aborted) {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
    }
    return
  }

  if (routing.provider === 'openai') {
    let accumulated = ''
    await streamCodexMessage(optimizedHistoryMessages, {
      chunk: (text) => {
        if (signal.aborted) return
        accumulated += text
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText, usage, responseId) => {
        finalizePartial(fullText, usage, responseId)
      },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          updatedAt: new Date().toISOString(),
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal, systemContext, routing.model)
    if (signal.aborted) {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
    }
    return
  }

  // Anthropic path
  const client = getAnthropicClient()!
  const apiMessages = optimizedHistoryMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))
  let accumulated = ''

  try {
    const stream = client.messages.stream({
      model: routing.model as import('../shared/types').AnthropicModel,
      max_tokens: 4096,
      system: [RELAY_SYSTEM_PROMPT, systemContext].filter(Boolean).join('\n\n'),
      messages: apiMessages,
    }, { signal })

    stream.on('text', (text) => {
      if (signal.aborted) return
      accumulated += text
      emit.chunk(conversationId, assistantId, text)
    })

    const finalMessage = await stream.finalMessage()
    finalizePartial(accumulated, normalizeAnthropicUsage(finalMessage.usage))
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') {
      if (accumulated) finalizePartial(accumulated)
      else cancelPlaceholder()
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    updateConversation(conversationId, c => ({
      ...c,
      updatedAt: new Date().toISOString(),
      messages: c.messages.filter(m => m.id !== assistantId),
    }))
    emit.error(conversationId, assistantId, msg)
  }
}
