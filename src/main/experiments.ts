import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { writePrivateJson } from './private-json'
import type {
  AgentRunEvent,
  AgentRunEventType,
  AgentRunSnapshot,
  AgentRunStatus,
  AgentAttemptProvider,
  AttemptStatus,
  ExperimentAttempt,
  ExperimentAttemptInput,
  ExperimentAttemptScores,
  ExperimentAttemptUpdateInput,
  ExperimentCase,
  ExperimentCaseInput,
  ExperimentCaseUpdateInput,
  ExperimentEvidenceLinks,
  ExperimentPostmortem,
  ExperimentPostmortemInput,
  ExperimentRunEventSummary,
  ExperimentRunEvidence,
  ExperimentScore,
  ExperimentStatus,
  ExperimentStoreSnapshot,
  GuardrailEvent,
  GuardrailPolicy,
  McpContextUsage,
} from '../shared/types'

const STORE_PATH = path.join(app.getPath('userData'), 'experiments.json')
const POSTMORTEMS_DIR = path.join(app.getPath('userData'), 'postmortems')

let emitExperimentsUpdate: ((snapshot: ExperimentStoreSnapshot) => void) | null = null

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim()))]
}

function normalizeExperimentStatus(value: unknown): ExperimentStatus {
  if (value === 'draft' || value === 'running' || value === 'reviewing' || value === 'completed' || value === 'archived') return value
  return 'draft'
}

function normalizeAttemptStatus(value: unknown): AttemptStatus {
  if (value === 'not_started' || value === 'running' || value === 'succeeded' || value === 'failed' || value === 'inconclusive') return value
  return 'not_started'
}

function normalizeAgentRunStatus(value: unknown): AgentRunStatus {
  if (value === 'queued' || value === 'running' || value === 'blocked' || value === 'done' || value === 'failed') return value
  return 'running'
}

function normalizeAgentRunEventType(value: unknown): AgentRunEventType {
  if (
    value === 'agent_started' ||
    value === 'agent_status' ||
    value === 'tool_started' ||
    value === 'tool_output' ||
    value === 'file_touched' ||
    value === 'agent_finished'
  ) return value
  return 'agent_status'
}

function normalizeProvider(value: unknown): AgentAttemptProvider {
  if (
    value === 'codex' ||
    value === 'claude' ||
    value === 'gemini' ||
    value === 'cursor' ||
    value === 'ollama' ||
    value === 'warp' ||
    value === 'lovable' ||
    value === 'manual'
  ) return value
  return 'manual'
}

function normalizeScore(value: unknown): ExperimentScore | undefined {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value
  return undefined
}

function normalizeScores(value: unknown): ExperimentAttemptScores {
  const scores = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof ExperimentAttemptScores, unknown>>
  return {
    correctness: normalizeScore(scores.correctness),
    speed: normalizeScore(scores.speed),
    autonomy: normalizeScore(scores.autonomy),
    codeQuality: normalizeScore(scores.codeQuality),
    instructionFollowing: normalizeScore(scores.instructionFollowing),
  }
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeSeverity(value: unknown): GuardrailEvent['severity'] {
  if (value === 'info' || value === 'warning' || value === 'blocked') return value
  return 'info'
}

function normalizePolicyMode(value: unknown): GuardrailPolicy['mode'] {
  return value === 'enforcing' ? 'enforcing' : 'passive'
}

function normalizeCase(raw: Partial<ExperimentCase>): ExperimentCase {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    title: normalizeString(raw.title) ?? 'Untitled experiment',
    brief: normalizeString(raw.brief) ?? '',
    workspaceId: normalizeString(raw.workspaceId),
    projectName: normalizeString(raw.projectName),
    projectPath: normalizeString(raw.projectPath),
    status: normalizeExperimentStatus(raw.status),
    successCriteria: normalizeStringArray(raw.successCriteria),
    recommendedChecks: normalizeStringArray(raw.recommendedChecks),
    tags: normalizeStringArray(raw.tags),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
    archivedAt: normalizeString(raw.archivedAt),
  }
}

