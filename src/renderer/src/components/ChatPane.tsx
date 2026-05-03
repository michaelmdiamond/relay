import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { UsageDashboard } from './UsageDashboard'
import { ConnectionsDashboard } from './ConnectionsDashboard'
import { useChatStore } from '../store/chat'
import { CODEX_MODELS } from '../../../shared/types'
import type { ChatMessage, ConversationMemory, CursorModelOption, GeminiModel, SendMessageOptions } from '../../../shared/types'

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function buildUsageSummary(messages: ChatMessage[]) {
  const byModel = new Map<string, {
    modelLabel: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    effectiveInputTokens: number
  }>()

  for (const message of messages) {
    if (message.role !== 'assistant' || !message.routing || !message.usage) continue
    const existing = byModel.get(message.routing.model) ?? {
      modelLabel: message.routing.modelLabel,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      effectiveInputTokens: 0,
    }

    existing.inputTokens += message.usage.inputTokens
    existing.outputTokens += message.usage.outputTokens
    existing.totalTokens += message.usage.totalTokens
    existing.effectiveInputTokens += message.usage.effectiveInputTokens ?? message.usage.inputTokens
    byModel.set(message.routing.model, existing)
  }

  return [...byModel.entries()]
    .map(([model, usage]) => ({ model, ...usage }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
}

function linesToList(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
}

function listToLines(value?: string[]): string {
  return (value ?? []).join('\n')
}

function MemoryPanel({
  memory,
  onSave,
  onCompact,
  onWorkflowHandoff,
}: {
  memory: ConversationMemory
  onSave: (memory: ConversationMemory) => void
  onCompact: () => void
  onWorkflowHandoff: () => void
}) {
  const [open, setOpen] = useState(false)
  const [activeGoal, setActiveGoal] = useState(memory.activeGoal ?? '')
  const [pinnedFacts, setPinnedFacts] = useState(listToLines(memory.pinnedFacts))
  const [decisions, setDecisions] = useState(listToLines(memory.decisions))

  useEffect(() => {
    setActiveGoal(memory.activeGoal ?? '')
    setPinnedFacts(listToLines(memory.pinnedFacts))
    setDecisions(listToLines(memory.decisions))
  }, [memory.activeGoal, memory.pinnedFacts, memory.decisions])

  function save() {
    onSave({
      activeGoal: activeGoal.trim(),
      pinnedFacts: linesToList(pinnedFacts),
      decisions: linesToList(decisions),
    })
  }

  return (
    <div style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(255,255,255,0.025)',
      padding: '10px 16px',
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          style={{
            border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.05)',
            color: '#e2e8f0',
            padding: '6px 9px',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Memory
        </button>
        {memory.summary && (
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>
            Summary active · ~{Math.ceil(memory.summary.length / 4).toLocaleString()} tokens
          </span>
        )}
        <button type="button" onClick={onCompact} style={smallActionStyle}>Compact now</button>
        <button type="button" onClick={onWorkflowHandoff} style={smallActionStyle}>Handoff to workflow</button>
      </div>
      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 10 }}>
          <label style={memoryLabelStyle}>
            Active goal
            <textarea value={activeGoal} onChange={e => setActiveGoal(e.target.value)} rows={4} style={memoryTextStyle} />
          </label>
          <label style={memoryLabelStyle}>
            Pinned facts
            <textarea value={pinnedFacts} onChange={e => setPinnedFacts(e.target.value)} rows={4} style={memoryTextStyle} />
          </label>
          <label style={memoryLabelStyle}>
            Decisions
            <textarea value={decisions} onChange={e => setDecisions(e.target.value)} rows={4} style={memoryTextStyle} />
          </label>
          {memory.summary && (
            <div style={{ gridColumn: '1 / -1', color: 'rgba(255,255,255,0.48)', fontSize: 12, lineHeight: 1.5 }}>
              {memory.summary}
            </div>
          )}
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="button" onClick={save} style={smallActionStyle}>Save memory</button>
          </div>
        </div>
      )}
    </div>
  )
}

const smallActionStyle: CSSProperties = {
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.64)',
  padding: '6px 9px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}

const memoryLabelStyle: CSSProperties = {
  display: 'grid',
  gap: 6,
  color: 'rgba(255,255,255,0.5)',
  fontSize: 11,
  fontWeight: 700,
}

