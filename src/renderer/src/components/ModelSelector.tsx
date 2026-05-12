import { useState } from 'react'
import { CODEX_MODELS } from '../../../shared/types'
import type { CursorModelOption, DeepSeekModel, GeminiModel, ModelChoice } from '../../../shared/types'

type TopLevelChoice = 'auto' | 'claude' | 'codex' | 'gemini' | 'deepseek' | 'ollama' | 'cursor'

const OPTIONS: { value: TopLevelChoice; label: string; sub: string }[] = [
  { value: 'auto',   label: 'Auto',   sub: 'router picks' },
  { value: 'claude', label: 'Claude', sub: 'Anthropic' },
  { value: 'codex',  label: 'Codex',  sub: 'GPT subscription' },
  { value: 'gemini', label: 'Gemini', sub: 'Google key' },
  { value: 'deepseek', label: 'DeepSeek', sub: 'API key' },
  { value: 'ollama', label: 'Local',  sub: 'Ollama' },
  { value: 'cursor', label: 'Cursor', sub: 'SDK agent' },
]

const CLAUDE_MODELS: { value: Extract<ModelChoice, 'haiku' | 'sonnet' | 'opus'>; label: string; sub: string }[] = [
  { value: 'haiku',  label: 'Haiku',  sub: 'fast & cheap' },
  { value: 'sonnet', label: 'Sonnet', sub: 'balanced' },
  { value: 'opus',   label: 'Opus',   sub: 'most capable' },
]

const CODEX_MODEL_META: Record<string, { label: string; sub: string }> = {
  'gpt-5.5': { label: 'GPT-5.5', sub: 'most capable' },
  'gpt-5.4': { label: 'GPT-5.4', sub: 'balanced' },
  'gpt-5.4-mini': { label: 'GPT-5.4 Mini', sub: 'fast' },
  'gpt-5.3-codex': { label: '5.3 Codex', sub: 'code' },
  'gpt-5.2': { label: 'GPT-5.2', sub: 'legacy' },
  'gpt-5.1-codex': { label: '5.1 Codex', sub: 'legacy' },
}

const GEMINI_MODELS: { value: GeminiModel; label: string; sub: string }[] = [
  { value: 'gemini-2.5-flash',      label: 'Flash',      sub: 'fast · free' },
  { value: 'gemini-2.5-flash-lite', label: 'Flash-Lite', sub: 'fastest · free' },
  { value: 'gemini-2.5-pro',        label: 'Pro',        sub: 'most capable' },
]

const DEEPSEEK_MODELS: { value: DeepSeekModel; label: string; sub: string }[] = [
  { value: 'deepseek-v4-flash', label: 'Flash', sub: 'default' },
  { value: 'deepseek-v4-pro', label: 'Pro', sub: 'thinking' },
]

interface Props {
  value: ModelChoice
  onChange: (v: ModelChoice) => void
  codexModel?: string
  codexModels?: string[]
  onCodexModelChange?: (v: string) => void
  geminiModel?: GeminiModel
  onGeminiModelChange?: (v: GeminiModel) => void
  deepSeekModel?: DeepSeekModel
  onDeepSeekModelChange?: (v: DeepSeekModel) => void
  ollamaModel?: string | null
  ollamaModels?: string[]
  onOllamaModelChange?: (v: string) => void
  cursorModel?: string
  cursorModels?: CursorModelOption[]
  cursorModelsLoading?: boolean
  cursorModelsError?: string
  onCursorModelChange?: (v: string) => void
  onCursorModelsRefresh?: () => void
  disabled?: boolean
}

