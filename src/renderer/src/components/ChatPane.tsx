import { useEffect, useRef, useState } from 'react'
import { MessageBubble } from './MessageBubble'
import { InputBar } from './InputBar'
import { useChatStore } from '../store/chat'
import type { GeminiModel } from '../../../shared/types'

export function ChatPane() {
  const { conversations, activeId, modelChoice, sending, setModelChoice, setSending, appendChunk, finalizeMessage, appendError, addStreamingPlaceholder } = useChatStore()
  const [geminiModel, setGeminiModelState] = useState<GeminiModel>('gemini-2.5-flash')
  const conversation = conversations.find(c => c.id === activeId)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getGeminiModel().then(m => setGeminiModelState(m))
  }, [])

  async function handleGeminiModelChange(model: GeminiModel) {
    setGeminiModelState(model)
    await window.api.setGeminiModel(model)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversation?.messages.length, conversation?.messages.at(-1)?.content])

  useEffect(() => {
    const unsub0 = window.api.onStreamStart((convId, msgId, routing) => {
      useChatStore.getState().addStreamingPlaceholder(convId, msgId, routing)
    })
    const unsub1 = window.api.onChunk((convId, msgId, chunk) => {
      useChatStore.getState().appendChunk(convId, msgId, chunk)
    })
    const unsub2 = window.api.onMessageDone((convId, message) => {
      useChatStore.getState().finalizeMessage(convId, message)
      useChatStore.getState().setSending(false)
    })
    const unsub3 = window.api.onError((convId, msgId, error) => {
      useChatStore.getState().appendError(convId, msgId, error)
      useChatStore.getState().setSending(false)
    })
    return () => { unsub0(); unsub1(); unsub2(); unsub3() }
  }, [])

  async function handleSend(content: string) {
    if (!activeId || sending) return
    setSending(true)
    // Add user message optimistically — backend persists it, renderer store drives display.
    // The streaming placeholder arrives via onStreamStart once backend creates the assistant slot.
    useChatStore.getState().addMessage(activeId, {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    })
    window.api.sendMessage(activeId, content, modelChoice)
  }

  async function handleStop() {
    if (!activeId) return
    await window.api.cancelMessage(activeId)
    setSending(false)
  }

  if (!conversation) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.2)',
        fontSize: 14,
      }}>
        Select a conversation or start a new one
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 24px 8px',
      }}>
        {conversation.messages.length === 0 && (
          <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.2)',
            fontSize: 14,
          }}>
            Start the conversation
          </div>
        )}
        {conversation.messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      <InputBar
        modelChoice={modelChoice}
        onModelChange={setModelChoice}
        geminiModel={geminiModel}
        onGeminiModelChange={handleGeminiModelChange}
        onSend={handleSend}
        onStop={handleStop}
        disabled={sending}
        streaming={sending}
      />
    </div>
  )
}
