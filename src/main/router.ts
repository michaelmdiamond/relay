import type { AnyModel, ChatMessage, ModelChoice, Provider, RoutingDecision } from '../shared/types'

const MODEL_LABELS: Record<AnyModel, string> = {
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-opus-4-7': 'Opus',
  'gpt-5.3-codex': 'Codex',
}

const MODEL_PROVIDER: Record<AnyModel, Provider> = {
  'claude-haiku-4-5-20251001': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'gpt-5.3-codex': 'openai',
}

const ANTHROPIC_FOR_CHOICE: Record<Exclude<ModelChoice, 'auto' | 'codex'>, AnyModel> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
}

const CODE_RE = /```|function |class |import |export |const |let |var |def |->|=>|\bSQL\b|\bAPI\b/
const COMPLEX_RE = /architect|refactor|design|tradeoff|compare|analyze|debug|optimize|implement|system|strategy/i

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function decide(model: AnyModel, reason: string, autoSelected: boolean): RoutingDecision {
  return {
    model,
    modelLabel: MODEL_LABELS[model],
    reason,
    autoSelected,
    provider: MODEL_PROVIDER[model],
  }
}

export function route(
  messages: ChatMessage[],
  choice: ModelChoice,
  openAIConnected: boolean
): RoutingDecision {
  // Manual Codex selection
  if (choice === 'codex') {
    if (!openAIConnected) {
      // Fall back to Sonnet if user picks Codex but isn't connected
      return decide('claude-sonnet-4-6', 'Codex selected but OpenAI not connected — using Sonnet', false)
    }
    return decide('gpt-5.3-codex', 'manually selected', false)
  }

  // Other manual selections
  if (choice !== 'auto') {
    const model = ANTHROPIC_FOR_CHOICE[choice]
    return decide(model, 'manually selected', false)
  }

  // Auto routing
  const userMessages = messages.filter(m => m.role === 'user')
  const lastUser = userMessages.at(-1)?.content ?? ''
  // Only count prior context, not the current message, to avoid self-inflating the score
  const priorContext = messages.slice(0, -1).map(m => m.content).join('\n')
  const priorTokens = estimateTokens(priorContext)
  const lastTokens = estimateTokens(lastUser)
  const hasCode = CODE_RE.test(lastUser)
  const isComplex = COMPLEX_RE.test(lastUser)

  // When OpenAI is connected, prefer Codex for most tasks (free via subscription).
  // Fall back to Anthropic only when context is very large (Opus handles long context better).
  if (openAIConnected) {
    if (priorTokens > 8000) {
      return decide('claude-opus-4-7', 'large context — using Opus', true)
    }
    return decide('gpt-5.3-codex', hasCode ? 'code task' : isComplex ? 'complex task' : 'default', true)
  }

  // No OpenAI — route across Anthropic models by complexity
  if (priorTokens > 6000 || (hasCode && priorTokens > 3000)) {
    const reason = priorTokens > 6000 ? 'large context window' : 'complex code task with growing context'
    return decide('claude-opus-4-7', reason, true)
  }

  if (hasCode || isComplex || priorTokens > 2000 || lastTokens > 500) {
    const reason = hasCode ? 'code present' : isComplex ? 'complex reasoning task' : 'moderate length or context'
    return decide('claude-sonnet-4-6', reason, true)
  }

  const reason = lastTokens > 200 ? 'moderate message, no complexity signals' : 'short or conversational message'
  return decide('claude-haiku-4-5-20251001', reason, true)
}
