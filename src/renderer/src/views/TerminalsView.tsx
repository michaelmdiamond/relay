import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '../store/sessions'
import type { Session } from '../../../../../shared/types'

export function TerminalsView() {
  const { sessions, activeTerminalId } = useSessionStore()
  const active = sessions.find((s) => s.id === activeTerminalId)

  if (!active) {
    return (
      <div className="terminals-body">
        <div className="terminal-unmanaged">
          <p className="muted">Select a session from the sidebar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="terminals-body">
      {active.managed
        ? <TerminalPane key={active.id} session={active} />
        : (
          <div className="terminal-unmanaged">
            <p>External session — live terminal not available.</p>
            <p className="muted">PID {active.pid} · {active.cwd}</p>
          </div>
        )
      }
    </div>
  )
}

export function TerminalPane({ session }: { session: Session }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return

    const term = new Terminal({
      fontFamily: '"JetBrains Mono", "Menlo", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      theme: {
        background: '#0e0e0f',
        foreground: '#e8e8ed',
        cursor: '#4aaeff',
        selectionBackground: '#4aaeff44',
        black: '#1a1a1f',
        brightBlack: '#4a4a5a',
        white: '#e8e8ed',
        brightWhite: '#ffffff',
        blue: '#4aaeff',
        brightBlue: '#6abeff',
        cyan: '#34d4f1',
        green: '#4caf70',
        yellow: '#f5a623',
        red: '#e05252',
        magenta: '#c792ea',
      },
      cursorBlink: true,
      scrollback: 5000,
    })

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(ref.current)
    fit.fit()

    term.onData((data) => window.api.writeToPty(session.id, data))

    const unsub = window.api.onPtyData((id, data) => {
      if (id === session.id) term.write(data)
    })

    const observer = new ResizeObserver(() => {
      fit.fit()
      window.api.resizePty(session.id, term.cols, term.rows)
    })
    observer.observe(ref.current)

    return () => {
      unsub()
      observer.disconnect()
      term.dispose()
    }
  }, [session.id])

  return <div ref={ref} className="terminal-pane" />
}
