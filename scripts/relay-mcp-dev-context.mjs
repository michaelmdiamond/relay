#!/usr/bin/env node
import fs from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'
import { randomUUID } from 'crypto'

const userData = process.env.RELAY_USER_DATA || (
  process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Application Support', 'relay')
    : path.join(os.homedir(), '.config', 'relay')
)

function readJson(filename, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(userData, filename), 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(filename, value) {
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, filename), JSON.stringify(value, null, 2))
}

function experimentsStore() {
  return readJson('experiments.json', {
    cases: [],
    attempts: [],
    runEvidence: [],
    guardrailPolicies: [],
    guardrailEvents: [],
    mcpContextUsages: [],
    postmortems: [],
  })
}

function tasksStore() {
  return readJson('tasks.json', [])
}

function terminalStore() {
  return readJson('terminal-sessions.json', [])
}

function workspaceStore() {
  return readJson('workspaces.json', [])
}

function recordUsage(toolName, args, summary) {
  const store = experimentsStore()
  const usage = {
    id: randomUUID(),
    attemptId: typeof args.attemptId === 'string' ? args.attemptId : undefined,
    experimentId: typeof args.experimentId === 'string' ? args.experimentId : undefined,
    toolName,
    query: typeof args.query === 'string' ? args.query : undefined,
    summary,
    createdAt: new Date().toISOString(),
  }
  store.mcpContextUsages = [usage, ...(store.mcpContextUsages || [])].slice(0, 200)
  writeJson('experiments.json', store)
}

function toolResult(value) {
  return {
    content: [{
      type: 'text',
      text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    }],
  }
}

function contextSummary(args = {}) {
  const experiments = experimentsStore()
  const tasks = tasksStore()
  const workspaces = workspaceStore()
  const activeCases = experiments.cases.filter((entry) => entry.status !== 'archived')
  const recentAttempts = experiments.attempts.slice(0, 10)
  const summary = {
    generatedAt: new Date().toISOString(),
    userData,
    workspaces: workspaces.slice(0, 20).map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      kind: workspace.kind,
      projectPath: workspace.projectPath,
    })),
    experiments: {
      activeCount: activeCases.length,
      recentCases: activeCases.slice(0, 10).map((entry) => ({
        id: entry.id,
        title: entry.title,
        status: entry.status,
        projectName: entry.projectName,
        tags: entry.tags,
      })),
      recentAttempts: recentAttempts.map((attempt) => ({
        id: attempt.id,
        experimentId: attempt.experimentId,
        provider: attempt.provider,
        status: attempt.status,
        taskId: attempt.taskId,
        terminalSessionId: attempt.terminalSessionId,
      })),
    },
    tasks: tasks.filter((task) => !task.archivedAt).slice(0, 15).map((task) => ({
      id: task.id,
      title: task.title,
      state: task.state,
      projectName: task.projectName,
    })),
  }
  recordUsage('relay_context_summary', args, `Returned ${activeCases.length} active experiment cases and ${tasks.length} tasks.`)
  return summary
}

function experimentCases(args = {}) {
  const store = experimentsStore()
  const status = typeof args.status === 'string' ? args.status : undefined
  const query = typeof args.query === 'string' ? args.query.toLowerCase() : ''
  const cases = store.cases.filter((entry) => {
    if (status && entry.status !== status) return false
    if (!query) return true
    return `${entry.title} ${entry.brief} ${(entry.tags || []).join(' ')}`.toLowerCase().includes(query)
  })
  recordUsage('relay_experiment_cases', args, `Returned ${cases.length} experiment cases.`)
  return cases
}

