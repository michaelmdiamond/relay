import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessions'
import type { ClaudeMessage } from '../../../../../shared/types'

function relativeTime(iso: string): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function TranscriptView() {
  const { activeConversation } = useSessionStore()
  const [messages, setMessages] = useState<ClaudeMessage[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!activeConversation) return
    setMessages([])
    setLoading(true)
    window.api.getClaudeMessages(activeConversation.filePath).then(msgs => {
      setMessages(msgs)
      setLoading(false)
    })
  }, [activeConversation?.id])

  if (!activeConversation) return null

  return (
    <div className="transcript-view">
      <div className="transcript-header">
        <div className="transcript-title" title={activeConversation.title}>
          {activeConversation.title}
        </div>
        <div className="transcript-meta">
          {activeConversation.project} · {relativeTime(activeConversation.lastTimestamp)}
        </div>
      </div>
      <div className="claude-messages">
        {loading && <div className="claude-loading">Loading…</div>}
        {messages.map(msg => (
          <div key={msg.uuid} className={`claude-msg claude-msg--${msg.role}`}>
            <div className="claude-msg-label">{msg.role === 'user' ? 'You' : 'Claude'}</div>
            <div className="claude-msg-content">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
