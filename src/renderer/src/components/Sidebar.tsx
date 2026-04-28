import { useEffect, useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useChatStore } from '../store/chat'

interface Props {
  onNew: () => void
}

export function Sidebar({ onNew }: Props) {
  const { conversations, activeId, setActiveId, removeConversation } = useChatStore()
  const [openAIEmail, setOpenAIEmail] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    window.api.getOpenAIAuthStatus().then(({ connected, email }) => {
      setOpenAIEmail(connected ? (email ?? 'Connected') : null)
    })
  }, [])

  async function handleConnectOpenAI() {
    setConnecting(true)
    try {
      await window.api.startOpenAILogin()
      const { connected, email } = await window.api.getOpenAIAuthStatus()
      setOpenAIEmail(connected ? (email ?? 'Connected') : null)
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnectOpenAI() {
    await window.api.disconnectOpenAI()
    setOpenAIEmail(null)
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    await window.api.deleteConversation(id)
    removeConversation(id)
  }

  return (
    <div style={{
      width: 220,
      borderRight: '1px solid rgba(255,255,255,0.06)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(0,0,0,0.15)',
    }}>
      <div style={{
        padding: '52px 12px 8px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <button
          onClick={onNew}
          style={{
            width: '100%',
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: 'rgba(255,255,255,0.7)',
            fontSize: 13,
            cursor: 'pointer',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          New conversation
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', minHeight: 0 }}>
        {conversations.map((conv: Conversation) => (
          <div
            key={conv.id}
            onClick={() => setActiveId(conv.id)}
            style={{
              padding: '7px 10px',
              borderRadius: 7,
              cursor: 'pointer',
              background: conv.id === activeId ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: conv.id === activeId ? '#fff' : 'rgba(255,255,255,0.55)',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 4,
              marginBottom: 1,
              transition: 'background 0.1s',
            }}
          >
            <span style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}>
              {conv.title}
            </span>
            <button
              onClick={(e) => handleDelete(e, conv.id)}
              style={{
                flexShrink: 0,
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.25)',
                cursor: 'pointer',
                fontSize: 13,
                padding: '0 2px',
                lineHeight: 1,
                borderRadius: 3,
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* OpenAI connection footer */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        {openAIEmail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {openAIEmail}
              </span>
            </div>
            <button
              onClick={handleDisconnectOpenAI}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.25)',
                fontSize: 11,
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0,
              }}
            >
              Disconnect OpenAI
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectOpenAI}
            disabled={connecting}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: 7,
              border: '1px solid rgba(245,158,11,0.25)',
              background: 'rgba(245,158,11,0.08)',
              color: connecting ? 'rgba(255,255,255,0.3)' : 'rgba(245,158,11,0.8)',
              fontSize: 12,
              cursor: connecting ? 'default' : 'pointer',
              textAlign: 'left',
            }}
          >
            {connecting ? 'Opening browser…' : 'Connect OpenAI (Codex)'}
          </button>
        )}
      </div>
    </div>
  )
}
