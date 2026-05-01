import type { ChatMessage, TokenUsage } from '../shared/types'
import { getOllamaConfig, DEFAULT_OLLAMA_URL } from './ollama-config'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'

export async function streamOllamaMessage(
  messages: ChatMessage[],
  emit: {
    chunk: (text: string) => void
    done: (fullText: string, usage?: TokenUsage) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal,
  systemContext?: string
): Promise<void> {
  const cfg = getOllamaConfig()
  if (!cfg) {
    emit.error('Ollama not configured')
    return
  }

  const baseUrl = (cfg.baseUrl || DEFAULT_OLLAMA_URL).replace('localhost', '127.0.0.1')
  const apiMessages = [
    { role: 'system', content: [RELAY_SYSTEM_PROMPT, systemContext].filter(Boolean).join('\n\n') },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  let res: Response
  try {
    res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model,
        messages: apiMessages,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: signal ?? AbortSignal.timeout(120_000),
    })
  } catch (err) {
    emit.error(`Cannot reach Ollama at ${baseUrl} — is it running? (${err instanceof Error ? err.message : String(err)})`)
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    emit.error(`Ollama error (${res.status}): ${text}`)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) {
    emit.error('No response body from Ollama')
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
            choices?: Array<{ delta?: { content?: string } }>
            usage?: {
              prompt_tokens?: number
              completion_tokens?: number
              total_tokens?: number
            }
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
          // Malformed SSE line — skip
        }
      }
    }
  } catch (err) {
    emit.error(`Stream read error: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  emit.done(accumulated, usage)
}
