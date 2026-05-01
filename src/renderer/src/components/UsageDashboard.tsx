import { useEffect, useMemo, useState } from 'react'
import type { Conversation, Provider, UsageLimitSettings } from '../../../shared/types'

interface Props {
  conversations: Conversation[]
}

interface UsageRow {
  key: string
  label: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

interface UsageSnapshot {
  allTime: UsageRow
  currentMonth: UsageRow
  byProvider: UsageRow[]
  byModel: UsageRow[]
  byProject: UsageRow[]
  conversationCount: number
  messageCount: number
}

interface UsageEvent {
  provider: Provider
  model: string
  modelLabel: string
  project: string
  timestamp: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function progressPercent(used: number, limit?: number): number {
  if (!limit || limit <= 0) return 0
  return Math.min(100, Math.round((used / limit) * 100))
}

function aggregateRows(events: UsageEvent[], keyFor: (event: UsageEvent) => string, labelFor: (event: UsageEvent) => string): UsageRow[] {
  const buckets = new Map<string, UsageRow>()

  for (const event of events) {
    const key = keyFor(event)
    const existing = buckets.get(key) ?? {
      key,
      label: labelFor(event),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }
    existing.inputTokens += event.inputTokens
    existing.outputTokens += event.outputTokens
    existing.totalTokens += event.totalTokens
    buckets.set(key, existing)
  }

  return [...buckets.values()].sort((a, b) => b.totalTokens - a.totalTokens)
}

function summarizeUsage(conversations: Conversation[]): UsageSnapshot {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const events: UsageEvent[] = []
  const conversationIds = new Set<string>()

  for (const conversation of conversations) {
    for (const message of conversation.messages) {
      if (message.role !== 'assistant' || !message.routing || !message.usage) continue
      const stamp = new Date(message.createdAt ?? conversation.updatedAt ?? conversation.createdAt).getTime()
      if (Number.isNaN(stamp)) continue

      conversationIds.add(conversation.id)
      events.push({
        provider: message.routing.provider,
        model: message.routing.model,
        modelLabel: message.routing.modelLabel,
        project: conversation.projectName ?? 'Unassigned',
        timestamp: stamp,
        inputTokens: message.usage.inputTokens,
        outputTokens: message.usage.outputTokens,
        totalTokens: message.usage.totalTokens,
      })
    }
  }

  const monthEvents = events.filter(event => event.timestamp >= monthStart)
  const summarize = (label: string, rows: UsageEvent[]): UsageRow => ({
    key: label.toLowerCase().replace(/\s+/g, '-'),
    label,
    inputTokens: rows.reduce((sum, row) => sum + row.inputTokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.outputTokens, 0),
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0),
  })

  return {
    allTime: summarize('All time', events),
    currentMonth: summarize(monthLabel(now), monthEvents),
    byProvider: aggregateRows(monthEvents, event => event.provider, event => event.provider),
    byModel: aggregateRows(monthEvents, event => event.model, event => event.modelLabel),
    byProject: aggregateRows(monthEvents, event => event.project, event => event.project),
    conversationCount: conversationIds.size,
    messageCount: events.length,
  }
}

function LimitBar({ label, used, limit }: { label: string; used: number; limit?: number }) {
  const percent = progressPercent(used, limit)
  const over = !!limit && used > limit

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
        <span style={{ color: '#e2e8f0' }}>{label}</span>
        <span style={{ color: over ? '#fca5a5' : 'rgba(255,255,255,0.55)' }}>
          {formatCount(used)}
          {limit ? ` / ${formatCount(limit)}` : ' / no limit'}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{
          width: `${limit ? Math.max(percent, used > 0 ? 2 : 0) : 0}%`,
          height: '100%',
          background: over ? 'linear-gradient(90deg, #fb7185, #ef4444)' : 'linear-gradient(90deg, #38bdf8, #22c55e)',
        }} />
      </div>
    </div>
  )
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div style={{
      padding: '16px 18px',
      borderRadius: 16,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'grid',
      gap: 6,
    }}>
      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.42)' }}>
        {label}
      </span>
      <span style={{ fontSize: 24, color: '#f8fafc', fontWeight: 600 }}>{value}</span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{detail}</span>
    </div>
  )
}

