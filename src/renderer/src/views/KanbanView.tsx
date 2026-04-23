import { useState } from 'react'
import { DragOverlay } from '@dnd-kit/core'
import type { Session, SessionStatus } from '../../../../../shared/types'
import { useSessionStore } from '../store/sessions'
import { KanbanColumn } from '../components/KanbanColumn'
import { SessionCard } from '../components/SessionCard'

const STATUS_COLUMNS: { id: SessionStatus; title: string }[] = [
  { id: 'in_progress', title: 'In Progress' },
  { id: 'idle', title: 'Idle' },
  { id: 'needs_input', title: 'Needs Input' },
  { id: 'done', title: 'Done' },
]

function inferProject(cwd: string): string {
  const m = cwd.match(/^\/Users\/[^/]+\/(.+)/)
  if (m) return m[1].split('/')[0] || '~'
  return cwd.split('/').pop() || '/'
}

export function KanbanView() {
  const { sessions, viewMode } = useSessionStore()
  const [selected, setSelected] = useState<Session | null>(null)

  const columns =
    viewMode === 'status'
      ? STATUS_COLUMNS.map((col) => ({
          id: col.id,
          title: col.title,
          sessions: sessions.filter((s) => s.status === col.id),
        }))
      : (() => {
          const map = new Map<string, Session[]>()
          for (const s of sessions) {
            const key = s.project ?? inferProject(s.cwd)
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(s)
          }
          return Array.from(map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([id, sessions]) => ({ id, title: id, sessions }))
        })()

  return (
    <div className="kanban-board">
      {columns.map((col) => (
        <KanbanColumn
          key={col.id}
          id={col.id}
          title={col.title}
          sessions={col.sessions}
          onCardClick={setSelected}
        />
      ))}
    </div>
  )
}
