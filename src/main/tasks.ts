import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { writePrivateJson } from './private-json'
import type {
  Conversation,
  PromoteConversationToTaskInput,
  TaskCreateInput,
  TaskItem,
  TaskSignal,
  TaskState,
  TaskUpdateInput,
  TerminalSessionSnapshot,
  WorkflowRun,
} from '../shared/types'

const STORE_PATH = path.join(app.getPath('userData'), 'tasks.json')
const RECENT_ACTIVITY_MS = 5 * 60 * 1000
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000

let emitTasksUpdate: ((tasks: TaskItem[]) => void) | null = null

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

function normalizeTask(raw: Partial<TaskItem>): TaskItem {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    title: normalizeString(raw.title) ?? 'Untitled task',
    brief: normalizeString(raw.brief) ?? '',
    state: normalizeTaskState(raw.state),
    projectName: normalizeString(raw.projectName),
    projectPath: normalizeString(raw.projectPath),
    sourceConversationId: normalizeString(raw.sourceConversationId),
    terminalSessionIds: normalizeStringArray(raw.terminalSessionIds),
    workflowRunIds: normalizeStringArray(raw.workflowRunIds),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
    archivedAt: normalizeString(raw.archivedAt),
    lastActivityAt: normalizeString(raw.lastActivityAt),
    signal: normalizeTaskSignal(raw.signal),
    signalReason: normalizeString(raw.signalReason),
    suggestedState: raw.suggestedState ? normalizeTaskState(raw.suggestedState) : undefined,
  }
}

function normalizeTaskState(value: unknown): TaskState {
  if (value === 'running' || value === 'blocked' || value === 'review' || value === 'done') return value
  return 'idea'
}

function normalizeTaskSignal(value: unknown): TaskSignal | undefined {
  if (
    value === 'active' ||
    value === 'idle' ||
    value === 'waiting' ||
    value === 'exited' ||
    value === 'failed' ||
    value === 'stale' ||
    value === 'complete'
  ) return value
  return undefined
}

function sortTasks(tasks: TaskItem[]): TaskItem[] {
  return [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function readStore(): TaskItem[] {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as Partial<TaskItem>[]
    return sortTasks(raw.map(normalizeTask))
  } catch {
    return []
  }
}

function writeStore(tasks: TaskItem[]): void {
  writePrivateJson(STORE_PATH, sortTasks(tasks))
}

function emitCurrentTasks(): TaskItem[] {
  const tasks = getTasks()
  emitTasksUpdate?.(tasks)
  return tasks
}

function updateStore(mutator: (tasks: TaskItem[]) => TaskItem[]): TaskItem[] {
  const next = sortTasks(mutator(readStore()))
  writeStore(next)
  emitTasksUpdate?.(next)
  return next
}

function deriveTitle(text: string): string {
  const first = text.trim().split('\n')[0]
  if (!first) return 'Untitled task'
  return first.length > 72 ? `${first.slice(0, 69)}...` : first
}

function latestUserMessage(conversation: Conversation): string {
  return [...conversation.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
}

function buildPromotionDefaults(conversation: Conversation): { title: string; brief: string } {
  const activeGoal = conversation.memory?.activeGoal?.trim()
  const latestUser = latestUserMessage(conversation).trim()
  const summary = conversation.memory?.summary?.trim()
  const brief = [
    activeGoal,
    latestUser && latestUser !== activeGoal ? latestUser : '',
    summary ? `Context summary: ${summary}` : '',
  ].filter(Boolean).join('\n\n')

  return {
    title: deriveTitle(activeGoal || latestUser || conversation.title),
    brief,
  }
}

function maxIso(values: Array<string | undefined>): string | undefined {
  return values.filter((value): value is string => !!value).sort().at(-1)
}

function signalForTask(task: TaskItem, terminals: TerminalSessionSnapshot[], workflowRuns: WorkflowRun[]): Pick<TaskItem, 'lastActivityAt' | 'signal' | 'signalReason' | 'suggestedState'> {
  const linkedTerminals = terminals.filter((terminal) => task.terminalSessionIds.includes(terminal.id))
  const linkedRuns = workflowRuns.filter((run) => task.workflowRunIds.includes(run.id))
  const lastActivityAt = maxIso([
    task.lastActivityAt,
    ...linkedTerminals.map((terminal) => terminal.lastActivityAt),
    ...linkedRuns.map((run) => run.updatedAt),
  ])
  const now = Date.now()
  const mostRecentTerminal = [...linkedTerminals]
    .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))[0]
  const runningTerminals = linkedTerminals.filter((terminal) => terminal.status !== 'exited')
  const failedTerminal = linkedTerminals.find((terminal) => terminal.status === 'exited' && typeof terminal.exitCode === 'number' && terminal.exitCode !== 0)
  const completedTerminal = linkedTerminals.find((terminal) => terminal.status === 'exited' && terminal.exitCode === 0)
  const failedRun = linkedRuns.find((run) => run.status === 'failed')
  const activeRun = linkedRuns.find((run) => run.status === 'running')
  const waitingRun = linkedRuns.find((run) => run.status === 'queued')
  const approvedRun = linkedRuns.find((run) => run.status === 'completed' && run.finalVerdict === 'approve')

  if (failedTerminal) {
    return {
      lastActivityAt,
      signal: 'failed',
      signalReason: `${failedTerminal.name} exited with code ${failedTerminal.exitCode}.`,
      suggestedState: task.state === 'done' ? undefined : 'blocked',
    }
  }

  if (failedRun) {
    return {
      lastActivityAt,
      signal: 'failed',
      signalReason: `${failedRun.workflowName} failed.`,
      suggestedState: task.state === 'done' ? undefined : 'blocked',
    }
  }

  if (activeRun) {
    return {
      lastActivityAt,
      signal: 'active',
      signalReason: `${activeRun.workflowName} is running.`,
      suggestedState: undefined,
    }
  }

  if (waitingRun) {
    return {
      lastActivityAt,
      signal: 'waiting',
      signalReason: `${waitingRun.workflowName} is queued.`,
      suggestedState: undefined,
    }
  }

  if (runningTerminals.length > 0) {
    const recent = mostRecentTerminal?.lastActivityAt
      ? now - new Date(mostRecentTerminal.lastActivityAt).getTime() <= RECENT_ACTIVITY_MS
      : false
    return {
      lastActivityAt,
      signal: recent ? 'active' : 'idle',
      signalReason: recent
        ? `${mostRecentTerminal?.name ?? 'A linked terminal'} produced recent output.`
        : `${runningTerminals[0].name} is running without recent output.`,
      suggestedState: undefined,
    }
  }

  if (approvedRun) {
    return {
      lastActivityAt,
      signal: 'complete',
      signalReason: `${approvedRun.workflowName} completed with approval.`,
      suggestedState: task.state === 'done' ? undefined : 'review',
    }
  }

  if (completedTerminal) {
    return {
      lastActivityAt,
      signal: 'exited',
      signalReason: `${completedTerminal.name} exited successfully.`,
      suggestedState: undefined,
    }
  }

  if (task.state === 'running' && lastActivityAt && now - new Date(lastActivityAt).getTime() > STALE_RUNNING_MS) {
    return {
      lastActivityAt,
      signal: 'stale',
      signalReason: 'No linked activity for more than 2 hours.',
      suggestedState: 'blocked',
    }
  }

  return {
    lastActivityAt,
    signal: undefined,
    signalReason: undefined,
    suggestedState: undefined,
  }
}

