import { useEffect, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useSessionStore } from '../store/sessions'
import type { ClaudeConversation, Session } from '../../../../../shared/types'

// ── Helpers ───────────────────────────────────────────────────

const STATUS_COLOR: Record<string, string> = {
  in_progress: 'var(--blue)',
  idle:        'var(--text-dim)',
  needs_input: 'var(--amber)',
  done:        'var(--text-dim)',
}

const STAGE_COLOR: Record<string, string> = {
  in_progress: 'var(--blue)',
  idle:        'var(--amber)',
  done:        'var(--text-dim)',
}

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function inferProject(cwd: string): string {
  const m = cwd.match(/^\/Users\/[^/]+\/(.+)/)
  if (m) return m[1].split('/')[0] || 'Root'
  return cwd.split('/').pop() || '/'
}

// ── Session item ──────────────────────────────────────────────

function SessionItem({ session }: { session: Session }) {
  const { activeTerminalId, setActiveTerminal, setMainView, mainView } = useSessionStore()
  const isActive = session.id === activeTerminalId && mainView === 'terminal'

  function handleClick() {
    setActiveTerminal(session.id)
    setMainView('terminal')
    if (session.needsAttention) window.api.dismissAttention(session.id)
  }

  const project = session.project ?? inferProject(session.cwd)

  return (
    <button
      className={`unified-item ${isActive ? 'unified-item--active' : ''} ${session.needsAttention ? 'unified-item--attention' : ''}`}
      onClick={handleClick}
    >
      <span className="unified-item-dot" style={{ background: STATUS_COLOR[session.status] ?? 'var(--text-dim)' }} />
      <span className="unified-item-title">{session.name}</span>
      {session.needsAttention
        ? <span className="unified-item-attention-dot" title={session.notificationText} />
        : <span className="unified-item-time">{relativeTime(session.lastActivity)}</span>
      }
    </button>
  )
}

// ── Conversation item ─────────────────────────────────────────

function DraggableConvItem({ conv }: { conv: ClaudeConversation }) {
  const { activeConversation, setActiveConversation, setMainView, mainView } = useSessionStore()
  const isActive = activeConversation?.id === conv.id && mainView === 'transcript'

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `conv::${conv.id}`,
    data: { conv },
  })

  const dotColor = conv.stage ? (STAGE_COLOR[conv.stage] ?? 'transparent') : 'transparent'

  return (
    <button
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      className={`unified-item ${isActive ? 'unified-item--active' : ''}`}
      onClick={() => { setActiveConversation(conv); setMainView('transcript') }}
      {...attributes}
      {...listeners}
    >
      <span className="unified-item-stage" style={{ background: dotColor }} />
      <span className="unified-item-title">{conv.title}</span>
      <span className="unified-item-time">{relativeTime(conv.lastTimestamp)}</span>
    </button>
  )
}

// ── Project group ─────────────────────────────────────────────

function ProjectGroup({ project, convs }: { project: string; convs: ClaudeConversation[] }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="conv-group">
      <button className="conv-group-header" onClick={() => setCollapsed(c => !c)}>
        <span className="conv-group-chevron">{collapsed ? '▸' : '▾'}</span>
        <span className="conv-group-name">{project}</span>
        <span className="conv-group-count">{convs.length}</span>
      </button>
      {!collapsed && (
        <div className="conv-group-items">
          {convs.map(c => <DraggableConvItem key={c.id} conv={c} />)}
        </div>
      )}
    </div>
  )
}

// ── Archive drop zone ─────────────────────────────────────────

function ArchiveDropZone({ count, children }: { count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'sidebar-archive' })
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="conv-archive-section">
      <button className="conv-group-header" onClick={() => setExpanded(e => !e)}>
        <span className="conv-group-chevron">{expanded ? '▾' : '▸'}</span>
        <span className="conv-group-name" style={{ color: 'var(--text-dim)' }}>Archive</span>
        <span className="conv-group-count">{count}</span>
      </button>
      <div ref={setNodeRef} className={`conv-archive-drop ${isOver ? 'conv-archive-drop--over' : ''}`}>
        {isOver && <div className="conv-archive-hint">Drop to archive</div>}
      </div>
      {expanded && <div className="conv-group-items">{children}</div>}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <div className="unified-section-header">{label}</div>
}

// ── Main component ────────────────────────────────────────────

type SortMode = 'project' | 'date'

export function UnifiedSidebar() {
  const { sessions } = useSessionStore()
  const [conversations, setConversations] = useState<ClaudeConversation[]>([])
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('project')

  useEffect(() => {
    window.api.getClaudeConversations().then(setConversations)
  }, [])

  // Sessions — exclude done conversation cards (they live in kanban)
  const liveSessions = sessions.filter(s =>
    s.status !== 'done' && s.cardType !== 'conversation'
  )

  // Conversations
  const recent  = conversations.filter(c => c.isRecent && !c.archived)
  const archive = conversations.filter(c => !c.isRecent || c.archived)

  const filteredRecent  = query ? recent.filter(matches(query))  : recent
  const filteredArchive = query ? archive.filter(matches(query)) : archive
  const filteredSessions = query
    ? liveSessions.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : liveSessions

  const byProject = (() => {
    const map = new Map<string, ClaudeConversation[]>()
    for (const c of filteredRecent) {
      const key = c.project || 'Other'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    for (const [, convs] of map) {
      convs.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    }
    return Array.from(map.entries()).sort(([, a], [, b]) =>
      new Date(b[0].lastTimestamp).getTime() - new Date(a[0].lastTimestamp).getTime()
    )
  })()

  const byDate = [...filteredRecent].sort(
    (a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime()
  )

  return (
    <div className="claude-sidebar">
      {/* Search */}
      <div className="claude-search-wrap">
        <input
          className="claude-search"
          placeholder="Search…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      <div className="claude-conv-list">
        {/* Live sessions */}
        {filteredSessions.length > 0 && (
          <>
            <SectionHeader label="Sessions" />
            {filteredSessions.map(s => <SessionItem key={s.id} session={s} />)}
          </>
        )}

        {/* History */}
        <div className="unified-history-header">
          <SectionHeader label="History" />
          <div className="conv-sort-toggle">
            <button
              className={`conv-sort-btn ${sortMode === 'project' ? 'active' : ''}`}
              onClick={() => setSortMode('project')}
            >Project</button>
            <button
              className={`conv-sort-btn ${sortMode === 'date' ? 'active' : ''}`}
              onClick={() => setSortMode('date')}
            >Date</button>
          </div>
        </div>

        {sortMode === 'project'
          ? byProject.length === 0
            ? <div className="claude-empty">No recent history</div>
            : byProject.map(([project, convs]) => (
                <ProjectGroup key={project} project={project} convs={convs} />
              ))
          : byDate.length === 0
            ? <div className="claude-empty">No recent history</div>
            : byDate.map(c => <DraggableConvItem key={c.id} conv={c} />)
        }

        <ArchiveDropZone count={filteredArchive.length}>
          {filteredArchive.map(c => <DraggableConvItem key={c.id} conv={c} />)}
        </ArchiveDropZone>
      </div>
    </div>
  )
}

function matches(q: string) {
  const lq = q.toLowerCase()
  return (c: ClaudeConversation) =>
    c.title.toLowerCase().includes(lq) || c.project.toLowerCase().includes(lq)
}
