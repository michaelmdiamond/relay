import { useEffect, useRef, useState } from 'react'
import { CODEX_MODELS } from '../../../shared/types'
import type { ConnectorProviderSnapshot, SkillEntry } from '../../../shared/types'

// ── Provider config ───────────────────────────────────────────────

interface ProviderConfig {
  id: string
  label: string
  accent: string
  accentDim: string
  connectorKey: string | null
  skillKey: 'claude' | 'codex' | null
  staticModels: string[]   // known models, shown even when disconnected
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'claude',  label: 'Claude',       accent: 'rgba(255,196,122,0.85)', accentDim: 'rgba(255,196,122,0.07)', connectorKey: 'claude', skillKey: 'claude', staticModels: ['Haiku', 'Sonnet', 'Opus'] },
  { id: 'openai',  label: 'OpenAI Codex', accent: 'rgba(92,200,122,0.85)',  accentDim: 'rgba(92,200,122,0.07)',  connectorKey: 'codex',  skillKey: 'codex',  staticModels: [...CODEX_MODELS] },
  { id: 'gemini',  label: 'Gemini',       accent: 'rgba(125,184,255,0.85)', accentDim: 'rgba(125,184,255,0.07)', connectorKey: 'gemini', skillKey: null,      staticModels: ['2.5 Pro', 'Flash', 'Flash-Lite'] },
  { id: 'ollama',  label: 'Ollama',       accent: 'rgba(111,212,255,0.85)', accentDim: 'rgba(111,212,255,0.07)', connectorKey: null,     skillKey: null,      staticModels: [] },
  { id: 'cursor',  label: 'Cursor',       accent: 'rgba(244,114,182,0.85)', accentDim: 'rgba(244,114,182,0.07)', connectorKey: 'cursor', skillKey: null,      staticModels: ['Composer', 'SDK models'] },
]

// ── Sidebar item ──────────────────────────────────────────────────

function SidebarItem({
  config,
  connected,
  models,
  selected,
  onClick,
}: {
  config: ProviderConfig
  connected: boolean
  models: string[]
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        background: selected ? 'rgba(255,255,255,0.08)' : 'transparent',
        border: 'none',
        borderLeft: selected ? `2px solid ${config.accent}` : '2px solid transparent',
        borderRadius: selected ? '0 10px 10px 0' : '0 10px 10px 0',
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'background 100ms, border-color 100ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: models.length ? 4 : 0 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: connected ? config.accent : 'rgba(255,255,255,0.2)',
          boxShadow: connected ? `0 0 5px ${config.accent}` : 'none',
          transition: 'background 200ms',
        }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: selected ? '#f8fafc' : 'rgba(255,255,255,0.72)' }}>
          {config.label}
        </span>
      </div>
      {models.length > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.36)', paddingLeft: 13, lineHeight: 1.6 }}>
          {models.join(' · ')}
        </div>
      )}
    </button>
  )
}

// ── Right panel sub-components ────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function ModelChips({ models }: { models: string[] }) {
  if (!models.length) return null
  return (
    <div>
      <SectionLabel>Models</SectionLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {models.map((m) => (
          <span key={m} style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(255,255,255,0.72)',
          }}>
            {m}
          </span>
        ))}
      </div>
    </div>
  )
}

function ConnectorsBlock({ snapshot }: { snapshot: ConnectorProviderSnapshot | undefined }) {
  if (!snapshot || snapshot.items.length === 0) return null
  return (
    <div>
      <SectionLabel>Connectors · {snapshot.items.length}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
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
    </div>
  )
}