function attemptSummaries(args = {}) {
  const store = experimentsStore()
  const experimentId = typeof args.experimentId === 'string' ? args.experimentId : undefined
  const attempts = store.attempts
    .filter((attempt) => !experimentId || attempt.experimentId === experimentId)
    .map((attempt) => ({
      ...attempt,
      runEvidence: store.runEvidence.filter((entry) => entry.attemptId === attempt.id).slice(0, 3),
      guardrailEvents: store.guardrailEvents.filter((entry) => entry.attemptId === attempt.id).slice(0, 5),
    }))
  recordUsage('relay_attempt_summaries', args, `Returned ${attempts.length} attempts.`)
  return attempts
}

function recentRunSummaries(args = {}) {
  const store = experimentsStore()
  const attemptId = typeof args.attemptId === 'string' ? args.attemptId : undefined
  const runs = store.runEvidence
    .filter((entry) => !attemptId || entry.attemptId === attemptId)
    .slice(0, Number(args.limit || 10))
  recordUsage('relay_recent_run_summaries', args, `Returned ${runs.length} run evidence records.`)
  return runs
}

function repoMetadata(args = {}) {
  const workspaces = workspaceStore()
  const projectPath = typeof args.projectPath === 'string' ? args.projectPath : workspaces.find((workspace) => workspace.projectPath)?.projectPath
  if (!projectPath) return { error: 'No project path available.' }
  const gitHeadPath = path.join(projectPath, '.git', 'HEAD')
  let branch
  try {
    const head = fs.readFileSync(gitHeadPath, 'utf8').trim()
    branch = head.startsWith('ref:') ? head.split('/').at(-1) : head
  } catch {
    branch = undefined
  }
  const result = { projectPath, branch }
  recordUsage('relay_repo_metadata', args, `Returned repo metadata for ${projectPath}.`)
  return result
}

const tools = {
  relay_context_summary: {
    description: 'Summarize Relay workspaces, active experiment cases, recent attempts, and active tasks.',
    inputSchema: { type: 'object', properties: { experimentId: { type: 'string' }, attemptId: { type: 'string' } } },
    run: contextSummary,
  },
  relay_experiment_cases: {
    description: 'List Relay experiment cases, optionally filtered by status or query.',
    inputSchema: { type: 'object', properties: { status: { type: 'string' }, query: { type: 'string' } } },
    run: experimentCases,
  },
  relay_attempt_summaries: {
    description: 'List experiment attempts with linked run evidence and guardrail notes.',
    inputSchema: { type: 'object', properties: { experimentId: { type: 'string' } } },
    run: attemptSummaries,
  },
  relay_recent_run_summaries: {
    description: 'List durable flight recorder summaries, optionally for one attempt.',
    inputSchema: { type: 'object', properties: { attemptId: { type: 'string' }, limit: { type: 'number' } } },
    run: recentRunSummaries,
  },
  relay_repo_metadata: {
    description: 'Return safe repository metadata for a Relay workspace path.',
    inputSchema: { type: 'object', properties: { projectPath: { type: 'string' } } },
    run: repoMetadata,
  },
}

function respond(id, result, error) {
  const payload = error
    ? { jsonrpc: '2.0', id, error: { code: -32000, message: error.message || String(error) } }
    : { jsonrpc: '2.0', id, result }
  process.stdout.write(`${JSON.stringify(payload)}\n`)
}

function handle(message) {
  if (message.method === 'initialize') {
    respond(message.id, {
      protocolVersion: message.params?.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'relay-dev-context', version: '0.1.0' },
    })
    return
  }
  if (message.method === 'tools/list') {
    respond(message.id, {
      tools: Object.entries(tools).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    })
    return
  }
  if (message.method === 'tools/call') {
    const name = message.params?.name
    const args = message.params?.arguments || {}
    const tool = tools[name]
    if (!tool) throw new Error(`Unknown tool: ${name}`)
    respond(message.id, toolResult(tool.run(args)))
    return
  }
  if (message.id !== undefined) respond(message.id, {})
}

const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  if (!line.trim()) return
  try {
    handle(JSON.parse(line))
  } catch (error) {
    respond(null, null, error)
  }
})