function normalizeAttempt(raw: Partial<ExperimentAttempt>): ExperimentAttempt {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    experimentId: normalizeString(raw.experimentId) ?? '',
    provider: normalizeProvider(raw.provider),
    model: normalizeString(raw.model),
    status: normalizeAttemptStatus(raw.status),
    taskId: normalizeString(raw.taskId),
    conversationId: normalizeString(raw.conversationId),
    terminalSessionId: normalizeString(raw.terminalSessionId),
    workflowRunId: normalizeString(raw.workflowRunId),
    startedAt: normalizeString(raw.startedAt),
    completedAt: normalizeString(raw.completedAt),
    durationMs: normalizeNumber(raw.durationMs),
    costEstimateUsd: normalizeNumber(raw.costEstimateUsd),
    tokenUsage: raw.tokenUsage,
    testsRun: normalizeStringArray(raw.testsRun),
    filesTouched: normalizeStringArray(raw.filesTouched),
    evidence: normalizeStringArray(raw.evidence),
    outcomeNotes: normalizeString(raw.outcomeNotes) ?? '',
    scores: normalizeScores(raw.scores),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
  }
}

function normalizeRunEventSummary(raw: Partial<ExperimentRunEventSummary>): ExperimentRunEventSummary {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    sourceEventId: normalizeString(raw.sourceEventId),
    type: normalizeAgentRunEventType(raw.type),
    createdAt,
    title: normalizeString(raw.title),
    status: raw.status ? normalizeAgentRunStatus(raw.status) : undefined,
    summary: normalizeString(raw.summary) ?? '',
    filePath: normalizeString(raw.filePath),
  }
}

function normalizeRunEvidence(raw: Partial<ExperimentRunEvidence>): ExperimentRunEvidence {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    attemptId: normalizeString(raw.attemptId) ?? '',
    experimentId: normalizeString(raw.experimentId) ?? '',
    runId: normalizeString(raw.runId),
    terminalSessionId: normalizeString(raw.terminalSessionId),
    workflowRunId: normalizeString(raw.workflowRunId),
    provider: normalizeString(raw.provider) as ExperimentRunEvidence['provider'],
    title: normalizeString(raw.title) ?? 'Agent run',
    status: normalizeAgentRunStatus(raw.status),
    prompt: normalizeString(raw.prompt),
    filesTouched: normalizeStringArray(raw.filesTouched),
    testsRun: normalizeStringArray(raw.testsRun),
    eventSummaries: (Array.isArray(raw.eventSummaries) ? raw.eventSummaries : []).map(normalizeRunEventSummary),
    exitState: normalizeString(raw.exitState),
    elapsedMs: normalizeNumber(raw.elapsedMs),
    finalNotes: normalizeString(raw.finalNotes),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
    completedAt: normalizeString(raw.completedAt),
  }
}

function defaultGuardrailPolicy(): GuardrailPolicy {
  const createdAt = nowIso()
  return {
    id: 'default-passive-policy',
    name: 'Default passive guardrails',
    mode: 'passive',
    allowedWorkspacePaths: [],
    blockedCommandPatterns: ['rm -rf /', 'git reset --hard', 'sudo ', 'curl *|*sh', 'chmod -R 777'],
    approvalRequiredActions: ['delete files', 'force push', 'install dependencies', 'write outside workspace'],
    requiredChecksAfterEdits: ['npm run build', 'focused test or typecheck'],
    createdAt,
    updatedAt: createdAt,
  }
}

function normalizeGuardrailPolicy(raw: Partial<GuardrailPolicy>): GuardrailPolicy {
  const fallback = defaultGuardrailPolicy()
  const createdAt = normalizeString(raw.createdAt) ?? fallback.createdAt
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    name: normalizeString(raw.name) ?? fallback.name,
    mode: normalizePolicyMode(raw.mode),
    allowedWorkspacePaths: normalizeStringArray(raw.allowedWorkspacePaths),
    blockedCommandPatterns: normalizeStringArray(raw.blockedCommandPatterns),
    approvalRequiredActions: normalizeStringArray(raw.approvalRequiredActions),
    requiredChecksAfterEdits: normalizeStringArray(raw.requiredChecksAfterEdits),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
  }
}

