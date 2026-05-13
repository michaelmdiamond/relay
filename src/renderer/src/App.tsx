import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatPane } from './components/ChatPane'
import { TasksPane } from './components/TasksPane'
import { TerminalsPane } from './components/TerminalsPane'
import { WorkflowsPane } from './components/WorkflowsPane'
import { ApiKeySetup } from './components/ApiKeySetup'
import { useChatStore } from './store/chat'

type WorkspaceView = 'tasks' | 'chat' | 'workflows' | 'terminals'

const ACTIVE_WORKSPACE_STORAGE_KEY = 'relay.activeWorkspace'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'relay.sidebarCollapsed'
const DEFAULT_WORKSPACE: WorkspaceView = 'tasks'

function loadPersistedWorkspace(): WorkspaceView {
  const persisted = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  if (persisted === 'tasks' || persisted === 'chat' || persisted === 'workflows' || persisted === 'terminals') {
    return persisted
  }
  return DEFAULT_WORKSPACE
}

function loadSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="2.2" />
      <path d="M8 3v14" />
      {collapsed && <path d="m11 7 3 3-3 3" />}
    </svg>
  )
}

export default function App() {
  const [needsSetup, setNeedsSetup] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceView>(loadPersistedWorkspace)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const { setConversations, setActiveId, prependConversation } = useChatStore()

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspace)
  }, [activeWorkspace])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    const unsubscribe = window.api.onConversationsUpdated((conversations) => {
      const state = useChatStore.getState()
      const currentActiveId = state.activeId
      state.setConversations(conversations)
      if (!currentActiveId || !conversations.some((conversation) => conversation.id === currentActiveId)) {
        state.setActiveId(conversations[0]?.id ?? null)
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    async function init() {
      const [anthropic, openai, gemini, deepseek, cursor] = await Promise.all([
        window.api.getApiKeyStatus(),
        window.api.getOpenAIAuthStatus(),
        window.api.getGeminiKeyStatus(),
        window.api.getDeepSeekKeyStatus(),
        window.api.getCursorKeyStatus(),
      ])
      if (!anthropic.configured && !openai.connected && !gemini.configured && !deepseek.configured && !cursor.configured) {
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
    setActiveWorkspace('chat')
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
        <button
          type="button"
          className={`toolbar-icon-btn toolbar-sidebar-btn${sidebarCollapsed ? ' is-active' : ''}`}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          <SidebarToggleIcon collapsed={sidebarCollapsed} />
        </button>
        <div className="toolbar-left">
          <div className="toolbar-title">Relay</div>
          <span className="toolbar-view-label">
            {activeWorkspace === 'tasks' ? 'Tasks board' : activeWorkspace === 'chat' ? 'Archive detail' : activeWorkspace === 'workflows' ? 'Workflow runs' : 'Terminal sessions'}
          </span>
        </div>
        <div className="toolbar-center">
          <div className="seg-control seg-control--compact" aria-label="Workspace views" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspace === 'tasks'}
              className={`seg-btn${activeWorkspace === 'tasks' ? ' active' : ''}`}
              onClick={() => setActiveWorkspace('tasks')}
            >
              Board
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspace === 'workflows'}
              className={`seg-btn${activeWorkspace === 'workflows' ? ' active' : ''}`}
              onClick={() => setActiveWorkspace('workflows')}
            >
              Runs
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeWorkspace === 'terminals'}
              className={`seg-btn${activeWorkspace === 'terminals' ? ' active' : ''}`}
              onClick={() => setActiveWorkspace('terminals')}
            >
              Terminal
            </button>
          </div>
        </div>
        <div className="toolbar-right">
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
        {!sidebarCollapsed && (
          <Sidebar
            onNew={handleNew}
            onConversationSelect={() => setActiveWorkspace('chat')}
            onUtilitySelect={() => setActiveWorkspace('chat')}
          />
        )}
        <main className="workspace-panel">
          <div className="app-section" hidden={activeWorkspace !== 'tasks'}>
            <TasksPane />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'chat'}>
            <ChatPane onOpenTerminals={() => setActiveWorkspace('terminals')} />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'workflows'}>
            <WorkflowsPane />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'terminals'}>
            <TerminalsPane visible={activeWorkspace === 'terminals'} />
          </div>
        </main>
      </div>
    </div>
  )
}
