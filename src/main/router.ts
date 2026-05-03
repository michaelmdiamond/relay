import type { AnyModel, ChatMessage, GeminiModel, ModelChoice, Provider, RoutingDecision } from '../shared/types'

const MODEL_LABELS: Partial<Record<string, string>> = {
  'claude-haiku-4-5-20251001': 'Haiku',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-opus-4-7': 'Opus',
  'gpt-5.5': 'GPT-5.5',
  'gpt-5.4': 'GPT-5.4',
  'gpt-5.4-mini': 'GPT-5.4 Mini',
  'gpt-5.3-codex': 'Codex',
  'gpt-5.2': 'GPT-5.2',
  'gpt-5.1-codex': 'GPT-5.1 Codex',
  'gemini-2.5-pro': 'Gemini Pro',
  'gemini-2.5-flash': 'Gemini Flash',
  'gemini-2.5-flash-lite': 'Gemini Flash-Lite',
}

const MODEL_PROVIDER: Partial<Record<string, Provider>> = {
  'claude-haiku-4-5-20251001': 'anthropic',
  'claude-sonnet-4-6': 'anthropic',
  'claude-opus-4-7': 'anthropic',
  'gpt-5.5': 'openai',
  'gpt-5.4': 'openai',
  'gpt-5.4-mini': 'openai',
  'gpt-5.3-codex': 'openai',
  'gpt-5.2': 'openai',
  'gpt-5.1-codex': 'openai',
  'gemini-2.5-pro': 'google',
  'gemini-2.5-flash': 'google',
  'gemini-2.5-flash-lite': 'google',
}

const ANTHROPIC_FOR_CHOICE: Record<Exclude<ModelChoice, 'auto' | 'codex' | 'gemini' | 'ollama' | 'cursor'>, AnyModel> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-7',
}

const CODE_RE = /```|function |class |import |export |const |let |var |def |->|=>|\bSQL\b|\bAPI\b/
const COMPLEX_RE = /architect|refactor|design|tradeoff|compare|analyze|debug|optimize|implement|system|strategy/i

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function labelForModel(model: string): string {
  return MODEL_LABELS[model] ?? (model.includes('codex') ? 'Codex' : model)
}

function decide(model: string, reason: string, autoSelected: boolean, provider?: Provider): RoutingDecision {
  return {
    model,
    modelLabel: labelForModel(model),
    reason,
    autoSelected,
    provider: provider ?? MODEL_PROVIDER[model] ?? 'anthropic',
  }
}

function decideOllama(modelName: string, reason: string, autoSelected: boolean): RoutingDecision {
  return {
    model: modelName,
    modelLabel: `Local (${modelName})`,
    reason,
    autoSelected,
    provider: 'ollama',
  }
}

function decideCursor(model: string, reason: string, autoSelected: boolean): RoutingDecision {
  return {
    model,
    modelLabel: model === 'auto' ? 'Cursor Auto' : model === 'composer-2' ? 'Cursor Composer' : `Cursor ${model}`,
    reason,
    autoSelected,
    provider: 'cursor',
  }
}

export function route(
  messages: ChatMessage[],
  choice: ModelChoice,
  openAIConnected: boolean,
  geminiConnected: boolean,
  codexModel: string = 'gpt-5.5',
  geminiModel: GeminiModel = 'gemini-2.5-flash',
  ollamaConfigured: boolean = false,
  ollamaModel: string = '',
  cursorConfigured: boolean = false,
  cursorModel: string = 'auto'
): RoutingDecision {
  if (choice === 'cursor') {
    if (!cursorConfigured) {
      return decide('claude-sonnet-4-6', 'Cursor selected but not configured — using Sonnet', false)
    }
    return decideCursor(cursorModel, 'local Cursor SDK agent', false)
  }

  // Manual Ollama selection
  if (choice === 'ollama') {
    if (!ollamaConfigured) {
      return decide('claude-haiku-4-5-20251001', 'Ollama selected but not configured — using Haiku', false)
    }
    return decideOllama(ollamaModel, 'manually selected', false)
  }

  // Manual Codex selection
  if (choice === 'codex') {
    if (!openAIConnected) {
      return decide('claude-sonnet-4-6', 'Codex selected but OpenAI not connected — using Sonnet', false)
    }
    return decide(codexModel, 'manually selected', false, 'openai')
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
    const model = ANTHROPIC_FOR_CHOICE[choice as Exclude<ModelChoice, 'auto' | 'codex' | 'gemini' | 'ollama' | 'cursor'>]
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

  // Local model: prefer for short, non-complex queries to conserve cloud tokens.
  if (ollamaConfigured && ollamaModel && !hasCode && !isComplex && lastTokens < 500 && priorTokens < 2000) {
    return decideOllama(ollamaModel, 'simple query — using local model', true)
  }

  // When free providers are connected, prefer them over Anthropic credits.
  if (openAIConnected || geminiConnected) {
    if (priorTokens > 8000) {
      return decide('claude-opus-4-7', 'large context — using Opus', true)
    }
    if (hasCode && openAIConnected) {
      return decide(codexModel, 'code task', true, 'openai')
    }
    if (geminiConnected) {
      return decide(geminiModel, isComplex ? 'complex task' : 'default', true)
    }
    return decide(codexModel, hasCode ? 'code task' : 'default', true, 'openai')
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