function normalizeGuardrailEvent(raw: Partial<GuardrailEvent>): GuardrailEvent {
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    attemptId: normalizeString(raw.attemptId),
    experimentId: normalizeString(raw.experimentId),
    terminalSessionId: normalizeString(raw.terminalSessionId),
    policyId: normalizeString(raw.policyId),
    severity: normalizeSeverity(raw.severity),
    action: normalizeString(raw.action) ?? 'unknown',
    detail: normalizeString(raw.detail) ?? '',
    createdAt: normalizeString(raw.createdAt) ?? nowIso(),
  }
}

function normalizeMcpUsage(raw: Partial<McpContextUsage>): McpContextUsage {
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    attemptId: normalizeString(raw.attemptId),
    experimentId: normalizeString(raw.experimentId),
    toolName: normalizeString(raw.toolName) ?? 'unknown',
    query: normalizeString(raw.query),
    summary: normalizeString(raw.summary) ?? '',
    createdAt: normalizeString(raw.createdAt) ?? nowIso(),
  }
}

function normalizePostmortem(raw: Partial<ExperimentPostmortem>): ExperimentPostmortem {
  const createdAt = normalizeString(raw.createdAt) ?? nowIso()
  return {
    id: normalizeString(raw.id) ?? randomUUID(),
    experimentId: normalizeString(raw.experimentId) ?? '',
    title: normalizeString(raw.title) ?? 'Experiment postmortem',
    markdown: normalizeString(raw.markdown) ?? '',
    exportedPath: normalizeString(raw.exportedPath),
    createdAt,
    updatedAt: normalizeString(raw.updatedAt) ?? createdAt,
  }
}

function starterCases(): ExperimentCase[] {
  const createdAt = nowIso()
  const base = [
    {
      title: 'Small bug fix',
      brief: 'Fix a narrow Relay defect with a low blast radius and verify the app still builds.',
      successCriteria: ['Root cause is identified', 'Fix is scoped to the failing behavior', 'Build or focused check passes'],
      recommendedChecks: ['npm run build', 'Exercise the affected UI path'],
      tags: ['relay', 'bug-fix'],
    },
    {
      title: 'UI polish task',
      brief: 'Improve a real Relay interface detail without changing the underlying workflow.',
      successCriteria: ['Text and controls fit at common widths', 'State changes remain clear', 'Visual style matches the existing app'],
      recommendedChecks: ['npm run build', 'Inspect desktop and narrow layouts'],
      tags: ['relay', 'ui'],
    },
    {
      title: 'TypeScript refactor',
      brief: 'Refactor a typed Relay module while preserving current behavior.',
      successCriteria: ['Public types remain coherent', 'Duplication or complexity is reduced', 'No unrelated behavior changes'],
      recommendedChecks: ['npm run build'],
      tags: ['relay', 'refactor'],
    },
    {
      title: 'Test/build failure investigation',
      brief: 'Diagnose a failing Relay build or check and produce a minimal fix or clear root-cause note.',
      successCriteria: ['Failure is reproduced', 'Likely cause is explained', 'Fix or next diagnostic step is recorded'],
      recommendedChecks: ['npm run build', 'Capture exact failing command'],
      tags: ['relay', 'debugging'],
    },
    {
      title: 'Code review / risk finding',
      brief: 'Review a Relay change for regressions, missing checks, and implementation risks.',
      successCriteria: ['Findings are prioritized by severity', 'Claims reference files or behavior', 'Test gaps are explicit'],
      recommendedChecks: ['Inspect diff', 'Run relevant build/check if practical'],
      tags: ['relay', 'review'],
    },
  ]

  return base.map((item) => normalizeCase({
    id: randomUUID(),
    ...item,
    status: 'draft',
    createdAt,
    updatedAt: createdAt,
  }))
}

