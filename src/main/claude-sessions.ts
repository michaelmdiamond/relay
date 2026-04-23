import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type { ClaudeConversation, ClaudeMessage, SessionStatus } from '../shared/types'

const CLI_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects')
const DESKTOP_SESSIONS_DIR = path.join(
  os.homedir(), 'Library', 'Application Support', 'Claude', 'claude-code-sessions'
)
const CODEX_DIR = path.join(os.homedir(), '.codex')
const CODEX_SESSIONS_DIR = path.join(CODEX_DIR, 'sessions')
const CODEX_INDEX = path.join(CODEX_DIR, 'session_index.jsonl')

const SB_DIR = path.join(os.homedir(), '.sessionboard')
const DISMISSED_PATH = path.join(SB_DIR, 'conv-dismissed.json')
const ARCHIVED_PATH  = path.join(SB_DIR, 'conv-archived.json')

export const RECENT_DAYS = 30

// ── Stage classification ───────────────────────────────────────

export function classifyStage(lastTimestamp: string): SessionStatus {
  const days = (Date.now() - new Date(lastTimestamp).getTime()) / 86_400_000
  if (days < 1) return 'in_progress'
  if (days < 4) return 'idle'
  return 'done'
}

// ── Dismissed / archived persistence ──────────────────────────

function loadIdSet(filePath: string): Set<string> {
  try { return new Set(JSON.parse(fs.readFileSync(filePath, 'utf8'))) }
  catch { return new Set() }
}

function saveIdSet(filePath: string, set: Set<string>): void {
  fs.mkdirSync(SB_DIR, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify([...set]))
}

export function loadDismissedIds(): Set<string> { return loadIdSet(DISMISSED_PATH) }
export function loadArchivedIds(): Set<string>  { return loadIdSet(ARCHIVED_PATH) }

export function addDismissedId(id: string): void {
  const s = loadDismissedIds(); s.add(id); saveIdSet(DISMISSED_PATH, s)
}

export function addArchivedId(id: string): void {
  const s = loadArchivedIds(); s.add(id); saveIdSet(ARCHIVED_PATH, s)
}

// ── Helpers ────────────────────────────────────────────────────

function extractText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return (content as any[])
      .filter(b => b?.type === 'text' && b?.text)
      .map(b => b.text as string)
      .join('').trim()
  }
  return ''
}

