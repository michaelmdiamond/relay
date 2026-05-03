import { useState } from 'react'

interface Props {
  onSaved: () => void
}

export function ApiKeySetup({ onSaved }: Props) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [anthropicError, setAnthropicError] = useState('')
  const [anthropicSaving, setAnthropicSaving] = useState(false)

  const [geminiKey, setGeminiKey] = useState('')
  const [geminiError, setGeminiError] = useState('')
  const [geminiSaving, setGeminiSaving] = useState(false)

  const [cursorKey, setCursorKey] = useState('')
  const [cursorError, setCursorError] = useState('')
  const [cursorSaving, setCursorSaving] = useState(false)

  const [openAIStatus, setOpenAIStatus] = useState<'idle' | 'pending' | 'done'>('idle')

  const [ollamaUrl, setOllamaUrl] = useState('http://localhost:11434')
  const [ollamaModel, setOllamaModel] = useState('')
  const [ollamaError, setOllamaError] = useState('')
  const [ollamaSaving, setOllamaSaving] = useState(false)

  async function handleSaveAnthropicKey() {
    const trimmed = anthropicKey.trim()
    if (!trimmed.startsWith('sk-ant-')) {
      setAnthropicError('Key should start with sk-ant-')
      return
    }
    setAnthropicSaving(true)
    await window.api.setApiKey(trimmed)
    onSaved()
  }

  async function handleSaveGeminiKey() {
    const trimmed = geminiKey.trim()
    if (!trimmed.startsWith('AIza')) {
      setGeminiError('Key should start with AIza')
      return
    }
    setGeminiSaving(true)
    await window.api.setGeminiKey(trimmed)
    onSaved()
  }

  async function handleSaveCursorKey() {
    const trimmed = cursorKey.trim()
    if (!trimmed) {
      setCursorError('Enter a Cursor API key')
      return
    }
    setCursorSaving(true)
    try {
      await window.api.setCursorKey(trimmed)
      onSaved()
    } catch (error) {
      setCursorSaving(false)
      setCursorError(error instanceof Error ? error.message : 'Could not save Cursor key')
    }
  }

  async function handleSaveOllama() {
    const model = ollamaModel.trim()
    if (!model) {
      setOllamaError('Enter a model name (e.g. llama3.2)')
      return
    }
    setOllamaSaving(true)
    await window.api.setOllamaConfig(ollamaUrl.trim() || 'http://localhost:11434', model)
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

  const inputStyle = (error: string): React.CSSProperties => ({
    padding: '10px 12px',
    borderRadius: 8,
    border: `1px solid ${error ? 'rgba(248,113,113,0.5)' : 'rgba(255,255,255,0.15)'}`,
    background: 'rgba(255,255,255,0.05)',
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    fontFamily: 'monospace',
  })

  const cardStyle: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: 16,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.03)',
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
        maxHeight: 'calc(100vh - 64px)',
        overflowY: 'auto',
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
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Anthropic</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Haiku · Sonnet · Opus</span>
          </div>
          <input
            type="password"
            value={anthropicKey}
            onChange={e => { setAnthropicKey(e.target.value); setAnthropicError('') }}
            placeholder="sk-ant-..."
            onKeyDown={e => e.key === 'Enter' && handleSaveAnthropicKey()}
            autoFocus
            style={inputStyle(anthropicError)}
          />
          {anthropicError && <p style={{ margin: 0, color: '#f87171', fontSize: 12 }}>{anthropicError}</p>}
          <button
            onClick={handleSaveAnthropicKey}
            disabled={!anthropicKey.trim() || anthropicSaving}
            style={{
              padding: '9px',
              borderRadius: 8,
              border: 'none',
              background: !anthropicKey.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(96,165,250,0.8)',
              color: !anthropicKey.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: !anthropicKey.trim() ? 'default' : 'pointer',
            }}
          >
            {anthropicSaving ? 'Saving…' : 'Save API key'}
          </button>
        </div>

        {/* OpenAI Codex */}
        <div style={cardStyle}>
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
                padding: '9px', borderRadius: 8, border: 'none',
                background: 'rgba(96,165,250,0.8)', color: '#fff',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Continue
            </button>
          )}
        </div>

        {/* Ollama (local) */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Ollama</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>local models · no API key needed</span>
          </div>
          <input
            type="text"
            value={ollamaUrl}
            onChange={e => setOllamaUrl(e.target.value)}
            placeholder="http://localhost:11434"
            style={inputStyle('')}
          />
          <input
            type="text"
            value={ollamaModel}
            onChange={e => { setOllamaModel(e.target.value); setOllamaError('') }}
            placeholder="llama3.2"
            onKeyDown={e => e.key === 'Enter' && handleSaveOllama()}
            style={inputStyle(ollamaError)}
          />
          {ollamaError && <p style={{ margin: 0, color: '#f87171', fontSize: 12 }}>{ollamaError}</p>}
          <button
            onClick={handleSaveOllama}
            disabled={!ollamaModel.trim() || ollamaSaving}
            style={{
              padding: '9px', borderRadius: 8, border: 'none',
              background: !ollamaModel.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(167,139,250,0.8)',
              color: !ollamaModel.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: !ollamaModel.trim() ? 'default' : 'pointer',
            }}
          >
            {ollamaSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {/* Cursor SDK */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Cursor</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>SDK agents · billed by Cursor</span>
          </div>
          <input
            type="password"
            value={cursorKey}
            onChange={e => { setCursorKey(e.target.value); setCursorError('') }}
            placeholder="Cursor API key"
            onKeyDown={e => e.key === 'Enter' && handleSaveCursorKey()}
            style={inputStyle(cursorError)}
          />
          {cursorError && <p style={{ margin: 0, color: '#f87171', fontSize: 12 }}>{cursorError}</p>}
          <button
            onClick={handleSaveCursorKey}
            disabled={!cursorKey.trim() || cursorSaving}
            style={{
              padding: '9px', borderRadius: 8, border: 'none',
              background: !cursorKey.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(244,114,182,0.78)',
              color: !cursorKey.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13, fontWeight: 600,
              cursor: !cursorKey.trim() ? 'default' : 'pointer',
            }}
          >
            {cursorSaving ? 'Saving…' : 'Save API key'}
          </button>
        </div>

        {/* Google Gemini */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Google</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
              Gemini 2.5 Pro ·{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'rgba(52,211,153,0.7)', textDecoration: 'none' }}
              >
                Get free key at aistudio.google.com
              </a>
            </span>
          </div>
          <input
            type="password"
            value={geminiKey}
            onChange={e => { setGeminiKey(e.target.value); setGeminiError('') }}
            placeholder="AIza..."
            onKeyDown={e => e.key === 'Enter' && handleSaveGeminiKey()}
            style={inputStyle(geminiError)}
          />
          {geminiError && <p style={{ margin: 0, color: '#f87171', fontSize: 12 }}>{geminiError}</p>}
          <button
            onClick={handleSaveGeminiKey}
            disabled={!geminiKey.trim() || geminiSaving}
            style={{
              padding: '9px',
              borderRadius: 8,
              border: 'none',
              background: !geminiKey.trim() ? 'rgba(255,255,255,0.08)' : 'rgba(52,211,153,0.8)',
              color: !geminiKey.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: !geminiKey.trim() ? 'default' : 'pointer',
            }}
          >
            {geminiSaving ? 'Saving…' : 'Save API key'}
          </button>
        </div>
      </div>
    </div>
  )
}
