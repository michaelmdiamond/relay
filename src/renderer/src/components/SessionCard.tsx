import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Session, ClaudeConversation } from '../../../../../shared/types'
import { useSessionStore } from '../store/sessions'

const STATUS_ICON: Record<string, string> = {
  in_progress: '▶',
  idle: '○',
  needs_input: '◐',
  done: '✓',
}

interface Props {
  session: Session
  onClick: () => void
}

const SOURCE_LABEL: Record<string, string> = { cli: 'cli', desktop: 'claude', codex: 'codex' }

export function SessionCard({ session: s, onClick }: Props) {
  const { updateSessionStatus, setFocusedConversation } = useSessionStore()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
    data: { session: s },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const isConv = s.cardType === 'conversation'

  if (isConv) {
    const source = s.conversationSource ?? 'cli'
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`card card--${s.status} card--conv`}
        onClick={() => {
          if (s.conversationFilePath) {
            const conv: ClaudeConversation = {
              id: s.conversationId ?? s.id,
              title: s.name,
              project: s.project ?? '',
              cwd: s.cwd,
              source,
              lastTimestamp: s.lastActivity,
              messageCount: 0,
              filePath: s.conversationFilePath,
            }
            setFocusedConversation(conv)
          }
        }}
        {...attributes}
        {...listeners}
      >
        <div className="card-header">
          <span className="card-icon">◎</span>
          <span className="card-name">{s.name}</span>
          <span className={`card-badge card-badge--${source}`}>{SOURCE_LABEL[source]}</span>
        </div>
        <div className="card-project">{s.project ?? inferProject(s.cwd)}</div>
        <div className="card-footer">
          <span className="card-age">{formatAge(s.lastActivity)}</span>
          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="card-action card-action--danger"
              title="Remove from board"
              onClick={() => window.api.removeSession(s.id)}
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    )
  }

  const cwd = s.cwd.replace(/^\/Users\/[^/]+/, '~')
  const projectName = s.project ?? inferProject(s.cwd)
  const age = formatAge(s.lastActivity)

  function handleClick() {
    if (s.needsAttention) window.api.dismissAttention(s.id)
    onClick()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card card--${s.status}${s.needsAttention ? ' card--attention' : ''}`}
      onClick={handleClick}
      {...attributes}
      {...listeners}
    >
      {s.needsAttention && (
        <div className="card-attention-ring" title={s.notificationText} />
      )}
      <div className="card-header">
        <span className="card-icon">{s.needsAttention ? '◉' : STATUS_ICON[s.status]}</span>
        <span className="card-name">{s.name}</span>
        {s.managed && <span className="card-badge">managed</span>}
      </div>
      <div className="card-project">{projectName}</div>
      <div className="card-cwd">{cwd}</div>
      {(s.gitBranch || (s.listeningPorts && s.listeningPorts.length > 0)) && (
        <div className="card-meta">
          {s.gitBranch && <span className="card-git-branch">⎇ {s.gitBranch}</span>}
          {s.listeningPorts?.map(p => (
            <span key={p} className="card-port">:{p}</span>
          ))}
        </div>
      )}
      <div className="card-footer">
        <span className="card-age">{age}</span>
        <div className="card-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className="card-action"
            title="Mark done"
            onClick={() => {
              updateSessionStatus(s.id, 'done')
              window.api.updateSession(s.id, { status: 'done' })
            }}
          >
            ✓
          </button>
          <button
            className="card-action card-action--danger"
            title="Kill & remove"
            onClick={() => {
              window.api.killSession(s.id)
              window.api.removeSession(s.id)
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

function inferProject(cwd: string): string {
  const home = cwd.match(/^\/Users\/[^/]+\/(.+)/)
  if (home) {
    const parts = home[1].split('/')
    return parts[0] || '~'
  }
  return cwd.split('/').pop() || '/'
}

function formatAge(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}
