import { useEffect, useMemo, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { IconRail } from './components/IconRail'
import { ChatPane } from './components/ChatPane'
import { TasksPane } from './components/TasksPane'
import { TerminalsPane } from './components/TerminalsPane'
import { WorkflowsPane } from './components/WorkflowsPane'
import { AutomationsPane } from './components/AutomationsPane'
import { ExperimentsPane } from './components/ExperimentsPane'
import { ApiKeySetup } from './components/ApiKeySetup'
import { useChatStore } from './store/chat'
import type { Workspace } from '../../shared/types'

type WorkspaceView = 'tasks' | 'chat' | 'experiments' | 'automations' | 'workflows' | 'terminals'

const ACTIVE_WORKSPACE_STORAGE_KEY = 'relay.activeWorkspace'
const ACTIVE_WORKSPACE_CONTEXT_STORAGE_KEY = 'relay.activeWorkspaceContext'
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'relay.sidebarCollapsed'
const DEFAULT_WORKSPACE: WorkspaceView = 'tasks'

function loadPersistedWorkspace(): WorkspaceView {
  const persisted = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY)
  if (persisted === 'tasks' || persisted === 'chat' || persisted === 'experiments' || persisted === 'automations' || persisted === 'workflows' || persisted === 'terminals') {
    return persisted
  }
  return DEFAULT_WORKSPACE
}