function parseJsonl(filePath: string): any[] {
  try {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n').filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

function readDir(p: string): string[] {
  try { return fs.readdirSync(p) } catch { return [] }
}

function isDir(p: string): boolean {
  try { return fs.statSync(p).isDirectory() } catch { return false }
}

function deriveProject(cwd: string): string {
  if (!cwd) return 'unknown'
  const home = os.homedir()
  if (cwd.startsWith(home)) {
    const rel = cwd.slice(home.length).replace(/^\//, '')
    return rel.split('/')[0] || 'Root'
  }
  return cwd.split('/').pop() || cwd
}

// ── Desktop meta ───────────────────────────────────────────────

function loadDesktopMeta(): Map<string, { title: string; cwd: string; lastActivityAt: number }> {
  const map = new Map<string, { title: string; cwd: string; lastActivityAt: number }>()
  if (!fs.existsSync(DESKTOP_SESSIONS_DIR)) return map

  for (const outerDir of readDir(DESKTOP_SESSIONS_DIR)) {
    const outerPath = path.join(DESKTOP_SESSIONS_DIR, outerDir)
    if (!isDir(outerPath)) continue
    for (const innerDir of readDir(outerPath)) {
      const innerPath = path.join(outerPath, innerDir)
      if (!isDir(innerPath)) continue
      for (const file of readDir(innerPath)) {
        if (!file.startsWith('local_') || !file.endsWith('.json')) continue
        try {
          const d = JSON.parse(fs.readFileSync(path.join(innerPath, file), 'utf8'))
          if (d.cliSessionId && d.title) {
            map.set(d.cliSessionId, { title: d.title, cwd: d.cwd ?? '', lastActivityAt: d.lastActivityAt ?? 0 })
          }
        } catch {}
      }
    }
  }
  return map
}

// ── Codex sessions ─────────────────────────────────────────────

function buildCodexFileMap(): Map<string, string> {
  const map = new Map<string, string>()
  if (!fs.existsSync(CODEX_SESSIONS_DIR)) return map

  function walk(dir: string) {
    for (const entry of readDir(dir)) {
      const full = path.join(dir, entry)
      if (isDir(full)) { walk(full) }
      else if (entry.endsWith('.jsonl')) {
        const match = entry.match(/([0-9a-f-]{36})\.jsonl$/)
        if (match) map.set(match[1], full)
      }
    }
  }
  walk(CODEX_SESSIONS_DIR)
  return map
}

function loadCodexConversations(
  fileMap: Map<string, string>,
  archivedIds: Set<string>
): ClaudeConversation[] {
  if (!fs.existsSync(CODEX_INDEX)) return []
  const conversations: ClaudeConversation[] = []

  for (const line of parseJsonl(CODEX_INDEX)) {
    const { id, thread_name, updated_at } = line
    if (!id || !thread_name) continue
    const filePath = fileMap.get(id)
    if (!filePath) continue

    let cwd = ''
    let messageCount = 0
    for (const entry of parseJsonl(filePath)) {
      if (entry.type === 'session_meta') cwd = entry.payload?.cwd ?? ''
      if (entry.type === 'response_item') {
        const role = entry.payload?.role
        if (role === 'user' || role === 'assistant') messageCount++
      }
    }
    if (messageCount === 0) continue

    const lastTimestamp = updated_at ?? ''
    const ageDays = (Date.now() - new Date(lastTimestamp).getTime()) / 86_400_000
    const isRecent = ageDays <= RECENT_DAYS
    const archived = archivedIds.has(id)

    conversations.push({
      id, title: thread_name,
      project: deriveProject(cwd), cwd,
      source: 'codex', lastTimestamp, messageCount, filePath,
      isRecent, archived,
      stage: (isRecent && !archived) ? classifyStage(lastTimestamp) : undefined,
    })
  }
  return conversations
}

// ── Main loader ────────────────────────────────────────────────

export function loadClaudeConversations(): ClaudeConversation[] {
  const desktopMeta = loadDesktopMeta()
  const archivedIds = loadArchivedIds()
  const conversations: ClaudeConversation[] = []

  if (fs.existsSync(CLI_PROJECTS_DIR)) {
    for (const projectDir of readDir(CLI_PROJECTS_DIR)) {
      const projectPath = path.join(CLI_PROJECTS_DIR, projectDir)
      if (!isDir(projectPath)) continue

      for (const file of readDir(projectPath)) {
        if (!file.endsWith('.jsonl')) continue

        const filePath = path.join(projectPath, file)
        const sessionId = path.basename(file, '.jsonl')
        const entries = parseJsonl(filePath)
        const messages = entries.filter(e => e.type === 'user' || e.type === 'assistant')
        if (messages.length === 0) continue

        const firstUser = messages.find(m => m.type === 'user')
        const lastEntry = messages[messages.length - 1]
        const meta = desktopMeta.get(sessionId)

        const cwd = meta?.cwd ?? firstUser?.cwd ?? ''
        const firstText = extractText(firstUser?.message?.content)
        const title = meta?.title ?? (firstText.slice(0, 80) || '(untitled)')
        const lastTimestamp = lastEntry?.timestamp
          ?? (meta?.lastActivityAt ? new Date(meta.lastActivityAt).toISOString() : '')

        const ageDays = (Date.now() - new Date(lastTimestamp).getTime()) / 86_400_000
        const isRecent = ageDays <= RECENT_DAYS
        const archived = archivedIds.has(sessionId)

        conversations.push({
          id: sessionId, title,
          project: deriveProject(cwd), cwd,
          source: meta ? 'desktop' : 'cli',
          lastTimestamp, messageCount: messages.length, filePath,
          isRecent, archived,
          stage: (isRecent && !archived) ? classifyStage(lastTimestamp) : undefined,
        })
      }
    }
  }

  const codex = loadCodexConversations(buildCodexFileMap(), archivedIds)
  conversations.push(...codex)

  return conversations.sort((a, b) =>
    new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
  )
}

// ── Message loader ─────────────────────────────────────────────

export function loadClaudeMessages(filePath: string): ClaudeMessage[] {
  const isCodex = filePath.includes('/.codex/')

  if (isCodex) {
    return parseJsonl(filePath)
      .filter(e => e.type === 'response_item' &&
        (e.payload?.role === 'user' || e.payload?.role === 'assistant'))
      .map(e => {
        const role = e.payload.role as 'user' | 'assistant'
        const blocks: any[] = e.payload?.content ?? []
        const textType = role === 'user' ? 'input_text' : 'output_text'
        const text = blocks.filter(b => b?.type === textType && b?.text)
          .map(b => b.text as string).join('').trim()
        if (!text || text.startsWith('#') || text.startsWith('<')) return null
        return { uuid: e.payload?.id ?? e.timestamp ?? '', role, content: text, timestamp: e.timestamp ?? '' }
      })
      .filter((m): m is ClaudeMessage => m !== null)
  }

  return parseJsonl(filePath)
    .filter(e => e.type === 'user' || e.type === 'assistant')
    .map(e => {
      const text = extractText(e.message?.content)
      if (!text) return null
      return { uuid: e.uuid ?? '', role: e.type as 'user' | 'assistant', content: text, timestamp: e.timestamp ?? '' }
    })
    .filter((m): m is ClaudeMessage => m !== null)
}
