import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { CodexStatusItem, CodexStatusSnapshot, CodexThreadState } from '../shared/types'

const CODEX_ROOT = path.join(process.env.HOME ?? '', '.codex')
const THREAD_DB_PATH = path.join(CODEX_ROOT, 'state_5.sqlite')
const MAX_THREADS = 8
const TAIL_BYTES = 180_000
const ACTIVE_WINDOW_MS = 15 * 60 * 1000
const RECENT_WINDOW_MS = 6 * 60 * 60 * 1000

interface CodexThreadRow {
  id: string
  title: string
  cwd: string
  source: string
  model_provider: string
  agent_nickname?: string | null
  agent_role?: string | null
  model?: string | null
  reasoning_effort?: string | null
  updated_at: string
  rollout_path: string
}

interface RolloutSignal {
  lastEventAt?: string
  lastMessage?: string
  terminalState?: CodexThreadState
}

function nowIso(): string {
  return new Date().toISOString()
}

function parseIso(value?: string): number {
  if (!value) return 0
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

function readRows(): CodexThreadRow[] {
  if (!fs.existsSync(THREAD_DB_PATH)) return []
  try {
    const output = execFileSync('sqlite3', [
      '-json',
      THREAD_DB_PATH,
      `select
        id,
        title,
        cwd,
        source,
        model_provider,
        agent_nickname,
        agent_role,
        model,
        reasoning_effort,
        datetime(updated_at,'unixepoch') as updated_at,
        rollout_path
      from threads
      where archived = 0
      order by updated_at desc
      limit ${MAX_THREADS};`,
    ], { encoding: 'utf8' })
    return JSON.parse(output) as CodexThreadRow[]
  } catch {
    return []
  }
}

function readTail(filePath: string): string {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return ''
    const start = Math.max(0, stat.size - TAIL_BYTES)
    const length = stat.size - start
    const fd = fs.openSync(filePath, 'r')
    try {
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, start)
      return buffer.toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

function trimText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const compact = value.replace(/\s+/g, ' ').trim()
  return compact ? compact.slice(0, 220) : undefined
}

function extractAssistantText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const joined = content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const record = item as { type?: string; text?: string }
      return record.type === 'output_text' && typeof record.text === 'string' ? record.text : ''
    })
    .filter(Boolean)
    .join('\n')
  return trimText(joined)
}

function parseRollout(filePath: string): RolloutSignal {
  const tail = readTail(filePath)
  if (!tail) return {}

  const lines = tail
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-180)

  let lastEventAt: string | undefined
  let lastMessage: string | undefined
  let terminalState: CodexThreadState | undefined

  for (const line of lines) {
    try {
      const record = JSON.parse(line) as {
        timestamp?: string
        type?: string
        payload?: {
          type?: string
          phase?: string
          message?: string
          last_agent_message?: string
          role?: string
          content?: unknown
        }
      }

      if (record.timestamp) lastEventAt = record.timestamp

      if (record.type === 'event_msg' && record.payload?.type === 'task_complete') {
        terminalState = 'completed'
        lastMessage = trimText(record.payload.last_agent_message) ?? lastMessage
        continue
      }

      if (record.type === 'event_msg' && record.payload?.type === 'turn_aborted') {
        terminalState = 'interrupted'
        continue
      }

      if (record.type === 'event_msg' && record.payload?.type === 'agent_message') {
        if (record.payload.phase === 'final_answer') {
          lastMessage = trimText(record.payload.message) ?? lastMessage
        }
        continue
      }

      if (record.type === 'response_item' && record.payload?.type === 'message' && record.payload.role === 'assistant') {
        lastMessage = extractAssistantText(record.payload.content) ?? lastMessage
      }
    } catch {
      // Ignore partial first-line JSON when the byte window starts mid-record.
    }
  }

  return { lastEventAt, lastMessage, terminalState }
}

function inferState(row: CodexThreadRow, signal: RolloutSignal): CodexThreadState {
  if (signal.terminalState) return signal.terminalState

  const now = Date.now()
  const latestActivity = Math.max(parseIso(signal.lastEventAt), parseIso(row.updated_at))
  if (latestActivity && now - latestActivity <= ACTIVE_WINDOW_MS) return 'active'
  if (latestActivity && now - latestActivity <= RECENT_WINDOW_MS) return 'idle'
  return 'stale'
}

function buildItem(row: CodexThreadRow): CodexStatusItem {
  const signal = parseRollout(row.rollout_path)
  const state = inferState(row, signal)
  const lastActivityAt = signal.lastEventAt ?? row.updated_at

  return {
    id: row.id,
    title: row.title || 'Untitled Codex thread',
    cwd: row.cwd || undefined,
    source: row.source || undefined,
    modelProvider: row.model_provider || undefined,
    agentNickname: row.agent_nickname ?? undefined,
    agentRole: row.agent_role ?? undefined,
    model: row.model ?? undefined,
    reasoningEffort: row.reasoning_effort ?? undefined,
    updatedAt: row.updated_at,
    lastActivityAt,
    state,
    lastMessage: signal.lastMessage,
  }
}

export function getCodexStatusSnapshot(): CodexStatusSnapshot {
  const items = readRows().map(buildItem)
  return {
    generatedAt: nowIso(),
    activeCount: items.filter((item) => item.state === 'active').length,
    completedCount: items.filter((item) => item.state === 'completed').length,
    items,
  }
}

export function codexStatusRevision(snapshot: CodexStatusSnapshot): string {
  return snapshot.items
    .map((item) => [item.id, item.state, item.lastActivityAt, item.lastMessage ?? ''].join('|'))
    .join('\n')
}