export function setTaskEmitter(emitter: ((tasks: TaskItem[]) => void) | null): void {
  emitTasksUpdate = emitter
}

export function getTasks(): TaskItem[] {
  return readStore()
}

export function createTask(input: TaskCreateInput): TaskItem {
  const createdAt = nowIso()
  const task = normalizeTask({
    id: randomUUID(),
    title: input.title,
    brief: input.brief,
    state: input.state ?? 'idea',
    projectName: input.projectName,
    projectPath: input.projectPath,
    sourceConversationId: input.sourceConversationId,
    terminalSessionIds: input.terminalSessionIds ?? [],
    workflowRunIds: input.workflowRunIds ?? [],
    createdAt,
    updatedAt: createdAt,
  })
  updateStore((tasks) => [task, ...tasks])
  return task
}

export function updateTask(id: string, input: TaskUpdateInput): TaskItem | null {
  let updated: TaskItem | null = null
  updateStore((tasks) => tasks.map((task) => {
    if (task.id !== id) return task
    updated = normalizeTask({
      ...task,
      ...input,
      updatedAt: nowIso(),
    })
    return updated
  }))
  return updated
}

export function updateTaskState(id: string, state: TaskState): TaskItem | null {
  return updateTask(id, { state })
}

export function archiveTask(id: string): TaskItem | null {
  return updateTask(id, { archivedAt: nowIso() })
}

export function promoteConversationToTask(conversation: Conversation, input: PromoteConversationToTaskInput = {}): TaskItem {
  const defaults = buildPromotionDefaults(conversation)
  return createTask({
    title: input.title?.trim() || defaults.title,
    brief: input.brief?.trim() || defaults.brief,
    state: input.state ?? 'idea',
    projectName: conversation.projectName,
    projectPath: conversation.projectPath,
    sourceConversationId: conversation.id,
  })
}

export function linkTerminalToTask(taskId: string, terminalSessionId: string): TaskItem | null {
  let updated: TaskItem | null = null
  updateStore((tasks) => tasks.map((task) => {
    if (task.id !== taskId) return task
    updated = {
      ...task,
      terminalSessionIds: [...new Set([...task.terminalSessionIds, terminalSessionId])],
      updatedAt: nowIso(),
    }
    return updated
  }))
  return updated
}

export function linkWorkflowRunToTask(taskId: string, workflowRunId: string): TaskItem | null {
  let updated: TaskItem | null = null
  updateStore((tasks) => tasks.map((task) => {
    if (task.id !== taskId) return task
    updated = {
      ...task,
      workflowRunIds: [...new Set([...task.workflowRunIds, workflowRunId])],
      updatedAt: nowIso(),
    }
    return updated
  }))
  return updated
}

export function reconcileTasks(terminals: TerminalSessionSnapshot[], workflowRuns: WorkflowRun[]): TaskItem[] {
  let changed = false
  const tasks = readStore().map((task) => {
    const signal = signalForTask(task, terminals, workflowRuns)
    const next = { ...task, ...signal }
    if (
      next.lastActivityAt !== task.lastActivityAt ||
      next.signal !== task.signal ||
      next.signalReason !== task.signalReason ||
      next.suggestedState !== task.suggestedState
    ) {
      changed = true
      return next
    }
    return task
  })

  if (changed) {
    writeStore(tasks)
    emitTasksUpdate?.(sortTasks(tasks))
    return sortTasks(tasks)
  }

  return emitCurrentTasks()
}
