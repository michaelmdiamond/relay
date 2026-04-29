import { getGeminiApiKey, getGeminiModel } from './gemini-auth'
import type { ChatMessage, GeminiModel } from '../shared/types'

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
    done: (fullText: string) => void
    error: (msg: string) => void
  },
  signal?: AbortSignal,
  model?: GeminiModel
): Promise<void> {
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    emit.error('Gemini API key not configured')
    return
  }

  const resolvedModel = model ?? getGeminiModel()

  const requestBody = {
    contents: toGeminiContents(messages),
    systemInstruction: { parts: [{ text: 'You are a helpful assistant.' }] },
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
          }

          const text = event.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            accumulated += text
            emit.chunk(text)
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
