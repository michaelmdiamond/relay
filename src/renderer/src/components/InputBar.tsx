import { useEffect, useRef, useState } from 'react'
import { ModelSelector } from './ModelSelector'
import type { ChatMode, ContextAttachment, CursorModelOption, GeminiModel, ModelChoice, SendMessageOptions } from '../../../shared/types'

interface Props {
  modelChoice: ModelChoice
  onModelChange: (v: ModelChoice) => void
  geminiModel?: GeminiModel
  onGeminiModelChange?: (v: GeminiModel) => void
  ollamaModel?: string | null
  ollamaModels?: string[]
  onOllamaModelChange?: (v: string) => void
  cursorModel?: string
  cursorModels?: CursorModelOption[]
  cursorModelsLoading?: boolean
  cursorModelsError?: string
  onCursorModelChange?: (v: string) => void
  onCursorModelsRefresh?: () => void
  onSend: (content: string, options?: SendMessageOptions) => void
  onStop?: () => void
  disabled?: boolean
  streaming?: boolean
}

const MODES: Array<{ id: ChatMode; label: string }> = [
  { id: 'quick', label: 'Quick' },
  { id: 'deep', label: 'Deep' },
  { id: 'code', label: 'Code' },
  { id: 'review', label: 'Review' },
  { id: 'brainstorm', label: 'Ideas' },
  { id: 'compare', label: 'Compare' },
]

export function InputBar({
  modelChoice,
  onModelChange,
  geminiModel,
  onGeminiModelChange,
  ollamaModel,
  ollamaModels,
  onOllamaModelChange,
  cursorModel,
  cursorModels,
  cursorModelsLoading,
  cursorModelsError,
  onCursorModelChange,
  onCursorModelsRefresh,
  onSend,
  onStop,
  disabled,
  streaming,
}: Props) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ChatMode>('quick')
  const [contextText, setContextText] = useState('')
  const [contextOpen, setContextOpen] = useState(false)
  const [tokenEstimate, setTokenEstimate] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const estimate = await window.api.estimateTokens([text, contextText].filter(Boolean).join('\n\n'))
      setTokenEstimate(estimate)
    }, 150)
    return () => window.clearTimeout(handle)
  }, [text, contextText])

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    const attachments: ContextAttachment[] = contextText.trim()
      ? [{
          id: crypto.randomUUID(),
          title: 'Context shelf',
          content: contextText.trim(),
          tokenEstimate: Math.ceil(contextText.trim().length / 4),
        }]
      : []
    onSend(trimmed, { mode, attachments })
    setText('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div style={{
      padding: '12px 16px 16px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(0,0,0,0.2)',
      }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {MODES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setMode(item.id)}
            disabled={disabled}
            style={{
              border: '1px solid rgba(255,255,255,0.1)',
              background: mode === item.id ? 'rgba(96,165,250,0.22)' : 'rgba(255,255,255,0.04)',
              color: mode === item.id ? '#bfdbfe' : 'rgba(255,255,255,0.62)',
              borderRadius: 8,
              padding: '5px 8px',
              fontSize: 11,
              fontWeight: 700,
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setContextOpen(v => !v)}
          disabled={disabled}
          style={{
            marginLeft: 'auto',
            border: '1px solid rgba(255,255,255,0.1)',
            background: contextText.trim() ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)',
            color: contextText.trim() ? '#bbf7d0' : 'rgba(255,255,255,0.62)',
            borderRadius: 8,
            padding: '5px 8px',
            fontSize: 11,
            fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer',
          }}
        >
          Context
        </button>
      </div>
      {contextOpen && (
        <textarea
          value={contextText}
          onChange={(event) => setContextText(event.target.value)}
          placeholder="Add temporary files, notes, constraints, or snippets for the next message."
          rows={4}
          disabled={disabled}
          style={{
            width: '100%',
            marginBottom: 8,
            resize: 'vertical',
            borderRadius: 10,
            padding: 10,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.09)',
            color: '#e2e8f0',
            font: 'inherit',
            fontSize: 12,
            lineHeight: 1.45,
          }}
        />
      )}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
        background: 'rgba(255,255,255,0.06)',
        borderRadius: 12,
        padding: '8px 12px',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="Message…"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#e2e8f0',
            fontSize: 14,
            lineHeight: 1.5,
            resize: 'none',
            fontFamily: 'inherit',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        />
        {streaming ? (
          <button
            onClick={onStop}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'rgba(239,68,68,0.8)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            Stop
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              border: 'none',
              background: disabled || !text.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(96,165,250,0.8)',
              color: disabled || !text.trim() ? 'rgba(255,255,255,0.3)' : '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: disabled || !text.trim() ? 'default' : 'pointer',
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            Send
          </button>
        )}
      </div>
      <div style={{ marginTop: 8, paddingLeft: 4 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <ModelSelector
            value={modelChoice}
            onChange={onModelChange}
            geminiModel={geminiModel}
            onGeminiModelChange={onGeminiModelChange}
            ollamaModel={ollamaModel}
            ollamaModels={ollamaModels}
            onOllamaModelChange={onOllamaModelChange}
            cursorModel={cursorModel}
            cursorModels={cursorModels}
            cursorModelsLoading={cursorModelsLoading}
            cursorModelsError={cursorModelsError}
            onCursorModelChange={onCursorModelChange}
            onCursorModelsRefresh={onCursorModelsRefresh}
            disabled={disabled}
          />
          <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11 }}>
            ~{tokenEstimate.toLocaleString()} input tokens
          </span>
        </div>
      </div>
    </div>
  )
}
