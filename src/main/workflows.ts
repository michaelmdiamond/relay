import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { Agent } from '@cursor/sdk'
import { getGeminiApiKey } from './gemini-auth'
import { getValidAccessToken } from './openai-auth'
import { getDeepSeekApiKey } from './deepseek-auth'
import { getOllamaConfig, DEFAULT_OLLAMA_URL } from './ollama-config'
import { getCursorApiKey, getCursorModel } from './cursor-auth'
import { writePrivateJson } from './private-json'
import { getWorkspaceById } from './workspaces'
import {
  type AgentProfile,
  type AgentKnowledgeEntry,
  type AgentProfileRun,
  type RunAgentProfileInput,
  type WorkflowArtifact,
  type WorkflowDefinition,
  type WorkflowRun,
  type WorkflowStepRun,
  type WorkflowVerdict,
} from '../shared/types'

const STORE_PATH = path.join(app.getPath('userData'), 'workflow-store.json')
const CHAT_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const GEMINI_BASE = 'https://generativelanguage.googleapis.com'
const DEEPSEEK_BASE = 'https://api.deepseek.com'
const AGENT_RUN_TIMEOUT_MS = 600_000
const LEGACY_SEEDED_AGENT_IDS = new Set(['codex-implementer', 'gemini-reviewer'])
const LEGACY_SEEDED_WORKFLOW_IDS = new Set(['codex-implements-gemini-reviews'])

interface WorkflowStore {
  agentProfiles: AgentProfile[]
  agentKnowledge: AgentKnowledgeEntry[]
  agentRuns: AgentProfileRun[]
  workflowDefinitions: WorkflowDefinition[]
  workflowRuns: WorkflowRun[]
}

let emitRunUpdate: ((run: WorkflowRun) => void) | null = null

function defaultAgentProfiles(): AgentProfile[] {
  return []
}

function defaultWorkflowDefinitions(): WorkflowDefinition[] {
  return []
}

function defaultStore(): WorkflowStore {
  return {
    agentProfiles: defaultAgentProfiles(),
    agentKnowledge: [],
    agentRuns: [],
    workflowDefinitions: defaultWorkflowDefinitions(),
    workflowRuns: [],
  }
}

function isLegacySeededAgent(profile: AgentProfile): boolean {
  if (LEGACY_SEEDED_AGENT_IDS.has(profile.id)) return true
  if (profile.name === 'Codex Implementer' && profile.provider === 'openai' && profile.role === 'implementer') return true
  if (profile.name === 'Gemini Reviewer' && profile.provider === 'google' && profile.role === 'reviewer') return true
  return false
}

