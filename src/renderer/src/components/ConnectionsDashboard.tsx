import { useEffect, useRef, useState } from 'react'
import type { ConnectorProviderSnapshot, SkillEntry } from '../../../shared/types'

// ── Provider config ───────────────────────────────────────────────

interface ProviderConfig {
  id: string
  label: string
  accent: string        // border + dot color
  accentDim: string     // faint card background tint
  connectorKey: string | null
  skillKey: 'claude' | 'codex' | null
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'claude',  label: 'Claude',       accent: 'rgba(255,196,122,0.85)', accentDim: 'rgba(255,196,122,0.06)', connectorKey: 'claude', skillKey: 'claude' },
  { id: 'openai',  label: 'OpenAI Codex', accent: 'rgba(92,200,122,0.85)',  accentDim: 'rgba(92,200,122,0.06)',  connectorKey: 'codex',  skillKey: 'codex' },
  { id: 'gemini',  label: 'Gemini',       accent: 'rgba(125,184,255,0.85)', accentDim: 'rgba(125,184,255,0.06)', connectorKey: 'gemini', skillKey: null },
  { id: 'ollama',  label: 'Ollama',       accent: 'rgba(111,212,255,0.85)', accentDim: 'rgba(111,212,255,0.06)', connectorKey: null,     skillKey: null },
  { id: 'cursor',  label: 'Cursor',       accent: 'rgba(244,114,182,0.85)', accentDim: 'rgba(244,114,182,0.06)', connectorKey: 'cursor', skillKey: null },
]

// ── Sub-components ────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
      {children}
    </div>
  )
}

function ConnectorsBlock({ snapshot }: { snapshot: ConnectorProviderSnapshot | undefined }) {
  if (!snapshot || snapshot.items.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <SectionLabel>Connectors · {snapshot.items.length}</SectionLabel>
      {snapshot.items.map((item) => (
        <div key={item.id} className="relay-plugin-item" style={{ padding: '6px 8px' }}>
          <span className={`relay-plugin-item__status relay-plugin-item__status--${item.status}`} />
          <span className="relay-plugin-item__body">
            <span className="relay-plugin-item__name" style={{ fontSize: 11 }}>{item.name}</span>
            {item.detail && <span className="relay-plugin-item__detail">{item.detail}</span>}
          </span>
          <span className={`relay-plugin-item__tag relay-plugin-item__tag--${item.status}`}>{item.status}</span>
        </div>
      ))}
    </div>
  )
}

function SkillsBlock({ skills }: { skills: SkillEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  if (skills.length === 0) return null
  const LIMIT = 4
  const visible = expanded ? skills : skills.slice(0, LIMIT)
  const hidden = skills.length - LIMIT
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <SectionLabel>Skills · {skills.length}</SectionLabel>
      {visible.map((skill) => (
        <div key={skill.id} style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 7,
          padding: '5px 8px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.035)',
        }}>
          <code style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
            /{skill.name}
          </code>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {skill.description.slice(0, 80)}
          </span>
        </div>
      ))}
      {!expanded && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.36)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '2px 8px' }}
        >
          +{hidden} more skills
        </button>
      )}
    </div>
  )
}

function CardDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '2px 0' }} />
}

