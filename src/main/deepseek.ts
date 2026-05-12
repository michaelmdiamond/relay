import { getDeepSeekApiKey, getDeepSeekModel } from './deepseek-auth'
import type { ChatMessage, DeepSeekModel, TokenUsage } from '../shared/types'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'

const BASE = 'https://api.deepseek.com'
const REQUEST_TIMEOUT_MS = 120_000

function toDeepSeekMessages(messages: ChatMessage[], systemContext?: string) {
  return [
    { role: 'system', content: [RELAY_SYSTEM_PROMPT, systemContext].filter(Boolean).join('\n\n') },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]
}

function timeoutSignal(signal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('DeepSeek request timed out')), REQUEST_TIMEOUT_MS)
  const abort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', abort, { once: true })

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    },
  }
}

export async function streamDeepSeekMessage(
  messages: ChatMessage[],
  emit: {
    chunk: (text: string) => void
    done: (fullText: string, usage?: TokenUsage) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal,
  model?: DeepSeekModel,
  systemContext?: string
): Promise<void> {
  const apiKey = getDeepSeekApiKey()
  if (!apiKey) {
    emit.error('DeepSeek API key not configured')
    return
  }

  const resolvedModel = model ?? getDeepSeekModel()
  const requestSignal = timeoutSignal(signal)

  let res: Response
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: toDeepSeekMessages(messages, systemContext),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: 8192,
        // Relay does not yet render DeepSeek reasoning_content separately, so keep
        // chat streaming on visible answer tokens instead of silent thinking deltas.
        thinking: { type: 'disabled' },
      }),
      signal: requestSignal.signal,
    })
  } catch (err) {
    const abortedByUser = signal?.aborted
    const message = abortedByUser
      ? 'DeepSeek request canceled'
      : err instanceof Error && err.name === 'AbortError'
        ? 'DeepSeek did not respond within 120 seconds.'
        : `DeepSeek network error: ${err instanceof Error ? err.message : String(err)}`
    emit.error(message)
    requestSignal.cleanup()
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    emit.error(`DeepSeek API error (${res.status}): ${text}`)
    requestSignal.cleanup()
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    emit.error('No response body from DeepSeek')
    requestSignal.cleanup()
    return
  }

  const decoder = new TextDecoder()
  let accumulated = ''
  let buffer = ''
  let usage: TokenUsage | undefined

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
            choices?: Array<{ delta?: { content?: string | null; reasoning_content?: string | null } }>
            usage?: {
              prompt_tokens?: number
              completion_tokens?: number
              total_tokens?: number
            } | null
          }
          const text = event.choices?.[0]?.delta?.content
          if (text) {
            accumulated += text
            emit.chunk(text)
          }

          if (event.usage) {
            const inputTokens = event.usage.prompt_tokens ?? 0
            const outputTokens = event.usage.completion_tokens ?? 0
            usage = {
              inputTokens,
              outputTokens,
              totalTokens: event.usage.total_tokens ?? (inputTokens + outputTokens),
            }
          }
        } catch {
          // Malformed SSE line - skip
        }
      }
    }
  } catch (err) {
    const abortedByUser = signal?.aborted
    const message = abortedByUser
      ? 'DeepSeek request canceled'
      : err instanceof Error && err.name === 'AbortError'
        ? 'DeepSeek stream stalled for too long.'
        : `Stream read error: ${err instanceof Error ? err.message : String(err)}`
    emit.error(message)
    requestSignal.cleanup()
    return
  }

  requestSignal.cleanup()
  if (!accumulated.trim()) {
    emit.error('DeepSeek finished without returning visible answer text.')
    return
  }

  emit.done(accumulated, usage)
}
