import { useEffect, useRef, useState } from 'react'
import type { ConnectorInventory, ConnectorProviderSnapshot, SkillEntry } from '../../../shared/types'

const PROVIDER_COLOR: Record<'claude' | 'codex', string> = {
  claude: 'rgba(168,85,247,0.8)',
  codex: 'rgba(56,189,248,0.8)',
}

function SkillsSection({ skills }: { skills: SkillEntry[] }) {
  const byProvider = skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
    ;(acc[s.provider] ??= []).push(s)
    return acc
  }, {})

  if (skills.length === 0) {
    return (
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', padding: '4px 0' }}>
        No skills found in ~/.claude/plugins or ~/.codex/skills.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {(Object.entries(byProvider) as [('claude' | 'codex'), SkillEntry[]][]).map(([provider, providerSkills]) => (
        <div key={provider}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 4,
              background: PROVIDER_COLOR[provider],
              color: '#fff',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {provider}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>{providerSkills.length} skills</span>
          </div>
          <div style={{ display: 'grid', gap: 6 }}>
            {providerSkills.map((skill) => (
              <div key={skill.id} style={{
                display: 'grid',
                gap: 2,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{skill.name}</span>
                  <code style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>
                    /{skill.name}
                  </code>
                </div>
                {skill.description && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                    {skill.description.length > 160 ? `${skill.description.slice(0, 160)}…` : skill.description}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function countConnectorItems(inventory: ConnectorInventory | null): number {
  if (!inventory) return 0
  return inventory.providers.reduce((count, provider) => count + provider.items.length, 0)
}

function ConnectorCard({ provider }: { provider: ConnectorProviderSnapshot }) {
  return (
    <article key={provider.provider} className="relay-plugin-card">
      <div className="relay-plugin-card__title-row">
        <span className="relay-plugin-card__title">{provider.label}</span>
        <span className={`relay-plugin-card__badge relay-plugin-card__badge--${provider.provider}`}>
          {provider.items.length > 0 ? `${provider.items.length} found` : 'None'}
        </span>
      </div>
      <div className="relay-plugin-card__subtitle">{provider.subtitle}</div>

      {provider.items.length > 0 ? (
        <div className="relay-plugin-list">
          {provider.items.map((item) => (
            <div key={item.id} className="relay-plugin-item">
              <span className={`relay-plugin-item__status relay-plugin-item__status--${item.status}`} />
              <span className="relay-plugin-item__body">
                <span className="relay-plugin-item__name">{item.name}</span>
                {item.detail && <span className="relay-plugin-item__detail">{item.detail}</span>}
              </span>
              <span className={`relay-plugin-item__tag relay-plugin-item__tag--${item.status}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="relay-plugin-empty">No local connectors detected for this model yet.</div>
      )}
    </article>
  )
}

export function ConnectionsDashboard() {
  const [connectorInventory, setConnectorInventory] = useState<ConnectorInventory | null>(null)
  const [skills, setSkills] = useState<SkillEntry[]>([])
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

  useEffect(() => {
    void refreshConnections()
  }, [])

  useEffect(() => {
    if (geminiKeyOpen) geminiInputRef.current?.focus()
  }, [geminiKeyOpen])

  useEffect(() => {
    if (cursorKeyOpen) cursorInputRef.current?.focus()
  }, [cursorKeyOpen])

  useEffect(() => {
    if (!ollamaModel) return
    let cancelled = false
    const check = () => {
      window.api.checkOllamaReachable().then((reachable) => {
        if (!cancelled) setOllamaReachable(reachable)
      })
    }
    check()
    const id = setInterval(check, 3000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [ollamaModel])

  async function refreshConnections() {
    const [openAI, gemini, ollama, cursor, inventory, skillList] = await Promise.all([
      window.api.getOpenAIAuthStatus(),
      window.api.getGeminiKeyStatus(),
      window.api.getOllamaStatus(),
      window.api.getCursorKeyStatus(),
      window.api.getConnectorInventory(),
      window.api.getSkills(),
    ])

    setOpenAIEmail(openAI.connected ? (openAI.email ?? 'Connected') : null)
    setGeminiConfigured(gemini.configured)
    setCursorConfigured(cursor.configured)
    setCursorLabel(cursor.userEmail ?? cursor.apiKeyName ?? (cursor.configured ? 'Cursor connected' : null))
    setOllamaModel(ollama.configured && ollama.model ? ollama.model : null)
    setConnectorInventory(inventory)
    setSkills(skillList)
  }

  async function handleConnectOpenAI() {
    setConnectingOpenAI(true)
    try {
      await window.api.startOpenAILogin()
      await refreshConnections()
    } finally {
      setConnectingOpenAI(false)
    }
  }

  async function handleDisconnectOpenAI() {
    await window.api.disconnectOpenAI()
    await refreshConnections()
  }

  async function handleSaveGeminiKey() {
    const trimmed = geminiKeyInput.trim()
    if (!trimmed.startsWith('AIza')) {
      setGeminiKeyError('Key should start with AIza')
      return
    }
    await window.api.setGeminiKey(trimmed)
    setGeminiKeyOpen(false)
    setGeminiKeyInput('')
    setGeminiKeyError('')
    await refreshConnections()
  }

  async function handleDisconnectGemini() {
    await window.api.disconnectGemini()
    await refreshConnections()
  }

  async function handleSaveCursorKey() {
    const trimmed = cursorKeyInput.trim()
    if (!trimmed) {
      setCursorKeyError('Enter a Cursor API key')
      return
    }

    try {
      await window.api.setCursorKey(trimmed)
      setCursorKeyOpen(false)
      setCursorKeyInput('')
      setCursorKeyError('')
      await refreshConnections()
    } catch (error) {
      setCursorKeyError(error instanceof Error ? error.message : 'Could not validate Cursor key')
    }
  }

  async function handleDisconnectCursor() {
    await window.api.disconnectCursor()
    await refreshConnections()
  }

  async function handleConnectOllama() {
    setOllamaPhase('loading')
    const { models, error } = await window.api.getOllamaModels()
    if (error || models.length === 0) {
      setOllamaSetupError(error ?? 'No models found')
      setOllamaPhase('error')
      return
    }
    setOllamaAvailable(models)
    setOllamaPhase('picking')
  }

  async function handlePickModel(model: string) {
    await window.api.setOllamaConfig('http://localhost:11434', model)
    setOllamaReachable(false)
    setOllamaPhase('idle')
    await refreshConnections()
  }

  async function handleDisconnectOllama() {
    await window.api.disconnectOllama()
    setOllamaReachable(false)
    setOllamaPhase('idle')
    await refreshConnections()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Connections
          </div>
          <h1 style={{ margin: 0, fontSize: 30, color: '#f8fafc', lineHeight: 1.1 }}>
            Model providers and tool connectors
          </h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.56)', fontSize: 14, maxWidth: 760 }}>
            Manage the accounts, API keys, local models, and connector inventory Relay can use across chats and workflows.
          </p>
        </div>

        <section style={{
          padding: '18px 20px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Model providers
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)' }}>
              Connect providers Relay can route to directly or through agent backends.
            </div>
          </div>

          <div className="relay-connection-list relay-connection-list--wide">
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
                {connectingOpenAI ? 'Opening browser...' : 'Connect OpenAI'}
              </button>
            )}

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
                  onChange={(event) => {
                    setGeminiKeyInput(event.target.value)
                    setGeminiKeyError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSaveGeminiKey()
                    if (event.key === 'Escape') {
                      setGeminiKeyOpen(false)
                      setGeminiKeyInput('')
                      setGeminiKeyError('')
                    }
                  }}
                  className="relay-inline-input"
                  placeholder="AIza..."
                />
                {geminiKeyError && <span className="relay-inline-error">{geminiKeyError}</span>}
                <div className="relay-inline-actions">
                  <button type="button" className="relay-inline-btn" onClick={() => void handleSaveGeminiKey()}>Save</button>
                  <button
                    type="button"
                    className="relay-inline-btn relay-inline-btn--ghost"
                    onClick={() => {
                      setGeminiKeyOpen(false)
                      setGeminiKeyInput('')
                      setGeminiKeyError('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setGeminiKeyOpen(true)}>
                Add Gemini key
              </button>
            )}

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
                  onChange={(event) => {
                    setCursorKeyInput(event.target.value)
                    setCursorKeyError('')
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleSaveCursorKey()
                    if (event.key === 'Escape') {
                      setCursorKeyOpen(false)
                      setCursorKeyInput('')
                      setCursorKeyError('')
                    }
                  }}
                  className="relay-inline-input"
                  placeholder="Cursor API key"
                />
                {cursorKeyError && <span className="relay-inline-error">{cursorKeyError}</span>}
                <div className="relay-inline-actions">
                  <button type="button" className="relay-inline-btn" onClick={() => void handleSaveCursorKey()}>Save</button>
                  <button
                    type="button"
                    className="relay-inline-btn relay-inline-btn--ghost"
                    onClick={() => {
                      setCursorKeyOpen(false)
                      setCursorKeyInput('')
                      setCursorKeyError('')
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => setCursorKeyOpen(true)}>
                Add Cursor key
              </button>
            )}

            {ollamaModel ? (
              <div className="relay-connection-item">
                <span className={`relay-connection-item__status${ollamaReachable ? ' is-ollama-ready' : ' is-ollama'}`} />
                <span className="relay-connection-item__label">{ollamaReachable ? ollamaModel : `${ollamaModel} (starting)`}</span>
                <button type="button" className="relay-connection-item__action" onClick={() => void handleDisconnectOllama()}>
                  Disconnect
                </button>
              </div>
            ) : ollamaPhase === 'picking' ? (
              <div className="relay-inline-form">
                <span className="relay-inline-caption">Choose an Ollama model</span>
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
                <button type="button" className="relay-inline-btn" onClick={() => setOllamaPhase('idle')}>
                  Dismiss
                </button>
              </div>
            ) : (
              <button type="button" className="relay-connect-btn relay-connect-btn--secondary" onClick={() => void handleConnectOllama()}>
                {ollamaPhase === 'loading' ? 'Checking Ollama...' : 'Connect Ollama'}
              </button>
            )}
          </div>
        </section>

        <section style={{
          padding: '18px 20px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Tool connectors
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)' }}>
                Local connector and plugin state detected from your development tools.
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12 }}>
              {countConnectorItems(connectorInventory)} found
            </span>
          </div>

          <div className="relay-plugin-grid relay-plugin-grid--wide">
            {connectorInventory?.providers.map((provider) => (
              <ConnectorCard key={provider.provider} provider={provider} />
            ))}
          </div>

          {connectorInventory && (
            <div className="relay-plugin-scan-note">
              Updated from local config at {new Date(connectorInventory.scannedAt).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}.
            </div>
          )}
        </section>

        <section style={{
          padding: '18px 20px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'end' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Skills
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)' }}>
                Installed skills from Claude and Codex. Type <code style={{ fontSize: 12, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>/</code> in any chat to invoke one.
              </div>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.42)', fontSize: 12, flexShrink: 0 }}>
              {skills.length} found
            </span>
          </div>

          <SkillsSection skills={skills} />
        </section>
      </div>
    </div>
  )
}