function loadSidebarCollapsed(): boolean {
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

function loadActiveWorkspaceContext(): string | null {
  return window.localStorage.getItem(ACTIVE_WORKSPACE_CONTEXT_STORAGE_KEY)
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
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(loadActiveWorkspaceContext)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const { conversations, setConversations, setActiveId, prependConversation, activePane, setActivePane } = useChatStore()
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null
  const repoWorkspacePaths = useMemo(() => workspaces
    .filter((workspace) => workspace.kind === 'repo' && workspace.projectPath)
    .map((workspace) => workspace.projectPath!), [workspaces])

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspace)
  }, [activeWorkspace])

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed))
  }, [sidebarCollapsed])

  useEffect(() => {
    if (activeWorkspaceId) window.localStorage.setItem(ACTIVE_WORKSPACE_CONTEXT_STORAGE_KEY, activeWorkspaceId)
    else window.localStorage.removeItem(ACTIVE_WORKSPACE_CONTEXT_STORAGE_KEY)
  }, [activeWorkspaceId])

  useEffect(() => {
    if (!activeWorkspaceId) return
    if (workspaces.some((workspace) => workspace.id === activeWorkspaceId)) return
    setActiveWorkspaceId(null)
  }, [activeWorkspaceId, workspaces])

  useEffect(() => {
    if (!activeWorkspaceId) return
    const visibleConversations = conversations.filter((conversation) => (
      conversation.status !== 'archived' && (
        conversation.workspaceId === activeWorkspaceId ||
        (
          selectedWorkspace?.kind === 'repo' &&
          !!selectedWorkspace.projectPath &&
          !!conversation.projectPath &&
          (conversation.projectPath === selectedWorkspace.projectPath || conversation.projectPath.startsWith(`${selectedWorkspace.projectPath}/`))
        ) ||
        (
          selectedWorkspace?.kind === 'general' &&
          (!conversation.projectPath || !repoWorkspacePaths.some((repoPath) => (
            conversation.projectPath === repoPath || conversation.projectPath.startsWith(`${repoPath}/`)
          )))
        )
      )
    ))
    const currentActiveId = useChatStore.getState().activeId
    if (currentActiveId) return
    setActiveId(visibleConversations[0]?.id ?? null)
  }, [activeWorkspaceId, conversations, repoWorkspacePaths, selectedWorkspace?.kind, selectedWorkspace?.projectPath, setActiveId])

  useEffect(() => {
    const unsubscribe = window.api.onConversationsUpdated((conversations) => {
      const state = useChatStore.getState()
      const currentActiveId = state.activeId
      state.setConversations(conversations)
      if (!currentActiveId || !conversations.some((conversation) => conversation.id === currentActiveId)) {
        state.setActiveId(conversations.find((conversation) => conversation.status !== 'archived')?.id ?? conversations[0]?.id ?? null)
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onCodexThreadFocusRequested(async (conversationId) => {
      const currentState = useChatStore.getState()
      let conversations = currentState.conversations
      if (!conversations.some((conversation) => conversation.id === conversationId)) {
        conversations = await window.api.getConversations()
        currentState.setConversations(conversations)
      }
      if (!conversations.some((conversation) => conversation.id === conversationId)) return
      currentState.setActiveId(conversationId)
      setActiveWorkspace('chat')
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
    const [convs, nextWorkspaces] = await Promise.all([
      window.api.getConversations(),
      window.api.getWorkspaces(),
    ])
    setConversations(convs)
    setWorkspaces(nextWorkspaces)
    if (convs.length > 0) setActiveId(convs.find((conversation) => conversation.status !== 'archived')?.id ?? convs[0].id)
  }

  async function handleNew() {
    const conv = await window.api.newConversation(activeWorkspaceId ?? undefined)
    prependConversation(conv)
    setActiveId(conv.id)
    setActiveWorkspace('chat')
  }

  async function handleRestart() {
    if (!window.confirm('Restart Relay and reload the main process?')) return
    await window.api.restartApp()
  }

  async function handleOpenWorkspaceFolder() {
    const projectPath = await window.terminalApi.selectDirectory()
    if (!projectPath) return
    const nextWorkspaces = await window.api.addWorkspaceForPath(projectPath)
    setWorkspaces(nextWorkspaces)
    const selected = nextWorkspaces.find((workspace) => workspace.projectPath === projectPath)
      ?? nextWorkspaces.find((workspace) => workspace.projectPath && projectPath.startsWith(`${workspace.projectPath}/`))
    if (selected) setActiveWorkspaceId(selected.id)
  }

  if (needsSetup) {
    return (
      <ApiKeySetup onSaved={async () => { setNeedsSetup(false); await load() }} />
    )
  }

  const connectionsActive = activeWorkspace === 'chat' && activePane === 'connections'
  const usageActive = activeWorkspace === 'chat' && activePane === 'usage'

  function handleConnections() {
    setActivePane('connections')
    setActiveWorkspace('chat')
  }

  function handleUsage() {
    setActivePane('usage')
    setActiveWorkspace('chat')
  }

  const showSidebar = activeWorkspace === 'chat' && !sidebarCollapsed

  return (
    <div className="app-shell">
      <div className="toolbar">
        <div className="toolbar-drag" />
        <div className="toolbar-left">
          <div className="toolbar-title">Relay</div>
        </div>
        {activeWorkspace === 'chat' && (
          <button
            type="button"
            className={`toolbar-icon-btn toolbar-sidebar-btn${sidebarCollapsed ? ' is-active' : ''}`}
            title={sidebarCollapsed ? 'Show conversations' : 'Hide conversations'}
            aria-label={sidebarCollapsed ? 'Show conversations' : 'Hide conversations'}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <SidebarToggleIcon collapsed={sidebarCollapsed} />
          </button>
        )}
        <div className="toolbar-right">
          <button
            type="button"
            className="toolbar-reload-btn"
            title="Restart Relay"
            aria-label="Restart Relay"
            onClick={() => void handleRestart()}
          >
            ↺
          </button>
        </div>
      </div>

      <div className="app-body">
        <IconRail
          active={activeWorkspace}
          onChange={(view) => {
            setActivePane('conversation')
            setActiveWorkspace(view)
          }}
          onConnections={handleConnections}
          onUsage={handleUsage}
          connectionsActive={connectionsActive}
          usageActive={usageActive}
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
          onWorkspaceChange={setActiveWorkspaceId}
          onOpenWorkspaceFolder={handleOpenWorkspaceFolder}
        />
        {showSidebar && (
          <Sidebar
            onNew={handleNew}
            onConversationSelect={() => setActiveWorkspace('chat')}
            workspaceId={activeWorkspaceId}
            workspaceKind={selectedWorkspace?.kind}
            workspaceProjectPath={selectedWorkspace?.projectPath}
            repoWorkspacePaths={repoWorkspacePaths}
          />
        )}
        <main className="workspace-panel">
          <div className="app-section" hidden={activeWorkspace !== 'tasks'}>
            <TasksPane
              workspaceId={activeWorkspaceId}
              workspaceKind={selectedWorkspace?.kind}
              workspaceProjectPath={selectedWorkspace?.projectPath}
              repoWorkspacePaths={repoWorkspacePaths}
            />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'chat'}>
            <ChatPane
              visible={activeWorkspace === 'chat'}
              onOpenTerminals={() => setActiveWorkspace('terminals')}
            />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'workflows'}>
            <WorkflowsPane workspaceId={activeWorkspaceId} workspaceKind={selectedWorkspace?.kind} />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'experiments'}>
            <ExperimentsPane
              workspaceId={activeWorkspaceId}
              workspaceName={selectedWorkspace?.name}
              workspaceKind={selectedWorkspace?.kind}
              workspaceProjectPath={selectedWorkspace?.projectPath}
              repoWorkspacePaths={repoWorkspacePaths}
            />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'automations'}>
            <AutomationsPane workspaceId={activeWorkspaceId} workspaces={workspaces} onWorkspacesChange={setWorkspaces} />
          </div>
          <div className="app-section" hidden={activeWorkspace !== 'terminals'}>
            <TerminalsPane
              visible={activeWorkspace === 'terminals'}
              workspaceId={activeWorkspaceId}
              workspaceKind={selectedWorkspace?.kind}
              workspaceProjectPath={selectedWorkspace?.projectPath}
              repoWorkspacePaths={repoWorkspacePaths}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
