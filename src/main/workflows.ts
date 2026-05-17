import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { getGeminiApiKey } from './gemini-auth'
import { getValidAccessToken } from './openai-auth'
import { writePrivateJson } from './private-json'
import {
  CODEX_MODELS,
  type AgentProfile,
  type WorkflowArtifact,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStepRun,
  type WorkflowVerdict,
} from '../shared/types'

const STORE_PATH = path.join(app.getPath('userData'), 'workflow-store.json')
const CHAT_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const GEMINI_BASE = 'https://generativelanguage.googleapis.com'

interface WorkflowStore {
  agentProfiles: AgentProfile[]
  workflowDefinitions: WorkflowDefinition[]
  workflowRuns: WorkflowRun[]
}

let emitRunUpdate: ((run: WorkflowRun) => void) | null = null

function defaultAgentProfiles(): AgentProfile[] {
  return [
    {
      id: 'codex-implementer',
      name: 'Codex Implementer',
      provider: 'openai',
      model: CODEX_MODELS[0],
      role: 'implementer',
      enabled: true,
      systemPrompt: [
        'You are the implementation agent in a local orchestration workflow.',
        'Produce concrete code-oriented work, keep your response structured, and make review easy.',
        'Do not explain the orchestration itself.',
      ].join(' '),
    },
    {
      id: 'gemini-reviewer',
      name: 'Gemini Reviewer',
      provider: 'google',
      model: 'gemini-2.5-pro',
      role: 'reviewer',
      enabled: true,
      systemPrompt: [
        'You are the reviewer agent in a local orchestration workflow.',
        'Be specific, critical, and concise. Focus on correctness, risks, regressions, and missing tests.',
        'Return a clear verdict of approve, request_changes, or escalate.',
      ].join(' '),
    },
  ]
}

function defaultWorkflowDefinitions(): WorkflowDefinition[] {
  return [
    {
      id: 'codex-implements-gemini-reviews',
      name: 'Codex Implements -> Gemini Reviews',
      description: 'Codex drafts the change and Gemini reviews it. Relay loops review feedback back to Codex.',
      implementerAgentId: 'codex-implementer',
      reviewerAgentId: 'gemini-reviewer',
      maxReviewRounds: 2,
    },
  ]
}

function defaultStore(): WorkflowStore {
  return {
    agentProfiles: defaultAgentProfiles(),
    workflowDefinitions: defaultWorkflowDefinitions(),
    workflowRuns: [],
  }
}

function normalizeStore(store: Partial<WorkflowStore> | null): WorkflowStore {
  const defaults = defaultStore()
  const incoming = store ?? {}
  const existingProfiles = new Map((incoming.agentProfiles ?? []).map((profile) => [profile.id, profile]))
  const existingWorkflows = new Map((incoming.workflowDefinitions ?? []).map((workflow) => [workflow.id, workflow]))

  return {
    agentProfiles: defaults.agentProfiles.map((profile) => existingProfiles.get(profile.id) ?? profile),
    workflowDefinitions: defaults.workflowDefinitions.map((workflow) => existingWorkflows.get(workflow.id) ?? workflow),
    workflowRuns: [...(incoming.workflowRuns ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 40),
  }
}

function readStore(): WorkflowStore {
  try {
    return normalizeStore(JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as WorkflowStore)
  } catch {
    return defaultStore()
  }
}

function writeStore(store: WorkflowStore): void {
  writePrivateJson(STORE_PATH, store)
}

function updateStore(mutator: (store: WorkflowStore) => WorkflowStore): WorkflowStore {
  const next = mutator(readStore())
  writeStore(next)
  return next
}

function nowIso(): string {
  return new Date().toISOString()
}

function readAnthropicApiKey(): string | null {
  try {
    const config = JSON.parse(fs.readFileSync(CHAT_CONFIG_PATH, 'utf8')) as { apiKey?: string }
    return config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null
  } catch {
    return process.env.ANTHROPIC_API_KEY ?? null
  }
}

function emitUpdatedRun(runId: string): WorkflowRun {
  const run = readStore().workflowRuns.find((entry) => entry.id === runId)
  if (!run) throw new Error(`Workflow run not found: ${runId}`)
  emitRunUpdate?.(run)
  return run
}

function updateRun(runId: string, updater: (run: WorkflowRun) => WorkflowRun): WorkflowRun {
  updateStore((store) => ({
    ...store,
    workflowRuns: store.workflowRuns.map((run) => (
      run.id === runId
        ? updater({ ...run, updatedAt: nowIso() })
        : run
    )),
  }))
  return emitUpdatedRun(runId)
}

function extractSection(text: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`## ${escaped}\\s*([\\s\\S]*?)(?=\\n## |$)`, 'i')
  return text.match(regex)?.[1]?.trim() ?? ''
}