function sortSnapshot(snapshot: ExperimentStoreSnapshot): ExperimentStoreSnapshot {
  return {
    cases: [...snapshot.cases].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    attempts: [...snapshot.attempts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    runEvidence: [...snapshot.runEvidence].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    guardrailPolicies: [...snapshot.guardrailPolicies].sort((a, b) => a.name.localeCompare(b.name)),
    guardrailEvents: [...snapshot.guardrailEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 500),
    mcpContextUsages: [...snapshot.mcpContextUsages].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    postmortems: [...snapshot.postmortems].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}

function normalizeStore(raw: Partial<ExperimentStoreSnapshot> | null): ExperimentStoreSnapshot {
  const cases = (raw?.cases ?? []).map(normalizeCase)
  const caseIds = new Set(cases.map((entry) => entry.id))
  const attempts = (raw?.attempts ?? []).map(normalizeAttempt).filter((attempt) => caseIds.has(attempt.experimentId))
  const attemptIds = new Set(attempts.map((attempt) => attempt.id))
  const policies = (raw?.guardrailPolicies ?? []).map(normalizeGuardrailPolicy)
  const defaultPolicy = defaultGuardrailPolicy()
  const guardrailPolicies = policies.some((policy) => policy.id === defaultPolicy.id) ? policies : [defaultPolicy, ...policies]
  return sortSnapshot({
    cases,
    attempts,
    runEvidence: (raw?.runEvidence ?? []).map(normalizeRunEvidence).filter((entry) => attemptIds.has(entry.attemptId)),
    guardrailPolicies,
    guardrailEvents: (raw?.guardrailEvents ?? []).map(normalizeGuardrailEvent).slice(-500),
    mcpContextUsages: (raw?.mcpContextUsages ?? []).map(normalizeMcpUsage).slice(-200),
    postmortems: (raw?.postmortems ?? []).map(normalizePostmortem).filter((entry) => caseIds.has(entry.experimentId)),
  })
}

function readStore(): ExperimentStoreSnapshot {
  try {
    const store = normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as ExperimentStoreSnapshot)
    if (store.cases.length > 0 || store.attempts.length > 0) return store
  } catch {
    // Seed below.
  }
  const seeded = {
    cases: starterCases(),
    attempts: [],
    runEvidence: [],
    guardrailPolicies: [defaultGuardrailPolicy()],
    guardrailEvents: [],
    mcpContextUsages: [],
    postmortems: [],
  }
  writeStore(seeded)
  return sortSnapshot(seeded)
}

function writeStore(snapshot: ExperimentStoreSnapshot): void {
  writePrivateJson(STORE_PATH, sortSnapshot(snapshot))
}

function updateStore(mutator: (snapshot: ExperimentStoreSnapshot) => ExperimentStoreSnapshot): ExperimentStoreSnapshot {
  const next = sortSnapshot(mutator(readStore()))
  writeStore(next)
  emitExperimentsUpdate?.(next)
  return next
}

function mergeStringArray(current: string[], incoming: unknown): string[] {
  return [...new Set([...current, ...normalizeStringArray(incoming)])]
}

function applyAttemptStatusTimes(attempt: ExperimentAttempt, status: AttemptStatus): ExperimentAttempt {
  const now = nowIso()
  if (status === 'running' && !attempt.startedAt) return { ...attempt, status, startedAt: now }
  if ((status === 'succeeded' || status === 'failed' || status === 'inconclusive') && !attempt.completedAt) {
    const durationMs = attempt.startedAt ? Math.max(0, Date.now() - new Date(attempt.startedAt).getTime()) : attempt.durationMs
    return { ...attempt, status, completedAt: now, durationMs }
  }
  return { ...attempt, status }
}

export function setExperimentsEmitter(emitter: ((snapshot: ExperimentStoreSnapshot) => void) | null): void {
  emitExperimentsUpdate = emitter
}

export function getExperiments(): ExperimentStoreSnapshot {
  return readStore()
}

export function createExperimentCase(input: ExperimentCaseInput): ExperimentCase {
  const createdAt = nowIso()
  const experiment = normalizeCase({
    id: randomUUID(),
    ...input,
    status: input.status ?? 'draft',
    createdAt,
    updatedAt: createdAt,
  })
  updateStore((snapshot) => ({ ...snapshot, cases: [experiment, ...snapshot.cases] }))
  return experiment
}

export function updateExperimentCase(id: string, input: ExperimentCaseUpdateInput): ExperimentCase | null {
  let updated: ExperimentCase | null = null
  updateStore((snapshot) => ({
    ...snapshot,
    cases: snapshot.cases.map((experiment) => {
      if (experiment.id !== id) return experiment
      updated = normalizeCase({ ...experiment, ...input, updatedAt: nowIso() })
      return updated
    }),
  }))
  return updated
}

export function archiveExperimentCase(id: string): ExperimentCase | null {
  return updateExperimentCase(id, { status: 'archived', archivedAt: nowIso() } as ExperimentCaseUpdateInput & { archivedAt: string })
}

export function createExperimentAttempt(experimentId: string, input: ExperimentAttemptInput): ExperimentAttempt {
  const snapshot = readStore()
  if (!snapshot.cases.some((experiment) => experiment.id === experimentId)) throw new Error('Experiment not found.')
  const createdAt = nowIso()
  const status = input.status ?? 'not_started'
  let attempt = normalizeAttempt({
    id: randomUUID(),
    ...input,
    experimentId,
    status,
    createdAt,
    updatedAt: createdAt,
  })
  attempt = applyAttemptStatusTimes(attempt, status)
  updateStore((current) => ({ ...current, attempts: [attempt, ...current.attempts] }))
  return attempt
}

export function updateExperimentAttempt(id: string, input: ExperimentAttemptUpdateInput): ExperimentAttempt | null {
  let updated: ExperimentAttempt | null = null
  updateStore((snapshot) => ({
    ...snapshot,
    attempts: snapshot.attempts.map((attempt) => {
      if (attempt.id !== id) return attempt
      const status = input.status ? normalizeAttemptStatus(input.status) : attempt.status
      const normalized = normalizeAttempt({
        ...attempt,
        ...input,
        status,
        updatedAt: nowIso(),
      })
      updated = input.status ? applyAttemptStatusTimes(normalized, status) : normalized
      return updated
    }),
  }))
  return updated
}

export function linkAttemptEvidence(attemptId: string, links: ExperimentEvidenceLinks): ExperimentAttempt | null {
  let updated: ExperimentAttempt | null = null
  updateStore((snapshot) => ({
    ...snapshot,
    attempts: snapshot.attempts.map((attempt) => {
      if (attempt.id !== attemptId) return attempt
      updated = normalizeAttempt({
        ...attempt,
        taskId: normalizeString(links.taskId) ?? attempt.taskId,
        conversationId: normalizeString(links.conversationId) ?? attempt.conversationId,
        terminalSessionId: normalizeString(links.terminalSessionId) ?? attempt.terminalSessionId,
        workflowRunId: normalizeString(links.workflowRunId) ?? attempt.workflowRunId,
        evidence: mergeStringArray(attempt.evidence, links.evidence),
        filesTouched: mergeStringArray(attempt.filesTouched, links.filesTouched),
        testsRun: mergeStringArray(attempt.testsRun, links.testsRun),
        updatedAt: nowIso(),
      })
      return updated
    }),
  }))
  return updated
}

function summarizeAgentEvent(event: AgentRunEvent): ExperimentRunEventSummary {
  const summary = normalizeString(event.summary) ??
    normalizeString(event.message) ??
    normalizeString(event.result) ??
    normalizeString(event.text) ??
    normalizeString(event.title) ??
    event.type
  return normalizeRunEventSummary({
    id: `event-summary-${event.id}`,
    sourceEventId: event.id,
    type: event.type,
    createdAt: event.createdAt,
    title: event.title ?? event.tool,
    status: event.status,
    summary: summary.slice(0, 360),
    filePath: event.path,
  })
}

function inferTestsFromEvents(events: AgentRunEvent[]): string[] {
  return [...new Set(events
    .map((event) => `${event.message ?? ''}\n${event.summary ?? ''}\n${event.text ?? ''}\n${event.result ?? ''}`)
    .flatMap((text) => text.match(/\b(?:npm|pnpm|yarn|bun|cargo|go|pytest|python|uv|swift|xcodebuild)\s+(?:run\s+)?(?:test|build|typecheck|check|lint)[^\n\r;]*/gi) ?? [])
    .map((value) => value.trim())
    .filter(Boolean))]
}

function evidenceFromRun(attempt: ExperimentAttempt, run: AgentRunSnapshot): ExperimentRunEvidence {
  const filesTouched = [...new Set([
    ...attempt.filesTouched,
    ...run.agents.flatMap((agent) => agent.filesTouched),
    ...run.events.map((event) => event.path).filter((value): value is string => !!value),
  ])]
  const testsRun = [...new Set([...attempt.testsRun, ...inferTestsFromEvents(run.events)])]
  const startedAt = run.agents.map((agent) => agent.startedAt).sort()[0] ?? run.createdAt
  const completedAt = run.agents.map((agent) => agent.completedAt).filter((value): value is string => !!value).sort().at(-1)
  const elapsedMs = completedAt ? Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()) : undefined
  const mainAgent = run.agents.find((agent) => agent.role === 'main') ?? run.agents[0]

  return normalizeRunEvidence({
    id: `run-evidence-${attempt.id}-${run.id}`,
    attemptId: attempt.id,
    experimentId: attempt.experimentId,
    runId: run.id,
    terminalSessionId: run.terminalSessionId ?? attempt.terminalSessionId,
    workflowRunId: run.workflowRunId ?? attempt.workflowRunId,
    provider: mainAgent?.provider as ExperimentRunEvidence['provider'],
    title: run.title,
    status: run.status,
    filesTouched,
    testsRun,
    eventSummaries: run.events.slice(-80).map(summarizeAgentEvent),
    exitState: run.status === 'done' ? 'completed' : run.status === 'failed' ? 'failed' : undefined,
    elapsedMs,
    finalNotes: mainAgent?.message,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt,
  })
}

