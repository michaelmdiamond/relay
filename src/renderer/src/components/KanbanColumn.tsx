import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { Session } from '../../../../../shared/types'
import { SessionCard } from './SessionCard'

interface Props {
  id: string
  title: string
  sessions: Session[]
  onCardClick: (session: Session) => void
}

export function KanbanColumn({ id, title, sessions, onCardClick }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const attentionCount = sessions.filter(s => s.needsAttention).length

  return (
    <div className={`column ${isOver ? 'column--over' : ''}`}>
      <div className="column-header">
        <span className="column-title">{title}</span>
        {attentionCount > 0 && (
          <span className="column-attention-badge">{attentionCount}</span>
        )}
        <span className="column-count">{sessions.length}</span>
      </div>
      <div ref={setNodeRef} className="column-body">
        <SortableContext items={sessions.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} onClick={() => onCardClick(s)} />
          ))}
        </SortableContext>
        {sessions.length === 0 && (
          <div className="column-empty">Drop here</div>
        )}
      </div>
    </div>
  )
}
