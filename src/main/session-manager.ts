import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import * as pty from 'node-pty'
import * as psutil from './psutil'
import type { Session, SessionStatus, ClaudeConversation } from '../shared/types'
import { loadDismissedIds, loadArchivedIds, addDismissedId, addArchivedId } from './claude-sessions'

const STORE_PATH = path.join(os.homedir(), '.sessionboard', 'sessions.json')
const IDLE_THRESHOLD = 5_000    // ms
const INPUT_THRESHOLD = 20_000  // ms
const PROMPT_ENDINGS = ['?', ':', '>', '$', '#', '→', '»']
const METADATA_INTERVAL = 15_000  // ms between git/port refreshes

// OSC notification sequences: ESC ] <code> ; <text> BEL  or  ST
const OSC_NOTIFY_RE = /\x1b\](?:9|99|777);(?:notify;)?([^\x07\x1b]*)\x07/g

interface ManagedPty {
  pty: pty.IPty
  outputLines: string[]
}

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map()
  private ptys: Map<string, ManagedPty> = new Map()
  private tickInterval: NodeJS.Timeout | null = null
  private metaInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.load()
    // Ensure all loaded sessions have the needsAttention field
    for (const s of this.sessions.values()) {
      if (s.needsAttention === undefined) s.needsAttention = false
    }
    console.log('[SessionManager] loaded sessions:', this.getAll().map(s => `${s.id} pid=${s.pid} managed=${s.managed} status=${s.status}`))
    this.tickInterval = setInterval(() => this.tick(), 2000)
    this.metaInterval = setInterval(() => this.refreshMetadata(), METADATA_INTERVAL)
    // Initial metadata pass after short delay
    setTimeout(() => this.refreshMetadata(), 3000)
  }

  destroy() {
    if (this.tickInterval) clearInterval(this.tickInterval)
    if (this.metaInterval) clearInterval(this.metaInterval)
    for (const { pty: p } of this.ptys.values()) {
      try { p.kill() } catch {}
    }
  }

  // ── CRUD ──────────────────────────────────────────────────────────

  getAll(): Session[] {
    return Array.from(this.sessions.values())
  }

  create(name: string, cwd: string, project: string | null): Session {
    console.log('[SessionManager] create() called:', { name, cwd, project })
    const id = randomBytes(4).toString('hex')
    const now = new Date().toISOString()

    const session: Session = {
      id,
      name,
      cwd,
      project,
      status: 'in_progress',
      createdAt: now,
      lastActivity: now,
      pid: null,
      managed: true,
      lastLine: '',
      needsAttention: false,
    }

    const shell = process.env.SHELL || '/bin/zsh'
    const p = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cwd,
      env: process.env as Record<string, string>,
      cols: 120,
      rows: 40,
    })

    session.pid = p.pid

    const managed: ManagedPty = { pty: p, outputLines: [] }
    p.onData((data) => {
      managed.outputLines.push(...data.split('\n'))
      if (managed.outputLines.length > 100) {
        managed.outputLines = managed.outputLines.slice(-100)
      }
      session.lastActivity = new Date().toISOString()
      session.lastLine = managed.outputLines[managed.outputLines.length - 1] ?? ''
      this.scanOscNotify(session, data)
      this.emit('pty-data', id, data)
    })
    p.onExit(() => {
      session.status = 'done'
      this.ptys.delete(id)
      this.emit('sessions-changed', this.getAll())
      this.save()
    })

    this.ptys.set(id, managed)
    this.sessions.set(id, session)
    this.emit('sessions-changed', this.getAll())
    this.save()
    return session
  }

  attach(pid: number, name: string, project: string | null): Session | null {
    if (!psutil.isAlive(pid)) return null

    const id = randomBytes(4).toString('hex')
    const now = new Date().toISOString()
    const cwd = psutil.getCwd(pid) ?? os.homedir()

    const session: Session = {
      id,
      name,
      cwd,
      project,
      status: 'in_progress',
      createdAt: now,
      lastActivity: now,
      pid,
      managed: false,
      lastLine: '',
      needsAttention: false,
    }

    this.sessions.set(id, session)
    this.emit('sessions-changed', this.getAll())
    this.save()
    return session
  }

  // Called by IPC server when a shell hook registers
  registerExternal(pid: number, cwd: string): Session {
    console.log('[SessionManager] registerExternal() called:', { pid, cwd })
    // Check if we're already tracking this PID
    for (const s of this.sessions.values()) {
      if (s.pid === pid) {
        s.cwd = cwd
        s.lastActivity = new Date().toISOString()
        this.emit('sessions-changed', this.getAll())
        this.save()
        return s
      }
    }

    const id = randomBytes(4).toString('hex')
    const now = new Date().toISOString()
    const session: Session = {
      id,
      name: path.basename(cwd) || 'shell',
      cwd,
      project: null,
      status: 'in_progress',
      createdAt: now,
      lastActivity: now,
      pid,
      managed: false,
      lastLine: '',
      needsAttention: false,
    }

    this.sessions.set(id, session)
    this.emit('sessions-changed', this.getAll())
    this.save()
    return session
  }

  deregisterExternal(pid: number): void {
    for (const [id, s] of this.sessions.entries()) {
      if (s.pid === pid && !s.managed) {
        s.status = 'done'
        this.sessions.set(id, s)
      }
    }
    this.emit('sessions-changed', this.getAll())
    this.save()
  }

  updateCwd(pid: number, cwd: string): void {
    for (const s of this.sessions.values()) {
      if (s.pid === pid) {
        s.cwd = cwd
        s.lastActivity = new Date().toISOString()
      }
    }
    this.emit('sessions-changed', this.getAll())
  }

  update(id: string, patch: Partial<Pick<Session, 'name' | 'project' | 'status'>>): void {
    const s = this.sessions.get(id)
    if (!s) return
    Object.assign(s, patch)
    this.sessions.set(id, s)
    this.emit('sessions-changed', this.getAll())
    this.save()
  }

  remove(id: string): void {
    const s = this.sessions.get(id)
    if (s?.cardType === 'conversation' && s.conversationId) {
      addDismissedId(s.conversationId)
    }
    this.sessions.delete(id)
    this.emit('sessions-changed', this.getAll())
    this.save()
  }

  archiveConversation(convId: string): void {
    addArchivedId(convId)
    // Remove from kanban if pinned
    for (const [id, s] of this.sessions.entries()) {
      if (s.conversationId === convId) {
        this.sessions.delete(id)
        break
      }
    }
    this.emit('sessions-changed', this.getAll())
    this.save()
  }

  autoPinRecent(conversations: ClaudeConversation[]): void {
    const dismissedIds = loadDismissedIds()
    const archivedIds  = loadArchivedIds()
    const pinnedIds = new Set(
      Array.from(this.sessions.values())
        .filter(s => s.cardType === 'conversation' && s.conversationId)
        .map(s => s.conversationId!)
    )

    for (const conv of conversations) {
      if (!conv.isRecent) continue
      if (conv.archived) continue
      if (pinnedIds.has(conv.id)) continue
      if (dismissedIds.has(conv.id)) continue
      if (archivedIds.has(conv.id)) continue
      this.pinConversation(conv, conv.stage ?? 'done')
    }
  }

  kill(id: string): void {
    const s = this.sessions.get(id)
    if (!s) return
    const managed = this.ptys.get(id)
    if (managed) {
      try { managed.pty.kill() } catch {}
      this.ptys.delete(id)
    } else if (s.pid) {
      try { process.kill(s.pid, 'SIGTERM') } catch {}
    }
    s.status = 'done'
    this.sessions.set(id, s)
    this.emit('sessions-changed', this.getAll())
    this.save()
  }

  pinConversation(conv: ClaudeConversation, status: SessionStatus): Session {
    const id = randomBytes(4).toString('hex')
    const now = new Date().toISOString()
    const session: Session = {
      id,
      name: conv.title,
      cwd: conv.cwd,
      project: conv.project,
      status,
      createdAt: now,
      lastActivity: conv.lastTimestamp || now,
      pid: null,
      managed: false,
      lastLine: '',
      needsAttention: false,
      cardType: 'conversation',
      conversationId: conv.id,
      conversationSource: conv.source,
      conversationFilePath: conv.filePath,
    }
    this.sessions.set(id, session)
    this.emit('sessions-changed', this.getAll())
    this.save()
    return session
  }

  writeToPty(id: string, data: string): void {
    this.ptys.get(id)?.pty.write(data)
    // User responded — clear attention flag
    const s = this.sessions.get(id)
    if (s?.needsAttention) {
      s.needsAttention = false
      this.emit('sessions-changed', this.getAll())
    }
  }

  resizePty(id: string, cols: number, rows: number): void {
    this.ptys.get(id)?.pty.resize(cols, rows)
  }

  // ── Notifications ─────────────────────────────────────────────────

  /** Called by IPC server when shell sends a 'notify' message — match by pid, fall back to cwd */
  notifySession(pid: number, text: string, cwd?: string): void {
    const msg = text || 'Waiting for input'
    const now = new Date().toISOString()

    // Try exact PID match first
    for (const s of this.sessions.values()) {
      if (s.pid === pid) {
        s.needsAttention = true
        s.notificationText = msg
        s.lastNotificationAt = now
        this.emit('sessions-changed', this.getAll())
        return
      }
    }

    // Fallback: match by cwd (useful for Claude Code hooks which know cwd but not shell PID)
    if (cwd) {
      for (const s of this.sessions.values()) {
        if (s.cwd === cwd && s.status !== 'done') {
          s.needsAttention = true
          s.notificationText = msg
          s.lastNotificationAt = now
          this.emit('sessions-changed', this.getAll())
          return
        }
      }
    }
  }

  /** Called by IPC handler when renderer dismisses an attention flag */
  dismissAttention(id: string): void {
    const s = this.sessions.get(id)
    if (s) {
      s.needsAttention = false
      this.emit('sessions-changed', this.getAll())
    }
  }

  /** Find the most recent session that needs attention */
  urgentSession(): Session | null {
    let best: Session | null = null
    for (const s of this.sessions.values()) {
      if (!s.needsAttention) continue
      if (!best || (s.lastNotificationAt ?? '') > (best.lastNotificationAt ?? '')) {
        best = s
      }
    }
    return best
  }

  private scanOscNotify(session: Session, data: string): void {
    OSC_NOTIFY_RE.lastIndex = 0
    const match = OSC_NOTIFY_RE.exec(data)
    if (match) {
      session.needsAttention = true
      session.notificationText = match[1] || 'Waiting for input'
      session.lastNotificationAt = new Date().toISOString()
      this.emit('sessions-changed', this.getAll())
    }
  }

  // ── Metadata (git branch + listening ports) ───────────────────────

  private refreshMetadata(): void {
    let changed = false
    const pending: Promise<void>[] = []

    for (const s of this.sessions.values()) {
      if (!s.cwd || s.cardType === 'conversation') continue
      pending.push(this.refreshSessionMeta(s).then(c => { if (c) changed = true }))
    }

    Promise.all(pending).then(() => {
      if (changed) this.emit('sessions-changed', this.getAll())
    })
  }

  private refreshSessionMeta(s: Session): Promise<boolean> {
    const gitP = new Promise<string | undefined>(resolve => {
      execFile('git', ['-C', s.cwd, 'branch', '--show-current'], { timeout: 3000 }, (err, stdout) => {
        resolve(err ? undefined : stdout.trim() || undefined)
      })
    })

    const portsP = new Promise<number[]>(resolve => {
      execFile('lsof', ['-iTCP', '-sTCP:LISTEN', '-n', '-P'], { timeout: 3000 }, (err, stdout) => {
        if (err) { resolve([]); return }
        const ports: number[] = []
        // Find PIDs that are descendants of session.pid or match session.pid
        const pidSet = s.pid ? this.getProcessTree(s.pid) : new Set<number>()
        for (const line of stdout.split('\n').slice(1)) {
          const parts = line.trim().split(/\s+/)
          if (parts.length < 9) continue
          const pid = parseInt(parts[1])
          const addr = parts[8] // e.g. *:3000 or 127.0.0.1:8080
          if (!pidSet.has(pid)) continue
          const portMatch = addr.match(/:(\d+)$/)
          if (portMatch) ports.push(parseInt(portMatch[1]))
        }
        resolve([...new Set(ports)].sort((a, b) => a - b))
      })
    })

    return Promise.all([gitP, portsP]).then(([branch, ports]) => {
      let changed = false
      if (branch !== s.gitBranch) { s.gitBranch = branch; changed = true }
      const portsStr = ports.join(',')
      const prevStr = (s.listeningPorts ?? []).join(',')
      if (portsStr !== prevStr) { s.listeningPorts = ports; changed = true }
      return changed
    })
  }

  private getProcessTree(rootPid: number): Set<number> {
    const pids = new Set<number>([rootPid])
    try {
      const result = require('child_process').execSync(
        `pgrep -P ${rootPid}`, { timeout: 2000 }
      ).toString().trim()
      for (const p of result.split('\n')) {
        const n = parseInt(p)
        if (!isNaN(n)) pids.add(n)
      }
    } catch {}
    return pids
  }

  // ── Status detection ──────────────────────────────────────────────

  private tick(): void {
    let changed = false
    const now = Date.now()

    for (const [id, s] of this.sessions.entries()) {
      if (s.status === 'done') continue

      // Check liveness
      if (s.pid && !psutil.isAlive(s.pid) && !this.ptys.has(id)) {
        s.status = 'done'
        changed = true
        continue
      }

      if (s.managed) continue // PTY onData handles managed sessions

      const elapsed = now - new Date(s.lastActivity).getTime()
      const prev = s.status

      if (elapsed < IDLE_THRESHOLD) {
        s.status = 'in_progress'
      } else if (elapsed >= INPUT_THRESHOLD) {
        const last = s.lastLine.trim()
        s.status = PROMPT_ENDINGS.some(c => last.endsWith(c))
          ? 'needs_input'
          : 'idle'
      } else {
        s.status = 'idle'
      }

      if (s.status !== prev) changed = true
    }

    if (changed) {
      this.emit('sessions-changed', this.getAll())
      this.save()
    }
  }

  // ── Persistence ───────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf8')
      const data: Session[] = JSON.parse(raw)
      for (const s of data) {
        this.sessions.set(s.id, s)
      }
    } catch {
      // Fresh start
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(STORE_PATH)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.getAll(), null, 2))
    } catch {}
  }
}
