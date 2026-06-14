import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { CODEX_MODELS } from '../../../shared/types'
import type { AgentProfile, CursorModelOption, WorkflowAgentProvider, WorkflowAgentRole } from '../../../shared/types'

const PROVIDER_OPTIONS: Array<{ value: WorkflowAgentProvider; label: string; defaultModels: string[] }> = [
  { value: 'openai', label: 'Codex', defaultModels: [...CODEX_MODELS] },
  {
    value: 'google',
    label: 'Gemini',
    defaultModels: [
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3-flash-preview',
      'gemini-3.1-flash-lite',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
    ],
  },
  { value: 'anthropic', label: 'Claude', defaultModels: ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-4-7'] },
  { value: 'deepseek', label: 'DeepSeek', defaultModels: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  { value: 'ollama', label: 'Local', defaultModels: [] },
  { value: 'cursor', label: 'Cursor', defaultModels: ['composer-2'] },
]

const ROLE_OPTIONS: Array<{ value: WorkflowAgentRole; label: string }> = [
  { value: 'implementer', label: 'Builder' },
  { value: 'reviewer', label: 'Reviewer' },
]

function providerLabel(provider: WorkflowAgentProvider): string {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.label ?? provider
}

function defaultModelOptions(provider: WorkflowAgentProvider): string[] {
  return PROVIDER_OPTIONS.find((option) => option.value === provider)?.defaultModels ?? []
}

export function AgentProfileEditor({
  profile,
  onSave,
  onDelete,
  onRun,
  onSetup,
  onCancel,
  saving,
  deleting,
  codexModels,
  ollamaModels,
  cursorModels,
}: {
  profile: AgentProfile
  onSave: (profile: AgentProfile) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onRun?: (profile: AgentProfile) => void
  onSetup?: (profile: AgentProfile) => Promise<void>
  onCancel?: () => void
  saving: boolean
  deleting?: boolean
  codexModels?: string[]
  ollamaModels?: string[]
  cursorModels?: CursorModelOption[]
}) {
  const [draft, setDraft] = useState(profile)

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(profile)
  const modelsByProvider: Partial<Record<WorkflowAgentProvider, string[]>> = {
    openai: codexModels?.length ? codexModels : defaultModelOptions('openai'),
    ollama: ollamaModels?.length ? ollamaModels : defaultModelOptions('ollama'),
    cursor: cursorModels?.length ? cursorModels.map((model) => model.id).filter((id) => id !== 'auto') : defaultModelOptions('cursor'),
  }
  const currentModelOptions = modelsByProvider[draft.provider] ?? defaultModelOptions(draft.provider)
  const canSave = !!draft.name.trim() && !!draft.systemPrompt.trim() && !!draft.model.trim()
  const canSetup = canSave && !!draft.foundationPrompt?.trim()

  return (
    <div style={{
      borderRadius: 12,
      padding: 16,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'grid',
      gap: 12,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={avatarStyle}>{draft.name.trim().slice(0, 1).toUpperCase() || 'A'}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.25, marginBottom: 3 }}>{draft.name || 'Untitled agent'}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            {ROLE_OPTIONS.find((option) => option.value === draft.role)?.label ?? draft.role} · {providerLabel(draft.provider)}
          </div>
        </div>
        <label style={toggleStyle}>
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          />
          Enabled
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(120px, 0.55fr)', gap: 10 }}>
        <label style={fieldGroupStyle}>
          <span style={labelStyle}>Name</span>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            style={fieldStyle}
          />
        </label>
        <label style={fieldGroupStyle}>
          <span style={labelStyle}>Role</span>
          <select
            value={draft.role}
            onChange={(event) => setDraft({ ...draft, role: event.target.value as WorkflowAgentRole })}
            style={fieldStyle}
          >
            {ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 0.5fr) minmax(0, 1fr)', gap: 10 }}>
        <label style={fieldGroupStyle}>
          <span style={labelStyle}>Provider</span>
          <select
            value={draft.provider}
            onChange={(event) => {
              const provider = event.target.value as WorkflowAgentProvider
              const nextModels = modelsByProvider[provider] ?? defaultModelOptions(provider)
              setDraft({ ...draft, provider, model: nextModels[0] ?? '' })
            }}
            style={fieldStyle}
          >
            {PROVIDER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label style={fieldGroupStyle}>
          <span style={labelStyle}>Model</span>
          <select
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            style={fieldStyle}
          >
            {[...new Set([draft.model, ...currentModelOptions])].filter(Boolean).map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
        </label>
      </div>

      <label style={fieldGroupStyle}>
        <span style={labelStyle}>System Prompt</span>
        <textarea
          value={draft.systemPrompt}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
          rows={6}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.45 }}
        />
      </label>

      <label style={fieldGroupStyle}>
        <span style={labelStyle}>Foundation Prompt</span>
        <textarea
          value={draft.foundationPrompt ?? ''}
          onChange={(event) => setDraft({ ...draft, foundationPrompt: event.target.value })}
          rows={5}
          placeholder="Optional setup run for building this agent's initial knowledge, repo understanding, or operating baseline."
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.45 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        {onDelete && (
          <button
            type="button"
            onClick={() => void onDelete(profile.id)}
            disabled={deleting || saving}
            style={{
              ...dangerButtonStyle,
              marginRight: 'auto',
              opacity: deleting || saving ? 0.55 : 1,
              cursor: deleting || saving ? 'default' : 'pointer',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
        {onRun && (
          <button type="button" onClick={() => onRun(profile)} disabled={saving || deleting} style={secondaryButtonStyle}>
            Run
          </button>
        )}
        {onSetup && (
          <button
            type="button"
            onClick={() => void onSetup(draft)}
            disabled={saving || deleting || !canSetup}
            style={{
              ...secondaryButtonStyle,
              opacity: saving || deleting || !canSetup ? 0.55 : 1,
              cursor: saving || deleting || !canSetup ? 'default' : 'pointer',
            }}
          >
            {profile.foundationPrompt ? 'Save & set up' : 'Create & set up'}
          </button>
        )}
        {hasChanges && (
          <button type="button" onClick={() => setDraft(profile)} style={secondaryButtonStyle}>
            Reset
          </button>
        )}
        {onCancel && (
          <button type="button" onClick={onCancel} style={secondaryButtonStyle}>
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void onSave(draft)}
          disabled={saving || !canSave}
          style={{
            ...primaryButtonStyle,
            opacity: saving || !canSave ? 0.55 : 1,
            cursor: saving || !canSave ? 'default' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(96,165,250,0.15)',
  border: '1px solid rgba(96,165,250,0.25)',
  color: '#bfdbfe',
  fontWeight: 800,
  flexShrink: 0,
}

const fieldGroupStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.45)',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  borderRadius: 8,
  padding: 9,
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  font: 'inherit',
  boxSizing: 'border-box',
}

const toggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'rgba(255,255,255,0.5)',
  whiteSpace: 'nowrap',
}

const primaryButtonStyle: CSSProperties = {
  border: '1px solid rgba(96,165,250,0.35)',
  borderRadius: 8,
  padding: '7px 13px',
  background: 'rgba(96,165,250,0.16)',
  color: '#bfdbfe',
  fontWeight: 700,
}

const secondaryButtonStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.05)',
  color: 'rgba(255,255,255,0.58)',
  cursor: 'pointer',
}

const dangerButtonStyle: CSSProperties = {
  border: '1px solid rgba(248,113,113,0.22)',
  borderRadius: 8,
  padding: '7px 12px',
  background: 'rgba(248,113,113,0.1)',
  color: '#fca5a5',
  fontWeight: 700,
}
