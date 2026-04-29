import { useRef, useState } from 'react'
import { ModelSelector } from './ModelSelector'
import type { GeminiModel, ModelChoice } from '../../../shared/types'

interface Props {
  modelChoice: ModelChoice
  onModelChange: (v: ModelChoice) => void
  geminiModel?: GeminiModel
  onGeminiModelChange?: (v: GeminiModel) => void
  onSend: (content: string) => void
  onStop?: () => void
  disabled?: boolean
  streaming?: boolean
}

export function InputBar({ modelChoice, onModelChange, geminiModel, onGeminiModelChange, onSend, onStop, disabled, streaming }: Props) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
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
        <ModelSelector
          value={modelChoice}
          onChange={onModelChange}
          geminiModel={geminiModel}
          onGeminiModelChange={onGeminiModelChange}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