function BreakdownTable({ title, rows }: { title: string; rows: UsageRow[] }) {
  return (
    <div style={{
      padding: '16px 18px',
      borderRadius: 16,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'grid',
      gap: 12,
    }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)' }}>No tracked usage yet for this period.</div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {rows.slice(0, 8).map((row) => (
            <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: '#e2e8f0' }}>{row.label}</span>
              <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                {formatCount(row.totalTokens)} total ({formatCount(row.inputTokens)} in / {formatCount(row.outputTokens)} out)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function UsageDashboard({ conversations }: Props) {
  const snapshot = useMemo(() => summarizeUsage(conversations), [conversations])
  const [limits, setLimits] = useState<UsageLimitSettings>({})
  const [draft, setDraft] = useState<Record<keyof UsageLimitSettings, string>>({
    overallMonthlyTokens: '',
    anthropicMonthlyTokens: '',
    openaiMonthlyTokens: '',
    googleMonthlyTokens: '',
    ollamaMonthlyTokens: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getUsageLimits().then((loaded) => {
      setLimits(loaded)
      setDraft({
        overallMonthlyTokens: loaded.overallMonthlyTokens ? String(loaded.overallMonthlyTokens) : '',
        anthropicMonthlyTokens: loaded.anthropicMonthlyTokens ? String(loaded.anthropicMonthlyTokens) : '',
        openaiMonthlyTokens: loaded.openaiMonthlyTokens ? String(loaded.openaiMonthlyTokens) : '',
        googleMonthlyTokens: loaded.googleMonthlyTokens ? String(loaded.googleMonthlyTokens) : '',
        ollamaMonthlyTokens: loaded.ollamaMonthlyTokens ? String(loaded.ollamaMonthlyTokens) : '',
      })
    })
  }, [])

  async function handleSaveLimits() {
    setSaving(true)
    try {
      const next: UsageLimitSettings = {
        overallMonthlyTokens: draft.overallMonthlyTokens ? Number(draft.overallMonthlyTokens) : undefined,
        anthropicMonthlyTokens: draft.anthropicMonthlyTokens ? Number(draft.anthropicMonthlyTokens) : undefined,
        openaiMonthlyTokens: draft.openaiMonthlyTokens ? Number(draft.openaiMonthlyTokens) : undefined,
        googleMonthlyTokens: draft.googleMonthlyTokens ? Number(draft.googleMonthlyTokens) : undefined,
        ollamaMonthlyTokens: draft.ollamaMonthlyTokens ? Number(draft.ollamaMonthlyTokens) : undefined,
      }
      const saved = await window.api.saveUsageLimits(next)
      setLimits(saved)
      setDraft({
        overallMonthlyTokens: saved.overallMonthlyTokens ? String(saved.overallMonthlyTokens) : '',
        anthropicMonthlyTokens: saved.anthropicMonthlyTokens ? String(saved.anthropicMonthlyTokens) : '',
        openaiMonthlyTokens: saved.openaiMonthlyTokens ? String(saved.openaiMonthlyTokens) : '',
        googleMonthlyTokens: saved.googleMonthlyTokens ? String(saved.googleMonthlyTokens) : '',
        ollamaMonthlyTokens: saved.ollamaMonthlyTokens ? String(saved.ollamaMonthlyTokens) : '',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 28px 24px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.42)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Usage dashboard
          </div>
          <h1 style={{ margin: 0, fontSize: 30, color: '#f8fafc', lineHeight: 1.1 }}>
            Token tracking across all conversations
          </h1>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.56)', fontSize: 14, maxWidth: 760 }}>
            Relay is aggregating token usage from every tracked assistant response it has seen. Current-month views use message timestamps when available and fall back to conversation timestamps for older history.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          <MetricCard
            label="All-time tokens"
            value={formatCount(snapshot.allTime.totalTokens)}
            detail={`${formatCount(snapshot.allTime.inputTokens)} in / ${formatCount(snapshot.allTime.outputTokens)} out`}
          />
          <MetricCard
            label={snapshot.currentMonth.label}
            value={formatCount(snapshot.currentMonth.totalTokens)}
            detail={`${formatCount(snapshot.currentMonth.inputTokens)} in / ${formatCount(snapshot.currentMonth.outputTokens)} out`}
          />
          <MetricCard
            label="Tracked chats"
            value={formatCount(snapshot.conversationCount)}
            detail={`${formatCount(snapshot.messageCount)} assistant responses with usage`}
          />
        </div>

        <div style={{
          padding: '18px 20px',
          borderRadius: 18,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'grid',
          gap: 14,
        }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.46)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Monthly limits
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.62)' }}>
              Set token caps for this month and compare tracked usage against them.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {([
              ['overallMonthlyTokens', 'Overall'],
              ['anthropicMonthlyTokens', 'Anthropic'],
              ['openaiMonthlyTokens', 'OpenAI'],
              ['googleMonthlyTokens', 'Google'],
              ['ollamaMonthlyTokens', 'Ollama'],
            ] as Array<[keyof UsageLimitSettings, string]>).map(([key, label]) => (
              <label key={key} style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{label}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft[key]}
                  onChange={(event) => setDraft(current => ({ ...current, [key]: event.target.value }))}
                  placeholder="No limit"
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(15,23,42,0.45)',
                    color: '#f8fafc',
                    padding: '10px 12px',
                    fontSize: 14,
                    outline: 'none',
                  }}
                />
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => void handleSaveLimits()}
              disabled={saving}
              style={{
                border: '1px solid rgba(125,211,252,0.24)',
                background: 'linear-gradient(135deg, rgba(56,189,248,0.24), rgba(34,197,94,0.18))',
                color: '#e0f2fe',
                padding: '10px 16px',
                borderRadius: 999,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {saving ? 'Saving…' : 'Save limits'}
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <LimitBar label="Overall" used={snapshot.currentMonth.totalTokens} limit={limits.overallMonthlyTokens} />
            <LimitBar
              label="Anthropic"
              used={snapshot.byProvider.find(row => row.key === 'anthropic')?.totalTokens ?? 0}
              limit={limits.anthropicMonthlyTokens}
            />
            <LimitBar
              label="OpenAI"
              used={snapshot.byProvider.find(row => row.key === 'openai')?.totalTokens ?? 0}
              limit={limits.openaiMonthlyTokens}
            />
            <LimitBar
              label="Google"
              used={snapshot.byProvider.find(row => row.key === 'google')?.totalTokens ?? 0}
              limit={limits.googleMonthlyTokens}
            />
            <LimitBar
              label="Ollama"
              used={snapshot.byProvider.find(row => row.key === 'ollama')?.totalTokens ?? 0}
              limit={limits.ollamaMonthlyTokens}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
          <BreakdownTable title="This month by provider" rows={snapshot.byProvider} />
          <BreakdownTable title="This month by model" rows={snapshot.byModel} />
        </div>

        <BreakdownTable title="This month by project" rows={snapshot.byProject} />
      </div>
    </div>
  )
}
