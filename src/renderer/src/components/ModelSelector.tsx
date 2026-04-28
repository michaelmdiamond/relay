import type { ModelChoice } from '../../../shared/types'

const OPTIONS: { value: ModelChoice; label: string; sub: string }[] = [
  { value: 'auto',   label: 'Auto',   sub: 'router picks' },
  { value: 'haiku',  label: 'Haiku',  sub: 'fast & cheap' },
  { value: 'sonnet', label: 'Sonnet', sub: 'balanced' },
  { value: 'opus',   label: 'Opus',   sub: 'most capable' },
  { value: 'codex',  label: 'Codex',  sub: 'GPT subscription' },
]

interface Props {
  value: ModelChoice
  onChange: (v: ModelChoice) => void
  disabled?: boolean
}

export function ModelSelector({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: 12,
            fontWeight: value === opt.value ? 600 : 400,
            background: value === opt.value ? 'rgba(255,255,255,0.15)' : 'transparent',
            color: value === opt.value ? '#fff' : 'rgba(255,255,255,0.45)',
            transition: 'all 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
