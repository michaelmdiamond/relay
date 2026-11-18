import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { getTasks } from './tasks'
import type { DispatchAgent, DispatchRecommendation } from '../shared/types'

const CHAT_CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')

function readAnthropicApiKey(): string | null {
  try {
    const config = JSON.parse(fs.readFileSync(CHAT_CONFIG_PATH, 'utf8')) as { apiKey?: string }
    return config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null
  } catch {
    return process.env.ANTHROPIC_API_KEY ?? null
  }
}

interface AgentOption {
  id: DispatchAgent
  label: string
  description: string
}

export interface DispatchContext {
  openAIConnected: boolean
  geminiConnected: boolean
  deepSeekConnected: boolean
  ollamaConfigured: boolean
  cursorConfigured: boolean
  ollamaModel?: string
}

function buildAgentOptions(ctx: DispatchContext): AgentOption[] {
  const agents: AgentOption[] = [
    {
      id: 'claude',
      label: 'Claude Code',
      description: 'complex refactors, multi-file changes, architectural decisions, and nuanced reasoning',
    },
  ]
  if (ctx.openAIConnected) {
    agents.push({
      id: 'codex',
      label: 'Codex CLI',
      description: 'focused code generation, boilerplate, and implementation tasks with clear specs',
    })
    agents.push({
      id: 'workflow',
      label: 'Codex → Gemini Workflow',
      description: 'well-defined specs that benefit from an automated implement-then-review loop',
    })
  }
  if (ctx.geminiConnected) {
    agents.push({
      id: 'gemini',
      label: 'Gemini CLI',
      description: 'code review, analysis, large codebase questions, and documentation',
    })
  }
  if (ctx.cursorConfigured) {
    agents.push({
      id: 'cursor',
      label: 'Cursor Agent',
      description: 'IDE-integrated tasks where file context and editor awareness matter',
    })
  }
  if (ctx.ollamaConfigured && ctx.ollamaModel) {
    agents.push({
      id: 'local',
      label: `Local (${ctx.ollamaModel})`,
      description: 'simple, private, or offline tasks that do not need cloud models',
    })
  }
  return agents
}

export async function getDispatchRecommendation(taskId: string, ctx: DispatchContext): Promise<DispatchRecommendation> {
  const task = getTasks().find((t) => t.id === taskId)
  if (!task) throw new Error('Task not found.')

  const apiKey = readAnthropicApiKey()
  if (!apiKey) throw new Error('Anthropic API key required to generate a dispatch recommendation.')

  const agents = buildAgentOptions(ctx)
  const agentList = agents.map((a) => `- ${a.id}: ${a.label} — ${a.description}`).join('\n')

  const prompt = [
    'You are a task dispatcher for a multi-agent coding environment.',
    'Given the task below, choose the best agent and write an optimized prompt for it.',
    '',
    `Task title: ${task.title}`,
    `Task brief: ${task.brief || '(none)'}`,
    '',
    'Available agents:',
    agentList,
    '',
    'Rules:',
    '- Pick exactly one agent id from the list above.',
    '- reason: one sentence, plain text, no markdown.',
    "- launchPrompt: the task brief rewritten for the chosen agent's strengths. Be specific and actionable.",
    '',
    'Respond with JSON only — no markdown, no code fences:',
    '{"agent":"<id>","reason":"<one sentence>","launchPrompt":"<prompt for the agent>"}',
  ].join('\n')

  const client = new Anthropic({ apiKey })
  const result = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = result.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { type: 'text'; text: string }).text)
    .join('')
    .trim()

  let parsed: { agent?: string; reason?: string; launchPrompt?: string }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw) as typeof parsed
  } catch {
    throw new Error('Dispatcher returned an unreadable response — try again.')
  }

  const validIds = agents.map((a) => a.id)
  const agent: DispatchAgent = validIds.includes(parsed.agent as DispatchAgent)
    ? (parsed.agent as DispatchAgent)
    : 'claude'
  const agentLabel = agents.find((a) => a.id === agent)?.label ?? agent

  return {
    taskId,
    agent,
    agentLabel,
    reason: parsed.reason?.trim() ?? '',
    launchPrompt: parsed.launchPrompt?.trim() || task.brief || task.title,
  }
}