export function findExperimentAttemptForTerminal(terminalSessionId: string): ExperimentAttempt | null {
  return readStore().attempts.find((attempt) => attempt.terminalSessionId === terminalSessionId) ?? null
}

export function findExperimentAttemptForTask(taskId: string): ExperimentAttempt | null {
  return readStore().attempts.find((attempt) => attempt.taskId === taskId) ?? null
}

export function upsertRunEvidenceFromSnapshot(run: AgentRunSnapshot): ExperimentRunEvidence | null {
  const terminalSessionId = run.terminalSessionId
  const attempt = terminalSessionId ? findExperimentAttemptForTerminal(terminalSessionId) : null
  if (!attempt) return null
  const evidence = evidenceFromRun(attempt, run)
  updateStore((snapshot) => ({
    ...snapshot,
    runEvidence: snapshot.runEvidence.some((entry) => entry.id === evidence.id)
      ? snapshot.runEvidence.map((entry) => entry.id === evidence.id ? evidence : entry)
      : [evidence, ...snapshot.runEvidence],
    attempts: snapshot.attempts.map((entry) => {
      if (entry.id !== attempt.id) return entry
      return normalizeAttempt({
        ...entry,
        terminalSessionId: evidence.terminalSessionId ?? entry.terminalSessionId,
        testsRun: mergeStringArray(entry.testsRun, evidence.testsRun),
        filesTouched: mergeStringArray(entry.filesTouched, evidence.filesTouched),
        evidence: mergeStringArray(entry.evidence, evidence.eventSummaries.map((event) => event.summary).slice(-8)),
        updatedAt: nowIso(),
      })
    }),
  }))
  return evidence
}

