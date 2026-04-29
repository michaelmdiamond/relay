import { randomUUID } from 'crypto'
import { getValidAccessToken } from './openai-auth'
import type { ChatMessage } from '../shared/types'

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
    done: (fullText: string) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal
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

  // The last user message is passed as `input`; prior messages as context via `previous_response_id`
  // is not available here, so we use the full history as the input array.
  const body = JSON.stringify({
    model,
    instructions: 'You are a helpful assistant.',
    input: toResponsesInput(messages),
    stream: true,
    store: false,
  })

  let res: Response
  try {
    res = await fetch(`${CODEX_BASE}/responses`, {
      method: 'POST',
      headers,
      body,
      signal: signal ?? AbortSignal.timeout(120_000),
    })
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
          }

          if (event.type === 'response.output_text.delta' && event.delta) {
            accumulated += event.delta
            emit.chunk(event.delta)
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

  emit.done(accumulated)
}
