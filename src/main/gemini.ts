import { getGeminiApiKey, getGeminiModel } from './gemini-auth'
import type { ChatMessage, GeminiModel, TokenUsage } from '../shared/types'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'

const BASE = 'https://generativelanguage.googleapis.com'

function toGeminiContents(messages: ChatMessage[]): unknown[] {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
}

export async function streamGeminiMessage(
  messages: ChatMessage[],
  emit: {
    chunk: (text: string) => void
    done: (fullText: string, usage?: TokenUsage) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal,
  model?: GeminiModel,
  systemContext?: string
): Promise<void> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    emit.error('Gemini API key not configured')
    return
  }

  const resolvedModel = model ?? getGeminiModel()

  const requestBody = {
    contents: toGeminiContents(messages),
    systemInstruction: { parts: [{ text: [RELAY_SYSTEM_PROMPT, systemContext].filter(Boolean).join('\n\n') }] },
    generationConfig: { maxOutputTokens: 8192 },
  }

  let res: Response
  try {
    res = await fetch(
      `${BASE}/v1beta/models/${resolvedModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal,
      }
    )
  } catch (err) {
    emit.error(`Gemini network error: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    emit.error(`Gemini API error (${res.status}): ${text}`)
    return
  }

  const reader = res.body?.getReader()
  if (!reader) { emit.error('No response body'); return }

  const decoder = new TextDecoder()
  let buffer = ''
  let accumulated = ''
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
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> }
            }>
            usageMetadata?: {
              promptTokenCount?: number
              candidatesTokenCount?: number
              totalTokenCount?: number
              cachedContentTokenCount?: number
            }
          }

          const text = event.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            accumulated += text
            emit.chunk(text)
          }

          if (event.usageMetadata) {
            const inputTokens = event.usageMetadata.promptTokenCount ?? 0
            const outputTokens = event.usageMetadata.candidatesTokenCount ?? 0
            const totalTokens = event.usageMetadata.totalTokenCount ?? (inputTokens + outputTokens)
            const cachedInputTokens = event.usageMetadata.cachedContentTokenCount
            usage = {
              inputTokens,
              outputTokens,
              totalTokens,
              ...(cachedInputTokens ? { cachedInputTokens } : {}),
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