function parseListSection(section: string): string[] {
  return section
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
}

function parseImplementationArtifact(goal: string, output: string): WorkflowArtifact {
  const changedFiles = parseListSection(extractSection(output, 'Changed Files'))
  return {
    goal,
    changedFiles,
    diffSummary: extractSection(output, 'Diff Summary') || extractSection(output, 'Proposed Change'),
    testStatus: extractSection(output, 'Test Plan') || 'Not specified',
    openQuestions: extractSection(output, 'Open Questions'),
    summary: extractSection(output, 'Proposed Change') || output.slice(0, 500),
  }
}

function parseVerdict(value: string): WorkflowVerdict {
  const normalized = value.trim().toLowerCase()
  if (normalized.includes('approve')) return 'approve'
  if (normalized.includes('escalate')) return 'escalate'
  return 'request_changes'
}

function parseReviewArtifact(goal: string, output: string): WorkflowArtifact {
  const verdict = parseVerdict(extractSection(output, 'Verdict') || output)
  const requiredChanges = extractSection(output, 'Required Changes')
  const issues = extractSection(output, 'Issues')
  return {
    goal,
    changedFiles: [],
    diffSummary: extractSection(output, 'Summary'),
    testStatus: extractSection(output, 'Test Coverage') || 'Reviewer did not assess tests explicitly',
    openQuestions: issues,
    requestedAction: requiredChanges,
    summary: extractSection(output, 'Summary') || output.slice(0, 500),
    verdict,
  }
}

function createStepRun(
  kind: WorkflowStepRun['kind'],
  agent: AgentProfile,
  round: number,
  input: string,
): WorkflowStepRun {
  return {
    id: randomUUID(),
    kind,
    status: 'running',
    agentId: agent.id,
    agentName: agent.name,
    round,
    input,
    output: '',
    startedAt: nowIso(),
  }
}

function buildImplementerPrompt(goal: string, previousReview?: WorkflowArtifact): string {
  const revisionBlock = previousReview
    ? [
        'Reviewer feedback to address before revising:',
        `Summary: ${previousReview.summary ?? 'n/a'}`,
        `Issues: ${previousReview.openQuestions || 'n/a'}`,
        `Required changes: ${previousReview.requestedAction || 'n/a'}`,
      ].join('\n')
    : 'This is the first implementation pass.'

  return [
    `Task: ${goal}`,
    revisionBlock,
    '',
    'Respond with the exact markdown headings below:',
    '## Proposed Change',
    '## Changed Files',
    '## Diff Summary',
    '## Test Plan',
    '## Open Questions',
    '## Final Patch',
    '',
    'Use bullet points for Changed Files. If you are proposing code, include it in Final Patch.',
  ].join('\n')
}

