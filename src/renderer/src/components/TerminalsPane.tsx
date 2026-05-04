import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalLauncherId, TerminalSessionSnapshot } from '../../../shared/types'

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

interface TerminalViewProps {
  session: TerminalSessionSnapshot
  active: boolean
}

function TerminalView({ session, active }: TerminalViewProps) {
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
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      theme: {
        background: session.launcherId === 'gemini' ? '#070711' : '#050507',
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
    window.terminalApi.createTerminal(session.id, session.launcherId, session.name, session.cwd)
      .then(() => window.terminalApi.getTerminalBuffer(session.id))
      .then((buffer) => {
        if (disposed) return
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
  }, [session.id, session.launcherId, session.name, session.cwd])

  useEffect(() => {
    if (active) {
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
        if (editorMode) editorRef.current?.focus()
        else termRef.current?.focus()
      })
    }
  }, [active, editorMode])

  return (
    <div
      className={`terminal-session-wrapper${session.launcherId === 'gemini' ? ' terminal-session-wrapper--opaque' : ''}`}
      style={{ display: active ? 'flex' : 'none' }}
      onClick={() => {
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

export function TerminalsPane() {
  const [selectedId, setSelectedId] = useState<TerminalLauncherId>('codex')
  const [sessions, setSessions] = useState<TerminalSessionSnapshot[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)

  const selectedLauncher = useMemo(
    () => launchers.find((l) => l.id === selectedId) ?? launchers[0],
    [selectedId],
  )

  useEffect(() => {
    let canceled = false
    window.terminalApi.listTerminalSessions().then((existingSessions) => {
      if (canceled) return
      setSessions(existingSessions)
      setActiveSessionId((current) => {
        if (current && existingSessions.some((session) => session.id === current)) return current
        return existingSessions[0]?.id ?? null
      })
    })
    return () => {
      canceled = true
    }
  }, [])

  async function handlePickDirectory() {
    const dir = await window.terminalApi.selectDirectory()
    if (dir) setCwd(dir)
  }

  async function handleLaunchSession() {
    const nextIndex = sessions.filter((s) => s.launcherId === selectedLauncher.id).length + 1
    const session = await window.terminalApi.createTerminal(
      `${selectedLauncher.id}-${crypto.randomUUID()}`,
      selectedLauncher.id,
      `${selectedLauncher.sessionLabel} ${nextIndex}`,
      cwd ?? undefined,
    )
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
  }

  function handleCloseSession(sessionId: string) {
    window.terminalApi.killTerminal(sessionId)
    setSessions((current) => {
      const nextSessions = current.filter((session) => session.id !== sessionId)
      setActiveSessionId((activeId) => {
        if (activeId !== sessionId) return activeId
        return nextSessions[0]?.id ?? null
      })
      return nextSessions
    })
  }

  return (
    <div className="terminals-view">
      <aside className="terminals-sidebar">
        <div className="terminals-sidebar__header">
          <div className="terminals-sidebar__title">Live Sessions</div>
        </div>

        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`terminal-tab ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => setActiveSessionId(session.id)}
          >
            <span className="tab-name">
              {session.name}
              {session.cwd && (
                <span style={{ display: 'block', fontSize: 10, opacity: 0.45, fontWeight: 400, marginTop: 1 }}>
                  {session.cwd.split('/').at(-1)}
                </span>
              )}
            </span>
            <span
              role="button"
              aria-label={`Close ${session.name}`}
              className="terminal-tab__close"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation()
                handleCloseSession(session.id)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                event.stopPropagation()
                handleCloseSession(session.id)
              }}
            >
              ×
            </span>
          </button>
        ))}

        {sessions.length === 0 && (
          <div className="terminals-empty">
            Start a session from the right-hand panel.
          </div>
        )}

        <div className="terminals-sidebar__divider" />

        <div className="terminals-sidebar__header">
          <div className="terminals-sidebar__title">Launchers</div>
        </div>

        {launchers.map((launcher) => (
          <button
            key={launcher.id}
            type="button"
            className={`terminal-tab ${launcher.id === selectedId ? 'active' : ''}`}
            onClick={() => setSelectedId(launcher.id)}
          >
            <span className="tab-name">{launcher.name}</span>
            <span className="tab-status">{launcher.status}</span>
          </button>
        ))}
      </aside>

      <section className="terminals-body">
        {sessions.map((session) => (
          <TerminalView key={session.id} session={session} active={session.id === activeSessionId} />
        ))}

        {!activeSessionId && (
          <div className="terminal-pane">
            <div className="terminal-launch-card">
              <div className="terminal-launch-card__eyebrow">Terminal Sessions</div>
              <h2 className="terminal-launch-card__title">{selectedLauncher.headline}</h2>
              <p className="terminal-launch-card__copy">{selectedLauncher.detail}</p>
              <div className="terminal-launch-card__actions">
                <button type="button" className="terminal-launch-btn" onClick={handleLaunchSession}>
                  {selectedLauncher.cta}
                </button>
                <button type="button" className="terminal-launch-btn" onClick={handlePickDirectory} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
                  {cwd ? `📁 ${cwd.split('/').at(-1)}` : '📁 Choose folder'}
                </button>
                {cwd && (
                  <button type="button" onClick={() => setCwd(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer' }}>
                    ×
                  </button>
                )}
              </div>
              {cwd && (
                <p className="terminal-launch-card__hint" style={{ marginTop: 8 }}>
                  Starting in: {cwd}
                </p>
              )}
            </div>
          </div>
        )}

        {activeSessionId && (
          <div className="terminal-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button type="button" className="terminal-launch-btn terminal-launch-btn--sm" onClick={handleLaunchSession}>
              + {selectedLauncher.cta}
            </button>
            <button type="button" className="terminal-launch-btn terminal-launch-btn--sm" onClick={handlePickDirectory} style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}>
              {cwd ? `📁 ${cwd.split('/').at(-1)}` : '📁 folder'}
            </button>
            {cwd && (
              <button type="button" onClick={() => setCwd(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: 13, cursor: 'pointer' }}>
                ×
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