export function ModelSelector({
  value,
  onChange,
  codexModel,
  codexModels,
  onCodexModelChange,
  geminiModel,
  onGeminiModelChange,
  deepSeekModel,
  onDeepSeekModelChange,
  ollamaModel,
  ollamaModels,
  onOllamaModelChange,
  cursorModel,
  cursorModels,
  cursorModelsLoading,
  cursorModelsError,
  onCursorModelChange,
  onCursorModelsRefresh,
  disabled,
}: Props) {
  const topLevelValue: TopLevelChoice =
    value === 'haiku' || value === 'sonnet' || value === 'opus'
      ? 'claude'
      : value
  const [collapsedTopLevel, setCollapsedTopLevel] = useState<TopLevelChoice | null>(null)
  const showSubmenu = collapsedTopLevel !== topLevelValue
  const cursorModelOptions: CursorModelOption[] = [
    { id: 'auto', displayName: 'Auto-select' },
    ...(cursorModels ?? []).filter(model => model.id !== 'auto'),
  ]
  if (cursorModel && !cursorModelOptions.some(model => model.id === cursorModel)) {
    cursorModelOptions.push({ id: cursorModel, displayName: cursorModel })
  }
  const codexModelOptions = [...(codexModels?.length ? codexModels : CODEX_MODELS)]
  if (codexModel && !codexModelOptions.includes(codexModel)) {
    codexModelOptions.push(codexModel)
  }

  function handleTopLevelChange(next: TopLevelChoice) {
    if (next === topLevelValue) {
      setCollapsedTopLevel(current => current === next ? null : next)
      return
    }

    setCollapsedTopLevel(null)
    if (next === 'claude') {
      onChange(value === 'haiku' || value === 'sonnet' || value === 'opus' ? value : 'sonnet')
      return
    }
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {OPTIONS.map(opt => (
          <button
            key={opt.value}
            disabled={disabled}
            onClick={() => handleTopLevelChange(opt.value)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: disabled ? 'default' : 'pointer',
              fontSize: 12,
              fontWeight: topLevelValue === opt.value ? 600 : 400,
              background: topLevelValue === opt.value ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: topLevelValue === opt.value ? '#fff' : 'rgba(255,255,255,0.45)',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {topLevelValue === 'claude' && showSubmenu && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2 }}>
          {CLAUDE_MODELS.map(opt => (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${value === opt.value ? 'rgba(145,181,255,0.4)' : 'transparent'}`,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: value === opt.value ? 600 : 400,
                background: value === opt.value ? 'rgba(145,181,255,0.12)' : 'transparent',
                color: value === opt.value ? '#91b5ff' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>{opt.sub}</span>
            </button>
          ))}
        </div>
      )}

      {topLevelValue === 'codex' && showSubmenu && onCodexModelChange && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2, flexWrap: 'wrap' }}>
          {codexModelOptions.map(model => {
            const meta = CODEX_MODEL_META[model] ?? { label: model, sub: 'available' }
            return (
              <button
                key={model}
                disabled={disabled}
                onClick={() => onCodexModelChange(model)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: `1px solid ${codexModel === model ? 'rgba(56,189,248,0.4)' : 'transparent'}`,
                  cursor: disabled ? 'default' : 'pointer',
                  fontSize: 11,
                  fontWeight: codexModel === model ? 600 : 400,
                  background: codexModel === model ? 'rgba(56,189,248,0.12)' : 'transparent',
                  color: codexModel === model ? '#7dd3fc' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                {meta.label}
                <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>{meta.sub}</span>
              </button>
            )
          })}
        </div>
      )}

      {value === 'gemini' && showSubmenu && onGeminiModelChange && (
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

      {topLevelValue === 'deepseek' && showSubmenu && onDeepSeekModelChange && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2 }}>
          {DEEPSEEK_MODELS.map(opt => (
            <button
              key={opt.value}
              disabled={disabled}
              onClick={() => onDeepSeekModelChange(opt.value)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${deepSeekModel === opt.value ? 'rgba(56,189,248,0.4)' : 'transparent'}`,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: deepSeekModel === opt.value ? 600 : 400,
                background: deepSeekModel === opt.value ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: deepSeekModel === opt.value ? '#7dd3fc' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
              <span style={{ marginLeft: 4, opacity: 0.6, fontSize: 10 }}>{opt.sub}</span>
            </button>
          ))}
        </div>
      )}

      {topLevelValue === 'ollama' && showSubmenu && !!ollamaModels?.length && onOllamaModelChange && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2, flexWrap: 'wrap' }}>
          {ollamaModels.map(model => (
            <button
              key={model}
              disabled={disabled}
              onClick={() => onOllamaModelChange(model)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${ollamaModel === model ? 'rgba(167,139,250,0.4)' : 'transparent'}`,
                cursor: disabled ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: ollamaModel === model ? 600 : 400,
                background: ollamaModel === model ? 'rgba(167,139,250,0.12)' : 'transparent',
                color: ollamaModel === model ? '#c4b5fd' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {model}
            </button>
          ))}
        </div>
      )}

      {topLevelValue === 'cursor' && showSubmenu && onCursorModelChange && (
        <div style={{ display: 'flex', gap: 4, paddingLeft: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {cursorModelOptions.map(model => (
            <button
              key={model.id}
              disabled={disabled || cursorModelsLoading}
              onClick={() => onCursorModelChange(model.id)}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: `1px solid ${cursorModel === model.id ? 'rgba(244,114,182,0.4)' : 'transparent'}`,
                cursor: disabled || cursorModelsLoading ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: cursorModel === model.id ? 600 : 400,
                background: cursorModel === model.id ? 'rgba(244,114,182,0.12)' : 'transparent',
                color: cursorModel === model.id ? '#f9a8d4' : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {model.displayName || model.id}
            </button>
          ))}
          {cursorModelsLoading && (
            <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11 }}>Loading models...</span>
          )}
          {cursorModelsError && !cursorModelsLoading && (
            <span style={{ color: 'rgba(248,113,113,0.8)', fontSize: 11 }}>{cursorModelsError}</span>
          )}
          {onCursorModelsRefresh && (
            <button
              type="button"
              disabled={disabled || cursorModelsLoading}
              onClick={onCursorModelsRefresh}
              style={{
                padding: '3px 8px',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.08)',
                cursor: disabled || cursorModelsLoading ? 'default' : 'pointer',
                fontSize: 11,
                fontWeight: 600,
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.48)',
              }}
            >
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  )
}