function ProviderCard({
  config,
  connected,
  statusLabel,
  children,
}: {
  config: ProviderConfig
  connected: boolean
  statusLabel: string
  children?: React.ReactNode
}) {
  return (
    <div style={{
      borderRadius: 16,
      border: '1px solid rgba(255,255,255,0.08)',
      borderTop: `2px solid ${connected ? config.accent : 'rgba(255,255,255,0.1)'}`,
      background: connected
        ? `radial-gradient(circle at top right, ${config.accentDim}, transparent 60%), rgba(255,255,255,0.035)`
        : 'rgba(255,255,255,0.025)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      padding: '14px 14px 16px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: connected ? config.accent : 'rgba(255,255,255,0.22)',
          flexShrink: 0,
          boxShadow: connected ? `0 0 6px ${config.accent}` : 'none',
        }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.94)', flex: 1 }}>{config.label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.38)' }}>{statusLabel}</span>
      </div>

      {children && <>{children}</>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function ConnectionsDashboard() {
  const [anthropicConfigured, setAnthropicConfigured] = useState(false)
  const [connectorSnapshots, setConnectorSnapshots] = useState<ConnectorProviderSnapshot[]>([])
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [scannedAt, setScannedAt] = useState<string | null>(null)

  const [openAIEmail, setOpenAIEmail] = useState<string | null>(null)
  const [connectingOpenAI, setConnectingOpenAI] = useState(false)

  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [geminiKeyOpen, setGeminiKeyOpen] = useState(false)
  const [geminiKeyInput, setGeminiKeyInput] = useState('')
  const [geminiKeyError, setGeminiKeyError] = useState('')

  const [cursorConfigured, setCursorConfigured] = useState(false)
  const [cursorLabel, setCursorLabel] = useState<string | null>(null)
  const [cursorKeyOpen, setCursorKeyOpen] = useState(false)
  const [cursorKeyInput, setCursorKeyInput] = useState('')
  const [cursorKeyError, setCursorKeyError] = useState('')

  const [ollamaModel, setOllamaModel] = useState<string | null>(null)
  const [ollamaReachable, setOllamaReachable] = useState(false)
  const [ollamaPhase, setOllamaPhase] = useState<'idle' | 'loading' | 'picking' | 'error'>('idle')
  const [ollamaAvailable, setOllamaAvailable] = useState<string[]>([])
  const [ollamaSetupError, setOllamaSetupError] = useState('')

  const geminiInputRef = useRef<HTMLInputElement>(null)
  const cursorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void refreshConnections() }, [])
  useEffect(() => { if (geminiKeyOpen) geminiInputRef.current?.focus() }, [geminiKeyOpen])
  useEffect(() => { if (cursorKeyOpen) cursorInputRef.current?.focus() }, [cursorKeyOpen])

  useEffect(() => {
    if (!ollamaModel) return
    let cancelled = false
    const check = () => { window.api.checkOllamaReachable().then((r) => { if (!cancelled) setOllamaReachable(r) }) }
    check()
    const id = setInterval(check, 3000)
    return () => { cancelled = true; clearInterval(id) }
  }, [ollamaModel])

  async function refreshConnections() {
    const [anthropic, openAI, gemini, ollama, cursor, inventory, skillList] = await Promise.all([
      window.api.getApiKeyStatus(),
      window.api.getOpenAIAuthStatus(),
      window.api.getGeminiKeyStatus(),
      window.api.getOllamaStatus(),
      window.api.getCursorKeyStatus(),
      window.api.getConnectorInventory(),
      window.api.getSkills(),
    ])
    setAnthropicConfigured(anthropic.configured)
    setOpenAIEmail(openAI.connected ? (openAI.email ?? 'Connected') : null)
    setGeminiConfigured(gemini.configured)
    setCursorConfigured(cursor.configured)
    setCursorLabel(cursor.userEmail ?? cursor.apiKeyName ?? (cursor.configured ? 'Cursor connected' : null))
    setOllamaModel(ollama.configured && ollama.model ? ollama.model : null)
    setConnectorSnapshots(inventory.providers)
    setScannedAt(inventory.scannedAt)
    setSkills(skillList)
  }

  async function handleConnectOpenAI() {
    setConnectingOpenAI(true)
    try { await window.api.startOpenAILogin(); await refreshConnections() }
    finally { setConnectingOpenAI(false) }
  }

  async function handleDisconnectOpenAI() { await window.api.disconnectOpenAI(); await refreshConnections() }

  async function handleSaveGeminiKey() {
    const trimmed = geminiKeyInput.trim()
    if (!trimmed.startsWith('AIza')) { setGeminiKeyError('Key should start with AIza'); return }
    await window.api.setGeminiKey(trimmed)
    setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('')
    await refreshConnections()
  }

  async function handleDisconnectGemini() { await window.api.disconnectGemini(); await refreshConnections() }

  async function handleSaveCursorKey() {
    const trimmed = cursorKeyInput.trim()
    if (!trimmed) { setCursorKeyError('Enter a Cursor API key'); return }
    try {
      await window.api.setCursorKey(trimmed)
      setCursorKeyOpen(false); setCursorKeyInput(''); setCursorKeyError('')
      await refreshConnections()
    } catch (error) {
      setCursorKeyError(error instanceof Error ? error.message : 'Could not validate Cursor key')
    }
  }

  async function handleDisconnectCursor() { await window.api.disconnectCursor(); await refreshConnections() }

  async function handleConnectOllama() {
    setOllamaPhase('loading')
    const { models, error } = await window.api.getOllamaModels()
    if (error || models.length === 0) { setOllamaSetupError(error ?? 'No models found'); setOllamaPhase('error'); return }
    setOllamaAvailable(models); setOllamaPhase('picking')
  }

  async function handlePickModel(model: string) {
    await window.api.setOllamaConfig('http://localhost:11434', model)
    setOllamaReachable(false); setOllamaPhase('idle'); await refreshConnections()
  }

  async function handleDisconnectOllama() {
    await window.api.disconnectOllama(); setOllamaReachable(false); setOllamaPhase('idle'); await refreshConnections()
  }

  function snapshot(key: string | null) {
    if (!key) return undefined
    return connectorSnapshots.find((s) => s.provider === key)
  }

  function providerSkills(key: 'claude' | 'codex' | null) {
    if (!key) return []
    return skills.filter((s) => s.provider === key)
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 20 }}>

        {/* Page header */}
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Connections
          </div>
          <h1 style={{ margin: 0, fontSize: 30, color: '#f8fafc', lineHeight: 1.1 }}>
            Model providers and tools
          </h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.56)', fontSize: 14, maxWidth: 680 }}>
            Each card shows auth status, locally detected connectors, and available skills. Type <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>/</code> in any chat to invoke a skill directly.
          </p>
        </div>

        {/* Provider grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, alignItems: 'start' }}>

          {/* ── Claude ── */}
          <ProviderCard
            config={PROVIDERS[0]}
            connected={anthropicConfigured}
            statusLabel={anthropicConfigured ? 'API key configured' : 'Not connected'}
          >
            {anthropicConfigured ? (
              <div className="relay-connection-item">
                <span className="relay-connection-item__status" style={{ background: PROVIDERS[0].accent }} />
                <span className="relay-connection-item__label">Anthropic API key</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
                Add your key in the initial setup screen.
              </div>
            )}
            <ConnectorsBlock snapshot={snapshot('claude')} />
            <SkillsBlock skills={providerSkills('claude')} />
          </ProviderCard>

          {/* ── OpenAI Codex ── */}
          <ProviderCard
            config={PROVIDERS[1]}
            connected={!!openAIEmail}
            statusLabel={openAIEmail ?? 'Not connected'}
          >
            {openAIEmail ? (
              <div className="relay-connection-item">
                <span className="relay-connection-item__status is-openai" />
                <span className="relay-connection-item__label">{openAIEmail}</span>
                <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectOpenAI()}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn" disabled={connectingOpenAI} onClick={() => void handleConnectOpenAI()}>
                {connectingOpenAI ? 'Opening browser…' : 'Connect OpenAI'}
              </button>
            )}
            <ConnectorsBlock snapshot={snapshot('codex')} />
            <SkillsBlock skills={providerSkills('codex')} />
          </ProviderCard>

          {/* ── Gemini ── */}
          <ProviderCard
            config={PROVIDERS[2]}
            connected={geminiConfigured}
            statusLabel={geminiConfigured ? 'API key configured' : 'Not connected'}
          >
            {geminiConfigured ? (
              <div className="relay-connection-item">
                <span className="relay-connection-item__status is-gemini" />
                <span className="relay-connection-item__label">Gemini connected</span>
                <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectGemini()}>
                  Disconnect
                </button>
              </div>
            ) : geminiKeyOpen ? (
              <div className="relay-inline-form">
                <input
                  ref={geminiInputRef}
                  type="password"
                  value={geminiKeyInput}
                  onChange={(e) => { setGeminiKeyInput(e.target.value); setGeminiKeyError('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveGeminiKey()
                    if (e.key === 'Escape') { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') }
                  }}
                  className="relay-inline-input"
                  placeholder="AIza…"
                />
                {geminiKeyError && <span className="relay-inline-error">{geminiKeyError}</span>}
                <div className="relay-inline-actions">
                  <button type="button" className="relay-inline-btn" onClick={() => void handleSaveGeminiKey()}>Save</button>
                  <button type="button" className="relay-inline-btn relay-inline-btn--ghost" onClick={() => { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setGeminiKeyOpen(true)}>
                Add Gemini key
              </button>
            )}
            <ConnectorsBlock snapshot={snapshot('gemini')} />
          </ProviderCard>

          {/* ── Ollama ── */}
          <ProviderCard
            config={PROVIDERS[3]}
            connected={!!ollamaModel && ollamaReachable}
            statusLabel={ollamaModel ? (ollamaReachable ? ollamaModel : `${ollamaModel} · starting`) : 'Not connected'}
          >
            {ollamaModel ? (
              <div className="relay-connection-item">
                <span className={`relay-connection-item__status${ollamaReachable ? ' is-ollama-ready' : ' is-ollama'}`} />
                <span className="relay-connection-item__label">{ollamaModel}</span>
                <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectOllama()}>
                  Disconnect
                </button>
              </div>
            ) : ollamaPhase === 'picking' ? (
              <div className="relay-inline-form">
                <span className="relay-inline-caption">Choose a model</span>
                <div className="relay-model-list">
                  {ollamaAvailable.map((model) => (
                    <button key={model} type="button" className="relay-model-chip" onClick={() => void handlePickModel(model)}>
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            ) : ollamaPhase === 'error' ? (
              <div className="relay-inline-form">
                <span className="relay-inline-error">{ollamaSetupError}</span>
                <button type="button" className="relay-inline-btn" onClick={() => setOllamaPhase('idle')}>Dismiss</button>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => void handleConnectOllama()}>
                {ollamaPhase === 'loading' ? 'Checking Ollama…' : 'Connect Ollama'}
              </button>
            )}
          </ProviderCard>

          {/* ── Cursor ── */}
          <ProviderCard
            config={PROVIDERS[4]}
            connected={cursorConfigured}
            statusLabel={cursorLabel ?? 'Not connected'}
          >
            {cursorConfigured ? (
              <div className="relay-connection-item">
                <span className="relay-connection-item__status is-cursor" />
                <span className="relay-connection-item__label">{cursorLabel}</span>
                <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectCursor()}>
                  Disconnect
                </button>
              </div>
            ) : cursorKeyOpen ? (
              <div className="relay-inline-form">
                <input
                  ref={cursorInputRef}
                  type="password"
                  value={cursorKeyInput}
                  onChange={(e) => { setCursorKeyInput(e.target.value); setCursorKeyError('') }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveCursorKey()
                    if (e.key === 'Escape') { setCursorKeyOpen(false); setCursorKeyInput(''); setCursorKeyError('') }
                  }}
                  className="relay-inline-input"
                  placeholder="Cursor API key"
                />
                {cursorKeyError && <span className="relay-inline-error">{cursorKeyError}</span>}
                <div className="relay-inline-actions">
                  <button type="button" className="relay-inline-btn" onClick={() => void handleSaveCursorKey()}>Save</button>
                  <button type="button" className="relay-inline-btn relay-inline-btn--ghost" onClick={() => { setCursorKeyOpen(false); setCursorKeyInput(''); setCursorKeyError('') }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setCursorKeyOpen(true)}>
                Add Cursor key
              </button>
            )}
            <ConnectorsBlock snapshot={snapshot('cursor')} />
          </ProviderCard>

        </div>

        {scannedAt && (
          <div className="relay-plugin-scan-note">
            Connector inventory scanned at {new Date(scannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          </div>
        )}

      </div>
    </div>
  )
}
