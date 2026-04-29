import Anthropic from '@anthropic-ai/sdk'
import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { ChatMessage, Conversation, ModelChoice } from '../shared/types'
import { route } from './router'
import { isOpenAIConnected } from './openai-auth'
import { streamCodexMessage } from './openai-codex'
import { isGeminiConnected, getGeminiModel } from './gemini-auth'
import { streamGeminiMessage } from './gemini'

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json')
const STORE_PATH = path.join(app.getPath('userData'), 'conversations.json')

function readConfig(): { apiKey?: string } {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} }
}

function writeConfig(cfg: { apiKey?: string }): void {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function readStore(): Conversation[] {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) } catch { return [] }
}

function writeStore(convs: Conversation[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(convs, null, 2))
}

function getAnthropicClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY ?? readConfig().apiKey
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

export function isApiKeyConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY ?? readConfig().apiKey)
}

export function saveApiKey(key: string): void {
  writeConfig({ ...readConfig(), apiKey: key })
}

export function getConversations(): Conversation[] {
  return readStore()
}

export function newConversation(): Conversation {
  const conv: Conversation = {
    id: randomUUID(),
    title: 'New conversation',
    messages: [],
    createdAt: new Date().toISOString(),
  }
  const store = readStore()
  store.unshift(conv)
  writeStore(store)
  return conv
}

export function deleteConversation(id: string): void {
  writeStore(readStore().filter(c => c.id !== id))
}

function updateConversation(id: string, updater: (c: Conversation) => Conversation): Conversation | null {
  const store = readStore()
  const idx = store.findIndex(c => c.id === id)
  if (idx === -1) return null
  store[idx] = updater(store[idx])
  writeStore(store)
  return store[idx]
}

function deriveTitle(content: string): string {
  const first = content.trim().split('\n')[0]
  return first.length > 60 ? first.slice(0, 57) + '…' : first
}

export async function sendMessage(
  conversationId: string,
  content: string,
  modelChoice: ModelChoice,
  signal: AbortSignal,
  emit: {
    streamStart: (convId: string, msgId: string, routing: ChatMessage['routing']) => void
    chunk: (convId: string, msgId: string, chunk: string) => void
    done: (convId: string, message: ChatMessage) => void
    error: (convId: string, msgId: string, error: string) => void
  }
): Promise<void> {
  // Add user message
  const userMsg: ChatMessage = { id: randomUUID(), role: 'user', content }
  let conv = updateConversation(conversationId, c => ({
    ...c,
    title: c.messages.length === 0 ? deriveTitle(content) : c.title,
    messages: [...c.messages, userMsg],
  }))
  if (!conv) return

  // Route — pass connection state for all free providers
  const { connected: openAIConnected } = isOpenAIConnected()
  const { configured: geminiConnected } = isGeminiConnected()
  const geminiModel = getGeminiModel()
  const routing = route(conv.messages, modelChoice, openAIConnected, geminiConnected, geminiModel)

  // If routing to Anthropic but no key configured, bail early with a clear message
  if (routing.provider === 'anthropic' && !isApiKeyConfigured()) {
    const errId = randomUUID()
    emit.error(conversationId, errId, 'No Anthropic API key configured. Add your key in settings.')
    return
  }

  // Placeholder assistant message
  const assistantId = randomUUID()
  const placeholder: ChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    routing,
    streaming: true,
  }
  conv = updateConversation(conversationId, c => ({ ...c, messages: [...c.messages, placeholder] }))!

  // Tell the renderer to create the streaming placeholder immediately
  emit.streamStart(conversationId, assistantId, routing)

  // Build message history excluding the empty placeholder
  const historyMessages = conv.messages.filter(m => m.id !== assistantId)

  if (routing.provider === 'openai' || routing.provider === 'google') {
    const streamFn = routing.provider === 'google'
      ? (msgs: typeof historyMessages, e: Parameters<typeof streamGeminiMessage>[1], sig?: AbortSignal) =>
          streamGeminiMessage(msgs, e, sig, routing.model as import('../shared/types').GeminiModel)
      : streamCodexMessage
    await streamFn(historyMessages, {
      chunk: (text) => {
        if (signal.aborted) return
        emit.chunk(conversationId, assistantId, text)
      },
      done: (fullText) => {
        const finalMsg: ChatMessage = {
          id: assistantId,
          role: 'assistant',
          content: fullText,
          routing,
          streaming: false,
        }
        updateConversation(conversationId, c => ({
          ...c,
          messages: c.messages.map(m => m.id === assistantId ? finalMsg : m),
        }))
        emit.done(conversationId, finalMsg)
      },
      error: (msg) => {
        if (signal.aborted) return
        updateConversation(conversationId, c => ({
          ...c,
          messages: c.messages.filter(m => m.id !== assistantId),
        }))
        emit.error(conversationId, assistantId, msg)
      },
    }, signal)
    return
  }

  // Anthropic path
  const client = getAnthropicClient()!
  const apiMessages = historyMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    const stream = client.messages.stream({
      model: routing.model as import('../shared/types').AnthropicModel,
      max_tokens: 4096,
      messages: apiMessages,
    }, { signal })

    let accumulated = ''

    stream.on('text', (text) => {
      if (signal.aborted) return
      accumulated += text
      emit.chunk(conversationId, assistantId, text)
    })

    await stream.finalMessage()

    const finalMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: accumulated,
      routing,
      streaming: false,
    }

    updateConversation(conversationId, c => ({
      ...c,
      messages: c.messages.map(m => m.id === assistantId ? finalMsg : m),
    }))

    emit.done(conversationId, finalMsg)
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'AbortError') return
    const msg = err instanceof Error ? err.message : String(err)
    updateConversation(conversationId, c => ({
      ...c,
      messages: c.messages.filter(m => m.id !== assistantId),
    }))
    emit.error(conversationId, assistantId, msg)
  }
}
