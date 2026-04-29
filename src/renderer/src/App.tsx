import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPane } from './components/ChatPane'
import { ApiKeySetup } from './components/ApiKeySetup'
import { useChatStore } from './store/chat'

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false)
  const { setConversations, setActiveId, prependConversation } = useChatStore()

  useEffect(() => {
    async function init() {
      const [anthropic, openai, gemini] = await Promise.all([
        window.api.getApiKeyStatus(),
        window.api.getOpenAIAuthStatus(),
        window.api.getGeminiKeyStatus(),
      ])
      if (!anthropic.configured && !openai.connected && !gemini.configured) {
        setNeedsSetup(true)
        return
      }
      await load()
    }
    init()
  }, [])

  async function load() {
    const convs = await window.api.getConversations()
    setConversations(convs)
    if (convs.length > 0) setActiveId(convs[0].id)
  }

  async function handleNew() {
    const conv = await window.api.newConversation()
    prependConversation(conv)
    setActiveId(conv.id)
  }

  if (needsSetup) {
    return (
      <ApiKeySetup onSaved={async () => { setNeedsSetup(false); await load() }} />
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#e2e8f0',
    }}>
      {/* Draggable title bar — sits above content, traffic lights overlap it */}
      <div style={{
        height: 40,
        flexShrink: 0,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar onNew={handleNew} />
        <ChatPane />
      </div>
    </div>
  )
}
