import { useState } from 'react'

interface Props {
  onSaved: () => void
}

export function ApiKeySetup({ onSaved }: Props) {
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [openAIStatus, setOpenAIStatus] = useState<'idle' | 'pending' | 'done'>('idle')

  async function handleSaveAnthropicKey() {
    const trimmed = key.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setError('Key should start with sk-ant-')
      return
    }
    setSaving(true)
    await window.api.setApiKey(trimmed)
    onSaved()
  }

  async function handleConnectOpenAI() {
    setOpenAIStatus('pending')
    try {
      await window.api.startOpenAILogin()
      setOpenAIStatus('done')
    } catch {
      setOpenAIStatus('idle')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)',
      backdropFilter: 'blur(8px)',
    }}>
      <div style={{
        background: 'rgba(30,30,40,0.95)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 16,
        padding: 32,
        width: 420,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>
            Connect a model provider
          </h2>
          <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            Add at least one provider to start chatting. You can add more later.
          </p>
        </div>

        {/* Anthropic */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 16,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Anthropic</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Haiku · Sonnet · Opus</span>
          </div>
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setError('') }}
            placeholder="sk-ant-..."
            onKeyDown={e => e.key === 'Enter' && handleSaveAnthropicKey()}
            autoFocus
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.15)'}`,
              background: 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          {error && <p style={{ margin: 0, color: '#f87171', fontSize: 12 }}>{error}</p>}
          <button
            onClick={handleSaveAnthropicKey}
            disabled={!key.trim() || saving}
            style={{
              padding: '9px',
              borderRadius: 8,
              border: 'none',
              background: !key.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(96,165,250,0.8)',
              color: !key.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: !key.trim() ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save API key'}
          </button>
        </div>

        {/* OpenAI Codex */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          padding: 16,
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>OpenAI</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Codex · uses your ChatGPT subscription</span>
          </div>
          <button
            onClick={handleConnectOpenAI}
            disabled={openAIStatus === 'pending' || openAIStatus === 'done'}
            style={{
              padding: '9px',
              borderRadius: 8,
              border: `1px solid ${openAIStatus === 'done' ? 'rgba(74,222,128,0.3)' : 'transparent'}`,
              background: openAIStatus === 'done'
                ? 'rgba(74,222,128,0.2)'
                : openAIStatus === 'pending'
                  ? 'rgba(255,255,255,0.08)'
                  : 'rgba(74,222,128,0.15)',
              color: openAIStatus === 'done'
                ? '#4ade80'
                : openAIStatus === 'pending'
                  ? 'rgba(255,255,255,0.4)'
                  : 'rgba(74,222,128,0.9)',
              fontSize: 13,
              fontWeight: 600,
              cursor: openAIStatus === 'idle' ? 'pointer' : 'default',
            }}
          >
            {openAIStatus === 'done'
              ? 'Connected'
              : openAIStatus === 'pending'
                ? 'Opening browser…'
                : 'Sign in with ChatGPT'}
          </button>
          {openAIStatus === 'done' && (
            <button
              onClick={onSaved}
              style={{
                padding: '9px',
                borderRadius: 8,
                border: 'none',
                background: 'rgba(96,165,250,0.8)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
