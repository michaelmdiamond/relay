import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPane } from './components/ChatPane'
import { TerminalsPane } from './components/TerminalsPane'
import { WorkflowsPane } from './components/WorkflowsPane'
import { ApiKeySetup } from './components/ApiKeySetup'
import { useChatStore } from './store/chat'

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeTab, setActiveTab] = useState<'chats' | 'workflows' | 'terminals'>('chats')
  const { setConversations, setActiveId, prependConversation } = useChatStore()

  useEffect(() => {
    async function init() {
      const [anthropic, openai, gemini, cursor] = await Promise.all([
        window.api.getApiKeyStatus(),
        window.api.getOpenAIAuthStatus(),
        window.api.getGeminiKeyStatus(),
        window.api.getCursorKeyStatus(),
      ])
      if (!anthropic.configured && !openai.connected && !gemini.configured && !cursor.configured) {
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
    <div className="app-shell">
      <div className="toolbar">
        <div className="toolbar-drag" />
        <div className="toolbar-center">
          <div className="seg-control" aria-label="App sections" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'chats'}
              className={`seg-btn${activeTab === 'chats' ? ' active' : ''}`}
              onClick={() => setActiveTab('chats')}
            >
              Chats
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'workflows'}
              className={`seg-btn${activeTab === 'workflows' ? ' active' : ''}`}
              onClick={() => setActiveTab('workflows')}
            >
              Workflows
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'terminals'}
              className={`seg-btn${activeTab === 'terminals' ? ' active' : ''}`}
              onClick={() => setActiveTab('terminals')}
            >
              Terminal Sessions
            </button>
          </div>
        </div>
        <div className="toolbar-right">
          <span className="toolbar-view-label">
            {activeTab === 'chats' ? 'Chat mode' : activeTab === 'workflows' ? 'Orchestration mode' : 'Terminal mode'}
          </span>
          <button
            type="button"
            className="toolbar-reload-btn"
            title="Reload app"
            onClick={() => location.reload()}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="app-body">
        <div className="app-section" hidden={activeTab !== 'chats'}>
          <Sidebar onNew={handleNew} />
          <ChatPane />
        </div>
        <div className="app-section" hidden={activeTab !== 'workflows'}>
          <WorkflowsPane />
        </div>
        <div className="app-section" hidden={activeTab !== 'terminals'}>
          <TerminalsPane />
        </div>
      </div>
    </div>
  )
}