function SkillsBlock({ skills }: { skills: SkillEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  if (!skills.length) return null
  const LIMIT = 5
  const visible = expanded ? skills : skills.slice(0, LIMIT)
  const hidden = skills.length - LIMIT
  return (
    <div>
      <SectionLabel>Skills · {skills.length} — type / in chat to invoke</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {visible.map((skill) => (
          <div key={skill.id} style={{
            display: 'flex', alignItems: 'baseline', gap: 8,
            padding: '5px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.035)',
          }}>
            <code style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)', background: 'rgba(255,255,255,0.06)', padding: '1px 4px', borderRadius: 3, flexShrink: 0 }}>
              /{skill.name}
            </code>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {skill.description.slice(0, 100)}
            </span>
          </div>
        ))}
        {!expanded && hidden > 0 && (
          <button type="button" onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.32)', fontSize: 11, cursor: 'pointer', textAlign: 'left', padding: '3px 8px' }}>
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────

export function ConnectionsDashboard() {
  const [selectedId, setSelectedId] = useState('claude')

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
    } catch (e) { setCursorKeyError(e instanceof Error ? e.message : 'Could not validate key') }
  }
  async function handleDisconnectCursor() { await window.api.disconnectCursor(); await refreshConnections() }

  async function handleConnectOllama() {
    setOllamaPhase('loading')
    const { models, error } = await window.api.getOllamaModels()
    if (error || !models.length) { setOllamaSetupError(error ?? 'No models found'); setOllamaPhase('error'); return }
    setOllamaAvailable(models); setOllamaPhase('picking')
  }
  async function handlePickModel(model: string) {
    await window.api.setOllamaConfig('http://localhost:11434', model)
    setOllamaReachable(false); setOllamaPhase('idle'); await refreshConnections()
  }
  async function handleDisconnectOllama() {
    await window.api.disconnectOllama(); setOllamaReachable(false); setOllamaPhase('idle'); await refreshConnections()
  }

  // ── Derived helpers ───────────────────────────────────────────

  function isConnected(id: string) {
    if (id === 'claude')  return anthropicConfigured
    if (id === 'openai')  return !!openAIEmail
    if (id === 'gemini')  return geminiConfigured
    if (id === 'ollama')  return !!ollamaModel
    if (id === 'cursor')  return cursorConfigured
    return false
  }

  function sidebarModels(cfg: ProviderConfig): string[] {
    if (cfg.id === 'ollama') return ollamaModel ? [ollamaModel] : ['any local model']
    return cfg.staticModels
  }

  function snapshot(key: string | null) {
    if (!key) return undefined
    return connectorSnapshots.find((s) => s.provider === key)
  }

  function providerSkills(key: 'claude' | 'codex' | null) {
    if (!key) return []
    return skills.filter((s) => s.provider === key)
  }

  const selected = PROVIDERS.find((p) => p.id === selectedId) ?? PROVIDERS[0]

  // ── Auth controls per provider (right panel) ──────────────────

  function renderAuth() {
    switch (selectedId) {
      case 'claude':
        return anthropicConfigured ? (
          <div className="relay-connection-item">
            <span className="relay-connection-item__status" style={{ background: selected.accent }} />
            <span className="relay-connection-item__label">Anthropic API key configured</span>
          </div>
        ) : (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
            Add your Anthropic API key in the initial setup screen (accessible from the top toolbar).
          </p>
        )

      case 'openai':
        return openAIEmail ? (
          <div className="relay-connection-item">
            <span className="relay-connection-item__status is-openai" />
            <span className="relay-connection-item__label">{openAIEmail}</span>
            <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectOpenAI()}>Disconnect</button>
          </div>
        ) : (
          <button type="button" className="relay-connect-btn" disabled={connectingOpenAI} onClick={() => void handleConnectOpenAI()}>
            {connectingOpenAI ? 'Opening browser…' : 'Connect OpenAI'}
          </button>
        )

      case 'gemini':
        return geminiConfigured ? (
          <div className="relay-connection-item">
            <span className="relay-connection-item__status is-gemini" />
            <span className="relay-connection-item__label">Gemini connected</span>
            <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectGemini()}>Disconnect</button>
          </div>
        ) : geminiKeyOpen ? (
          <div className="relay-inline-form">
            <input ref={geminiInputRef} type="password" value={geminiKeyInput} onChange={(e) => { setGeminiKeyInput(e.target.value); setGeminiKeyError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveGeminiKey(); if (e.key === 'Escape') { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') } }}
              className="relay-inline-input" placeholder="AIza…" />
            {geminiKeyError && <span className="relay-inline-error">{geminiKeyError}</span>}
            <div className="relay-inline-actions">
              <button type="button" className="relay-inline-btn" onClick={() => void handleSaveGeminiKey()}>Save</button>
              <button type="button" className="relay-inline-btn relay-inline-btn--ghost" onClick={() => { setGeminiKeyOpen(false); setGeminiKeyInput(''); setGeminiKeyError('') }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setGeminiKeyOpen(true)}>Add Gemini key</button>
        )

      case 'ollama':
        return ollamaModel ? (
          <div className="relay-connection-item">
            <span className={`relay-connection-item__status${ollamaReachable ? ' is-ollama-ready' : ' is-ollama'}`} />
            <span className="relay-connection-item__label">{ollamaReachable ? ollamaModel : `${ollamaModel} · starting…`}</span>
            <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectOllama()}>Disconnect</button>
          </div>
        ) : ollamaPhase === 'picking' ? (
          <div className="relay-inline-form">
            <span className="relay-inline-caption">Choose a model</span>
            <div className="relay-model-list">
              {ollamaAvailable.map((m) => <button key={m} type="button" className="relay-model-chip" onClick={() => void handlePickModel(m)}>{m}</button>)}
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
        )

      case 'cursor':
        return cursorConfigured ? (
          <div className="relay-connection-item">
            <span className="relay-connection-item__status is-cursor" />
            <span className="relay-connection-item__label">{cursorLabel}</span>
            <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectCursor()}>Disconnect</button>
          </div>
        ) : cursorKeyOpen ? (
          <div className="relay-inline-form">
            <input ref={cursorInputRef} type="password" value={cursorKeyInput} onChange={(e) => { setCursorKeyInput(e.target.value); setCursorKeyError('') }}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSaveCursorKey(); if (e.key === 'Escape') { setCursorKeyOpen(false); setCursorKeyInput(''); setCursorKeyError('') } }}
              className="relay-inline-input" placeholder="Cursor API key" />
            {cursorKeyError && <span className="relay-inline-error">{cursorKeyError}</span>}
            <div className="relay-inline-actions">
              <button type="button" className="relay-inline-btn" onClick={() => void handleSaveCursorKey()}>Save</button>
              <button type="button" className="relay-inline-btn relay-inline-btn--ghost" onClick={() => { setCursorKeyOpen(false); setCursorKeyInput(''); setCursorKeyError('') }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setCursorKeyOpen(true)}>Add Cursor key</button>
        )
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Page header */}
      <div style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Connections
        </div>
        <h1 style={{ margin: 0, fontSize: 24, color: '#f8fafc', lineHeight: 1.15 }}>Model providers and tools</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
          Select a provider to manage auth, view connectors, and browse available skills.
        </p>
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar — provider list */}
        <div style={{
          width: 200,
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          overflowY: 'auto',
          paddingTop: 12,
          paddingBottom: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          {PROVIDERS.map((cfg) => (
            <SidebarItem
              key={cfg.id}
              config={cfg}
              connected={isConnected(cfg.id)}
              models={sidebarModels(cfg)}
              selected={selectedId === cfg.id}
              onClick={() => setSelectedId(cfg.id)}
            />
          ))}

          {scannedAt && (
            <div style={{ marginTop: 'auto', padding: '16px 12px 0', fontSize: 10, color: 'rgba(255,255,255,0.24)', lineHeight: 1.5 }}>
              Connectors scanned at {new Date(scannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </div>
          )}
        </div>

        {/* Right detail panel */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Provider heading */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 16, borderBottom: `1px solid rgba(255,255,255,0.07)` }}>
              <div style={{
                width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                background: isConnected(selectedId) ? selected.accent : 'rgba(255,255,255,0.2)',
                boxShadow: isConnected(selectedId) ? `0 0 7px ${selected.accent}` : 'none',
              }} />
              <h2 style={{ margin: 0, fontSize: 20, color: '#f8fafc', fontWeight: 700 }}>{selected.label}</h2>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', marginLeft: 2 }}>
                {isConnected(selectedId) ? 'connected' : 'not connected'}
              </span>
            </div>

            {/* Models */}
            <ModelChips models={sidebarModels(selected)} />

            {/* Auth */}
            <div>
              <SectionLabel>Authentication</SectionLabel>
              {renderAuth()}
            </div>

            {/* Connectors */}
            <ConnectorsBlock snapshot={snapshot(selected.connectorKey)} />

            {/* Skills */}
            <SkillsBlock skills={providerSkills(selected.skillKey)} />

          </div>
        </div>

      </div>
    </div>
  )
}
