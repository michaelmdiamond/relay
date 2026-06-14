import { useEffect, useMemo, useState } from 'react'
import type {
  AgentAttemptProvider,
  AttemptStatus,
  ExperimentAttempt,
  ExperimentCase,
  ExperimentPostmortem,
  ExperimentRunEvidence,
  ExperimentScore,
  ExperimentStatus,
  GuardrailEvent,
  McpContextUsage,
  TerminalLauncherId,
} from '../../../shared/types'

const statusColumns: Array<{ status: ExperimentStatus; label: string }> = [
  { status: 'draft', label: 'Draft' },
  { status: 'running', label: 'Running' },
  { status: 'reviewing', label: 'Reviewing' },
  { status: 'completed', label: 'Completed' },
]

const providers: Array<{ id: AgentAttemptProvider; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'manual', label: 'Manual' },
  { id: 'warp', label: 'Warp' },
  { id: 'lovable', label: 'Lovable' },
]

const attemptStatuses: AttemptStatus[] = ['not_started', 'running', 'succeeded', 'failed', 'inconclusive']
const scoreKeys = ['correctness', 'speed', 'autonomy', 'codeQuality', 'instructionFollowing'] as const

function splitLines(value: string): string[] {
  return value.split('\n').map((line) => line.trim()).filter(Boolean)
}

function joinLines(value: string[]): string {
  return value.join('\n')
}

function statusLabel(value: AttemptStatus | ExperimentStatus): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function terminalLauncherForProvider(provider: AgentAttemptProvider): TerminalLauncherId | null {
  if (provider === 'ollama') return 'local'
  if (provider === 'codex' || provider === 'claude' || provider === 'gemini' || provider === 'cursor') return provider
  return null
}

function formatScore(value?: ExperimentScore): string {
  return value ? String(value) : '-'
}

