import { Agent, Cursor } from '@cursor/sdk'
import type { SDKMessage } from '@cursor/sdk'
import type { ChatMessage, CursorModelOption, TokenUsage } from '../shared/types'
import { RELAY_SYSTEM_PROMPT } from './system-prompt'
import { getCursorApiKey, getCursorModel, saveCursorKeyMetadata } from './cursor-auth'

interface CursorEmitter {
  chunk: (text: string) => void
  done: (fullText: string, usage?: TokenUsage) => void
  error: (message: string) => void
}

function formatTranscript(messages: ChatMessage[]): string {
  return messages
    .filter(message => !message.streaming && !message.error)
    .map(message => `${message.role === 'user' ? 'User' : 'Assistant'}:\n${message.content}`)
    .join('\n\n---\n\n')
}

function buildPrompt(messages: ChatMessage[], systemContext: string): string {
  return [
    RELAY_SYSTEM_PROMPT,
    systemContext,
    'You are running as a local Cursor SDK agent inside Relay.',
    'Use the current repository as context. If the user asks for implementation, inspect and edit files directly when appropriate.',
    'When you run commands or make changes, summarize the important results clearly.',
    '',
    'Conversation transcript:',
    formatTranscript(messages),
  ].filter(Boolean).join('\n\n')
}

function textFromAssistantMessage(message: SDKMessage): string {
  if (message.type !== 'assistant') return ''
  return message.message.content
    .map(block => block.type === 'text' ? block.text : '')
    .filter(Boolean)
    .join('')
}

function describeTool(message: SDKMessage): string {
  if (message.type !== 'tool_call' || message.status !== 'running') return ''
  return `\n\n[Cursor: ${message.name}]\n`
}

export async function validateCursorKey(apiKey: string): Promise<{ userEmail?: string; apiKeyName?: string }> {
  const user = await Cursor.me({ apiKey })
  const metadata = { userEmail: user.userEmail, apiKeyName: user.apiKeyName }
  saveCursorKeyMetadata(metadata)
  return metadata
}

export async function listCursorModels(): Promise<{ models: CursorModelOption[]; error?: string }> {
  const apiKey = getCursorApiKey()
  if (!apiKey) return { models: [], error: 'No Cursor API key configured.' }

  try {
    const models = await Cursor.models.list({ apiKey })
    return {
      models: models.map(model => ({
        id: model.id,
        displayName: model.displayName,
        description: model.description,
      })),
    }
  } catch (error) {
    return {
      models: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function streamCursorAgentMessage(
  messages: ChatMessage[],
  cwd: string,
  emit: CursorEmitter,
  signal: AbortSignal,
  systemContext = '',
): Promise<void> {
  const apiKey = getCursorApiKey()
  if (!apiKey) {
    emit.error('No Cursor API key configured. Add a Cursor API key in settings.')
    return
  }

  let accumulated = ''
  let run: Awaited<ReturnType<Awaited<ReturnType<typeof Agent.create>>['send']>> | null = null
  const cursorModel = getCursorModel()
  const agent = await Agent.create({
    apiKey,
    ...(cursorModel === 'auto' ? {} : { model: { id: cursorModel } }),
    local: { cwd },
  })

  const cancel = () => {
    if (run?.supports('cancel')) void run.cancel().catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })

  try {
    run = await agent.send(buildPrompt(messages, systemContext))
    for await (const event of run.stream()) {
      if (signal.aborted) break

      const assistantText = textFromAssistantMessage(event)
      if (assistantText) {
        accumulated += assistantText
        emit.chunk(assistantText)
        continue
      }

      const toolText = describeTool(event)
      if (toolText) {
        accumulated += toolText
        emit.chunk(toolText)
        continue
      }

      if (event.type === 'task' && event.text) {
        const text = `\n\n${event.text}\n`
        accumulated += text
        emit.chunk(text)
      }
    }

    if (signal.aborted) {
      if (accumulated) emit.done(accumulated)
      return
    }

    const result = await run.wait()
    const finalText = accumulated || result.result || ''
    emit.done(finalText)
  } catch (error) {
    if (signal.aborted) {
      if (accumulated) emit.done(accumulated)
      return
    }
    emit.error(error instanceof Error ? error.message : String(error))
  } finally {
    signal.removeEventListener('abort', cancel)
    agent.close()
  }
}