function buildReviewerPrompt(goal: string, artifact: WorkflowArtifact, implementerOutput: string): string {
  return [
    `Review task: ${goal}`,
    '',
    'Implementation summary:',
    artifact.summary ?? 'n/a',
    '',
    'Changed files:',
    artifact.changedFiles.length > 0 ? artifact.changedFiles.map((file) => `- ${file}`).join('\n') : '- Not specified',
    '',
    'Diff summary:',
    artifact.diffSummary || 'Not specified',
    '',
    'Test plan:',
    artifact.testStatus || 'Not specified',
    '',
    'Full implementation output:',
    implementerOutput,
    '',
    'Respond with the exact markdown headings below:',
    '## Verdict',
    'One of: approve, request_changes, escalate',
    '## Summary',
    '## Issues',
    '## Required Changes',
    '## Test Coverage',
  ].join('\n')
}

async function runAnthropic(profile: AgentProfile, prompt: string): Promise<string> {
  const apiKey = readAnthropicApiKey()
  if (!apiKey) throw new Error('No Anthropic API key configured for implementation agent.')
  const client = new Anthropic({ apiKey })
  const result = await client.messages.create({
    model: profile.model as Anthropic.Model,
    max_tokens: 4096,
    system: profile.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })

  return result.content
    .map((item) => item.type === 'text' ? item.text : '')
    .join('\n\n')
    .trim()
}

async function runOpenAI(profile: AgentProfile, prompt: string): Promise<string> {
  const auth = await getValidAccessToken()
  const sessionId = randomUUID()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${auth.accessToken}`,
    'originator': 'relay',
    'session_id': sessionId,
  }

  if (auth.accountId) {
    headers['ChatGPT-Account-Id'] = auth.accountId
  }

  const body = JSON.stringify({
    model: profile.model,
    instructions: profile.systemPrompt,
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: prompt }],
    }],
    stream: false,
    store: false,
  })

  const res = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Codex API error (${res.status}): ${text}`)
  }

  const json = await res.json() as {
    output?: Array<{
      content?: Array<{ type?: string; text?: string }>
    }>
  }

  const text = (json.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text ?? '')
    .join('\n\n')
    .trim()

  if (!text) throw new Error('Codex returned an empty implementation response.')
  return text
}

async function runGemini(profile: AgentProfile, prompt: string): Promise<string> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) throw new Error('No Gemini API key configured for reviewer agent.')
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: profile.systemPrompt }] },
    generationConfig: { maxOutputTokens: 4096 },
  }
  const res = await fetch(`${GEMINI_BASE}/v1beta/models/${profile.model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gemini API error (${res.status}): ${text}`)
  }
  const json = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n')?.trim()
  if (!text) throw new Error('Gemini returned an empty review response.')
  return text
}

async function runAgent(profile: AgentProfile, prompt: string): Promise<string> {
  if (profile.provider === 'anthropic') return runAnthropic(profile, prompt)
  if (profile.provider === 'openai') return runOpenAI(profile, prompt)
  return runGemini(profile, prompt)
}

