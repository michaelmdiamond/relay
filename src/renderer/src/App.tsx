import { useEffect, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useSessionStore } from './store/sessions'
import { KanbanView } from './views/KanbanView'
import { TerminalsView } from './views/TerminalsView'
import { TranscriptView } from './views/TranscriptView'
import { Toolbar } from './components/Toolbar'
import { UnifiedSidebar } from './components/UnifiedSidebar'
import { DevPanel } from './components/DevPanel'
import type { ClaudeConversation, Session, SessionStatus } from '../../../../shared/types'
import './styles/globals.css'

declare global {
  interface Window {
    api: import('../../../../shared/types').IpcApi
  }
}

const STATUS_COLUMNS: SessionStatus[] = ['in_progress', 'idle', 'needs_input', 'done']

function inferProject(cwd: string): string {
  const m = cwd.match(/^\/Users\/[^/]+\/(.+)/)
  if (m) return m[1].split('/')[0] || 'Root'
  return cwd.split('/').pop() || '/'
}

export default function App() {
  const { setSessions, mainView, setMainView, setActiveTerminal, sessions, viewMode, updateSessionStatus, updateSessionProject } = useSessionStore()
  const [draggedSession, setDraggedSession] = useState<Session | null>(null)
  const [draggedConv, setDraggedConv] = useState<ClaudeConversation | null>(null)

  useEffect(() => {
    window.api.getSessions().then(setSessions)
    const unsub = window.api.onSessionsChanged(setSessions)
    return unsub
  }, [setSessions])

  useEffect(() => {
    const unsub = window.api.onFocusUrgentSession((id) => {
      setMainView('terminal')
      setActiveTerminal(id)
    })
    return unsub
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function onDragStart({ active }: DragStartEvent) {
    const conv = active.data.current?.conv as ClaudeConversation | undefined
    if (conv) {
      setDraggedConv(conv)
    } else {
      const session = sessions.find(s => s.id === String(active.id))
      if (session) setDraggedSession(session)
    }
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setDraggedSession(null)
    setDraggedConv(null)
    if (!over || active.id === over.id) return

    const conv = active.data.current?.conv as ClaudeConversation | undefined
    const overId = String(over.id)

    if (conv) {
      if (overId === 'sidebar-archive') {
        window.api.archiveConversation(conv.id)
        return
      }
      const targetStatus: SessionStatus | undefined =
        STATUS_COLUMNS.find(s => s === overId) ??
        sessions.find(s => s.id === overId)?.status
      if (targetStatus) window.api.pinConversation(conv, targetStatus)
      return
    }

    const session = sessions.find(s => s.id === String(active.id))
    if (!session) return

    if (viewMode === 'status') {
      const targetCol = STATUS_COLUMNS.find(s => s === overId)
      if (targetCol && targetCol !== session.status) {
        updateSessionStatus(session.id, targetCol)
        window.api.updateSession(session.id, { status: targetCol })
        return
      }
      const overSession = sessions.find(s => s.id === overId)
      if (overSession && overSession.status !== session.status) {
        updateSessionStatus(session.id, overSession.status)
        window.api.updateSession(session.id, { status: overSession.status })
      }
    } else {
      const overSession = sessions.find(s => s.id === overId)
      const targetProject = overSession
        ? (overSession.project ?? inferProject(overSession.cwd))
        : overId
      const currentProject = session.project ?? inferProject(session.cwd)
      if (targetProject !== currentProject) {
        updateSessionProject(session.id, targetProject)
        window.api.updateSession(session.id, { project: targetProject })
      }
    }
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="app">
          <Toolbar />
          <main className="app-body">
            <UnifiedSidebar />
            {mainView === 'kanban'     && <KanbanView />}
            {mainView === 'terminal'   && <TerminalsView />}
            {mainView === 'transcript' && <TranscriptView />}
          </main>
        </div>

        <DragOverlay>
          {draggedConv && (
            <div className="conv-drag-ghost">
              <div className="conv-drag-ghost-title">{draggedConv.title}</div>
              <div className="conv-drag-ghost-meta">{draggedConv.project}</div>
            </div>
          )}
          {draggedSession && (
            <div className={`card card--${draggedSession.status}`} style={{ opacity: 0.9, pointerEvents: 'none' }}>
              <div className="card-header">
                <span className="card-name">{draggedSession.name}</span>
              </div>
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <DevPanel />
    </>
  )
}
