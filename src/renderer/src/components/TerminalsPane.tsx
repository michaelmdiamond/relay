import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalLauncherId } from '../../../shared/types'

interface Launcher {
  id: TerminalLauncherId
  name: string
  status: string
  headline: string
  detail: string
  cta: string
  sessionLabel: string
}

interface TerminalSession {
  id: string
  launcherId: TerminalLauncherId
  name: string
  cwd?: string
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
  session: TerminalSession
  active: boolean
}

function TerminalView({ session, active }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const termRef = useRef<Terminal | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      fontFamily: '"Cascadia Code", "Fira Code", "Menlo", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      allowTransparency: true,
      theme: {
        background: '#00000000',
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
    setTimeout(() => {
      fitAddon.fit()
      term.focus()
    }, 50)

    window.terminalApi.createTerminal(session.id, session.launcherId, session.cwd)

    const onDataDispose = term.onData((data) => window.terminalApi.sendTerminalInput(session.id, data))
    const onResizeDispose = term.onResize(({ cols, rows }) =>
      window.terminalApi.resizeTerminal(session.id, cols, rows),
    )

    const unsubData = window.terminalApi.onTerminalData((id, data) => {
      if (id === session.id) term.write(data)
    })

    const unsubExit = window.terminalApi.onTerminalExit((id, code) => {
      if (id === session.id)
        term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`)
    })

    const ro = new ResizeObserver(() => fitAddon.fit())
    ro.observe(containerRef.current)

    return () => {
      onDataDispose.dispose()
      onResizeDispose.dispose()
      unsubData()
      unsubExit()
      ro.disconnect()
      term.dispose()
      window.terminalApi.killTerminal(session.id)
    }
  }, [session.id, session.launcherId])

  useEffect(() => {
    if (active) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit()
        termRef.current?.focus()
      })
    }
  }, [active])

  return (
    <div
      className="terminal-session-wrapper"
      style={{ display: active ? 'block' : 'none' }}
      onClick={() => termRef.current?.focus()}
    >
      <div ref={containerRef} className="terminal-session-container" />
    </div>
  )
}

export function TerminalsPane() {
  const [selectedId, setSelectedId] = useState<TerminalLauncherId>('codex')
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [cwd, setCwd] = useState<string | null>(null)

  const selectedLauncher = useMemo(
    () => launchers.find((l) => l.id === selectedId) ?? launchers[0],
    [selectedId],
  )

  async function handlePickDirectory() {
    const dir = await window.terminalApi.selectDirectory()
    if (dir) setCwd(dir)
  }

  function handleLaunchSession() {
    const nextIndex = sessions.filter((s) => s.launcherId === selectedLauncher.id).length + 1
    const session: TerminalSession = {
      id: `${selectedLauncher.id}-${crypto.randomUUID()}`,
      launcherId: selectedLauncher.id,
      name: `${selectedLauncher.sessionLabel} ${nextIndex}`,
      cwd: cwd ?? undefined,
    }
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)
  }

  return (
    <div className="terminals-view">
      <aside className="terminals-sidebar">
        <div className="terminals-sidebar__header">
          <div className="terminals-sidebar__title">Live Sessions</div>
          <div className="terminals-sidebar__subtitle">
            {sessions.length === 0
              ? 'No terminals launched yet'
              : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
          </div>
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
          <div className="terminals-sidebar__subtitle">Choose how new sessions should start</div>
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
