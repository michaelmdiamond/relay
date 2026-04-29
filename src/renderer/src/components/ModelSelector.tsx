import type { GeminiModel, ModelChoice } from '../../../shared/types'

const OPTIONS: { value: ModelChoice; label: string; sub: string }[] = [
  { value: 'auto',   label: 'Auto',   sub: 'router picks' },
  { value: 'haiku',  label: 'Haiku',  sub: 'fast & cheap' },
  { value: 'sonnet', label: 'Sonnet', sub: 'balanced' },
  { value: 'opus',   label: 'Opus',   sub: 'most capable' },
  { value: 'codex',  label: 'Codex',  sub: 'GPT subscription' },
  { value: 'gemini', label: 'Gemini', sub: 'Google key' },
]

const GEMINI_MODELS: { value: GeminiModel; label: string; sub: string }[] = [
  { value: 'gemini-2.5-flash',      label: 'Flash',      sub: 'fast · free' },
  { value: 'gemini-2.5-flash-lite', label: 'Flash-Lite', sub: 'fastest · free' },
  { value: 'gemini-2.5-pro',        label: 'Pro',        sub: 'most capable' },
]

interface Props {
  value: ModelChoice
  onChange: (v: ModelChoice) => void
  geminiModel?: GeminiModel
  onGeminiModelChange?: (v: GeminiModel) => void
  disabled?: boolean
}

export function ModelSelector({ value, onChange, geminiModel, onGeminiModelChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

      {value === 'gemini' && onGeminiModelChange && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2 }}>
          {GEMINI_MODELS.map(opt => (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => onGeminiModelChange(opt.value)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${geminiModel === opt.value ? 'rgba(52,211,153,0.4)' : 'transparent'}`,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: geminiModel === opt.value ? 600 : 400,
                background: geminiModel === opt.value ? 'rgba(52,211,153,0.12)' : 'transparent',
                color: geminiModel === opt.value ? '#34d399' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>{opt.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
