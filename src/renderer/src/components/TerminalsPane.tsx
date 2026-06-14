import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { AgentRunEvent, AgentRunSnapshot, AgentRunStatus, TerminalLauncherId, TerminalSessionSnapshot } from '../../../shared/types'

interface Launcher {
  id: TerminalLauncherId
  name: string
  status: string
  headline: string
  detail: string
  cta: string
  sessionLabel: string
}

const launchers: Launcher[] = [
  {
    id: 'codex',
    name: 'Codex Agent',
    status: 'recommended',
    headline: 'Launch a coding agent session',
    detail: 'Use this when you want repo-aware edits, patches, and verification inside a managed terminal flow.',
    cta: 'New Codex session',
    sessionLabel: 'Codex Session',
  },
  {
    id: 'claude',
    name: 'Claude Session',
    status: 'flexible',
    headline: 'Start a general-purpose agent terminal',
    detail: 'Good for broader exploration or when you want a different launch path than the chat model picker.',
    cta: 'New Claude session',
    sessionLabel: 'Claude Session',
  },
  {
    id: 'gemini',
    name: 'Gemini CLI Agent',
    status: 'google',
    headline: 'Start a Gemini CLI agent',
    detail: 'Use this when you want a Google Gemini command-line agent working directly in the selected project folder.',
    cta: 'New Gemini session',
    sessionLabel: 'Gemini Session',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek Agent',
    status: 'local',
    headline: 'Launch a local DeepSeek agent session',
    detail: 'Use this when you want the installed DeepSeek TUI working directly in the selected project folder.',
    cta: 'New DeepSeek session',
    sessionLabel: 'DeepSeek Session',
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    status: 'cursor',
    headline: 'Launch a Cursor agent session',
    detail: 'Use this for Cursor-managed coding work from a live terminal session.',
    cta: 'New Cursor session',
    sessionLabel: 'Cursor Session',
  },
  {
    id: 'local',
    name: 'Local Agent',
    status: 'ollama',
    headline: 'Launch a local agent session',
    detail: 'Use this when you want an Ollama-backed agent running in the selected project folder with the configured Local model.',
    cta: 'New Local session',
    sessionLabel: 'Local Session',
  },
  {
    id: 'shell',
    name: 'Local Shell',
    status: 'manual',
    headline: 'Open an unmanaged terminal',
    detail: 'Useful for direct commands, scripts, and local workflows outside an agent-managed session lifecycle.',
    cta: 'Open shell',
    sessionLabel: 'Shell Session',
  },
]

