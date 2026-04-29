import type { AnyModel, ChatMessage, GeminiModel, ModelChoice, Provider, RoutingDecision } from '../shared/types'

const MODEL_LABELS: Record<AnyModel, string> = {
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-opus-4-7': 'Opus',
  'gpt-5.3-codex': 'Codex',
  'gemini-2.5-pro': 'Gemini Pro',
  'gemini-2.0-flash': 'Gemini Flash',
  'gemini-2.0-flash-lite': 'Gemini Flash-Lite',
}

const MODEL_PROVIDER: Record<AnyModel, Provider> = {
  'claude-haiku-4-5-20251001': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'gpt-5.3-codex': 'openai',
  'gemini-2.5-pro': 'google',
  'gemini-2.0-flash': 'google',
  'gemini-2.0-flash-lite': 'google',
}

const ANTHROPIC_FOR_CHOICE: Record<Exclude<ModelChoice, 'auto' | 'codex' | 'gemini'>, AnyModel> = {
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
  openAIConnected: boolean,
  geminiConnected: boolean,
  geminiModel: GeminiModel = 'gemini-2.0-flash'
): RoutingDecision {
  // Manual Codex selection
  if (choice === 'codex') {
    if (!openAIConnected) {
      return decide('claude-sonnet-4-6', 'Codex selected but OpenAI not connected — using Sonnet', false)
    }
    return decide('gpt-5.3-codex', 'manually selected', false)
  }

  // Manual Gemini selection
  if (choice === 'gemini') {
    if (!geminiConnected) {
      return decide('claude-sonnet-4-6', 'Gemini selected but not connected — using Sonnet', false)
    }
    return decide(geminiModel, 'manually selected', false)
  }

  // Other manual selections
  if (choice !== 'auto') {
    const model = ANTHROPIC_FOR_CHOICE[choice as Exclude<ModelChoice, 'auto' | 'codex' | 'gemini'>]
    return decide(model, 'manually selected', false)
  }

  // Auto routing
  const userMessages = messages.filter(m => m.role === 'user')
  const lastUser = userMessages.at(-1)?.content ?? ''
  const priorContext = messages.slice(0, -1).map(m => m.content).join('\n')
  const priorTokens = estimateTokens(priorContext)
  const lastTokens = estimateTokens(lastUser)
  const hasCode = CODE_RE.test(lastUser)
  const isComplex = COMPLEX_RE.test(lastUser)

  // When free providers are connected, prefer them over Anthropic credits.
  if (openAIConnected || geminiConnected) {
    if (priorTokens > 8000) {
      return decide('claude-opus-4-7', 'large context — using Opus', true)
    }
    if (hasCode && openAIConnected) {
      return decide('gpt-5.3-codex', 'code task', true)
    }
    if (geminiConnected) {
      return decide(geminiModel, isComplex ? 'complex task' : 'default', true)
    }
    return decide('gpt-5.3-codex', hasCode ? 'code task' : 'default', true)
  }

  // No free providers — route across Anthropic models by complexity
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
