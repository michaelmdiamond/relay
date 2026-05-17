import { useEffect, useMemo, useState } from 'react'
import type {
  AgentProfile,
  AutomationCatalogItem,
  AutomationCatalogSnapshot,
  AutomationProviderSummary,
} from '../../../shared/types'
import { AgentProfileEditor } from './AgentProfileEditor'

function tone(status: AutomationCatalogItem['status'] | AutomationProviderSummary['status']): string {
  if (status === 'active' || status === 'connected') return 'rgba(74, 222, 128, 0.18)'
  if (status === 'paused') return 'rgba(248, 113, 113, 0.18)'
  return 'rgba(96, 165, 250, 0.18)'
}

function sourceLabel(source: AutomationCatalogItem['source']): string {
  if (source === 'relay') return 'Relay'
  if (source === 'codex') return 'Codex'
  return 'Claude'
}

function kindLabel(kind: AutomationCatalogItem['kind']): string {
  if (kind === 'agent') return 'Agent'
  if (kind === 'workflow') return 'Workflow'
  return 'Scheduled task'
}

export function AutomationsPane() {
  const [catalog, setCatalog] = useState<AutomationCatalogSnapshot | null>(null)
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([])
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [nextCatalog, profiles] = await Promise.all([
        window.api.getAutomationCatalog(),
        window.api.getAgentProfiles(),
      ])
      setCatalog(nextCatalog)
      setAgentProfiles(profiles)
    }
    void load()
  }, [])

  const relayItems = useMemo(
    () => catalog?.items.filter((item) => item.source === 'relay') ?? [],
    [catalog],
  )
  const externalItems = useMemo(
    () => catalog?.items.filter((item) => item.external) ?? [],
    [catalog],
  )

  async function handleSaveAgent(profile: AgentProfile) {
    setSavingAgentId(profile.id)
    setError('')
    try {
      const nextProfiles = await window.api.saveAgentProfile(profile)
      const nextCatalog = await window.api.getAutomationCatalog()
      setAgentProfiles(nextProfiles)
      setCatalog(nextCatalog)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingAgentId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', flex: 1, minHeight: 0 }}>
      <aside style={{
        padding: 18,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        overflowY: 'auto',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <SectionLabel>Sources</SectionLabel>
        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
          {catalog?.providers.map((provider) => (
            <div
              key={provider.source}
              style={{
                borderRadius: 12,
                padding: 12,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{provider.label}</div>
                <StatusPill label={provider.status} background={tone(provider.status)} />
              </div>
              <div style={{ color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
                {provider.detail}
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>Reusable agents</SectionLabel>
        <div style={{ display: 'grid', gap: 12 }}>
          {agentProfiles.map((profile) => (
            <AgentProfileEditor
              key={profile.id}
              profile={profile}
              onSave={handleSaveAgent}
              saving={savingAgentId === profile.id}
            />
          ))}
        </div>
        {error && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#fca5a5', lineHeight: 1.4 }}>
            {error}
          </div>
        )}
      </aside>

      <section style={{ overflowY: 'auto', padding: 18 }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <CatalogSection
            title="Relay library"
            items={relayItems}
            empty="No Relay automation assets are configured."
          />
          <CatalogSection
            title="External schedules"
            items={externalItems}
            empty="No external scheduled tasks are indexed yet."
          />
        </div>
      </section>
    </div>
  )
}

function CatalogSection({
  title,
  items,
  empty,
}: {
  title: string
  items: AutomationCatalogItem[]
  empty: string
}) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{
              borderRadius: 12,
              padding: 14,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              minHeight: 148,
              display: 'grid',
              alignContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
                    {sourceLabel(item.source)} · {kindLabel(item.kind)}
                  </div>
                </div>
                <StatusPill label={item.status} background={tone(item.status)} />
              </div>
              <div style={{ color: 'rgba(255,255,255,0.68)', lineHeight: 1.55 }}>
                {item.description}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', color: 'rgba(255,255,255,0.58)', fontSize: 12 }}>
              {item.model && <MetaChip>{item.model}</MetaChip>}
              {item.cadence && <MetaChip>{item.cadence}</MetaChip>}
              {item.destination && <MetaChip>{item.destination}</MetaChip>}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: 13, lineHeight: 1.5 }}>
            {empty}
          </div>
        )}
      </div>
    </section>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'rgba(255,255,255,0.45)',
      marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

function StatusPill({ label, background }: { label: string; background: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      padding: '4px 9px',
      borderRadius: 999,
      background,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: '#e2e8f0',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function MetaChip({ children }: { children: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      borderRadius: 999,
      border: '1px solid rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.05)',
      padding: '4px 8px',
      lineHeight: 1,
    }}>
      {children}
    </span>
  )
}