function dedupeSessions(sessions: TerminalSessionSnapshot[]) {
  const seen = new Set<string>()
  return sessions.filter((session) => {
    if (seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
}

function upsertSession(sessions: TerminalSessionSnapshot[], session: TerminalSessionSnapshot) {
  return [session, ...sessions.filter((entry) => entry.id !== session.id)]
}

function statusLabel(status: AgentRunStatus) {
  if (status === 'done') return 'done'
  if (status === 'failed') return 'failed'
  if (status === 'blocked') return 'blocked'
  if (status === 'queued') return 'queued'
  return 'running'
}

function eventLabel(type: string) {
  if (type === 'agent_started') return 'started'
  if (type === 'agent_status') return 'status'
  if (type === 'tool_started') return 'tool'
  if (type === 'tool_output') return 'note'
  if (type === 'file_touched') return 'file'
  if (type === 'agent_finished') return 'finished'
  return type
}

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface ActivityEntry {
  id: string
  createdAt: string
  kind: string
  text: string
  detail?: string
  tone?: 'good' | 'bad' | 'neutral'
}

function basename(value: string) {
  return value.split('/').filter(Boolean).at(-1) ?? value
}

function eventText(event: AgentRunEvent) {
  return event.message ?? event.summary ?? event.result ?? event.text ?? event.path ?? event.title ?? ''
}

function buildActivityTimeline(run: AgentRunSnapshot | null): ActivityEntry[] {
  if (!run) return []

  const entries: ActivityEntry[] = []
  const seen = new Set<string>()
  const files = run.events
    .filter((event) => event.type === 'file_touched' && event.path)
    .slice(-6)
    .map((event) => event.path as string)
  const uniqueFiles = [...new Set(files)]

  for (const event of [...run.events].reverse()) {
    const text = eventText(event).trim()
    if (!text) continue

    let entry: ActivityEntry | null = null
    if (event.type === 'agent_finished') {
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: event.status === 'failed' ? 'failed' : 'finished',
        text,
        tone: event.status === 'failed' ? 'bad' : 'good',
      }
    } else if (event.type === 'file_touched' && event.path) {
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: event.action ?? 'file',
        text: basename(event.path),
        detail: event.path,
      }
    } else if (event.type === 'tool_started') {
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: event.tool ?? eventLabel(event.type),
        text,
      }
    } else if (event.type === 'agent_status') {
      const looksBad = /\b(error|failed|blocked)\b/i.test(text)
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: event.status && event.status !== 'running' ? statusLabel(event.status) : 'update',
        text,
        tone: event.status === 'failed' || event.status === 'blocked' || looksBad ? 'bad' : 'neutral',
      }
    } else if (event.type === 'agent_started') {
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: 'started',
        text,
      }
    } else if (event.type === 'tool_output' && /\b(error|failed|passed|success|complete|build|test|lint|typecheck)\b/i.test(text)) {
      entry = {
        id: event.id,
        createdAt: event.createdAt,
        kind: 'result',
        text,
        tone: /\b(error|failed)\b/i.test(text) ? 'bad' : /\b(passed|success|complete)\b/i.test(text) ? 'good' : 'neutral',
      }
    }

    if (!entry) continue
    const key = `${entry.kind}|${entry.text}|${entry.detail ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push(entry)
    if (entries.length >= 9) break
  }

  if (uniqueFiles.length > 1) {
    entries.unshift({
      id: `${run.id}-files-summary`,
      createdAt: run.updatedAt,
      kind: 'files',
      text: `${uniqueFiles.length} files touched`,
      detail: uniqueFiles.slice(-4).map(basename).join(', '),
    })
  }

  return entries.slice(0, 9)
}

function AgentMapPanel({
  session,
  run,
}: {
  session: TerminalSessionSnapshot | null
  run: AgentRunSnapshot | null
}) {
  const agents = run?.agents ?? []
  const mainAgent = agents.find((agent) => agent.role === 'main') ?? agents[0]
  const childAgents = mainAgent ? agents.filter((agent) => agent.parentAgentId === mainAgent.id) : []
  const otherAgents = agents.filter((agent) => agent.id !== mainAgent?.id && !childAgents.includes(agent))
  const timeline = useMemo(() => buildActivityTimeline(run), [run])
  if (!run && !session) return null

  return (
    <aside className="terminal-agent-map" aria-label="Agent activity">
      <div className="terminal-agent-map__header">
        <div>
          <div className="terminal-agent-map__eyebrow">Agent Activity</div>
          <div className="terminal-agent-map__title">{session?.name ?? 'No session'}</div>
        </div>
        {run && <span className={`terminal-agent-map__status terminal-agent-map__status--${run.status}`}>{statusLabel(run.status)}</span>}
      </div>

      {mainAgent ? (
        <div className="terminal-agent-tree">
          <div className="terminal-agent-node terminal-agent-node--main">
            <div className="terminal-agent-node__rail" />
            <div className="terminal-agent-node__body">
              <div className="terminal-agent-node__topline">
                <span className="terminal-agent-node__name">{mainAgent.title}</span>
                <span className={`terminal-agent-node__status terminal-agent-node__status--${mainAgent.status}`}>{statusLabel(mainAgent.status)}</span>
              </div>
              {mainAgent.message && <div className="terminal-agent-node__message">{mainAgent.message}</div>}
              {mainAgent.lastOutputPreview && <pre className="terminal-agent-node__preview">{mainAgent.lastOutputPreview}</pre>}
            </div>
          </div>

          {[...childAgents, ...otherAgents].map((agent) => (
            <div key={agent.id} className="terminal-agent-node terminal-agent-node--child">
              <div className="terminal-agent-node__rail" />
              <div className="terminal-agent-node__body">
                <div className="terminal-agent-node__topline">
                  <span className="terminal-agent-node__name">{agent.title}</span>
                  <span className={`terminal-agent-node__status terminal-agent-node__status--${agent.status}`}>{statusLabel(agent.status)}</span>
                </div>
                {agent.message && <div className="terminal-agent-node__message">{agent.message}</div>}
                {agent.filesTouched.length > 0 && (
                  <div className="terminal-agent-node__files">
                    {agent.filesTouched.slice(-3).map((path) => <span key={path}>{path.split('/').at(-1)}</span>)}
                  </div>
                )}
              </div>
            </div>
          ))}

          {childAgents.length === 0 && otherAgents.length === 0 && (
            <div className="terminal-agent-map__empty">No subagents reported yet.</div>
          )}
        </div>
      ) : (
        <div className="terminal-agent-map__empty">Start or select a session.</div>
      )}

      <div className="terminal-agent-timeline">
        <div className="terminal-agent-timeline__title">Recent Activity</div>
        {timeline.length > 0 ? timeline.map((event) => {
          return (
            <div key={event.id} className={`terminal-agent-event${event.tone ? ` terminal-agent-event--${event.tone}` : ''}`}>
              <span className="terminal-agent-event__time">{timeLabel(event.createdAt)}</span>
              <span className="terminal-agent-event__kind">{event.kind}</span>
              <span className="terminal-agent-event__text">
                <span>{event.text}</span>
                {event.detail && <small>{event.detail}</small>}
              </span>
            </div>
          )
        }) : (
          <div className="terminal-agent-map__empty">No activity captured yet.</div>
        )}
      </div>
    </aside>
  )
}

interface TerminalViewProps {
  session: TerminalSessionSnapshot
  visible: boolean
  focused: boolean
  onFocus: () => void
}

function TerminalView({ session, visible, focused, onFocus }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const editorModeRef = useRef(false)
  const [editorMode, setEditorMode] = useState(false)
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)

  useEffect(() => {
    editorModeRef.current = editorMode
  }, [editorMode])

  function sendTerminalData(data: string) {
    return window.terminalApi.sendTerminalInput(session.id, data)
  }

  function handlePasteDraft({ run }: { run: boolean }) {
    const message = draft.replace(/\r\n?/g, '\n').trimEnd()
    if (!message) return

    const term = termRef.current
    if (!term) return
    editorModeRef.current = false
    setEditorMode(false)

    requestAnimationFrame(() => {
      term?.focus()
      term?.paste(message)
      if (run) setTimeout(() => window.terminalApi.sendTerminalInput(session.id, '\r'), 0)
    })

    setHistory((current) => [message, ...current.filter((item) => item !== message)].slice(0, 50))
    setHistoryIndex(null)
    setDraft('')
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handlePasteDraft({ run: true })
      return
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      handlePasteDraft({ run: true })
      return
    }

    if (event.key === 'Escape' && draft.length === 0) {
      event.preventDefault()
      setEditorMode(false)
      requestAnimationFrame(() => termRef.current?.focus())
      return
    }

    if (event.key === 'ArrowUp' && history.length > 0) {
      const target = event.currentTarget
      const cursorAtStart = target.selectionStart === 0 && target.selectionEnd === 0
      if (draft.length === 0 || cursorAtStart) {
        event.preventDefault()
        const nextIndex = historyIndex === null ? 0 : Math.min(historyIndex + 1, history.length - 1)
        setHistoryIndex(nextIndex)
        setDraft(history[nextIndex])
      }
      return
    }

    if (event.key === 'ArrowDown' && historyIndex !== null) {
      event.preventDefault()
      const nextIndex = historyIndex - 1
      if (nextIndex < 0) {
        setHistoryIndex(null)
        setDraft('')
      } else {
        setHistoryIndex(nextIndex)
        setDraft(history[nextIndex])
      }
    }
  }

  useEffect(() => {
    if (!visible || !containerRef.current) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      theme: {
        background: session.launcherId === 'gemini' || session.launcherId === 'deepseek' ? '#070711' : '#050507',
        foreground: '#e2e8f0',
        cursor: '#e2e8f0',
        selectionBackground: '#4a5568',
        black: '#1a202c',
        red: '#fc8181',
        green: '#68d391',
        yellow: '#f6e05e',
        blue: '#63b3ed',
        magenta: '#b794f4',
        cyan: '#76e4f7',
        white: '#e2e8f0',
        brightBlack: '#4a5568',
        brightRed: '#feb2b2',
        brightGreen: '#9ae6b4',
        brightYellow: '#faf089',
        brightBlue: '#90cdf4',
        brightMagenta: '#d6bcfa',
        brightCyan: '#b2f5ea',
        brightWhite: '#ffffff',
      },
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddonRef.current = fitAddon
    termRef.current = term

    // Give Electron time to finish layout before fit/focus
    const fitTerminal = () => {
      if (!containerRef.current || containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0) return
      fitAddon.fit()
      const { cols, rows } = term
      const lastSize = lastSizeRef.current
      if (!lastSize || lastSize.cols !== cols || lastSize.rows !== rows) {
        lastSizeRef.current = { cols, rows }
        window.terminalApi.resizeTerminal(session.id, cols, rows)
      }
    }

    setTimeout(() => {
      fitTerminal()
      if (editorModeRef.current) editorRef.current?.focus()
      else term.focus()
    }, 50)

    let disposed = false
    let bufferReplayed = false
    let bufferSequence = 0
    const pendingData: Array<{ data: string; sequence: number }> = []
    window.terminalApi.createTerminal(session.id, session.launcherId, session.name, session.cwd, session.taskId, session.workspaceId)
      .then(() => window.terminalApi.getTerminalBuffer(session.id))
      .then((buffer) => {
        if (disposed) return
        term.reset()
        bufferSequence = buffer.sequence
        if (buffer.output) term.write(buffer.output)
        bufferReplayed = true
        pendingData.forEach((item) => {
          if (item.sequence > bufferSequence) {
            term.write(item.data)
            bufferSequence = item.sequence
          }
        })
        pendingData.length = 0
      })
      .catch(() => {
        if (!disposed) term.write('\r\n\x1b[31m[Unable to attach terminal session]\x1b[0m\r\n')
      })

    const onDataDispose = term.onData((data) => {
      if (!editorModeRef.current) window.terminalApi.sendTerminalInput(session.id, data)
    })
    const onResizeDispose = term.onResize(({ cols, rows }) => {
      const lastSize = lastSizeRef.current
      if (lastSize?.cols === cols && lastSize.rows === rows) return
      lastSizeRef.current = { cols, rows }
      window.terminalApi.resizeTerminal(session.id, cols, rows)
    })

    const unsubData = window.terminalApi.onTerminalData((id, data, sequence) => {
      if (id !== session.id) return
      if (!bufferReplayed) {
        pendingData.push({ data, sequence })
        return
      }
      if (sequence > bufferSequence) {
        term.write(data)
        bufferSequence = sequence
      }
    })

    const unsubExit = window.terminalApi.onTerminalExit(() => {})

    let resizeFrame: number | null = null
    const ro = new ResizeObserver(() => {
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        fitTerminal()
      })
    })
    ro.observe(containerRef.current)

    return () => {
      disposed = true
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      onDataDispose.dispose()
      onResizeDispose.dispose()
      unsubData()
      unsubExit()
      ro.disconnect()
      term.dispose()
    }
  }, [visible, session.id, session.launcherId, session.name, session.cwd])

  useEffect(() => {
    if (visible) {
      requestAnimationFrame(() => {
        const term = termRef.current
        fitAddonRef.current?.fit()
        if (term) {
          const { cols, rows } = term
          const lastSize = lastSizeRef.current
          if (!lastSize || lastSize.cols !== cols || lastSize.rows !== rows) {
            lastSizeRef.current = { cols, rows }
            window.terminalApi.resizeTerminal(session.id, cols, rows)
          }
        }
        if (focused) {
          if (editorMode) editorRef.current?.focus()
          else termRef.current?.focus()
        }
      })
    }
  }, [focused, visible, editorMode])

  return (
    <div
      className={`terminal-session-wrapper${session.launcherId === 'gemini' || session.launcherId === 'deepseek' ? ' terminal-session-wrapper--opaque' : ''}`}
      style={{ display: visible ? 'flex' : 'none' }}
      onClick={() => {
        onFocus()
        if (editorMode) editorRef.current?.focus()
        else termRef.current?.focus()
      }}
    >
      <div ref={containerRef} className="terminal-session-container" />
      <div className="terminal-composer" onClick={(event) => event.stopPropagation()}>
        <div className="terminal-composer__mode" role="group" aria-label="Terminal input mode">
          <button
            type="button"
            className={`terminal-composer__mode-btn${editorMode ? ' active' : ''}`}
            onClick={() => {
              setEditorMode(true)
              requestAnimationFrame(() => editorRef.current?.focus())
            }}
          >
            Editor
          </button>
          <button
            type="button"
            className={`terminal-composer__mode-btn${!editorMode ? ' active' : ''}`}
            onClick={() => {
              setEditorMode(false)
              requestAnimationFrame(() => termRef.current?.focus())
            }}
          >
            Direct
          </button>
        </div>
        {editorMode ? (
          <>
            <textarea
              ref={editorRef}
              className="terminal-composer__input"
              value={draft}
              rows={2}
              spellCheck={false}
              placeholder="Type a command or prompt. Enter runs, Shift+Enter adds a line."
              onChange={(event) => {
                setDraft(event.target.value)
                setHistoryIndex(null)
              }}
              onKeyDown={handleEditorKeyDown}
            />
            <div className="terminal-composer__actions">
              <button type="button" className="terminal-composer__action" onClick={() => sendTerminalData('\x03')}>
                Ctrl-C
              </button>
              <button type="button" className="terminal-composer__action" onClick={() => sendTerminalData('\t')}>
                Tab
              </button>
              <button type="button" className="terminal-composer__action" onClick={() => sendTerminalData('\x1b')}>
                Esc
              </button>
              <button
                type="button"
                className="terminal-composer__action terminal-composer__action--primary"
                onClick={() => handlePasteDraft({ run: false })}
                disabled={draft.trimEnd().length === 0}
              >
                Paste
              </button>
              <button
                type="button"
                className="terminal-composer__action terminal-composer__action--primary"
                onClick={() => handlePasteDraft({ run: true })}
                disabled={draft.trimEnd().length === 0}
              >
                Run
              </button>
            </div>
          </>
        ) : (
          <div className="terminal-composer__direct">
            Raw terminal input is active. Press Esc in the terminal as usual, or switch back to Editor for editable command entry.
          </div>
        )}
      </div>
    </div>
  )
}

export function TerminalsPane({
  visible = true,
  workspaceId,
  workspaceKind,
  workspaceProjectPath,
  repoWorkspacePaths = [],
}: {
  visible?: boolean
  workspaceId?: string | null
  workspaceKind?: 'repo' | 'general'
  workspaceProjectPath?: string
  repoWorkspacePaths?: string[]
}) {
  const [selectedId, setSelectedId] = useState<TerminalLauncherId>('codex')
  const [sessions, setSessions] = useState<TerminalSessionSnapshot[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [visibleSessionIds, setVisibleSessionIds] = useState<Set<string>>(new Set())
  const [cwd, setCwd] = useState<string | null>(null)
  const [launchError, setLaunchError] = useState('')
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false)
  const [agentRuns, setAgentRuns] = useState<Record<string, AgentRunSnapshot>>({})
  const createMenuRef = useRef<HTMLDivElement>(null)
  const layoutMenuRef = useRef<HTMLDivElement>(null)

  const selectedLauncher = useMemo(
    () => launchers.find((l) => l.id === selectedId) ?? launchers[0],
    [selectedId],
  )
  const defaultCwd = workspaceKind === 'repo' ? workspaceProjectPath ?? null : null
  const effectiveCwd = cwd ?? defaultCwd
  const folderLabel = effectiveCwd ? effectiveCwd.split('/').at(-1) : 'Choose folder'
  const uniqueSessions = useMemo(() => dedupeSessions(sessions), [sessions])
  const workspaceSessions = useMemo(() => uniqueSessions.filter((session) => {
    if (!workspaceId) return true
    if (session.workspaceId === workspaceId) return true
    if (workspaceKind === 'repo' && workspaceProjectPath && session.cwd) {
      return session.cwd === workspaceProjectPath || session.cwd.startsWith(`${workspaceProjectPath}/`)
    }
    if (workspaceKind === 'general') {
      return !session.cwd || !repoWorkspacePaths.some((repoPath) => (
        session.cwd === repoPath || session.cwd.startsWith(`${repoPath}/`)
      ))
    }
    return false
  }), [uniqueSessions, workspaceId, workspaceKind, workspaceProjectPath, repoWorkspacePaths])

  useEffect(() => {
    setActiveSessionId((current) => {
      if (current && workspaceSessions.some((session) => session.id === current)) return current
      return workspaceSessions[0]?.id ?? null
    })
    setVisibleSessionIds((current) => {
      const workspaceIds = new Set(workspaceSessions.map((session) => session.id))
      const next = new Set([...current].filter((id) => workspaceIds.has(id)))
      if (next.size === 0 && workspaceSessions[0]) next.add(workspaceSessions[0].id)
      return next
    })
  }, [workspaceSessions])

  useEffect(() => {
    setCwd(null)
  }, [workspaceId, workspaceProjectPath])

  useEffect(() => {
    let canceled = false
    window.terminalApi.listTerminalSessions().then((existingSessions) => {
      if (canceled) return
      const nextSessions = dedupeSessions(existingSessions)
      setSessions(nextSessions)
      setActiveSessionId((current) => {
        if (current && nextSessions.some((session) => session.id === current)) return current
        return nextSessions[0]?.id ?? null
      })
      setVisibleSessionIds((current) => {
        const existingIds = new Set(nextSessions.map((session) => session.id))
        const next = new Set([...current].filter((id) => existingIds.has(id)))
        if (next.size === 0 && nextSessions[0]) next.add(nextSessions[0].id)
        return next
      })
    })
    const unsubscribeCreated = window.terminalApi.onTerminalCreated((session) => {
      if (canceled) return
      setSessions((current) => upsertSession(current, session))
      setActiveSessionId(session.id)
      setVisibleSessionIds((current) => new Set([...current, session.id]))
    })
    return () => {
      canceled = true
      unsubscribeCreated()
    }
  }, [])

  useEffect(() => {
    if (!createMenuOpen && !layoutMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (createMenuOpen && !createMenuRef.current?.contains(target)) setCreateMenuOpen(false)
      if (layoutMenuOpen && !layoutMenuRef.current?.contains(target)) setLayoutMenuOpen(false)
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return
      setCreateMenuOpen(false)
      setLayoutMenuOpen(false)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [createMenuOpen, layoutMenuOpen])

  async function handlePickDirectory() {
    const dir = await window.terminalApi.selectDirectory()
    if (dir) setCwd(dir)
  }

  async function handleLaunchSession() {
    setLaunchError('')
    const nextIndex = workspaceSessions.filter((s) => s.launcherId === selectedLauncher.id).length + 1
    try {
      const session = await window.terminalApi.createTerminal(
        `${selectedLauncher.id}-${crypto.randomUUID()}`,
        selectedLauncher.id,
        `${selectedLauncher.sessionLabel} ${nextIndex}`,
        effectiveCwd ?? undefined,
        undefined,
        workspaceId ?? undefined,
      )
      setSessions((current) => upsertSession(current, session))
      setActiveSessionId(session.id)
      setVisibleSessionIds((current) => new Set([...current, session.id]))
      setCreateMenuOpen(false)
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error))
    }
  }

  function handleCloseSession(sessionId: string) {
    window.terminalApi.killTerminal(sessionId)
    setSessions((current) => {
      const nextSessions = current.filter((session) => session.id !== sessionId)
      setActiveSessionId((activeId) => {
        if (activeId !== sessionId) return activeId
        return nextSessions[0]?.id ?? null
      })
      setVisibleSessionIds((current) => {
        const next = new Set([...current].filter((id) => id !== sessionId))
        if (next.size === 0 && nextSessions[0]) next.add(nextSessions[0].id)
        return next
      })
      return nextSessions
    })
  }

  function handleSelectSession(sessionId: string) {
    setVisibleSessionIds((current) => new Set([...current, sessionId]))
  }

  function handleSoloSession() {
    const targetSessionId = activeSessionId && workspaceSessions.some((session) => session.id === activeSessionId)
      ? activeSessionId
      : visibleSessions[0]?.id
    if (!targetSessionId) return
    setVisibleSessionIds(new Set([targetSessionId]))
  }

  function handleTileAll() {
    setVisibleSessionIds(new Set(workspaceSessions.map((session) => session.id)))
  }

  function handleHideSession(sessionId: string, event: MouseEvent) {
    event.stopPropagation()
    setVisibleSessionIds((current) => {
      if (current.size <= 1) return current
      const next = new Set(current)
      next.delete(sessionId)
      return next
    })
  }

  const visibleSessions = workspaceSessions.filter((session) => visibleSessionIds.has(session.id))
  const activeSession = activeSessionId
    ? workspaceSessions.find((session) => session.id === activeSessionId) ?? null
    : workspaceSessions[0] ?? null
  const activeAgentRun = activeSession ? agentRuns[activeSession.id] ?? null : null

  useEffect(() => {
    if (!activeSession) return
    let canceled = false
    window.terminalApi.getAgentRunForTerminal(activeSession.id).then((run) => {
      if (canceled || !run?.terminalSessionId) return
      setAgentRuns((current) => ({ ...current, [run.terminalSessionId as string]: run }))
    })
    return () => {
      canceled = true
    }
  }, [activeSession?.id])

  useEffect(() => {
    const unsubscribe = window.terminalApi.onAgentRunUpdated((run) => {
      if (!run.terminalSessionId) return
      setAgentRuns((current) => ({ ...current, [run.terminalSessionId as string]: run }))
    })
    return unsubscribe
  }, [])

  return (
    <div className="terminals-view">
      <section className="terminals-body">
        <div className="terminal-tabs-bar">
          <div className="terminal-tabs-bar__sessions">
            <div className="terminal-session-tabs">
              {workspaceSessions.map((session) => {
                const isVisible = visibleSessionIds.has(session.id)
                return (
                  <button
                    key={session.id}
                    type="button"
                    className={`terminal-session-tab${isVisible ? ' active is-visible' : ''}${session.id === activeSessionId ? ' is-focused' : ''}`}
                    onClick={() => handleSelectSession(session.id)}
                    title={session.cwd ? `${session.name} - ${session.cwd}` : session.name}
                  >
                    <span
                      className="terminal-session-tab__visibility"
                      title={isVisible ? 'Hide from workspace' : 'Show in workspace'}
                      onClick={(event) => {
                        if (isVisible) handleHideSession(session.id, event)
                      }}
                    />
                    <span className="terminal-session-tab__label">
                      <span className="terminal-session-tab__name">{session.name}</span>
                      {session.cwd && <span className="terminal-session-tab__cwd">{session.cwd.split('/').at(-1)}</span>}
                    </span>
                    <span
                      className="terminal-session-tab__close"
                      title={`Close ${session.name}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        handleCloseSession(session.id)
                      }}
                    >
                      ×
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="terminal-header-actions">
            <div ref={createMenuRef} className="terminal-toolbar-menu">
              <button
                type="button"
                className="terminal-toolbar-primary"
                aria-haspopup="dialog"
                aria-expanded={createMenuOpen}
                onClick={() => {
                  setCreateMenuOpen((value) => !value)
                  setLayoutMenuOpen(false)
                }}
              >
                + New agent
              </button>
              {createMenuOpen && (
                <div className="terminal-toolbar-popover terminal-create-popover" role="dialog" aria-label="Create terminal session">
                  <label className="terminal-agent-form__field">
                    <span>Agent</span>
                    <select value={selectedId} onChange={(event) => setSelectedId(event.target.value as TerminalLauncherId)}>
                      {launchers.map((launcher) => (
                        <option key={launcher.id} value={launcher.id}>{launcher.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="terminal-agent-form__folder">
                    <button type="button" className="terminal-agent-form__folder-button" onClick={handlePickDirectory} title={effectiveCwd ?? 'Choose folder'}>
                      {folderLabel}
                    </button>
                    {cwd && <button type="button" className="terminal-agent-form__clear" onClick={() => setCwd(null)} aria-label="Clear selected folder" title="Clear folder">×</button>}
                  </div>
                  {effectiveCwd && <div className="terminal-agent-form__path" title={effectiveCwd}>{effectiveCwd}</div>}
                  <button type="button" className="terminal-agent-form__launch" onClick={handleLaunchSession}>
                    Start {selectedLauncher.name}
                  </button>
                </div>
              )}
            </div>
            <button type="button" className="terminal-toolbar-button" onClick={handlePickDirectory} title={effectiveCwd ?? 'Set folder'}>
              {effectiveCwd ? folderLabel : 'Set folder'}
            </button>
            <div ref={layoutMenuRef} className="terminal-toolbar-menu">
              <button
                type="button"
                className="terminal-toolbar-icon"
                aria-label="Session layout"
                aria-haspopup="menu"
                aria-expanded={layoutMenuOpen}
                title="Session layout"
                onClick={() => {
                  setLayoutMenuOpen((value) => !value)
                  setCreateMenuOpen(false)
                }}
              >
                ⋮
              </button>
              {layoutMenuOpen && (
                <div className="terminal-toolbar-popover terminal-layout-popover" role="menu" aria-label="Session layout actions">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleSoloSession()
                      setLayoutMenuOpen(false)
                    }}
                    disabled={visibleSessions.length <= 1}
                  >
                    Solo active
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      handleTileAll()
                      setLayoutMenuOpen(false)
                    }}
                    disabled={workspaceSessions.length <= 1 || visibleSessionIds.size === workspaceSessions.length}
                  >
                    Tile all sessions
                  </button>
                  {cwd && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCwd(null)
                        setLayoutMenuOpen(false)
                      }}
                    >
                      Clear folder
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {launchError && (
          <div className="terminal-launch-error">
            {launchError}
          </div>
        )}

        {visibleSessions.length > 0 && (
          <div className={`terminal-grid terminal-grid--${Math.min(visibleSessions.length, 4)}`}>
            {visibleSessions.map((session) => (
              <TerminalView
                key={session.id}
                session={session}
                visible={visible}
                focused={session.id === activeSessionId}
                onFocus={() => setActiveSessionId(session.id)}
              />
            ))}
          </div>
        )}

        {workspaceSessions.length === 0 && (
          <div className="terminal-pane">
            <div className="terminal-launch-card" role="region" aria-label="Create terminal session">
              <div className="terminal-launch-card__eyebrow">Terminal Sessions</div>
              <h2 className="terminal-launch-card__title">No active sessions</h2>
              <div className="terminal-agent-form terminal-agent-form--empty">
                <label className="terminal-agent-form__field">
                  <span>Agent</span>
                  <select value={selectedId} onChange={(event) => setSelectedId(event.target.value as TerminalLauncherId)}>
                    {launchers.map((launcher) => (
                      <option key={launcher.id} value={launcher.id}>{launcher.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="terminal-agent-form__folder-button"
                  onClick={handlePickDirectory}
                  title={effectiveCwd ?? 'Choose folder'}
                >
                  {folderLabel}
                </button>
                <button type="button" className="terminal-agent-form__launch" onClick={handleLaunchSession}>
                  Start {selectedLauncher.name}
                </button>
                {cwd && (
                  <button type="button" className="terminal-agent-form__clear" onClick={() => setCwd(null)} aria-label="Clear selected folder" title="Clear folder">
                    ×
                  </button>
                )}
              </div>
              {effectiveCwd && (
                <p className="terminal-launch-card__hint">
                  Starting in: {effectiveCwd}
                </p>
              )}
              {launchError && (
                <p className="terminal-launch-card__hint terminal-launch-card__hint--error">
                  {launchError}
                </p>
              )}
            </div>
          </div>
        )}
      </section>
      <AgentMapPanel session={activeSession} run={activeAgentRun} />
    </div>
  )
}