function ExperimentCaseCard({
  experiment,
  attempts,
  active,
  onSelect,
}: {
  experiment: ExperimentCase
  attempts: ExperimentAttempt[]
  active: boolean
  onSelect: () => void
}) {
  const latestAttempt = attempts[0]
  return (
    <button type="button" className={`experiment-card${active ? ' is-active' : ''}`} onClick={onSelect}>
      <div className="experiment-card__topline">
        <span className="experiment-card__title">{experiment.title}</span>
        <span className={`experiment-status experiment-status--${experiment.status}`}>{statusLabel(experiment.status)}</span>
      </div>
      {experiment.brief && <div className="experiment-card__brief">{experiment.brief}</div>}
      <div className="experiment-card__meta">
        <span>{attempts.length} attempts</span>
        {latestAttempt && <span>{latestAttempt.provider} {statusLabel(latestAttempt.status)}</span>}
      </div>
      {experiment.tags.length > 0 && (
        <div className="experiment-card__tags">
          {experiment.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
    </button>
  )
}

function NewCaseForm({
  workspaceId,
  workspaceName,
  workspaceProjectPath,
  onCreated,
}: {
  workspaceId?: string | null
  workspaceName?: string
  workspaceProjectPath?: string
  onCreated: (experiment: ExperimentCase) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [criteria, setCriteria] = useState('')
  const [checks, setChecks] = useState('')
  const [tags, setTags] = useState('relay')

  async function handleCreate() {
    if (!title.trim()) return
    const experiment = await window.api.createExperimentCase({
      title,
      brief,
      workspaceId: workspaceId ?? undefined,
      projectName: workspaceName,
      projectPath: workspaceProjectPath,
      successCriteria: splitLines(criteria),
      recommendedChecks: splitLines(checks),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    })
    setTitle('')
    setBrief('')
    setCriteria('')
    setChecks('')
    setTags('relay')
    setOpen(false)
    onCreated(experiment)
  }

  if (!open) {
    return (
      <button type="button" className="experiments-primary-btn" onClick={() => setOpen(true)}>
        New case
      </button>
    )
  }

  return (
    <div className="experiment-form">
      <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Case title" />
      <textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Brief" rows={3} />
      <textarea value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="Success criteria, one per line" rows={3} />
      <textarea value={checks} onChange={(event) => setChecks(event.target.value)} placeholder="Recommended checks, one per line" rows={3} />
      <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, comma separated" />
      <div className="experiment-form__actions">
        <button type="button" onClick={handleCreate} disabled={!title.trim()}>Create</button>
        <button type="button" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  )
}

function AttemptEditor({
  attempt,
  onUpdated,
}: {
  attempt: ExperimentAttempt
  onUpdated: (attempt: ExperimentAttempt) => void
}) {
  const [testsRun, setTestsRun] = useState(joinLines(attempt.testsRun))
  const [filesTouched, setFilesTouched] = useState(joinLines(attempt.filesTouched))
  const [evidence, setEvidence] = useState(joinLines(attempt.evidence))
  const [outcomeNotes, setOutcomeNotes] = useState(attempt.outcomeNotes)

  useEffect(() => {
    setTestsRun(joinLines(attempt.testsRun))
    setFilesTouched(joinLines(attempt.filesTouched))
    setEvidence(joinLines(attempt.evidence))
    setOutcomeNotes(attempt.outcomeNotes)
  }, [attempt])

  async function updateAttempt(input: Parameters<typeof window.api.updateExperimentAttempt>[1]) {
    const updated = await window.api.updateExperimentAttempt(attempt.id, input)
    if (updated) onUpdated(updated)
  }

  async function saveNotes() {
    await updateAttempt({
      testsRun: splitLines(testsRun),
      filesTouched: splitLines(filesTouched),
      evidence: splitLines(evidence),
      outcomeNotes,
    })
  }

  return (
    <article className="experiment-attempt">
      <header className="experiment-attempt__header">
        <div>
          <strong>{providers.find((provider) => provider.id === attempt.provider)?.label ?? attempt.provider}</strong>
          {attempt.model && <span>{attempt.model}</span>}
        </div>
        <select value={attempt.status} onChange={(event) => void updateAttempt({ status: event.target.value as AttemptStatus })}>
          {attemptStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
        </select>
      </header>

      <div className="experiment-link-grid">
        {attempt.taskId && <span>Task {attempt.taskId.slice(0, 8)}</span>}
        {attempt.terminalSessionId && <span>Terminal {attempt.terminalSessionId.slice(0, 12)}</span>}
        {attempt.conversationId && <span>Chat {attempt.conversationId.slice(0, 12)}</span>}
        {attempt.workflowRunId && <span>Workflow {attempt.workflowRunId.slice(0, 12)}</span>}
      </div>

      <div className="experiment-score-grid">
        {scoreKeys.map((key) => (
          <label key={key}>
            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
            <select
              value={attempt.scores[key] ?? ''}
              onChange={(event) => {
                const value = event.target.value ? Number(event.target.value) as ExperimentScore : undefined
                void updateAttempt({ scores: { ...attempt.scores, [key]: value } })
              }}
            >
              <option value="">{formatScore(undefined)}</option>
              {[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{score}</option>)}
            </select>
          </label>
        ))}
      </div>

      <div className="experiment-notes-grid">
        <label>
          <span>Tests run</span>
          <textarea value={testsRun} onChange={(event) => setTestsRun(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Files touched</span>
          <textarea value={filesTouched} onChange={(event) => setFilesTouched(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Evidence</span>
          <textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} rows={3} />
        </label>
        <label>
          <span>Outcome notes</span>
          <textarea value={outcomeNotes} onChange={(event) => setOutcomeNotes(event.target.value)} rows={4} />
        </label>
      </div>
      <button type="button" className="experiments-secondary-btn" onClick={() => void saveNotes()}>
        Save evidence
      </button>
    </article>
  )
}

function ExperimentDetail({
  experiment,
  attempts,
  runEvidence,
  guardrailEvents,
  mcpContextUsages,
  postmortems,
  onExperimentUpdated,
  onAttemptUpdated,
  onPostmortemGenerated,
  onRefresh,
}: {
  experiment: ExperimentCase
  attempts: ExperimentAttempt[]
  runEvidence: ExperimentRunEvidence[]
  guardrailEvents: GuardrailEvent[]
  mcpContextUsages: McpContextUsage[]
  postmortems: ExperimentPostmortem[]
  onExperimentUpdated: (experiment: ExperimentCase) => void
  onAttemptUpdated: (attempt: ExperimentAttempt) => void
  onPostmortemGenerated: (postmortem: ExperimentPostmortem) => void
  onRefresh: () => void
}) {
  const [provider, setProvider] = useState<AgentAttemptProvider>('codex')
  const [model, setModel] = useState('')
  const [startTerminal, setStartTerminal] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  async function updateStatus(status: ExperimentStatus) {
    const updated = await window.api.updateExperimentCase(experiment.id, { status })
    if (updated) onExperimentUpdated(updated)
  }

  async function createTaskFromExperiment(): Promise<string> {
    const task = await window.api.createTask({
      title: experiment.title,
      brief: [
        experiment.brief,
        experiment.successCriteria.length ? `Success criteria:\n${experiment.successCriteria.map((item) => `- ${item}`).join('\n')}` : '',
        experiment.recommendedChecks.length ? `Recommended checks:\n${experiment.recommendedChecks.map((item) => `- ${item}`).join('\n')}` : '',
      ].filter(Boolean).join('\n\n'),
      state: 'idea',
      workspaceId: experiment.workspaceId,
      projectName: experiment.projectName,
      projectPath: experiment.projectPath,
    })
    setNotice(`Created task ${task.title}.`)
    return task.id
  }

  async function handleCreateTask() {
    setError('')
    await createTaskFromExperiment()
  }

  async function handleStartAttempt() {
    setError('')
    setNotice('')
    try {
      let taskId: string | undefined
      let terminalSessionId: string | undefined
      const launcherId = terminalLauncherForProvider(provider)
      if (startTerminal && launcherId) {
        const task = await window.api.createTask({
          title: `${experiment.title} - ${providers.find((entry) => entry.id === provider)?.label ?? provider}`,
          brief: experiment.brief,
          state: 'running',
          workspaceId: experiment.workspaceId,
          projectName: experiment.projectName,
          projectPath: experiment.projectPath,
        })
        taskId = task.id
      }
      let attempt = await window.api.createExperimentAttempt(experiment.id, {
        provider,
        model: model.trim() || undefined,
        status: startTerminal && launcherId ? 'running' : 'not_started',
        taskId,
      })
      if (startTerminal && launcherId && taskId) {
        const session = await window.api.startTaskTerminal(taskId, launcherId)
        terminalSessionId = session.id
        attempt = await window.api.updateExperimentAttempt(attempt.id, { terminalSessionId }) ?? attempt
      }
      onAttemptUpdated(attempt)
      await updateStatus('running')
      setNotice(startTerminal && launcherId ? 'Started attempt and terminal.' : 'Created attempt.')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleArchive() {
    const archived = await window.api.archiveExperimentCase(experiment.id)
    if (archived) onExperimentUpdated(archived)
  }

  async function handleGeneratePostmortem(exportMarkdown = false) {
    setError('')
    setNotice('')
    try {
      const postmortem = await window.api.generateExperimentPostmortem(experiment.id, { exportMarkdown })
      onPostmortemGenerated(postmortem)
      setNotice(exportMarkdown && postmortem.exportedPath ? `Exported ${postmortem.exportedPath}.` : 'Generated postmortem.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <section className="experiment-detail">
      <header className="experiment-detail__header">
        <div>
          <h2>{experiment.title}</h2>
          {experiment.projectName && <span>{experiment.projectName}</span>}
        </div>
        <select value={experiment.status} onChange={(event) => void updateStatus(event.target.value as ExperimentStatus)}>
          {statusColumns.map((column) => <option key={column.status} value={column.status}>{column.label}</option>)}
          <option value="archived">Archived</option>
        </select>
      </header>

      {experiment.brief && <p className="experiment-detail__brief">{experiment.brief}</p>}

      <div className="experiment-detail__lists">
        <div>
          <h3>Success Criteria</h3>
          {experiment.successCriteria.length > 0 ? experiment.successCriteria.map((item) => <p key={item}>{item}</p>) : <p>No criteria recorded.</p>}
        </div>
        <div>
          <h3>Checks</h3>
          {experiment.recommendedChecks.length > 0 ? experiment.recommendedChecks.map((item) => <p key={item}>{item}</p>) : <p>No checks recorded.</p>}
        </div>
      </div>

      <div className="experiment-actions">
        <button type="button" className="experiments-secondary-btn" onClick={() => void handleCreateTask()}>
          Create task
        </button>
        <label>
          <span>Provider</span>
          <select value={provider} onChange={(event) => setProvider(event.target.value as AgentAttemptProvider)}>
            {providers.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
        </label>
        <label>
          <span>Model</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="optional" />
        </label>
        <label className="experiment-checkbox">
          <input type="checkbox" checked={startTerminal} onChange={(event) => setStartTerminal(event.target.checked)} disabled={!terminalLauncherForProvider(provider)} />
          <span>Start terminal</span>
        </label>
        <button type="button" className="experiments-primary-btn" onClick={() => void handleStartAttempt()}>
          Start attempt
        </button>
        <button type="button" className="experiments-danger-btn" onClick={() => void handleArchive()}>
          Archive
        </button>
      </div>

      {notice && <div className="experiments-notice">{notice}</div>}
      {error && <div className="experiments-error">{error}</div>}

      <div className="experiment-attempts-header">
        <h3>Attempts</h3>
        <span>{attempts.length}</span>
      </div>
      <div className="experiment-attempts">
        {attempts.map((attempt) => <AttemptEditor key={attempt.id} attempt={attempt} onUpdated={onAttemptUpdated} />)}
        {attempts.length === 0 && <div className="experiment-empty">No attempts yet.</div>}
      </div>

      <div className="experiment-evidence-grid">
        <section>
          <h3>Flight Recorder</h3>
          {runEvidence.slice(0, 4).map((entry) => (
            <div key={entry.id} className="experiment-evidence-row">
              <strong>{entry.title}</strong>
              <span>{entry.status} · {entry.eventSummaries.length} events · {entry.filesTouched.length} files</span>
            </div>
          ))}
          {runEvidence.length === 0 && <p>No durable run evidence yet.</p>}
        </section>
        <section>
          <h3>Guardrails</h3>
          {guardrailEvents.slice(0, 5).map((event) => (
            <div key={event.id} className={`experiment-evidence-row experiment-evidence-row--${event.severity}`}>
              <strong>{event.action}</strong>
              <span>{event.detail}</span>
            </div>
          ))}
          {guardrailEvents.length === 0 && <p>No guardrail events yet.</p>}
        </section>
        <section>
          <h3>MCP Context</h3>
          {mcpContextUsages.slice(0, 5).map((usage) => (
            <div key={usage.id} className="experiment-evidence-row">
              <strong>{usage.toolName}</strong>
              <span>{usage.summary}</span>
            </div>
          ))}
          {mcpContextUsages.length === 0 && <p>No MCP context usage recorded.</p>}
        </section>
        <section>
          <div className="experiment-postmortem-header">
            <h3>Postmortems</h3>
            <div>
              <button type="button" className="experiments-secondary-btn" onClick={() => void handleGeneratePostmortem(false)}>
                Generate
              </button>
              <button type="button" className="experiments-secondary-btn" onClick={() => void handleGeneratePostmortem(true)}>
                Export
              </button>
            </div>
          </div>
          {postmortems.slice(0, 3).map((postmortem) => (
            <details key={postmortem.id} className="experiment-postmortem">
              <summary>{postmortem.title}</summary>
              {postmortem.exportedPath && <div className="experiment-postmortem__path">{postmortem.exportedPath}</div>}
              <pre>{postmortem.markdown}</pre>
            </details>
          ))}
          {postmortems.length === 0 && <p>No postmortems generated.</p>}
        </section>
      </div>
    </section>
  )
}

export function ExperimentsPane({
  workspaceId,
  workspaceName,
  workspaceKind,
  workspaceProjectPath,
  repoWorkspacePaths = [],
}: {
  workspaceId?: string | null
  workspaceName?: string
  workspaceKind?: 'repo' | 'general'
  workspaceProjectPath?: string
  repoWorkspacePaths?: string[]
}) {
  const [cases, setCases] = useState<ExperimentCase[]>([])
  const [attempts, setAttempts] = useState<ExperimentAttempt[]>([])
  const [runEvidence, setRunEvidence] = useState<ExperimentRunEvidence[]>([])
  const [guardrailEvents, setGuardrailEvents] = useState<GuardrailEvent[]>([])
  const [mcpContextUsages, setMcpContextUsages] = useState<McpContextUsage[]>([])
  const [postmortems, setPostmortems] = useState<ExperimentPostmortem[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)

  async function refreshExperiments() {
    const snapshot = await window.api.getExperiments()
    setCases(snapshot.cases)
    setAttempts(snapshot.attempts)
    setRunEvidence(snapshot.runEvidence)
    setGuardrailEvents(snapshot.guardrailEvents)
    setMcpContextUsages(snapshot.mcpContextUsages)
    setPostmortems(snapshot.postmortems)
    setActiveCaseId((current) => current ?? snapshot.cases.find((entry) => entry.status !== 'archived')?.id ?? snapshot.cases[0]?.id ?? null)
  }

  useEffect(() => {
    void refreshExperiments()
    return window.api.onExperimentsUpdated((snapshot) => {
      setCases(snapshot.cases)
      setAttempts(snapshot.attempts)
      setRunEvidence(snapshot.runEvidence)
      setGuardrailEvents(snapshot.guardrailEvents)
      setMcpContextUsages(snapshot.mcpContextUsages)
      setPostmortems(snapshot.postmortems)
    })
  }, [])

  const visibleCases = useMemo(() => cases.filter((experiment) => {
    if (experiment.status === 'archived' || experiment.archivedAt) return false
    if (!workspaceId) return true
    if (experiment.workspaceId === workspaceId) return true
    if (workspaceKind === 'repo' && workspaceProjectPath && experiment.projectPath) {
      return experiment.projectPath === workspaceProjectPath || experiment.projectPath.startsWith(`${workspaceProjectPath}/`)
    }
    if (workspaceKind === 'general') {
      return !experiment.projectPath || !repoWorkspacePaths.some((repoPath) => (
        experiment.projectPath === repoPath || experiment.projectPath.startsWith(`${repoPath}/`)
      ))
    }
    return false
  }), [cases, repoWorkspacePaths, workspaceId, workspaceKind, workspaceProjectPath])

  const activeCase = visibleCases.find((entry) => entry.id === activeCaseId) ?? visibleCases[0] ?? null
  const attemptsByCase = useMemo(() => new Map(visibleCases.map((experiment) => [
    experiment.id,
    attempts.filter((attempt) => attempt.experimentId === experiment.id),
  ])), [attempts, visibleCases])

  function updateCaseLocally(experiment: ExperimentCase) {
    setCases((current) => current.map((entry) => entry.id === experiment.id ? experiment : entry))
    if (experiment.status === 'archived') setActiveCaseId(null)
  }

  function updateAttemptLocally(attempt: ExperimentAttempt) {
    setAttempts((current) => {
      if (current.some((entry) => entry.id === attempt.id)) return current.map((entry) => entry.id === attempt.id ? attempt : entry)
      return [attempt, ...current]
    })
  }

  function updatePostmortemLocally(postmortem: ExperimentPostmortem) {
    setPostmortems((current) => [postmortem, ...current.filter((entry) => entry.id !== postmortem.id)])
  }

  return (
    <div className="experiments-view">
      <header className="experiments-header">
        <div>
          <div className="experiments-header__eyebrow">Agent Learning Lab</div>
          <h1>Experiments</h1>
        </div>
        <div className="experiments-header__actions">
          <span>{visibleCases.length} active cases</span>
          <NewCaseForm
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            workspaceProjectPath={workspaceProjectPath}
            onCreated={(experiment) => {
              setCases((current) => [experiment, ...current])
              setActiveCaseId(experiment.id)
            }}
          />
        </div>
      </header>

      <div className="experiments-layout">
        <section className="experiments-columns">
          {statusColumns.map((column) => (
            <div key={column.status} className="experiment-column">
              <header>
                <span>{column.label}</span>
                <strong>{visibleCases.filter((experiment) => experiment.status === column.status).length}</strong>
              </header>
              <div className="experiment-column__body">
                {visibleCases.filter((experiment) => experiment.status === column.status).map((experiment) => (
                  <ExperimentCaseCard
                    key={experiment.id}
                    experiment={experiment}
                    attempts={attemptsByCase.get(experiment.id) ?? []}
                    active={activeCase?.id === experiment.id}
                    onSelect={() => setActiveCaseId(experiment.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>

        {activeCase ? (
          <ExperimentDetail
            experiment={activeCase}
            attempts={attemptsByCase.get(activeCase.id) ?? []}
            runEvidence={runEvidence.filter((entry) => entry.experimentId === activeCase.id)}
            guardrailEvents={guardrailEvents.filter((entry) => entry.experimentId === activeCase.id)}
            mcpContextUsages={mcpContextUsages.filter((entry) => entry.experimentId === activeCase.id)}
            postmortems={postmortems.filter((entry) => entry.experimentId === activeCase.id)}
            onExperimentUpdated={updateCaseLocally}
            onAttemptUpdated={updateAttemptLocally}
            onPostmortemGenerated={updatePostmortemLocally}
            onRefresh={() => void refreshExperiments()}
          />
        ) : (
          <section className="experiment-detail">
            <div className="experiment-empty">No experiment selected.</div>
          </section>
        )}
      </div>
    </div>
  )
}
