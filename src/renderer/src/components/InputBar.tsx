import { useEffect, useRef, useState } from 'react'
import { ModelSelector } from './ModelSelector'
import type { CursorModelOption, GeminiModel, ModelChoice, SendMessageOptions, SkillEntry } from '../../../shared/types'

const PROVIDER_COLOR: Record<'claude' | 'codex', string> = {
  claude: 'rgba(168,85,247,0.75)',
  codex: 'rgba(56,189,248,0.75)',
}

interface Props {
  modelChoice: ModelChoice
  onModelChange: (v: ModelChoice) => void
  codexModel?: string
  codexModels?: string[]
  onCodexModelChange?: (v: string) => void
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

export function InputBar({
  modelChoice,
  onModelChange,
  codexModel,
  codexModels,
  onCodexModelChange,
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
  const [tokenEstimate, setTokenEstimate] = useState(0)
  const [skills, setSkills] = useState<SkillEntry[]>([])
  const [activeSkill, setActiveSkill] = useState<SkillEntry | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteIndex, setPaletteIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getSkills().then(setSkills).catch(() => {})
  }, [])

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      const estimate = await window.api.estimateTokens(text)
      setTokenEstimate(estimate)
    }, 150)
    return () => window.clearTimeout(handle)
  }, [text])

  const filteredSkills = paletteQuery
    ? skills.filter(s =>
        s.name.toLowerCase().includes(paletteQuery.toLowerCase()) ||
        s.provider.toLowerCase().includes(paletteQuery.toLowerCase())
      )
    : skills

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, { mode: 'quick', attachments: [], skill: activeSkill ?? undefined })
    setText('')
    setActiveSkill(null)
    setPaletteOpen(false)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  function selectSkill(skill: SkillEntry) {
    setActiveSkill(skill)
    setText('')
    setPaletteOpen(false)
    setPaletteQuery('')
    textareaRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (paletteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPaletteIndex(i => Math.min(i + 1, filteredSkills.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPaletteIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredSkills[paletteIndex]) selectSkill(filteredSkills[paletteIndex])
      } else if (e.key === 'Escape') {
        setPaletteOpen(false)
        setText('')
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    if (val.startsWith('/')) {
      const query = val.slice(1)
      setPaletteQuery(query)
      setPaletteOpen(true)
      setPaletteIndex(0)
    } else {
      setPaletteOpen(false)
    }

    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }

  return (
    <div style={{
      padding: '12px 16px 16px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(0,0,0,0.2)',
      position: 'relative',
    }}>
      {/* Skill palette */}
      {paletteOpen && filteredSkills.length > 0 && (
        <div
          ref={paletteRef}
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 16,
            right: 16,
            maxHeight: 280,
            overflowY: 'auto',
            background: 'rgba(15,23,42,0.97)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            zIndex: 50,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <div style={{ padding: '6px 10px 4px', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.35)' }}>
            Skills — type to filter, ↑↓ to navigate, Enter to select
          </div>
          {filteredSkills.map((skill, i) => (
            <div
              key={skill.id}
              onMouseDown={(e) => { e.preventDefault(); selectSkill(skill) }}
              onMouseEnter={() => setPaletteIndex(i)}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '8px 12px',
                cursor: 'pointer',
                background: i === paletteIndex ? 'rgba(255,255,255,0.07)' : 'transparent',
                borderRadius: 8,
                margin: '2px 4px',
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '1px 6px',
                borderRadius: 4,
                background: PROVIDER_COLOR[skill.provider],
                color: '#fff',
                flexShrink: 0,
              }}>
                {skill.provider}
              </span>
              <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500 }}>{skill.name}</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {skill.description.slice(0, 100)}
              </span>
            </div>
          ))}
        </div>
      )}

      {paletteOpen && filteredSkills.length === 0 && paletteQuery && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 4px)',
          left: 16,
          right: 16,
          padding: '10px 14px',
          background: 'rgba(15,23,42,0.97)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          fontSize: 13,
          color: 'rgba(255,255,255,0.4)',
          zIndex: 50,
        }}>
          No skills match "{paletteQuery}"
        </div>
      )}

      {/* Active skill chip */}
      {activeSkill && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          padding: '4px 10px 4px 8px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          width: 'fit-content',
        }}>
          <span style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 3,
            background: PROVIDER_COLOR[activeSkill.provider],
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {activeSkill.provider}
          </span>
          <span style={{ fontSize: 12, color: '#e2e8f0' }}>{activeSkill.name}</span>
          <button
            type="button"
            onClick={() => setActiveSkill(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: 0,
              marginLeft: 2,
            }}
            title="Remove skill"
          >
            ✕
          </button>
        </div>
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
          placeholder={activeSkill ? `Message with /${activeSkill.name}…` : 'Message… (type / for skills)'}
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
            codexModel={codexModel}
            codexModels={codexModels}
            onCodexModelChange={onCodexModelChange}
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
