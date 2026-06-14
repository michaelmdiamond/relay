import { useEffect, useMemo, useState } from 'react'
import type {
  AgentProfile,
  AgentKnowledgeEntry,
  AgentProfileRun,
  AutomationCatalogItem,
  AutomationCatalogSnapshot,
  AutomationProviderSummary,
  CursorModelOption,
  ModelChoice,
  ScheduledAutomation,
  ScheduledAutomationInput,
  Workspace,
  WorkflowAgentProvider,
} from '../../../shared/types'
import { AgentProfileEditor } from './AgentProfileEditor'

// ── Constants ────────────────────────────────────────────────────────────────

const MODEL_OPTIONS: { value: ModelChoice; label: string }[] = [
  { value: 'sonnet', label: 'Claude Sonnet' },
  { value: 'haiku', label: 'Claude Haiku' },
  { value: 'opus', label: 'Claude Opus' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'codex', label: 'Codex' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'cursor', label: 'Cursor' },
]

const SCHEDULE_PRESETS = [
  { label: 'Every 30 min', value: '*/30 * * * *' },
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 9am', value: '0 9 * * *' },
  { label: 'Daily at 6pm', value: '0 18 * * *' },
  { label: 'Weekdays at 9am', value: '0 9 * * 1-5' },
  { label: 'Weekly (Mon 9am)', value: '0 9 * * 1' },
  { label: 'Custom…', value: 'custom' },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function humanSchedule(cron: string): string {
  const match = SCHEDULE_PRESETS.find((p) => p.value === cron && p.value !== 'custom')
  return match ? match.label : cron
}

function timeAgo(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.round(hr / 24)}d ago`
}

function timeUntil(iso?: string): string {
  if (!iso) return '—'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff < 0) return 'overdue'
  const min = Math.round(diff / 60000)
  if (min < 1) return 'soon'
  if (min < 60) return `in ${min}m`
  const hr = Math.round(min / 60)
  if (hr < 24) return `in ${hr}h`
  return `in ${Math.round(hr / 24)}d`
}

function statusDot(status: AutomationProviderSummary['status']): string {
  if (status === 'connected') return '#4ade80'
  if (status === 'detected') return '#60a5fa'
  return 'rgba(255,255,255,0.25)'
}

function sourceLabel(source: AutomationCatalogItem['source']): string {
  if (source === 'relay') return 'Relay'
  if (source === 'codex') return 'Codex'
  return 'Claude'
}

function kindLabel(kind: AutomationCatalogItem['kind']): string {
  if (kind === 'agent') return 'Agent'
  if (kind === 'workflow') return 'Workflow'
  return 'Scheduled task'
}

function agentProviderLabel(provider: WorkflowAgentProvider): string {
  if (provider === 'openai') return 'Codex'
  if (provider === 'google') return 'Gemini'
  if (provider === 'anthropic') return 'Claude'
  if (provider === 'deepseek') return 'DeepSeek'
  if (provider === 'ollama') return 'Local'
  if (provider === 'cursor') return 'Cursor'
  return provider
}

function agentRoleLabel(role: AgentProfile['role']): string {
  return role === 'reviewer' ? 'Reviewer' : 'Builder'
}

function summarizeAgent(profile: AgentProfile): string {
  const firstLine = profile.systemPrompt
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean)
  return firstLine ?? 'No purpose written yet.'
}

function suggestedAgentTasks(profile: AgentProfile): string[] {
  const name = profile.name.toLowerCase()
  if (name.includes('tool')) {
    return [
      'Review the knowledge base and tell me what needs verification.',
      'Update this month\'s usage log. Ask me for any missing usage details first.',
      'Focus on the soonest-expiring tools and recommend what I should evaluate next.',
    ]
  }
  return [
    'Review the current workspace and summarize what you understand.',
    'Do a focused maintenance pass and report what changed.',
    'Answer my question using your saved knowledge and current workspace context.',
  ]
}

// ── Form state ───────────────────────────────────────────────────────────────

interface FormState extends ScheduledAutomationInput {
  schedulePreset: string
  customSchedule: string
}

function blankForm(): FormState {
  return { title: '', prompt: '', model: 'sonnet', schedule: '0 9 * * *', schedulePreset: '0 9 * * *', customSchedule: '' }
}

function formFromAutomation(a: ScheduledAutomation): FormState {
  const preset = SCHEDULE_PRESETS.find((p) => p.value === a.schedule && p.value !== 'custom')
  return {
    title: a.title, prompt: a.prompt, model: a.model, schedule: a.schedule,
    schedulePreset: preset ? a.schedule : 'custom',
    customSchedule: preset ? '' : a.schedule,
  }
}

function resolvedSchedule(f: FormState): string {
  return f.schedulePreset === 'custom' ? f.customSchedule.trim() : f.schedulePreset
}

function makeAgentId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agent'
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Date.now().toString(36)
  return `${slug}-${suffix}`
}

function blankAgent(): AgentProfile {
  return {
    id: makeAgentId('agent'),
    name: '',
    provider: 'openai',
    model: 'gpt-5.5',
    role: 'implementer',
    systemPrompt: '',
    foundationPrompt: '',
    enabled: true,
  }
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'agents' | 'schedules' | 'sources'

export function AutomationsPane({
  workspaceId,
  workspaces,
  onWorkspacesChange,
}: {
  workspaceId?: string | null
  workspaces: Workspace[]
  onWorkspacesChange?: (workspaces: Workspace[]) => void
}) {
  const [tab, setTab] = useState<Tab>('agents')
  const [catalog, setCatalog] = useState<AutomationCatalogSnapshot | null>(null)
  const [agentProfiles, setAgentProfiles] = useState<AgentProfile[]>([])
  const [automations, setAutomations] = useState<ScheduledAutomation[]>([])
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null)
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null)
  const [newAgentDraft, setNewAgentDraft] = useState<AgentProfile | null>(null)
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<FormState>(blankForm())
  const [saving, setSaving] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')
  const [agentError, setAgentError] = useState('')
  const [codexModels, setCodexModels] = useState<string[]>([])
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [cursorModels, setCursorModels] = useState<CursorModelOption[]>([])
  const [runTarget, setRunTarget] = useState<AgentProfile | null>(null)
  const [runPrompt, setRunPrompt] = useState('')
  const [saveRunToKnowledge, setSaveRunToKnowledge] = useState(true)
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null)
  const [agentRunResult, setAgentRunResult] = useState<AgentProfileRun | null>(null)
  const [agentKnowledge, setAgentKnowledge] = useState<AgentKnowledgeEntry[]>([])
  const [agentRuns, setAgentRuns] = useState<AgentProfileRun[]>([])
  const [runWorkspaceId, setRunWorkspaceId] = useState<string>('')
  const [runMode, setRunMode] = useState<'setup' | 'run'>('run')
  const [showRunOutput, setShowRunOutput] = useState(false)
  const repoWorkspaces = useMemo(() => workspaces.filter((workspace) => workspace.kind === 'repo' && workspace.projectPath), [workspaces])

  useEffect(() => {
    async function load() {
      const [nextCatalog, profiles, scheduled, codexResult, ollamaStatus, cursorStatus] = await Promise.all([
        window.api.getAutomationCatalog(),
        window.api.getAgentProfiles(),
        window.api.getScheduledAutomations(),
        window.api.getCodexModels(),
        window.api.getOllamaStatus(),
        window.api.getCursorKeyStatus(),
      ])
      setCatalog(nextCatalog)
      setAgentProfiles(profiles)
      setAutomations(scheduled)
      setCodexModels(codexResult.models)

      const ollamaBaseUrl = ollamaStatus.baseUrl ?? 'http://localhost:11434'
      const [ollamaResult, cursorResult] = await Promise.all([
        window.api.getOllamaModels(ollamaBaseUrl),
        cursorStatus.configured ? window.api.getCursorModels() : Promise.resolve({ models: [] as CursorModelOption[] }),
      ])
      setOllamaModels(ollamaResult.models)
      setCursorModels(cursorResult.models)
    }
    void load()
    const off = window.api.onScheduledAutomationsUpdated(setAutomations)
    return off
  }, [])

  const externalItems = useMemo(() => catalog?.items.filter((i) => i.external) ?? [], [catalog])

  async function handleSaveAgent(profile: AgentProfile) {
    setSavingAgentId(profile.id)
    setAgentError('')
    try {
      const nextProfiles = await window.api.saveAgentProfile(profile)
      setAgentProfiles(nextProfiles)
      if (newAgentDraft?.id === profile.id) setNewAgentDraft(null)
      if (editingAgentId === profile.id) setEditingAgentId(null)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingAgentId(null)
    }
  }

  async function handleDeleteAgent(id: string) {
    const profile = agentProfiles.find((entry) => entry.id === id)
    const label = profile?.name || 'this agent'
    if (!window.confirm(`Delete ${label}?`)) return
    setDeletingAgentId(id)
    setAgentError('')
    try {
      const nextProfiles = await window.api.deleteAgentProfile(id)
      setAgentProfiles(nextProfiles)
      if (newAgentDraft?.id === id) setNewAgentDraft(null)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err))
    } finally {
      setDeletingAgentId(null)
    }
  }

  async function openRunAgent(profile: AgentProfile, initialPrompt = '', mode: 'setup' | 'run' = 'run') {
    setRunTarget(profile)
    setRunPrompt(initialPrompt)
    setRunMode(mode)
    setShowRunOutput(false)
    setRunWorkspaceId(workspaceId && repoWorkspaces.some((workspace) => workspace.id === workspaceId) ? workspaceId : repoWorkspaces[0]?.id ?? '')
    setAgentRunResult(null)
    setShowRunOutput(false)
    setAgentError('')
    const [knowledge, runs] = await Promise.all([
      window.api.getAgentKnowledge(profile.id),
      window.api.getAgentRuns(profile.id),
    ])
    setAgentKnowledge(knowledge)
    setAgentRuns(runs)
    setAgentRunResult(runs[0] ?? null)
  }

  async function handleSaveAndSetupAgent(profile: AgentProfile) {
    await handleSaveAgent(profile)
    const savedProfile = { ...profile, foundationPrompt: profile.foundationPrompt?.trim() ?? '' }
    await openRunAgent(savedProfile, savedProfile.foundationPrompt ?? '', 'setup')
  }

  async function handleRunAgent() {
    if (!runTarget || !runPrompt.trim() || runningAgentId) return
    setRunningAgentId(runTarget.id)
    setAgentError('')
    setAgentRunResult(null)
    try {
      const result = await window.api.runAgentProfile({
        agentId: runTarget.id,
        prompt: runPrompt.trim(),
        workspaceId: runWorkspaceId || workspaceId || undefined,
        saveToKnowledge: saveRunToKnowledge,
        setupRun: runMode === 'setup',
      })
      setAgentRunResult(result)
      const [knowledge, runs, profiles] = await Promise.all([
        window.api.getAgentKnowledge(runTarget.id),
        window.api.getAgentRuns(runTarget.id),
        window.api.getAgentProfiles(),
      ])
      setAgentKnowledge(knowledge)
      setAgentRuns(runs)
      setAgentProfiles(profiles)
      if (runMode === 'setup') setRunTarget(null)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err))
      if (runTarget) {
        const runs = await window.api.getAgentRuns(runTarget.id)
        setAgentRuns(runs)
        setAgentRunResult(runs[0] ?? null)
      }
    } finally {
      setRunningAgentId(null)
    }
  }

  async function handlePickRunWorkspace() {
    const projectPath = await window.terminalApi.selectDirectory()
    if (!projectPath) return
    try {
      const nextWorkspaces = await window.api.addWorkspaceForPath(projectPath)
      onWorkspacesChange?.(nextWorkspaces)
      const selected = nextWorkspaces.find((workspace) => workspace.projectPath === projectPath)
        ?? nextWorkspaces.find((workspace) => workspace.projectPath && projectPath.startsWith(`${workspace.projectPath}/`))
      if (selected) setRunWorkspaceId(selected.id)
    } catch (err) {
      setAgentError(err instanceof Error ? err.message : String(err))
    }
  }

  function openNew() {
    setForm(blankForm())
    setEditingId('new')
    setFormError('')
  }

  function openEdit(a: ScheduledAutomation) {
    setForm(formFromAutomation(a))
    setEditingId(a.id)
    setFormError('')
  }

  function closeEditor() {
    setEditingId(null)
    setFormError('')
  }

  async function handleSave() {
    if (!form.title.trim() || !form.prompt.trim()) { setFormError('Title and prompt are required.'); return }
    const schedule = resolvedSchedule(form)
    if (!schedule) { setFormError('A schedule is required.'); return }
    setSaving(true)
    setFormError('')
    try {
      const input: ScheduledAutomationInput = { title: form.title.trim(), prompt: form.prompt.trim(), model: form.model, schedule }
      if (editingId === 'new') {
        const created = await window.api.createScheduledAutomation(input)
        setAutomations((prev) => [...prev, created])
      } else if (editingId) {
        const updated = await window.api.updateScheduledAutomation(editingId, input)
        if (updated) setAutomations((prev) => prev.map((a) => a.id === editingId ? updated : a))
      }
      closeEditor()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(a: ScheduledAutomation) {
    const updated = await window.api.updateScheduledAutomation(a.id, { enabled: !a.enabled })
    if (updated) setAutomations((prev) => prev.map((x) => x.id === a.id ? updated : x))
  }

  async function handleDelete(id: string) {
    await window.api.deleteScheduledAutomation(id)
    setAutomations((prev) => prev.filter((a) => a.id !== id))
    if (editingId === id) closeEditor()
  }

  async function handleRunNow(id: string) {
    setRunningId(id)
    try { await window.api.runAutomationNow(id) } finally { setRunningId(null) }
  }

  function startNewAgent() {
    setAgentError('')
    setEditingAgentId(null)
    setRunTarget(null)
    setNewAgentDraft(blankAgent())
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 2,
        padding: '10px 18px 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        {(['agents', 'schedules', 'sources'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid #60a5fa' : '2px solid transparent',
              color: tab === t ? '#e2e8f0' : 'rgba(255,255,255,0.45)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              padding: '6px 14px 10px',
              textTransform: 'capitalize',
              marginBottom: -1,
            }}
          >
            {t}
            {t === 'schedules' && automations.length > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, background: 'rgba(96,165,250,0.2)', borderRadius: 999, padding: '1px 6px', color: '#93c5fd' }}>
                {automations.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>

        {/* ── Schedules tab ─────────────────────────────────────── */}
        {tab === 'schedules' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <SectionLabel>Relay schedules</SectionLabel>
              <button onClick={openNew} style={newBtnStyle}>+ New schedule</button>
            </div>

            {/* Editor */}
            {editingId !== null && (
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(96,165,250,0.25)',
                borderRadius: 14,
                padding: 18,
                marginBottom: 18,
                maxWidth: 560,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
                  {editingId === 'new' ? 'New schedule' : 'Edit schedule'}
                </div>
                <Field label="Title">
                  <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Morning digest" style={inputStyle} />
                </Field>
                <Field label="Prompt">
                  <textarea value={form.prompt} onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))} placeholder="What should the agent do?" rows={4} style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                </Field>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Model">
                    <select value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value as ModelChoice }))} style={inputStyle}>
                      {MODEL_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Schedule">
                    <select value={form.schedulePreset} onChange={(e) => setForm((f) => ({ ...f, schedulePreset: e.target.value }))} style={inputStyle}>
                      {SCHEDULE_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                  </Field>
                </div>
                {form.schedulePreset === 'custom' && (
                  <Field label="Cron expression">
                    <input value={form.customSchedule} onChange={(e) => setForm((f) => ({ ...f, customSchedule: e.target.value }))} placeholder="e.g. 0 9 * * 1-5" style={inputStyle} />
                  </Field>
                )}
                {formError && <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>{formError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={closeEditor} style={ghostBtnStyle}>Cancel</button>
                  <button onClick={handleSave} disabled={saving} style={{ ...ghostBtnStyle, background: 'rgba(96,165,250,0.15)', borderColor: 'rgba(96,165,250,0.35)', color: '#93c5fd', opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Cards grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {automations.map((a) => (
                <div key={a.id} style={{
                  borderRadius: 12,
                  padding: 14,
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${a.enabled ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.07)'}`,
                  display: 'grid',
                  alignContent: 'space-between',
                  gap: 10,
                  minHeight: 148,
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>{a.title}</div>
                      <StatusPill active={a.enabled} />
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.prompt}
                    </div>
                  </div>
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 9 }}>
                      <Chip>{MODEL_OPTIONS.find((m) => m.value === a.model)?.label ?? a.model}</Chip>
                      <Chip>{humanSchedule(a.schedule)}</Chip>
                      {a.lastRunAt && <Chip muted>Last {timeAgo(a.lastRunAt)}</Chip>}
                      {a.nextRunAt && a.enabled && <Chip muted>Next {timeUntil(a.nextRunAt)}</Chip>}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn title="Run now" disabled={runningId === a.id} onClick={() => handleRunNow(a.id)}>{runningId === a.id ? '…' : '▶'}</ActionBtn>
                      <ActionBtn title={a.enabled ? 'Pause' : 'Enable'} onClick={() => handleToggle(a)}>{a.enabled ? '⏸' : '▷▷'}</ActionBtn>
                      <ActionBtn title="Edit" onClick={() => openEdit(a)}>✎</ActionBtn>
                      <ActionBtn title="Delete" danger onClick={() => handleDelete(a.id)}>✕</ActionBtn>
                    </div>
                  </div>
                </div>
              ))}
              {automations.length === 0 && editingId === null && (
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, gridColumn: '1/-1' }}>
                  No scheduled automations yet. Hit <strong style={{ color: 'rgba(255,255,255,0.55)' }}>+ New schedule</strong> to run any prompt on any model automatically.
                </div>
              )}
            </div>

            {/* External schedules (if any) */}
            {externalItems.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <SectionLabel>External schedules</SectionLabel>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {externalItems.map((item) => <CatalogCard key={item.id} item={item} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Agents tab ────────────────────────────────────────── */}
        {tab === 'agents' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
              <div>
                <SectionLabel>Reusable agents</SectionLabel>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: -6, lineHeight: 1.5 }}>
                  Run focused agents. Setup details stay hidden after the agent is initialized.
                </div>
              </div>
              <button onClick={startNewAgent} style={newBtnStyle}>+ New agent</button>
            </div>

            {newAgentDraft && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SectionLabel>New agent</SectionLabel>
                  <button onClick={() => setNewAgentDraft(null)} style={ghostBtnStyle}>Cancel</button>
                </div>
                <AgentProfileEditor
                  profile={newAgentDraft}
                  onSave={handleSaveAgent}
                  onSetup={handleSaveAndSetupAgent}
                  saving={savingAgentId === newAgentDraft.id}
                  codexModels={codexModels}
                  ollamaModels={ollamaModels}
                  cursorModels={cursorModels}
                />
              </div>
            )}

            {runTarget && (
              <div style={{
                borderRadius: 12,
                border: '1px solid rgba(96,165,250,0.24)',
                background: 'rgba(96,165,250,0.06)',
                padding: 16,
                marginBottom: 16,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 750, marginBottom: 4 }}>
                      {runMode === 'setup' ? `Set up ${runTarget.name}` : `Use ${runTarget.name}`}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.54)', fontSize: 12, lineHeight: 1.5, maxWidth: 720 }}>
                      {runMode === 'setup'
                        ? 'This runs the one-time foundation task. After it succeeds, setup will be hidden and the agent becomes ready to use.'
                        : 'Type the next task. Relay automatically includes this agent\'s system prompt and saved knowledge; you do not need to redefine the agent.'}
                    </div>
                  </div>
                  <button onClick={() => setRunTarget(null)} style={ghostBtnStyle}>Close</button>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.34)', marginBottom: 5 }}>What this agent is</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.68)', lineHeight: 1.5, maxWidth: 720 }}>{summarizeAgent(runTarget)}</div>
                </div>

                <Field label={runMode === 'setup' ? 'One-time setup task' : 'Task for this run'}>
                  <textarea
                    value={runPrompt}
                    onChange={(event) => setRunPrompt(event.target.value)}
                    rows={5}
                    placeholder={runMode === 'setup' ? 'Initialize this agent with its foundation task.' : 'Example: Review the knowledge base and tell me what needs updating.'}
                    style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
                  />
                </Field>

                {runTarget.provider === 'cursor' && (
                  <Field label="Workspace folder">
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select
                        value={runWorkspaceId}
                        onChange={(event) => setRunWorkspaceId(event.target.value)}
                        style={inputStyle}
                      >
                        {repoWorkspaces.length === 0 && <option value="">No workspace folders available</option>}
                        {repoWorkspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}{workspace.projectPath ? ` - ${workspace.projectPath}` : ''}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => void handlePickRunWorkspace()} style={{ ...ghostBtnStyle, whiteSpace: 'nowrap' }}>
                        Choose folder
                      </button>
                    </div>
                  </Field>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    <input
                      type="checkbox"
                      checked={saveRunToKnowledge}
                      onChange={(event) => setSaveRunToKnowledge(event.target.checked)}
                    />
                    Remember result
                  </label>
                  <button
                    onClick={() => void handleRunAgent()}
                    disabled={!runPrompt.trim() || runningAgentId === runTarget.id || (runTarget.provider === 'cursor' && !runWorkspaceId)}
                    style={{
                      ...newBtnStyle,
                      opacity: !runPrompt.trim() || runningAgentId === runTarget.id || (runTarget.provider === 'cursor' && !runWorkspaceId) ? 0.55 : 1,
                      cursor: !runPrompt.trim() || runningAgentId === runTarget.id || (runTarget.provider === 'cursor' && !runWorkspaceId) ? 'default' : 'pointer',
                    }}
                  >
                    {runningAgentId === runTarget.id ? 'Running...' : runMode === 'setup' ? 'Run setup' : 'Start task'}
                  </button>
                </div>
                {agentRunResult && (
                  <div style={{
                    marginTop: 12,
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(0,0,0,0.18)',
                    padding: 12,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ fontSize: 12, color: agentRunResult.status === 'failed' ? '#fca5a5' : '#86efac' }}>
                        {agentRunResult.status === 'failed' ? 'Task failed' : 'Task completed'}
                        {agentRunResult.savedToKnowledge ? ' · remembered' : ''}
                      </div>
                      <button type="button" onClick={() => setShowRunOutput((value) => !value)} style={{ ...ghostBtnStyle, fontSize: 12, padding: '4px 8px' }}>
                        {showRunOutput ? 'Hide output' : 'View output'}
                      </button>
                    </div>
                    {showRunOutput && (
                      <div style={{
                        marginTop: 10,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                        fontSize: 12,
                        color: 'rgba(255,255,255,0.72)',
                        maxHeight: 280,
                        overflowY: 'auto',
                      }}>
                        {agentRunResult.status === 'failed' ? agentRunResult.error : agentRunResult.output}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <SectionLabel>Agents</SectionLabel>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{agentProfiles.length} saved</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {agentProfiles.map((profile) => editingAgentId === profile.id ? (
                <AgentProfileEditor
                  key={profile.id}
                  profile={profile}
                  onSave={handleSaveAgent}
                  onDelete={handleDeleteAgent}
                  onSetup={handleSaveAndSetupAgent}
                  onCancel={() => setEditingAgentId(null)}
                  saving={savingAgentId === profile.id}
                  deleting={deletingAgentId === profile.id}
                  codexModels={codexModels}
                  ollamaModels={ollamaModels}
                  cursorModels={cursorModels}
                />
              ) : (
                <AgentCard
                  key={profile.id}
                  profile={profile}
                  onRun={() => void openRunAgent(profile)}
                  onSetup={() => {
                    if (profile.foundationPrompt?.trim()) void openRunAgent(profile, profile.foundationPrompt, 'setup')
                    else setEditingAgentId(profile.id)
                  }}
                  onEdit={() => {
                    setNewAgentDraft(null)
                    setRunTarget(null)
                    setEditingAgentId(profile.id)
                  }}
                  onDelete={() => void handleDeleteAgent(profile.id)}
                  deleting={deletingAgentId === profile.id}
                />
              ))}
            </div>
            {agentError && <div style={{ marginTop: 12, fontSize: 12, color: '#fca5a5' }}>{agentError}</div>}
          </div>
        )}

        {/* ── Sources tab ───────────────────────────────────────── */}
        {tab === 'sources' && (
          <div style={{ maxWidth: 560 }}>
            <div style={{ marginBottom: 14 }}>
              <SectionLabel>Connected sources</SectionLabel>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: -6 }}>
                External automation providers Relay can detect.
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {catalog?.providers.map((provider) => (
                <div key={provider.source} style={{
                  borderRadius: 12,
                  padding: '12px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                }}>
                  <div style={{ marginTop: 3, width: 8, height: 8, borderRadius: '50%', background: statusDot(provider.status), flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{provider.label}</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{provider.detail}</div>
                    {provider.itemCount > 0 && (
                      <div style={{ marginTop: 6, fontSize: 11, color: '#93c5fd' }}>{provider.itemCount} automation{provider.itemCount !== 1 ? 's' : ''} detected</div>
                    )}
                  </div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: provider.status === 'connected' ? '#4ade80' : provider.status === 'detected' ? '#60a5fa' : 'rgba(255,255,255,0.3)' }}>
                    {provider.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function AgentCard({
  profile,
  onRun,
  onSetup,
  onEdit,
  onDelete,
  deleting,
}: {
  profile: AgentProfile
  onRun: () => void
  onSetup: () => void
  onEdit: () => void
  onDelete: () => void
  deleting?: boolean
}) {
  const isSetUp = !!profile.setupCompletedAt
  return (
    <div style={{
      borderRadius: 12,
      padding: 14,
      background: 'rgba(255,255,255,0.04)',
      border: `1px solid ${isSetUp ? 'rgba(74,222,128,0.14)' : 'rgba(250,204,21,0.2)'}`,
      display: 'grid',
      gap: 12,
      minHeight: 176,
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 750, lineHeight: 1.25, marginBottom: 4 }}>{profile.name || 'Untitled agent'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <Chip>{agentProviderLabel(profile.provider)}</Chip>
              <Chip>{profile.model}</Chip>
              <Chip muted>{agentRoleLabel(profile.role)}</Chip>
            </div>
          </div>
          <span style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
            padding: '3px 7px',
            borderRadius: 999,
            background: isSetUp ? 'rgba(74,222,128,0.14)' : 'rgba(250,204,21,0.12)',
            color: isSetUp ? '#86efac' : '#fde68a',
            whiteSpace: 'nowrap',
          }}>
            {isSetUp ? 'ready' : 'needs setup'}
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {summarizeAgent(profile)}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 'auto' }}>
        {isSetUp ? (
          <button type="button" onClick={onRun} style={newBtnStyle}>Use</button>
        ) : (
          <button type="button" onClick={onSetup} style={newBtnStyle}>Set up</button>
        )}
        <button type="button" onClick={onEdit} style={ghostBtnStyle}>Edit</button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          style={{ ...ghostBtnStyle, marginLeft: 'auto', color: '#fca5a5', borderColor: 'rgba(248,113,113,0.18)', opacity: deleting ? 0.55 : 1 }}
        >
          {deleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>
    </div>
  )
}

function CatalogCard({ item }: { item: AutomationCatalogItem }) {
  return (
    <div style={{
      borderRadius: 11,
      padding: 13,
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{item.title}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{sourceLabel(item.source)} · {kindLabel(item.kind)}</div>
        </div>
        <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 7px', borderRadius: 999, background: itemStatusColor(item.status), color: '#e2e8f0', whiteSpace: 'nowrap' }}>
          {item.status}
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{item.description}</div>
      {(item.model || item.cadence || item.destination) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {item.model && <Chip>{item.model}</Chip>}
          {item.cadence && <Chip>{item.cadence}</Chip>}
          {item.destination && <Chip>{item.destination}</Chip>}
        </div>
      )}
    </div>
  )
}

function itemStatusColor(status: AutomationCatalogItem['status']): string {
  if (status === 'active') return 'rgba(74,222,128,0.18)'
  if (status === 'paused') return 'rgba(248,113,113,0.18)'
  return 'rgba(96,165,250,0.18)'
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  )
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '3px 7px', borderRadius: 999, background: active ? 'rgba(74,222,128,0.18)' : 'rgba(248,113,113,0.15)', color: active ? '#86efac' : '#fca5a5', whiteSpace: 'nowrap', flexShrink: 0 }}>
      {active ? 'active' : 'paused'}
    </span>
  )
}

function Chip({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span style={{ fontSize: 11, padding: '3px 7px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.05)', color: muted ? 'rgba(255,255,255,0.38)' : 'rgba(255,255,255,0.55)', lineHeight: 1 }}>
      {children}
    </span>
  )
}

function ActionBtn({ children, title, onClick, disabled, danger }: { children: React.ReactNode; title: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled} style={{ background: danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${danger ? 'rgba(248,113,113,0.2)' : 'rgba(255,255,255,0.09)'}`, borderRadius: 6, color: danger ? '#fca5a5' : 'rgba(255,255,255,0.6)', fontSize: 12, padding: '4px 8px', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, lineHeight: 1 }}>
      {children}
    </button>
  )
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
      {children}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, padding: '8px 10px', outline: 'none', boxSizing: 'border-box',
}

const ghostBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.11)', borderRadius: 8, color: 'rgba(255,255,255,0.65)', fontSize: 13, padding: '6px 14px', cursor: 'pointer',
}

const newBtnStyle: React.CSSProperties = {
  background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.28)', borderRadius: 8, color: '#93c5fd', fontSize: 12, padding: '5px 12px', cursor: 'pointer',
}
