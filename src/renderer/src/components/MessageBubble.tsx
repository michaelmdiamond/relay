import { useState } from 'react'
import { RoutingBadge } from './RoutingBadge'
import type { ChatMessage } from '../../../shared/types'

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const [contextOpen, setContextOpen] = useState(false)
  const contextPacket = message.contextPacket

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
            <div style={{ color: 'rgba(255,255,255,0.35)' }}>
              <div className="working-dots">
                <span /><span /><span />
              </div>
            </div>
          )}
          {message.streaming && message.content && (
            <span style={{ opacity: 0.4, animation: 'blink 1s infinite' }}>▋</span>
          )}
        </div>

        {message.role === 'assistant' && message.routing && !message.streaming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <RoutingBadge routing={message.routing} />
            {message.usage && (
              <span style={{
                marginTop: 6,
                fontSize: 11,
                color: 'rgba(255,255,255,0.45)',
              }}>
                {formatCount(message.usage.totalTokens)} tokens
                {' '}
                ({formatCount(message.usage.inputTokens)} in / {formatCount(message.usage.outputTokens)} out)
              </span>
            )}
            {message.requestDiagnostics && (
              <span style={{
                marginTop: 6,
                fontSize: 11,
                color: 'rgba(255,255,255,0.38)',
              }}>
                {message.requestDiagnostics.sentMessageCount}/{message.requestDiagnostics.originalMessageCount} msgs
                {message.requestDiagnostics.usedMemorySummary ? ' · summary' : ''}
                {message.requestDiagnostics.usedPreviousResponseId ? ' · linked' : ''}
                {message.requestDiagnostics.contextPacketTokenEstimate ? ` · ~${formatCount(message.requestDiagnostics.contextPacketTokenEstimate)} context tokens` : ''}
              </span>
            )}
            {contextPacket && (
              <button
                type="button"
                onClick={() => setContextOpen(open => !open)}
                style={{
                  marginTop: 6,
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 999,
                  background: contextOpen ? 'rgba(96,165,250,0.14)' : 'rgba(255,255,255,0.04)',
                  color: contextOpen ? '#bfdbfe' : 'rgba(255,255,255,0.42)',
                  fontSize: 11,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                Context packet
              </button>
            )}
          </div>
        )}
        {contextPacket && contextOpen && (
          <div style={{
            marginTop: 8,
            padding: 10,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(0,0,0,0.18)',
            color: 'rgba(255,255,255,0.58)',
            fontSize: 11,
            lineHeight: 1.45,
            display: 'grid',
            gap: 8,
          }}>
            <div style={{ color: '#e2e8f0', fontWeight: 700 }}>{contextPacket.taskBrief}</div>
            <div>
              {formatCount(contextPacket.tokenEstimate)} estimated tokens · {contextPacket.relevantMessages.length} messages · {contextPacket.files.length} files · {contextPacket.attachments.length} attachments
            </div>
            {contextPacket.conversationSummary && (
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.72)' }}>Summary: </strong>
                {contextPacket.conversationSummary.slice(0, 360)}
                {contextPacket.conversationSummary.length > 360 ? '...' : ''}
              </div>
            )}
            {contextPacket.files.length > 0 && (
              <div style={{ display: 'grid', gap: 4 }}>
                <strong style={{ color: 'rgba(255,255,255,0.72)' }}>Files</strong>
                {contextPacket.files.map(file => (
                  <div key={file.path}>
                    {file.included ? 'Included' : 'Skipped'} {file.path} ({formatCount(file.tokenEstimate)} tokens)
                  </div>
                ))}
              </div>
            )}
            {contextPacket.pinnedFacts.length > 0 && (
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.72)' }}>Pinned: </strong>
                {contextPacket.pinnedFacts.join(' · ')}
              </div>
            )}
            {contextPacket.decisions.length > 0 && (
              <div>
                <strong style={{ color: 'rgba(255,255,255,0.72)' }}>Decisions: </strong>
                {contextPacket.decisions.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
