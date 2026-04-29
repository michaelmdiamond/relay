import { useEffect, useRef, useState } from 'react'
import type { Conversation } from '../../../shared/types'
import { useChatStore } from '../store/chat'

interface Props {
  onNew: () => void
}

export function Sidebar({ onNew }: Props) {
  const { conversations, activeId, setActiveId, removeConversation } = useChatStore()
  const [openAIEmail, setOpenAIEmail] = useState<string | null>(null)
  const [connectingOpenAI, setConnectingOpenAI] = useState(false)
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [geminiKeyOpen, setGeminiKeyOpen] = useState(false)
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [geminiKeyError, setGeminiKeyError] = useState('')
  const geminiInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getOpenAIAuthStatus().then(({ connected, email }) => {
      setOpenAIEmail(connected ? (email ?? 'Connected') : null)
    })
    window.api.getGeminiKeyStatus().then(({ configured }) => {
      setGeminiConfigured(configured)
    })
  }, [])

  useEffect(() => {
    if (geminiKeyOpen) geminiInputRef.current?.focus()
  }, [geminiKeyOpen])

  async function handleConnectOpenAI() {
    setConnectingOpenAI(true)
    try {
      await window.api.startOpenAILogin()
      const { connected, email } = await window.api.getOpenAIAuthStatus()
      setOpenAIEmail(connected ? (email ?? 'Connected') : null)
    } finally {
      setConnectingOpenAI(false)
    }
  }

  async function handleDisconnectOpenAI() {
    await window.api.disconnectOpenAI()
    setOpenAIEmail(null)
  }

  async function handleSaveGeminiKey() {
    const trimmed = geminiKeyInput.trim()
    if (!trimmed.startsWith('AIza')) {
      setGeminiKeyError('Key should start with AIza')
      return
    }
    await window.api.setGeminiKey(trimmed)
    setGeminiConfigured(true)
    setGeminiKeyOpen(false)
    setGeminiKeyInput('')
    setGeminiKeyError('')
  }

  async function handleDisconnectGemini() {
    await window.api.disconnectGemini()
    setGeminiConfigured(false)
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

      {/* Provider connection footer */}
      <div style={{
        padding: '8px 12px 12px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {/* OpenAI */}
        {openAIEmail ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {openAIEmail}
              </span>
            </div>
            <button onClick={handleDisconnectOpenAI} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
              Disconnect OpenAI
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectOpenAI}
            disabled={connectingOpenAI}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 7,
              border: '1px solid rgba(245,158,11,0.25)', background: 'rgba(245,158,11,0.08)',
              color: connectingOpenAI ? 'rgba(255,255,255,0.3)' : 'rgba(245,158,11,0.8)',
              fontSize: 12, cursor: connectingOpenAI ? 'default' : 'pointer', textAlign: 'left',
            }}
          >
            {connectingOpenAI ? 'Opening browser…' : 'Connect OpenAI (Codex)'}
          </button>
        )}

        {/* Gemini */}
        {geminiConfigured ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                Gemini connected
              </span>
            </div>
            <button onClick={handleDisconnectGemini} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
              Disconnect Gemini
            </button>
          </div>
        ) : geminiKeyOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input
              ref={geminiInputRef}
              type="password"
              value={geminiKeyInput}
              onChange={e => { setGeminiKeyInput(e.target.value); setGeminiKeyError('') }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSaveGeminiKey()
                if (e.key === 'Escape') { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') }
              }}
              placeholder="AIza..."
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                border: `1px solid ${geminiKeyError ? 'rgba(248,113,113,0.5)' : 'rgba(52,211,153,0.3)'}`,
                background: 'rgba(52,211,153,0.05)',
                color: '#fff',
                fontSize: 12,
                outline: 'none',
                fontFamily: 'monospace',
              }}
            />
            {geminiKeyError && <p style={{ margin: 0, color: '#f87171', fontSize: 11 }}>{geminiKeyError}</p>}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={handleSaveGeminiKey}
                disabled={!geminiKeyInput.trim()}
                style={{
                  flex: 1, padding: '5px', borderRadius: 6, border: 'none',
                  background: geminiKeyInput.trim() ? 'rgba(52,211,153,0.7)' : 'rgba(255,255,255,0.08)',
                  color: geminiKeyInput.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                  fontSize: 11, fontWeight: 600, cursor: geminiKeyInput.trim() ? 'pointer' : 'default',
                }}
              >
                Save
              </button>
              <button
                onClick={() => { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') }}
                style={{
                  padding: '5px 8px', borderRadius: 6, border: 'none',
                  background: 'rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setGeminiKeyOpen(true)}
            style={{
              width: '100%', padding: '6px 10px', borderRadius: 7,
              border: '1px solid rgba(52,211,153,0.25)', background: 'rgba(52,211,153,0.08)',
              color: 'rgba(52,211,153,0.8)',
              fontSize: 12, cursor: 'pointer', textAlign: 'left',
            }}
          >
            Connect Gemini
          </button>
        )}
      </div>
    </div>
  )
}
