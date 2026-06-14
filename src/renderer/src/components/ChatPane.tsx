import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { UsageDashboard } from './UsageDashboard'
import { ConnectionsDashboard } from './ConnectionsDashboard'
import { useChatStore } from '../store/chat'
import { CODEX_MODELS } from '../../../shared/types'
import type { ChatMessage, Conversation, ConversationMemory, CursorModelOption, DeepSeekModel, GeminiModel, SendMessageOptions, TaskState, ThreadStatus } from '../../../shared/types'

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
}: {
  memory: ConversationMemory
  onSave: (memory: ConversationMemory) => void
}) {
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
    <div className="thread-drawer__memory">
      {memory.summary && (
        <div className="thread-drawer__memory-summary">
          Summary active · ~{Math.ceil(memory.summary.length / 4).toLocaleString()} tokens
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
        <label style={memoryLabelStyle}>
          Active goal
          <textarea value={activeGoal} onChange={e => setActiveGoal(e.target.value)} rows={3} style={memoryTextStyle} />
        </label>
        <label style={memoryLabelStyle}>
          Pinned facts
          <textarea value={pinnedFacts} onChange={e => setPinnedFacts(e.target.value)} rows={3} style={memoryTextStyle} />
        </label>
        <label style={memoryLabelStyle}>
          Decisions
          <textarea value={decisions} onChange={e => setDecisions(e.target.value)} rows={3} style={memoryTextStyle} />
        </label>
      </div>
      {memory.summary && (
        <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 12, lineHeight: 1.5, marginBottom: 10 }}>
          {memory.summary}
        </div>
      )}
      <button type="button" onClick={save} style={smallActionStyle}>Save memory</button>
    </div>
  )
}