async function executeWorkflowRun(runId: string): Promise<void> {
  let run = emitUpdatedRun(runId)
  const store = readStore()
  const workflow = store.workflowDefinitions.find((item) => item.id === run.workflowId)
  if (!workflow) {
    updateRun(runId, (current) => ({ ...current, status: 'failed', summary: 'Workflow definition not found.' }))
    return
  }

  const implementer = store.agentProfiles.find((item) => item.id === workflow.implementerAgentId)
  const reviewer = store.agentProfiles.find((item) => item.id === workflow.reviewerAgentId)
  if (!implementer || !reviewer) {
    updateRun(runId, (current) => ({ ...current, status: 'failed', summary: 'Workflow agent profile is missing.' }))
    return
  }

  let reviewArtifact: WorkflowArtifact | undefined

  for (let round = 1; round <= workflow.maxReviewRounds; round += 1) {
    try {
      run = updateRun(runId, (current) => ({
        ...current,
        status: 'running',
        currentRound: round,
        steps: [...current.steps, createStepRun('implement', implementer, round, buildImplementerPrompt(current.goal, reviewArtifact))],
      }))

      const implementStep = run.steps.at(-1)
      if (!implementStep) throw new Error('Implementation step did not initialize.')
      const implementOutput = await runAgent(implementer, implementStep.input)
      const implementationArtifact = parseImplementationArtifact(run.goal, implementOutput)

      run = updateRun(runId, (current) => ({
        ...current,
        steps: current.steps.map((step) => step.id === implementStep.id ? {
          ...step,
          status: 'completed',
          output: implementOutput,
          completedAt: nowIso(),
          artifact: implementationArtifact,
        } : step),
      }))

      const reviewPrompt = buildReviewerPrompt(run.goal, implementationArtifact, implementOutput)
      run = updateRun(runId, (current) => ({
        ...current,
        steps: [...current.steps, createStepRun('review', reviewer, round, reviewPrompt)],
      }))

      const reviewStep = run.steps.at(-1)
      if (!reviewStep) throw new Error('Review step did not initialize.')
      const reviewOutput = await runAgent(reviewer, reviewPrompt)
      reviewArtifact = parseReviewArtifact(run.goal, reviewOutput)

      run = updateRun(runId, (current) => ({
        ...current,
        steps: current.steps.map((step) => step.id === reviewStep.id ? {
          ...step,
          status: 'completed',
          output: reviewOutput,
          completedAt: nowIso(),
          artifact: reviewArtifact,
        } : step),
      }))

      if (reviewArtifact.verdict === 'approve') {
        updateRun(runId, (current) => ({
          ...current,
          status: 'completed',
          finalVerdict: 'approve',
          summary: reviewArtifact?.summary ?? 'Reviewer approved the change.',
        }))
        return
      }

      if (reviewArtifact.verdict === 'escalate') {
        updateRun(runId, (current) => ({
          ...current,
          status: 'completed',
          finalVerdict: 'escalate',
          summary: reviewArtifact?.summary ?? 'Reviewer escalated the run.',
        }))
        return
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      updateRun(runId, (current) => ({
        ...current,
        status: 'failed',
        summary: message,
        steps: current.steps.map((step, index, steps) => (
          index === steps.length - 1 && step.status === 'running'
            ? { ...step, status: 'failed', error: message, completedAt: nowIso() }
            : step
        )),
      }))
      return
    }
  }

  updateRun(runId, (current) => ({
    ...current,
    status: 'completed',
    finalVerdict: 'escalate',
    summary: reviewArtifact?.summary ?? 'Maximum review rounds reached without approval.',
  }))
}

export function setWorkflowRunEmitter(emitter: ((run: WorkflowRun) => void) | null): void {
  emitRunUpdate = emitter
}

export function getAgentProfiles(): AgentProfile[] {
  return readStore().agentProfiles
}

export function saveAgentProfile(profile: AgentProfile): AgentProfile[] {
  return updateStore((store) => ({
    ...store,
    agentProfiles: store.agentProfiles.some((entry) => entry.id === profile.id)
      ? store.agentProfiles.map((entry) => entry.id === profile.id ? profile : entry)
      : [...store.agentProfiles, profile],
  })).agentProfiles
}

export function getWorkflowDefinitions(): WorkflowDefinition[] {
  return readStore().workflowDefinitions
}

export function getWorkflowRuns(): WorkflowRun[] {
  return readStore().workflowRuns
}

export function startWorkflowRun(workflowId: string, goal: string, workspaceId?: string): WorkflowRun {
  const store = readStore()
  const workflow = store.workflowDefinitions.find((item) => item.id === workflowId)
  if (!workflow) throw new Error('Workflow definition not found.')

  const run: WorkflowRun = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    goal: goal.trim(),
    workspaceId,
    status: 'queued',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    currentRound: 0,
    maxRounds: workflow.maxReviewRounds,
    steps: [],
  }

  updateStore((current) => ({
    ...current,
    workflowRuns: [run, ...current.workflowRuns].slice(0, 40),
  }))
  emitUpdatedRun(run.id)
  void executeWorkflowRun(run.id)
  return emitUpdatedRun(run.id)
}
