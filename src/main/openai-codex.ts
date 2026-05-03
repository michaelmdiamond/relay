import { randomUUID } from 'crypto'
import { getValidAccessToken } from './openai-auth'
import type { ChatMessage, TokenUsage } from '../shared/types'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'

const CODEX_BASE = 'https://chatgpt.com/backend-api/codex'

// Preferred models in priority order — first one your account supports wins
const MODEL_PREFERENCE = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex',
  'gpt-5.2',
  'gpt-5.1-codex',
]

let cachedModel: string | null = null

export function resetModelCache(): void {
  cachedModel = null
}

async function resolveModel(accessToken: string, accountId?: string): Promise<string> {
  if (cachedModel) return cachedModel

  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'originator': 'relay',
    }
    if (accountId) headers['ChatGPT-Account-Id'] = accountId

    const res = await fetch(`${CODEX_BASE}/models?client_version=1.0.0`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    })

    if (res.ok) {
      const json = await res.json() as { models?: Array<{ slug: string; supported_in_api?: boolean; visibility?: string }> }
      const available = new Set(
        (json.models ?? [])
          .filter(m => m.visibility !== 'hidden')
          .map(m => m.slug)
      )
      const match = MODEL_PREFERENCE.find(m => available.has(m))
      if (match) {
        cachedModel = match
        return match
      }
      // Fall back to first available model
      const first = json.models?.[0]?.slug
      if (first) {
        cachedModel = first
        return first
      }
    }
  } catch {
    // ignore, fall through to hard fallback
  }
  return MODEL_PREFERENCE[0]
}

// Converts our internal message history to the Responses API input format
function toResponsesInput(messages: ChatMessage[]): unknown[] {
  return messages.map(m => ({
    type: 'message',
    role: m.role,
    content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: m.content }],
  }))
}

export async function streamCodexMessage(
  messages: ChatMessage[],
  emit: {
    chunk: (text: string) => void
    done: (fullText: string, usage?: TokenUsage, responseId?: string) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal,
  systemContext?: string
): Promise<void> {
  let auth: { accessToken: string; accountId?: string }

  try {
    auth = await getValidAccessToken()
  } catch (err) {
    emit.error(err instanceof Error ? err.message : String(err))
    return
  }

  const model = await resolveModel(auth.accessToken, auth.accountId)
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

  const lastMessage = messages.at(-1)
  const previousMessage = [...messages]
    .slice(0, -1)
    .reverse()
    .find(message => message.role === 'assistant')
  const previousResponseId =
    lastMessage?.role === 'user' &&
    previousMessage?.role === 'assistant'
      ? previousMessage.openAIResponseId
      : undefined

  const baseBody = {
    model,
    instructions: [RELAY_SYSTEM_PROMPT, systemContext].filter(Boolean).join('\n\n'),
    stream: true,
    store: true,
  }

  const buildBody = (usePreviousResponse: boolean): string => JSON.stringify(usePreviousResponse && previousResponseId
    ? {
      ...baseBody,
      previous_response_id: previousResponseId,
      input: toResponsesInput([lastMessage!]),
    }
    : {
      ...baseBody,
      input: toResponsesInput(messages),
    }
  )

  let res: Response
  try {
    res = await fetch(`${CODEX_BASE}/responses`, {
      method: 'POST',
      headers,
      body: buildBody(Boolean(previousResponseId)),
      signal: signal ?? AbortSignal.timeout(120_000),
    })
    if (!res.ok && previousResponseId && (res.status === 400 || res.status === 404)) {
      res = await fetch(`${CODEX_BASE}/responses`, {
        method: 'POST',
        headers,
        body: buildBody(false),
        signal: signal ?? AbortSignal.timeout(120_000),
      })
    }
  } catch (err) {
    emit.error(`Network error: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    emit.error(`Codex API error (${res.status}): ${text}`)
    return
  }

  // Parse SSE stream
  const reader = res.body?.getReader()
  if (!reader) {
    emit.error('No response body from Codex API')
    return
  }

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''
  let usage: TokenUsage | undefined
  let responseId: string | undefined

  try {
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
          const event = JSON.parse(data) as {
            type?: string
            delta?: string
            response_id?: string
            item?: {
              id?: string
            }
            response?: {
              id?: string
              usage?: {
                input_tokens?: number
                output_tokens?: number
                total_tokens?: number
                input_tokens_details?: {
                  cached_tokens?: number
                }
              }
            }
          }

          if (event.response?.id) responseId = event.response.id
          if (event.response_id) responseId = event.response_id

          if (event.type === 'response.output_text.delta' && event.delta) {
            accumulated += event.delta
            emit.chunk(event.delta)
          }

          if (event.type === 'response.completed' && event.response?.usage) {
            const inputTokens = event.response.usage.input_tokens ?? 0
            const outputTokens = event.response.usage.output_tokens ?? 0
            const cachedInputTokens = event.response.usage.input_tokens_details?.cached_tokens
            usage = {
              inputTokens,
              outputTokens,
              totalTokens: event.response.usage.total_tokens ?? (inputTokens + outputTokens),
              ...(cachedInputTokens ? {
                cachedInputTokens,
                effectiveInputTokens: Math.max(0, inputTokens - cachedInputTokens),
              } : {}),
            }
          }
        } catch {
          // Malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    emit.error(`Stream read error: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  emit.done(accumulated, usage, responseId)
}