export function recordGuardrailEvent(input: Omit<GuardrailEvent, 'id' | 'createdAt'>): GuardrailEvent {
  const event = normalizeGuardrailEvent({ ...input, id: randomUUID(), createdAt: nowIso() })
  updateStore((snapshot) => ({ ...snapshot, guardrailEvents: [event, ...snapshot.guardrailEvents] }))
  return event
}

export function recordMcpContextUsage(input: Omit<McpContextUsage, 'id' | 'createdAt'>): McpContextUsage {
  const usage = normalizeMcpUsage({ ...input, id: randomUUID(), createdAt: nowIso() })
  updateStore((snapshot) => ({ ...snapshot, mcpContextUsages: [usage, ...snapshot.mcpContextUsages] }))
  return usage
}

function averageScore(attempt: ExperimentAttempt): string {
  const values = Object.values(attempt.scores).filter((value): value is ExperimentScore => typeof value === 'number')
  if (values.length === 0) return 'n/a'
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)
}

function buildOutcomeTable(attempts: ExperimentAttempt[]): string {
  if (attempts.length === 0) return '| Agent | Status | Average score | Tests | Files |\n| --- | --- | --- | --- | --- |\n'
  return [
    '| Agent | Status | Average score | Tests | Files |',
    '| --- | --- | --- | --- | --- |',
    ...attempts.map((attempt) => `| ${attempt.provider}${attempt.model ? ` (${attempt.model})` : ''} | ${attempt.status} | ${averageScore(attempt)} | ${attempt.testsRun.length} | ${attempt.filesTouched.length} |`),
  ].join('\n')
}