const memoryTextStyle: CSSProperties = {
  width: '100%',
  resize: 'vertical',
  borderRadius: 8,
  padding: 8,
  background: 'rgba(0,0,0,0.18)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#e2e8f0',
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1.45,
}

export function ChatPane() {
  const { conversations, activeId, activePane, modelChoice, sending, setModelChoice, setSending, replaceConversation } = useChatStore()
  const [codexModel, setCodexModelState] = useState<string>(CODEX_MODELS[0])
  const [codexModels, setCodexModels] = useState<string[]>([...CODEX_MODELS])
  const [geminiModel, setGeminiModelState] = useState<GeminiModel>('gemini-2.5-flash')
  const [ollamaModel, setOllamaModelState] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [cursorModel, setCursorModelState] = useState('auto')
  const [cursorModels, setCursorModels] = useState<CursorModelOption[]>([])
  const [cursorModelsLoading, setCursorModelsLoading] = useState(false)
  const [cursorModelsError, setCursorModelsError] = useState('')
  const conversation = conversations.find(c => c.id === activeId)
  const bottomRef = useRef<HTMLDivElement>(null)
  const usageSummary = conversation ? buildUsageSummary(conversation.messages) : []
  const readOnly = !!conversation?.readOnly

  useEffect(() => {
    async function loadProviderState() {
      const [codex, gemini, ollama, cursor] = await Promise.all([
        window.api.getCodexModel(),
        window.api.getGeminiModel(),
        window.api.getOllamaStatus(),
        window.api.getCursorKeyStatus(),
      ])
      setCodexModelState(codex)
      setGeminiModelState(gemini)
      const baseUrl = ollama.baseUrl ?? 'http://localhost:11434'
      setOllamaBaseUrl(baseUrl)
      setOllamaModelState(ollama.configured && ollama.model ? ollama.model : null)
      const [ollamaModelResult, selectedCursorModel] = await Promise.all([
        window.api.getOllamaModels(baseUrl),
        window.api.getCursorModel(),
      ])
      setOllamaModels(ollamaModelResult.models)
      setCursorModelState(selectedCursorModel)
      const codexModelResult = await window.api.getCodexModels()
      setCodexModels(codexModelResult.models)
      if (!codexModelResult.error && codexModelResult.models.length && !codexModelResult.models.includes(codex)) {
        const nextCodexModel = codexModelResult.models[0]
        setCodexModelState(nextCodexModel)
        await window.api.setCodexModel(nextCodexModel)
      }
      if (cursor.configured) {
        await refreshCursorModels()
      }
    }

    void loadProviderState()
  }, [])

  async function refreshCursorModels() {
    setCursorModelsLoading(true)
    setCursorModelsError('')
    try {
      const [selected, result] = await Promise.all([
        window.api.getCursorModel(),
        window.api.getCursorModels(),
      ])
      setCursorModelState(selected)
      setCursorModels(result.models)
      if (result.error) setCursorModelsError(result.error)
    } finally {
      setCursorModelsLoading(false)
    }
  }

  async function handleGeminiModelChange(model: GeminiModel) {
    setGeminiModelState(model)
    await window.api.setGeminiModel(model)
  }

  async function handleCodexModelChange(model: string) {
    setCodexModelState(model)
    await window.api.setCodexModel(model)
  }

  async function handleOllamaModelChange(model: string) {
    setOllamaModelState(model)
    await window.api.setOllamaConfig(ollamaBaseUrl, model)
  }

  async function handleCursorModelChange(model: string) {
    setCursorModelState(model)
    await window.api.setCursorModel(model)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages.length, conversation?.messages.at(-1)?.content])

  useEffect(() => {
    const unsub0 = window.api.onStreamStart((convId, msgId, routing) => {
      useChatStore.getState().addStreamingPlaceholder(convId, msgId, routing)
    })
    const unsub1 = window.api.onChunk((convId, msgId, chunk) => {
      useChatStore.getState().appendChunk(convId, msgId, chunk)
    })
    const unsub2 = window.api.onMessageDone((convId, message) => {
      useChatStore.getState().finalizeMessage(convId, message)
      useChatStore.getState().setSending(false)
    })
    const unsub3 = window.api.onError((convId, msgId, error) => {
      useChatStore.getState().appendError(convId, msgId, error)
      useChatStore.getState().setSending(false)
    })
    const unsub4 = window.api.onCanceled((convId, msgId) => {
      useChatStore.getState().removeMessage(convId, msgId)
      useChatStore.getState().setSending(false)
    })
    return () => { unsub0(); unsub1(); unsub2(); unsub3(); unsub4() }
  }, [])

  async function handleSend(content: string, options?: SendMessageOptions) {
    if (!activeId || sending || readOnly) return
    setSending(true)
    // Add user message optimistically — backend persists it, renderer store drives display.
    // The streaming placeholder arrives via onStreamStart once backend creates the assistant slot.
    useChatStore.getState().addMessage(activeId, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    })
    window.api.sendMessage(activeId, content, modelChoice, options)
  }

  async function handleStop() {
    if (!activeId || readOnly) return
    await window.api.cancelMessage(activeId)
    setSending(false)
  }

  async function handleMemorySave(memory: ConversationMemory) {
    if (!activeId) return
    const next = await window.api.updateConversationMemory(activeId, memory)
    if (next) replaceConversation(next)
  }

  async function handleCompact() {
    if (!activeId) return
    const next = await window.api.compactConversation(activeId)
    if (next) replaceConversation(next)
  }

  async function handleWorkflowHandoff() {
    if (!conversation) return
    const goal = [
      conversation.memory?.activeGoal,
      conversation.messages.at(-1)?.content,
      conversation.memory?.summary ? `Context summary: ${conversation.memory.summary}` : '',
    ].filter(Boolean).join('\n\n')
    const workflows = await window.api.getWorkflowDefinitions()
    if (workflows[0] && goal.trim()) {
      await window.api.startWorkflowRun(workflows[0].id, goal.trim())
    }
  }

  if (activePane === 'usage') {
    return <UsageDashboard conversations={conversations} />
  }

  if (activePane === 'connections') {
    return <ConnectionsDashboard />
  }

  if (!conversation) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.2)',
        fontSize: 14,
      }}>
        Select a conversation or start a new one
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {readOnly && conversation && (
        <div style={{
          padding: '10px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.04)',
          color: 'rgba(255,255,255,0.62)',
          fontSize: 12,
        }}>
          Imported from {conversation.source}. This transcript is read-only history.
        </div>
      )}

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 24px 8px',
      }}>
        {usageSummary.length > 0 && (
          <div style={{
            marginBottom: 20,
            padding: '12px 14px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.42)',
              marginBottom: 8,
            }}>
              Token usage by model
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {usageSummary.map((entry) => (
                <div key={entry.model} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                  fontSize: 12,
                }}>
                  <span style={{ color: '#e2e8f0' }}>{entry.modelLabel}</span>
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {formatCount(entry.totalTokens)} total
                    {' '}
                    ({formatCount(entry.inputTokens)} in / {formatCount(entry.outputTokens)} out)
                    {entry.effectiveInputTokens !== entry.inputTokens && ` · ${formatCount(entry.effectiveInputTokens)} effective in`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {conversation.messages.length === 0 && (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: 14,
          }}>
            Start the conversation
          </div>
        )}
        {conversation.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {!readOnly ? (
        <InputBar
          modelChoice={modelChoice}
          onModelChange={setModelChoice}
          codexModel={codexModel}
          codexModels={codexModels}
          onCodexModelChange={handleCodexModelChange}
          geminiModel={geminiModel}
          onGeminiModelChange={handleGeminiModelChange}
          ollamaModel={ollamaModel}
          ollamaModels={ollamaModels}
          onOllamaModelChange={handleOllamaModelChange}
          cursorModel={cursorModel}
          cursorModels={cursorModels}
          cursorModelsLoading={cursorModelsLoading}
          cursorModelsError={cursorModelsError}
          onCursorModelChange={handleCursorModelChange}
          onCursorModelsRefresh={() => void refreshCursorModels()}
          onSend={handleSend}
          onStop={handleStop}
          disabled={sending}
          streaming={sending}
        />
      ) : (
        <div style={{
          padding: '14px 16px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
          color: 'rgba(255,255,255,0.38)',
          fontSize: 12,
        }}>
          Start a new Relay chat to continue working from this history.
        </div>
      )}
    </div>
  )
}
