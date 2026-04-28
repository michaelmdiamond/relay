import { RoutingBadge } from './RoutingBadge'
import type { ChatMessage } from '../../../shared/types'

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
    }}>
      <div style={{ maxWidth: '75%' }}>
        <div style={{
          padding: '10px 14px',
          borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isUser ? 'rgba(96,165,250,0.25)' : 'rgba(255,255,255,0.07)',
          color: message.error ? '#f87171' : '#e2e8f0',
          fontSize: 14,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border: message.error ? '1px solid rgba(248,113,113,0.3)' : 'none',
        }}>
          {message.error ? `Error: ${message.error}` : message.content}
          {message.streaming && !message.content && (
            <span style={{ opacity: 0.4 }}>▋</span>
          )}
          {message.streaming && message.content && (
            <span style={{ opacity: 0.4, animation: 'blink 1s infinite' }}>▋</span>
          )}
        </div>

        {message.role === 'assistant' && message.routing && !message.streaming && (
          <RoutingBadge routing={message.routing} />
        )}
      </div>
    </div>
  )
}