function normalizeStore(store: Partial<WorkflowStore> | null): WorkflowStore {
  const defaults = defaultStore()
  const incoming = store ?? {}
  const incomingProfiles = (incoming.agentProfiles ?? []).filter((profile) => !isLegacySeededAgent(profile))
  const incomingWorkflows = (incoming.workflowDefinitions ?? []).filter((workflow) => !LEGACY_SEEDED_WORKFLOW_IDS.has(workflow.id))
  const existingProfiles = new Map(incomingProfiles.map((profile) => [profile.id, profile]))
  const existingWorkflows = new Map(incomingWorkflows.map((workflow) => [workflow.id, workflow]))
  const customProfiles = incomingProfiles.filter((profile) => (
    !defaults.agentProfiles.some((defaultProfile) => defaultProfile.id === profile.id)
  ))
  const customWorkflows = incomingWorkflows.filter((workflow) => (
    !defaults.workflowDefinitions.some((defaultWorkflow) => defaultWorkflow.id === workflow.id)
  ))

  const knowledgeAgentIds = new Set((incoming.agentKnowledge ?? []).map((entry) => entry.agentId))
  const agentProfiles = [
    ...defaults.agentProfiles.map((profile) => existingProfiles.get(profile.id) ?? profile),
    ...customProfiles,
  ].map((profile) => (
    profile.setupCompletedAt || !knowledgeAgentIds.has(profile.id)
      ? profile
      : { ...profile, setupCompletedAt: (incoming.agentKnowledge ?? []).filter((entry) => entry.agentId === profile.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt }
  ))

  return {
    agentProfiles,
    agentKnowledge: [...(incoming.agentKnowledge ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200),
    agentRuns: [...(incoming.agentRuns ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 80),
    workflowDefinitions: [
      ...defaults.workflowDefinitions.map((workflow) => existingWorkflows.get(workflow.id) ?? workflow),
      ...customWorkflows,
    ],
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

function agentKnowledgeContext(profile: AgentProfile): string {
  const entries = readStore().agentKnowledge
    .filter((entry) => entry.agentId === profile.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  if (entries.length === 0) return profile.systemPrompt

  return [
    profile.systemPrompt,
    '',
    'Persistent Relay knowledge for this agent:',
    entries.map((entry, index) => [
      `Knowledge ${index + 1} (${entry.createdAt})`,
      `Source prompt: ${entry.sourcePrompt}`,
      entry.content,
    ].join('\n')).join('\n\n---\n\n'),
  ].join('\n')
}

function profileWithKnowledge(profile: AgentProfile): AgentProfile {
  return { ...profile, systemPrompt: agentKnowledgeContext(profile) }
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
    stream: true,
    store: false,
  })

  const res = await fetch('https://chatgpt.com/backend-api/codex/responses', {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(AGENT_RUN_TIMEOUT_MS),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Codex API error (${res.status}): ${text}`)
  }

  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body from Codex API.')

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') continue

      try {
        const event = JSON.parse(data) as { type?: string; delta?: string }
        if (event.type === 'response.output_text.delta' && event.delta) {
          accumulated += event.delta
        }
      } catch {
        // Skip malformed SSE events.
      }
    }
  }

  const text = accumulated.trim()

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
    signal: AbortSignal.timeout(AGENT_RUN_TIMEOUT_MS),
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

async function runDeepSeek(profile: AgentProfile, prompt: string): Promise<string> {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) throw new Error('No DeepSeek API key configured for workflow agent.')
  const res = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: profile.model,
      messages: [
        { role: 'system', content: profile.systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: false,
      max_tokens: 8192,
      thinking: { type: 'disabled' },
    }),
    signal: AbortSignal.timeout(AGENT_RUN_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek API error (${res.status}): ${text}`)
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('DeepSeek returned an empty workflow response.')
  return text
}

async function runOllama(profile: AgentProfile, prompt: string): Promise<string> {
  const cfg = getOllamaConfig()
  if (!cfg) throw new Error('No Ollama model is configured for workflow agents.')
  const baseUrl = (cfg.baseUrl || DEFAULT_OLLAMA_URL).replace('localhost', '127.0.0.1')
  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: profile.model || cfg.model,
      messages: [
        { role: 'system', content: profile.systemPrompt },
        { role: 'user', content: prompt },
      ],
      stream: false,
    }),
    signal: AbortSignal.timeout(AGENT_RUN_TIMEOUT_MS),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama error (${res.status}): ${text}`)
  }
  const json = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Ollama returned an empty workflow response.')
  return text
}

async function runCursor(profile: AgentProfile, prompt: string, workspaceId?: string): Promise<string> {
  const apiKey = getCursorApiKey()
  if (!apiKey) throw new Error('No Cursor API key configured for workflow agent.')
  const workspace = workspaceId ? getWorkspaceById(workspaceId) : null
  if (!workspace?.projectPath) throw new Error('Cursor workflow agents need a selected workspace folder.')

  const model = profile.model && profile.model !== 'auto' ? profile.model : getCursorModel()
  const agent = await Agent.create({
    apiKey,
    model: { id: model },
    local: { cwd: workspace.projectPath },
  })
  const run = await agent.send([profile.systemPrompt, prompt].filter(Boolean).join('\n\n'))
  let accumulated = ''
  for await (const event of run.stream()) {
    if (event.type === 'assistant') {
      accumulated += event.message.content
        .map((block) => block.type === 'text' ? block.text : '')
        .join('')
    }
  }
  const result = await run.wait()
  const text = (accumulated || result.result || '').trim()
  if (!text) throw new Error('Cursor returned an empty workflow response.')
  return text
}

async function runAgent(profile: AgentProfile, prompt: string, workspaceId?: string): Promise<string> {
  const contextualProfile = profileWithKnowledge(profile)
  if (contextualProfile.provider === 'anthropic') return runAnthropic(contextualProfile, prompt)
  if (contextualProfile.provider === 'openai') return runOpenAI(contextualProfile, prompt)
  if (contextualProfile.provider === 'google') return runGemini(contextualProfile, prompt)
  if (contextualProfile.provider === 'deepseek') return runDeepSeek(contextualProfile, prompt)
  if (contextualProfile.provider === 'ollama') return runOllama(contextualProfile, prompt)
  return runCursor(contextualProfile, prompt, workspaceId)
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
      const implementOutput = await runAgent(implementer, implementStep.input, run.workspaceId)
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
      const reviewOutput = await runAgent(reviewer, reviewPrompt, run.workspaceId)
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

export function deleteAgentProfile(id: string): AgentProfile[] {
  return updateStore((store) => ({
    ...store,
    agentProfiles: store.agentProfiles.filter((entry) => entry.id !== id),
    agentKnowledge: store.agentKnowledge.filter((entry) => entry.agentId !== id),
    agentRuns: store.agentRuns.filter((entry) => entry.agentId !== id),
    workflowDefinitions: store.workflowDefinitions.filter((workflow) => (
      workflow.implementerAgentId !== id && workflow.reviewerAgentId !== id
    )),
  })).agentProfiles
}

export function getAgentKnowledge(agentId: string): AgentKnowledgeEntry[] {
  return readStore().agentKnowledge
    .filter((entry) => entry.agentId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getAgentRuns(agentId: string): AgentProfileRun[] {
  return readStore().agentRuns
    .filter((entry) => entry.agentId === agentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function runAgentProfile(input: RunAgentProfileInput): Promise<AgentProfileRun> {
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('Prompt is required.')

  const profile = readStore().agentProfiles.find((entry) => entry.id === input.agentId)
  if (!profile) throw new Error('Agent profile not found.')
  if (!profile.enabled) throw new Error(`${profile.name} is disabled.`)

  const createdAt = nowIso()
  try {
    const output = await runAgent(profile, prompt, input.workspaceId)
    const completedAt = nowIso()
    const run: AgentProfileRun = {
      id: randomUUID(),
      agentId: profile.id,
      agentName: profile.name,
      prompt,
      output,
      savedToKnowledge: input.saveToKnowledge === true,
      status: 'completed',
      createdAt,
      completedAt,
    }
    updateStore((store) => ({
      ...store,
      agentProfiles: input.setupRun
        ? store.agentProfiles.map((entry) => entry.id === profile.id ? { ...entry, setupCompletedAt: completedAt } : entry)
        : store.agentProfiles,
      agentRuns: [run, ...store.agentRuns].slice(0, 80),
      agentKnowledge: input.saveToKnowledge === true
        ? [{
            id: randomUUID(),
            agentId: profile.id,
            sourcePrompt: prompt,
            content: output,
            createdAt: completedAt,
          }, ...store.agentKnowledge].slice(0, 200)
        : store.agentKnowledge,
    }))
    return run
  } catch (error) {
    const completedAt = nowIso()
    const message = error instanceof Error ? error.message : String(error)
    const run: AgentProfileRun = {
      id: randomUUID(),
      agentId: profile.id,
      agentName: profile.name,
      prompt,
      output: '',
      savedToKnowledge: false,
      status: 'failed',
      createdAt,
      completedAt,
      error: message,
    }
    updateStore((store) => ({ ...store, agentRuns: [run, ...store.agentRuns].slice(0, 80) }))
    throw error
  }
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
