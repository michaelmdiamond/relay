import { useEffect, useState } from 'react'
import type { WorkflowDefinition, WorkflowRun, WorkflowStepRun } from '../../../shared/types'

function formatTime(value: string): string {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function statusTone(status: WorkflowRun['status'] | WorkflowStepRun['status']): string {
  if (status === 'completed') return 'rgba(74, 222, 128, 0.18)'
  if (status === 'failed') return 'rgba(248, 113, 113, 0.18)'
  if (status === 'running') return 'rgba(96, 165, 250, 0.18)'
  return 'rgba(255,255,255,0.08)'
}

export function WorkflowsPane({
  workspaceId,
  workspaceKind,
}: {
  workspaceId?: string | null
  workspaceKind?: 'repo' | 'general'
}) {
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowDefinition[]>([])
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [goal, setGoal] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const [workflows, runs] = await Promise.all([
        window.api.getWorkflowDefinitions(),
        window.api.getWorkflowRuns(),
      ])
      setWorkflowDefinitions(workflows)
      setWorkflowRuns(runs)
      setSelectedRunId((current) => current ?? runs[0]?.id ?? null)
    }
    void load()
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onWorkflowRunUpdated((run) => {
      setWorkflowRuns((current) => {
        const exists = current.some((entry) => entry.id === run.id)
        const next = exists
          ? current.map((entry) => entry.id === run.id ? run : entry)
          : [run, ...current]
        return [...next].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      })
      setSelectedRunId((current) => current ?? run.id)
    })
    return unsubscribe
  }, [])

  const visibleWorkflowRuns = workflowRuns.filter((run) => {
    if (!workspaceId) return true
    if (run.workspaceId === workspaceId) return true
    return workspaceKind === 'general' && !run.workspaceId
  })

  useEffect(() => {
    if (selectedRunId && visibleWorkflowRuns.some((run) => run.id === selectedRunId)) return
    setSelectedRunId(visibleWorkflowRuns[0]?.id ?? null)
  }, [selectedRunId, visibleWorkflowRuns])

  const workflow = workflowDefinitions[0]
  const selectedRun = visibleWorkflowRuns.find((run) => run.id === selectedRunId) ?? visibleWorkflowRuns[0] ?? null
  async function handleStartRun() {
    if (!workflow || !goal.trim() || starting) return
    setError('')
    setStarting(true)
    try {
      const run = await window.api.startWorkflowRun(workflow.id, goal.trim(), workspaceId ?? undefined)
      setGoal('')
      setSelectedRunId(run.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <aside style={{
        width: 340,
        padding: 18,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        overflowY: 'auto',
        background: 'rgba(255,255,255,0.03)',
      }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>
            Workflow
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{workflow?.name ?? 'No workflow loaded'}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.6)' }}>
            {workflow?.description}
          </div>
        </div>

        <div style={{
          padding: 14,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Run Orchestration</div>
          <textarea
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            rows={5}
            placeholder="Describe the change you want Claude to implement and Gemini to review."
            style={{
              width: '100%',
              resize: 'vertical',
              borderRadius: 10,
              padding: 10,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              font: 'inherit',
              lineHeight: 1.5,
              marginBottom: 10,
            }}
          />
          <button
            type="button"
            disabled={!goal.trim() || starting || !workflow}
            onClick={handleStartRun}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 10,
              padding: '10px 12px',
              background: !goal.trim() || starting ? 'rgba(255,255,255,0.1)' : 'rgba(96,165,250,0.85)',
              color: !goal.trim() || starting ? 'rgba(255,255,255,0.35)' : '#fff',
              fontWeight: 700,
              cursor: !goal.trim() || starting ? 'default' : 'pointer',
            }}
          >
            {starting ? 'Starting run...' : 'Start Codex -> Gemini loop'}
          </button>
          {error && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#fca5a5', lineHeight: 1.4 }}>
              {error}
            </div>
          )}
        </div>
      </aside>

      <section style={{ display: 'flex', flex: 1, minWidth: 0 }}>
        <div style={{
          width: 320,
          borderRight: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto',
          padding: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Runs</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {visibleWorkflowRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedRunId(run.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 12,
                  border: run.id === selectedRun?.id ? '1px solid rgba(96,165,250,0.45)' : '1px solid rgba(255,255,255,0.08)',
                  background: run.id === selectedRun?.id ? 'rgba(96,165,250,0.12)' : 'rgba(255,255,255,0.03)',
                  padding: 12,
                  cursor: 'pointer',
                  color: '#e2e8f0',
                }}
              >
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
                  {formatTime(run.updatedAt)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, marginBottom: 8 }}>
                  {run.goal}
                </div>
                <div style={{
                  display: 'inline-flex',
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: statusTone(run.status),
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  {run.status}
                </div>
                {run.finalVerdict && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.62)' }}>
                    Verdict: {run.finalVerdict}
                  </div>
                )}
              </button>
            ))}
            {workflowRuns.length === 0 && (
              <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 13, lineHeight: 1.5 }}>
                No runs yet. Start the first orchestration loop from the panel on the left.
              </div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: 18 }}>
          {selectedRun ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
                  {selectedRun.workflowName}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.25, marginBottom: 10 }}>
                  {selectedRun.goal}
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StatusPill label={selectedRun.status} />
                  {selectedRun.finalVerdict && <StatusPill label={`verdict: ${selectedRun.finalVerdict}`} />}
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                    Round {selectedRun.currentRound} / {selectedRun.maxRounds}
                  </span>
                </div>
                {selectedRun.summary && (
                  <div style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.72)',
                    lineHeight: 1.5,
                  }}>
                    {selectedRun.summary}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {selectedRun.steps.map((step) => (
                  <div
                    key={step.id}
                    style={{
                      borderRadius: 16,
                      padding: 16,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>
                          {step.kind === 'implement' ? 'Implementation' : 'Review'} · {step.agentName}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                          Round {step.round}
                          {' · '}
                          {step.startedAt ? formatTime(step.startedAt) : 'pending'}
                        </div>
                      </div>
                      <StatusPill label={step.status} />
                    </div>

                    <SectionBlock title="Prompt" body={step.input} />
                    <SectionBlock title="Output" body={step.output || step.error || 'No output yet'} />

                    {step.artifact && (
                      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                        <ArtifactLine label="Summary" value={step.artifact.summary} />
                        <ArtifactLine label="Changed files" value={step.artifact.changedFiles.join(', ') || 'None specified'} />
                        <ArtifactLine label="Diff summary" value={step.artifact.diffSummary} />
                        <ArtifactLine label="Test status" value={step.artifact.testStatus} />
                        <ArtifactLine label="Open questions" value={step.artifact.openQuestions || 'None'} />
                        {step.artifact.requestedAction && <ArtifactLine label="Requested action" value={step.artifact.requestedAction} />}
                        {step.artifact.verdict && <ArtifactLine label="Verdict" value={step.artifact.verdict} />}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 14 }}>
              Select a run to inspect its step-by-step orchestration timeline.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function StatusPill({ label }: { label: string }) {
  return (
    <span style={{
      display: 'inline-flex',
      padding: '4px 9px',
      borderRadius: 999,
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.08)',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      color: '#e2e8f0',
    }}>
      {label}
    </span>
  )
}

function SectionBlock({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{
        whiteSpace: 'pre-wrap',
        lineHeight: 1.55,
        fontSize: 13,
        color: 'rgba(255,255,255,0.78)',
        background: 'rgba(0,0,0,0.18)',
        borderRadius: 10,
        padding: 10,
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {body}
      </div>
    </div>
  )
}

function ArtifactLine({ label, value }: { label: string; value?: string }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '130px 1fr',
      gap: 10,
      alignItems: 'start',
      fontSize: 13,
      lineHeight: 1.5,
    }}>
      <div style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</div>
      <div style={{ color: 'rgba(255,255,255,0.78)', whiteSpace: 'pre-wrap' }}>{value || 'n/a'}</div>
    </div>
  )
}
