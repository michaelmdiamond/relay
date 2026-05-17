import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { AgentProfile } from '../../../shared/types'

export function AgentProfileEditor({
  profile,
  onSave,
  saving,
}: {
  profile: AgentProfile
  onSave: (profile: AgentProfile) => Promise<void>
  saving: boolean
}) {
  const [draft, setDraft] = useState(profile)

  useEffect(() => {
    setDraft(profile)
  }, [profile])

  return (
    <div style={{
      borderRadius: 12,
      padding: 14,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{profile.name}</div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>
        {profile.role} · {profile.provider}
      </div>

      <label style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
        <span style={labelStyle}>Model</span>
        <input
          value={draft.model}
          onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          style={fieldStyle}
        />
      </label>

      <label style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
        <span style={labelStyle}>System Prompt</span>
        <textarea
          value={draft.systemPrompt}
          onChange={(event) => setDraft({ ...draft, systemPrompt: event.target.value })}
          rows={6}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: 1.45 }}
        />
      </label>

      <button
        type="button"
        onClick={() => void onSave(draft)}
        disabled={saving}
        style={{
          width: '100%',
          border: 'none',
          borderRadius: 10,
          padding: '9px 12px',
          background: saving ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.12)',
          color: saving ? 'rgba(255,255,255,0.4)' : '#fff',
          fontWeight: 700,
          cursor: saving ? 'default' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Save Agent'}
      </button>
    </div>
  )
}

const labelStyle: CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'rgba(255,255,255,0.45)',
}

const fieldStyle: CSSProperties = {
  width: '100%',
  borderRadius: 10,
  padding: 9,
  background: 'rgba(0,0,0,0.2)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  font: 'inherit',
}
