import { useEffect, useMemo, useState } from 'react'
import type { CodexStatusItem, CodexStatusSnapshot, CodexThreadState } from '../../../shared/types'

const STATE_LABEL: Record<CodexThreadState, string> = {
  active: 'Active',
  completed: 'Done',
  idle: 'Idle',
  interrupted: 'Stopped',
  stale: 'Stale',
}

function formatAge(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'unknown'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.round(minutes / 60)
  return `${hours}h`
}

function compactTitle(item: CodexStatusItem): string {
  const title = item.agentNickname || item.title
  return title.length > 34 ? `${title.slice(0, 31)}...` : title
}

function statusText(snapshot: CodexStatusSnapshot): string {
  if (snapshot.activeCount > 0) {
    return `${snapshot.activeCount} active ${snapshot.activeCount === 1 ? 'agent' : 'agents'}`
  }
  if (snapshot.items.length > 0) {
    return 'No active agents'
  }
  return 'No agents found'
}

export function CodexStatusBar({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<CodexStatusSnapshot | null>(null)

  useEffect(() => {
    let mounted = true
    window.api.getCodexStatus().then((next) => {
      if (mounted) setSnapshot(next)
    })
    const unsubscribe = window.api.onCodexStatusUpdated((next) => {
      setSnapshot(next)
    })
    return () => {
      mounted = false
      unsubscribe()
    }
  }, [])

  const items = useMemo(() => snapshot?.items
    .filter((item) => compact ? item.state === 'active' : true)
    .slice(0, compact ? 3 : 4) ?? [], [compact, snapshot])

  function focusThread(item: CodexStatusItem): void {
    if (!compact) return
    void window.api.focusCodexThread(item.id)
  }

  return (
    <section className={`codex-status${compact ? ' codex-status--compact' : ''}`} aria-label="Codex agent status">
      <div className="codex-status__summary">
        <span className={`codex-status__pulse${snapshot?.activeCount ? ' is-live' : ''}`} />
        <div>
          <strong>Codex</strong>
          <span>{snapshot ? statusText(snapshot) : 'Loading Codex status'}</span>
        </div>
      </div>
      <div className="codex-status__items">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`codex-chip codex-chip--${item.state}`}
            title={`Focus ${item.title}`}
            onClick={() => focusThread(item)}
          >
            <span className="codex-chip__state">{STATE_LABEL[item.state]}</span>
            <strong>{compactTitle(item)}</strong>
            <span className="codex-chip__age">{formatAge(item.lastActivityAt)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