function latestUserMessage(conversation: Conversation): string {
  return [...conversation.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
}

function promotionDefaults(conversation: Conversation): { title: string; brief: string } {
  const activeGoal = conversation.resumeState?.userGoal?.trim() || conversation.memory?.activeGoal?.trim()
  const latestUser = latestUserMessage(conversation).trim()
  const summary = conversation.resumeState?.currentState?.trim() || conversation.memory?.summary?.trim()
  const nextSteps = conversation.resumeState?.nextSteps?.length
    ? `Next steps:\n${conversation.resumeState.nextSteps.map((step) => `- ${step}`).join('\n')}`
    : ''
  const titleSource = activeGoal || latestUser || conversation.title
  const title = titleSource.split('\n')[0].slice(0, 72) || 'Untitled task'
  const brief = [
    activeGoal,
    latestUser && latestUser !== activeGoal ? latestUser : '',
    summary ? `Context summary: ${summary}` : '',
    nextSteps,
  ].filter(Boolean).join('\n\n')
  return { title, brief }
}

function formatDateTime(value?: string): string {
  if (!value) return 'unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'unknown'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function threadStatusLabel(status: ThreadStatus | undefined): string {
  if (status === 'paused') return 'Paused'
  if (status === 'completed') return 'Completed'
  if (status === 'archived') return 'Archived'
  return 'Active'
}

function hasVisibleContinuity(conversation: Conversation): boolean {
  const resume = conversation.resumeState
  return !!(
    resume?.currentState?.trim() ||
    resume?.nextSteps?.length ||
    (resume?.userGoal?.trim() && resume.userGoal.trim() !== conversation.title.trim())
  )
}

function ChatHeader({
  conversation,
  onOpenDrawer,
}: {
  conversation: Conversation
  onOpenDrawer: () => void
}) {
  return (
    <div className="chat-header">
      <span className="chat-header__title">{conversation.title}</span>
      {conversation.readOnly && <span className="chat-header__imported">Imported</span>}
      <button type="button" className="chat-header__drawer-btn" onClick={onOpenDrawer} title="Thread details">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m8 5 5 5-5 5" />
        </svg>
      </button>
    </div>
  )
}

function ThreadDrawer({
  conversation,
  open,
  onClose,
  saving,
  onStatusChange,
  onContinueImport,
  onPromoteToTask,
  onMemorySave,
  onCompact,
}: {
  conversation: Conversation
  open: boolean
  onClose: () => void
  saving: boolean
  onStatusChange: (status: ThreadStatus) => void
  onContinueImport: () => void
  onPromoteToTask: () => void
  onMemorySave: (memory: ConversationMemory) => void
  onCompact: () => void
}) {
  const readOnly = !!conversation.readOnly
  const status = conversation.status ?? 'active'
  const resume = conversation.resumeState
  const workspace = conversation.workspaceSnapshot

  return (
    <div className={`thread-drawer${open ? ' is-open' : ''}`} aria-hidden={!open}>
      <div className="thread-drawer__head">
        <span className="thread-drawer__head-title">Thread</span>
        <button type="button" className="thread-drawer__close" onClick={onClose} title="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 5 10 10M15 5 5 15" /></svg>
        </button>
      </div>

      <div className="thread-drawer__body">
        <div className="thread-drawer__section">
          <div className="thread-drawer__conv-title">{resume?.userGoal || conversation.title}</div>
          <div className="thread-drawer__meta">
            <span className={`thread-drawer__status-badge thread-drawer__status-badge--${readOnly ? 'imported' : status}`}>
              {readOnly ? 'Imported' : threadStatusLabel(status)}
            </span>
            <span>{formatDateTime(conversation.updatedAt ?? conversation.createdAt)}</span>
          </div>
          {(workspace?.gitBranch || workspace?.gitCommit) && (
            <div className="thread-drawer__git">
              {workspace.gitBranch && <span>{workspace.gitBranch}</span>}
              {workspace.gitCommit && <span>@ {workspace.gitCommit.slice(0, 7)}</span>}
            </div>
          )}
          {readOnly && conversation.source && (
            <div className="thread-drawer__import-note">
              {conversation.source === 'codex'
                ? 'Imported from Codex. Relay syncs this transcript from local history; it stays read-only here.'
                : `Imported from ${conversation.source}. This transcript is read-only.`}
              {conversation.externalLink?.terminalName && (
                <span> Linked to terminal <strong>{conversation.externalLink.terminalName}</strong>
                  {conversation.externalLink.taskTitle ? ` for task "${conversation.externalLink.taskTitle}"` : ''}.
                </span>
              )}
            </div>
          )}
        </div>

        <div className="thread-drawer__section">
          <div className="thread-drawer__actions">
            {readOnly ? (
              <>
                <button type="button" className="thread-drawer__action-btn thread-drawer__action-btn--primary" onClick={onContinueImport} disabled={saving}>
                  {saving ? 'Creating...' : 'Continue in Relay'}
                </button>
                <button type="button" className="thread-drawer__action-btn" onClick={onPromoteToTask}>
                  Promote to task
                </button>
              </>
            ) : (
              <>
                {status === 'active' ? (
                  <>
                    <button type="button" className="thread-drawer__action-btn" onClick={() => onStatusChange('paused')} disabled={saving}>Pause</button>
                    <button type="button" className="thread-drawer__action-btn" onClick={() => onStatusChange('completed')} disabled={saving}>Mark complete</button>
                  </>
                ) : (
                  <button type="button" className="thread-drawer__action-btn" onClick={() => onStatusChange('active')} disabled={saving}>Resume</button>
                )}
                {status !== 'archived' && (
                  <button type="button" className="thread-drawer__action-btn" onClick={() => onStatusChange('archived')} disabled={saving}>Archive</button>
                )}
                <button type="button" className="thread-drawer__action-btn" onClick={onPromoteToTask}>Promote to task</button>
                <button type="button" className="thread-drawer__action-btn" onClick={onCompact}>Compact memory</button>
              </>
            )}
          </div>
        </div>

        {hasVisibleContinuity(conversation) && (
          <div className="thread-drawer__section">
            {resume?.userGoal && resume.userGoal !== conversation.title && (
              <div className="thread-drawer__field">
                <div className="thread-drawer__field-label">Goal</div>
                <div className="thread-drawer__field-value">{resume.userGoal}</div>
              </div>
            )}
            {resume?.currentState && (
              <div className="thread-drawer__field">
                <div className="thread-drawer__field-label">Current state</div>
                <div className="thread-drawer__field-value">{resume.currentState}</div>
              </div>
            )}
            {!!resume?.nextSteps?.length && (
              <div className="thread-drawer__field">
                <div className="thread-drawer__field-label">Next steps</div>
                <ul className="thread-drawer__steps">
                  {resume.nextSteps.slice(0, 3).map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!readOnly && (
          <div className="thread-drawer__section">
            <div className="thread-drawer__section-label">Memory</div>
            <MemoryPanel memory={conversation.memory ?? {}} onSave={onMemorySave} />
          </div>
        )}
      </div>
    </div>
  )
}

function PromoteTaskModal({
  title,
  brief,
  state,
  saving,
  onTitleChange,
  onBriefChange,
  onStateChange,
  onCancel,
  onSubmit,
}: {
  title: string
  brief: string
  state: TaskState
  saving: boolean
  onTitleChange: (value: string) => void
  onBriefChange: (value: string) => void
  onStateChange: (value: TaskState) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="promote-modal" role="dialog" aria-modal="true" aria-label="Promote chat to task">
      <div className="promote-modal__panel">
        <div className="promote-modal__header">
          <div>
            <div className="promote-modal__eyebrow">Task promotion</div>
            <div className="promote-modal__title">Promote chat to task</div>
          </div>
          <button type="button" className="promote-modal__close" onClick={onCancel}>x</button>
        </div>
        <label className="promote-modal__field">
          <span>Title</span>
          <input value={title} onChange={(event) => onTitleChange(event.target.value)} />
        </label>
        <label className="promote-modal__field">
          <span>Brief</span>
          <textarea value={brief} rows={7} onChange={(event) => onBriefChange(event.target.value)} />
        </label>
        <label className="promote-modal__field">
          <span>Initial state</span>
          <select value={state} onChange={(event) => onStateChange(event.target.value as TaskState)}>
            <option value="idea">Idea</option>
            <option value="running">Running</option>
            <option value="blocked">Blocked</option>
            <option value="review">Review</option>
            <option value="done">Done</option>
          </select>
        </label>
        <div className="promote-modal__actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="promote-modal__primary" disabled={!title.trim() || saving} onClick={onSubmit}>
            {saving ? 'Creating...' : 'Create task'}
          </button>
        </div>
      </div>
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

export function ChatPane({
  onOpenTerminals,
  visible = true,
}: {
  onOpenTerminals?: () => void
  visible?: boolean
}) {
  const { conversations, activeId, activePane, modelChoice, sending, setModelChoice, setSending, setActiveId, replaceConversation, prependConversation } = useChatStore()
  const [codexModel, setCodexModelState] = useState<string>(CODEX_MODELS[0])
  const [codexModels, setCodexModels] = useState<string[]>([...CODEX_MODELS])
  const [geminiModel, setGeminiModelState] = useState<GeminiModel>('gemini-3.5-flash')
  const [deepSeekModel, setDeepSeekModelState] = useState<DeepSeekModel>('deepseek-v4-flash')
  const [ollamaModel, setOllamaModelState] = useState<string | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState('http://localhost:11434')
  const [cursorModel, setCursorModelState] = useState('auto')
  const [cursorModels, setCursorModels] = useState<CursorModelOption[]>([])
  const [cursorModelsLoading, setCursorModelsLoading] = useState(false)
  const [cursorModelsError, setCursorModelsError] = useState('')
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [promoteTitle, setPromoteTitle] = useState('')
  const [promoteBrief, setPromoteBrief] = useState('')
  const [promoteState, setPromoteState] = useState<TaskState>('idea')
  const [promoteSaving, setPromoteSaving] = useState(false)
  const [promoteStatus, setPromoteStatus] = useState('')
  const [threadSaving, setThreadSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const conversation = conversations.find(c => c.id === activeId)
  const messagesRef = useRef<HTMLDivElement>(null)
  const restoringScrollRef = useRef(false)
  const [autoFollow, setAutoFollow] = useState(true)
  const usageSummary = conversation ? buildUsageSummary(conversation.messages) : []
  const readOnly = !!conversation?.readOnly

  useEffect(() => {
    async function loadProviderState() {
      const [codex, gemini, deepSeek, ollama, cursor] = await Promise.all([
        window.api.getCodexModel(),
        window.api.getGeminiModel(),
        window.api.getDeepSeekModel(),
        window.api.getOllamaStatus(),
        window.api.getCursorKeyStatus(),
      ])
      setCodexModelState(codex)
      setGeminiModelState(gemini)
      setDeepSeekModelState(deepSeek)
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

  async function handleDeepSeekModelChange(model: DeepSeekModel) {
    setDeepSeekModelState(model)
    await window.api.setDeepSeekModel(model)
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

  function scrollToLatest(behavior: ScrollBehavior = 'auto', restoring = false) {
    if (restoring) restoringScrollRef.current = true
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const messages = messagesRef.current
        if (!messages) {
          restoringScrollRef.current = false
          return
        }
        messages.scrollTo({ top: messages.scrollHeight, behavior })
        if (restoring) {
          requestAnimationFrame(() => {
            restoringScrollRef.current = false
          })
        }
      })
    })
  }

  useEffect(() => {
    setAutoFollow(true)
  }, [activeId])

  useEffect(() => {
    if (!visible || !autoFollow) return
    scrollToLatest('auto', true)
  }, [activeId, visible, autoFollow, conversation?.messages.length, conversation?.messages.at(-1)?.content])

  function handleMessagesScroll() {
    if (restoringScrollRef.current) return
    const el = messagesRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight)
    // Stop auto-follow once the user scrolls meaningfully away from latest messages.
    setAutoFollow(distanceFromBottom < 72)
  }

  function jumpToLatest() {
    setAutoFollow(true)
    scrollToLatest('smooth')
  }

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

  function openPromotion() {
    if (!conversation) return
    const defaults = promotionDefaults(conversation)
    setPromoteTitle(defaults.title)
    setPromoteBrief(defaults.brief)
    setPromoteState('idea')
    setPromoteStatus('')
    setPromoteOpen(true)
  }

  async function handlePromoteSubmit() {
    if (!conversation || !promoteTitle.trim() || promoteSaving) return
    setPromoteSaving(true)
    try {
      await window.api.promoteConversationToTask(conversation.id, {
        title: promoteTitle,
        brief: promoteBrief,
        state: promoteState,
      })
      setPromoteStatus('Task created.')
      setPromoteOpen(false)
    } catch (err) {
      setPromoteStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setPromoteSaving(false)
    }
  }

  async function handleThreadStatusChange(status: ThreadStatus) {
    if (!conversation || conversation.readOnly || threadSaving) return
    setThreadSaving(true)
    try {
      const next = await window.api.updateThreadStatus(conversation.id, status)
      if (next) replaceConversation(next)
    } finally {
      setThreadSaving(false)
    }
  }

  async function handleContinueImported() {
    if (!conversation || !conversation.readOnly || threadSaving) return
    setThreadSaving(true)
    try {
      const next = await window.api.cloneImportedConversation(conversation.id)
      prependConversation(next)
      setActiveId(next.id)
    } finally {
      setThreadSaving(false)
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      <ChatHeader conversation={conversation} onOpenDrawer={() => setDrawerOpen(true)} />

      <ThreadDrawer
        conversation={conversation}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        saving={threadSaving}
        onStatusChange={(status) => void handleThreadStatusChange(status)}
        onContinueImport={() => void handleContinueImported()}
        onPromoteToTask={openPromotion}
        onMemorySave={handleMemorySave}
        onCompact={handleCompact}
      />

      {promoteOpen && (
        <PromoteTaskModal
          title={promoteTitle}
          brief={promoteBrief}
          state={promoteState}
          saving={promoteSaving}
          onTitleChange={setPromoteTitle}
          onBriefChange={setPromoteBrief}
          onStateChange={setPromoteState}
          onCancel={() => setPromoteOpen(false)}
          onSubmit={() => void handlePromoteSubmit()}
        />
      )}

      <div
        ref={messagesRef}
        onScroll={handleMessagesScroll}
        style={{
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
        {!autoFollow && conversation.messages.length > 0 && (
          <div style={{ position: 'sticky', bottom: 14, display: 'flex', justifyContent: 'flex-end', pointerEvents: 'none' }}>
            <button
              type="button"
              onClick={jumpToLatest}
              style={{
                pointerEvents: 'auto',
                border: '1px solid rgba(90,180,255,0.34)',
                background: 'rgba(12,18,30,0.88)',
                color: 'rgba(191,219,254,0.95)',
                borderRadius: 999,
                padding: '7px 12px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 6px 22px rgba(0,0,0,0.35)',
              }}
            >
              Jump to latest
            </button>
          </div>
        )}
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
          deepSeekModel={deepSeekModel}
          onDeepSeekModelChange={handleDeepSeekModelChange}
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
          Use Continue in Relay to create an editable thread from this history.
        </div>
      )}
    </div>
  )
}
