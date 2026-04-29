import { useMemo, useState } from 'react'

type LauncherId = 'codex' | 'claude' | 'shell'
type TerminalSessionStatus = 'starting' | 'idle'

interface Launcher {
  id: LauncherId
  name: string
  status: string
  headline: string
  detail: string
  cta: string
  sessionLabel: string
}

interface TerminalSession {
  id: string
  launcherId: LauncherId
  name: string
  status: TerminalSessionStatus
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

export function TerminalsPane() {
  const [selectedId, setSelectedId] = useState<LauncherId>('codex')
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const selectedLauncher = useMemo(
    () => launchers.find((launcher) => launcher.id === selectedId) ?? launchers[0],
    [selectedId],
  )

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  )

  function handleLaunchSession() {
    const nextIndex =
      sessions.filter((session) => session.launcherId === selectedLauncher.id).length + 1
    const session: TerminalSession = {
      id: `${selectedLauncher.id}-${crypto.randomUUID()}`,
      launcherId: selectedLauncher.id,
      name: `${selectedLauncher.sessionLabel} ${nextIndex}`,
      status: 'starting',
    }
    setSessions((current) => [session, ...current])
    setActiveSessionId(session.id)

    window.setTimeout(() => {
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? { ...item, status: 'idle' } : item,
        ),
      )
    }, 700)
  }

  return (
    <div className="terminals-view">
      <aside className="terminals-sidebar">
        <div className="terminals-sidebar__header">
          <div className="terminals-sidebar__title">Live Sessions</div>
          <div className="terminals-sidebar__subtitle">
            {sessions.length === 0 ? 'No terminals launched yet' : `${sessions.length} active session${sessions.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            className={`terminal-tab tab--${session.status} ${session.id === activeSessionId ? 'active' : ''}`}
            onClick={() => setActiveSessionId(session.id)}
          >
            <span className="tab-name">{session.name}</span>
            <span className="tab-status">{session.status}</span>
          </button>
        ))}
        {sessions.length === 0 && (
          <div className="terminals-empty">
            Start a session from the right-hand panel. Terminal launches stay separate from chat history and model selection.
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
        <div className="terminal-pane">
          <div className="terminal-launch-card">
            <div className="terminal-launch-card__eyebrow">Terminal Sessions</div>
            <h2 className="terminal-launch-card__title">{selectedLauncher.headline}</h2>
            <p className="terminal-launch-card__copy">{selectedLauncher.detail}</p>

            <div className="terminal-launch-card__actions">
              <button type="button" className="terminal-launch-btn" onClick={handleLaunchSession}>
                {selectedLauncher.cta}
              </button>
              <span className="terminal-launch-card__hint">
                New terminal sessions now appear in the sidebar immediately, even before backend process launch is wired in.
              </span>
            </div>

            <div className="terminal-unmanaged">
              {activeSession ? (
                <>
                  <div className="terminal-unmanaged__title">{activeSession.name}</div>
                  <div className="terminal-unmanaged__copy">
                    This session is staged in the UI and ready for backend launch wiring. The eventual process bootstrap,
                    terminal stream, and agent attach flow can connect here without borrowing chat conversation behavior.
                  </div>
                </>
              ) : (
                <>
                  <div className="terminal-unmanaged__title">No live terminal sessions yet</div>
                  <div className="terminal-unmanaged__copy">
                    This mode is reserved for agent-driven or manual terminal work. Once the session APIs are connected,
                    this panel can show active terminals, status, and launch history.
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