function buildPostmortemMarkdown(experiment: ExperimentCase, attempts: ExperimentAttempt[], runEvidence: ExperimentRunEvidence[], guardrails: GuardrailEvent[]): string {
  const usefulTraces = runEvidence.flatMap((entry) => entry.eventSummaries.slice(-6).map((event) => `- ${entry.title}: ${event.summary}`)).slice(-12)
  const failureModes = attempts
    .filter((attempt) => attempt.status === 'failed' || attempt.status === 'inconclusive' || attempt.scores.correctness === 1 || attempt.scores.correctness === 2)
    .map((attempt) => `- ${attempt.provider}: ${attempt.outcomeNotes || 'No outcome notes recorded.'}`)
  return [
    `# ${experiment.title} Postmortem`,
    '',
    '## Task Goal',
    experiment.brief || 'No brief recorded.',
    '',
    '## Success Criteria',
    experiment.successCriteria.length > 0 ? experiment.successCriteria.map((item) => `- ${item}`).join('\n') : '- No criteria recorded.',
    '',
    '## Agents Compared',
    attempts.length > 0 ? attempts.map((attempt) => `- ${attempt.provider}${attempt.model ? ` (${attempt.model})` : ''}`).join('\n') : '- No attempts recorded.',
    '',
    '## Outcome Table',
    buildOutcomeTable(attempts),
    '',
    '## Useful Traces',
    usefulTraces.length > 0 ? usefulTraces.join('\n') : '- No durable run traces recorded.',
    '',
    '## Guardrail Notes',
    guardrails.length > 0 ? guardrails.slice(0, 10).map((event) => `- ${event.severity}: ${event.detail}`).join('\n') : '- No guardrail warnings recorded.',
    '',
    '## Failure Modes',
    failureModes.length > 0 ? failureModes.join('\n') : '- No failed or inconclusive attempts recorded.',
    '',
    '## Lessons Learned',
    attempts.flatMap((attempt) => attempt.outcomeNotes ? [`- ${attempt.provider}: ${attempt.outcomeNotes}`] : []).join('\n') || '- Add outcome notes to attempts before finalizing this postmortem.',
    '',
    '## Next Workflow Improvement',
    experiment.recommendedChecks.length > 0
      ? `Run and record: ${experiment.recommendedChecks.join(', ')}.`
      : 'Define explicit checks before the next comparison run.',
    '',
  ].join('\n')
}

function safeFilename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'postmortem'
}

export function generateExperimentPostmortem(experimentId: string, input: ExperimentPostmortemInput = {}): ExperimentPostmortem {
  const snapshot = readStore()
  const experiment = snapshot.cases.find((entry) => entry.id === experimentId)
  if (!experiment) throw new Error('Experiment not found.')
  const attempts = snapshot.attempts.filter((attempt) => attempt.experimentId === experimentId)
  const attemptIds = new Set(attempts.map((attempt) => attempt.id))
  const runEvidence = snapshot.runEvidence.filter((entry) => entry.experimentId === experimentId)
  const guardrails = snapshot.guardrailEvents.filter((event) => event.experimentId === experimentId || (event.attemptId && attemptIds.has(event.attemptId)))
  const now = nowIso()
  const markdown = buildPostmortemMarkdown(experiment, attempts, runEvidence, guardrails)
  let exportedPath: string | undefined
  if (input.exportMarkdown) {
    fs.mkdirSync(POSTMORTEMS_DIR, { recursive: true })
    exportedPath = path.join(POSTMORTEMS_DIR, `${safeFilename(experiment.title)}-${now.slice(0, 10)}.md`)
    fs.writeFileSync(exportedPath, markdown)
  }
  const postmortem = normalizePostmortem({
    id: randomUUID(),
    experimentId,
    title: `${experiment.title} Postmortem`,
    markdown,
    exportedPath,
    createdAt: now,
    updatedAt: now,
  })
  updateStore((current) => ({ ...current, postmortems: [postmortem, ...current.postmortems] }))
  return postmortem
}
