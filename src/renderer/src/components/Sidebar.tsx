import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ConnectorInventory,
  Conversation,
} from '../../../shared/types'
import { useChatStore } from '../store/chat'

interface Props {
  onNew: () => void
  onConversationSelect?: () => void
  onUtilitySelect?: () => void
}

interface ProjectGroup {
  name: string
  path?: string
  conversations: Conversation[]
}

const PROJECT_CONVERSATION_PREVIEW_LIMIT = 5

function projectKey(project: ProjectGroup): string {
  return project.path ?? project.name
}

function formatRelativeTime(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''

  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000))
  if (diffMinutes < 60) return `${diffMinutes}m`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`

  const diffWeeks = Math.floor(diffDays / 7)
  return `${diffWeeks}w`
}

function PencilSquareIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M13.9 3.7a1.8 1.8 0 0 1 2.4 2.7l-8.6 7.8-3.4.7.9-3.3 8.7-7.9Z" />
      <path d="M11.8 5.5 14.5 8" />
      <path d="M9.2 3.8H6.4c-1.7 0-2.6 0-3.2.5-.6.6-.6 1.5-.6 3.2v6.1c0 1.7 0 2.6.6 3.2.6.6 1.5.6 3.2.6h6.1c1.7 0 2.6 0 3.2-.6.5-.6.5-1.5.5-3.2v-2.8" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="m12.5 12.5 4 4" />
    </svg>
  )
}

function PlugIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="5" height="5" rx="1.2" />
      <rect x="12" y="3" width="5" height="5" rx="1.2" />
      <rect x="3" y="12" width="5" height="5" rx="1.2" />
      <rect x="12" y="12" width="5" height="5" rx="1.2" />
      <path d="M8 5.5h4M5.5 8v4M14.5 8v4M8 14.5h4" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" />
      <path d="M10 6v4.2l2.8 1.8" />
    </svg>
  )
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 15.5h13" />
      <path d="M6 13V9" />
      <path d="M10 13V5.5" />
      <path d="M14 13v-3" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 6.2c0-1.4 1.1-2.5 2.5-2.5H7l1.4 1.6h6.5c1.7 0 2.6 0 3.2.5.6.6.6 1.5.6 3.2v3.8c0 1.7 0 2.6-.6 3.2-.6.6-1.5.6-3.2.6H5c-1.7 0-2.6 0-3.2-.6-.6-.6-.6-1.5-.6-3.2V6.2Z" />
    </svg>
  )
}

function countConnectorItems(inventory: ConnectorInventory | null): number {
  if (!inventory) return 0
  return inventory.providers.reduce((count, provider) => count + provider.items.length, 0)
}

export function Sidebar({ onNew, onConversationSelect, onUtilitySelect }: Props) {
  const { conversations, activeId, activePane, setActiveId, setActivePane, removeConversation } = useChatStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [expandedProjectHistory, setExpandedProjectHistory] = useState<Record<string, boolean>>({})
  const [connectorInventory, setConnectorInventory] = useState<ConnectorInventory | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.api.getConnectorInventory().then(setConnectorInventory)
  }, [])

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return conversations
    return conversations.filter((conv) => {
      const haystack = [
        conv.title,
        conv.projectName,
        conv.projectPath,
        conv.messages.at(-1)?.content,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [conversations, searchTerm])

  const grouped = useMemo(() => {
    const projectMap = new Map<string, ProjectGroup>()
    const unassigned: Conversation[] = []

    filteredConversations.forEach((conv) => {
      if (!conv.projectName) {
        unassigned.push(conv)
        return
      }
      const key = conv.projectPath ?? conv.projectName
      const existing = projectMap.get(key)
      if (existing) {
        existing.conversations.push(conv)
        return
      }
      projectMap.set(key, {
        name: conv.projectName,
        path: conv.projectPath,
        conversations: [conv],
      })
    })

    const projects = Array.from(projectMap.values()).map((project) => ({
      ...project,
      conversations: [...project.conversations].sort((a, b) => {
        const aTime = a.updatedAt ?? a.createdAt
        const bTime = b.updatedAt ?? b.createdAt
        return bTime.localeCompare(aTime)
      }),
    })).sort((a, b) => {
      const aNewest = a.conversations[0]?.updatedAt ?? a.conversations[0]?.createdAt ?? ''
      const bNewest = b.conversations[0]?.updatedAt ?? b.conversations[0]?.createdAt ?? ''
      return bNewest.localeCompare(aNewest)
    })

    return { projects, unassigned }
  }, [filteredConversations])

  async function handleDelete(event: React.MouseEvent, id: string) {
    event.stopPropagation()
    await window.api.deleteConversation(id)
    removeConversation(id)
  }

  function handleToggleProject(project: ProjectGroup) {
    const key = projectKey(project)
    setCollapsedProjects((current) => ({
      ...current,
      [key]: !current[key],
    }))
  }

  function handleShowMoreProject(project: ProjectGroup) {
    const key = projectKey(project)
    setExpandedProjectHistory((current) => ({
      ...current,
      [key]: true,
    }))
  }

  function handleSelectConversation(id: string) {
    setActiveId(id)
    onConversationSelect?.()
  }

  function handleSelectUtility(pane: 'usage' | 'connections') {
    setActivePane(pane)
    onUtilitySelect?.()
  }

  return (
    <aside className="relay-sidebar">
      <div className="relay-sidebar__top">
        <button type="button" className="relay-nav-action relay-nav-action--primary" onClick={onNew}>
          <span className="relay-nav-action__icon"><PencilSquareIcon /></span>
          <span className="relay-nav-action__label">New chat</span>
        </button>

        <div className="relay-search-shell">
          <SearchIcon />
          <input
            ref={searchInputRef}
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="relay-search-input"
            placeholder="Search"
          />
        </div>

        <button
          type="button"
          className={`relay-nav-action${activePane === 'connections' ? ' is-active' : ''}`}
          onClick={() => handleSelectUtility('connections')}
        >
          <span className="relay-nav-action__icon"><PlugIcon /></span>
          <span className="relay-nav-action__label">Connections</span>
          <span className="relay-nav-action__meta">{countConnectorItems(connectorInventory)}</span>
        </button>

        <button type="button" className="relay-nav-action relay-nav-action--muted">
          <span className="relay-nav-action__icon"><ClockIcon /></span>
          <span className="relay-nav-action__label">Automations</span>
          <span className="relay-nav-action__meta">Soon</span>
        </button>

        <button
          type="button"
          className={`relay-nav-action relay-nav-action--secondary${activePane === 'usage' ? ' is-active' : ''}`}
          onClick={() => handleSelectUtility('usage')}
        >
          <span className="relay-nav-action__icon"><ChartIcon /></span>
          <span className="relay-nav-action__label">Usage</span>
          <span className="relay-nav-action__meta">Live</span>
        </button>
      </div>

      <div className="relay-sidebar__content">
        <>
            <section className="relay-sidebar-section">
              <div className="relay-sidebar-section__header">
                <span className="relay-sidebar-section__label">Projects</span>
              </div>

              {grouped.projects.length === 0 && (
                <div className="relay-sidebar-empty">No project threads yet.</div>
              )}

              {grouped.projects.map((project) => {
                const key = projectKey(project)
                const hasActiveConversation = project.conversations.some((conv) => conv.id === activeId)
                const isCollapsed = collapsedProjects[key] ?? !hasActiveConversation
                const activeConversationIndex = project.conversations.findIndex((conv) => conv.id === activeId)
                const activeConversationNeedsExpansion = activeConversationIndex >= PROJECT_CONVERSATION_PREVIEW_LIMIT
                const searchIsActive = searchTerm.trim().length > 0
                const isHistoryExpanded = (expandedProjectHistory[key] ?? false) || activeConversationNeedsExpansion || searchIsActive
                const visibleConversations = isHistoryExpanded
                  ? project.conversations
                  : project.conversations.slice(0, PROJECT_CONVERSATION_PREVIEW_LIMIT)
                const hiddenConversationCount = project.conversations.length - visibleConversations.length

                return (
                  <div key={key} className="relay-project-group">
                    <button
                      type="button"
                      className="relay-project-group__title"
                      onClick={() => handleToggleProject(project)}
                    >
                      <span className={`relay-project-group__chevron${isCollapsed ? ' is-collapsed' : ''}`}>▾</span>
                      <span className="relay-project-group__icon"><FolderIcon /></span>
                      <span className="relay-project-group__name">{project.name}</span>
                      <span className="relay-project-group__count">{project.conversations.length}</span>
                    </button>

                    {!isCollapsed && (
                      <div className="relay-project-group__list">
                        {visibleConversations.map((conv) => {
                          const isActive = conv.id === activeId
                          return (
                            <button
                              key={conv.id}
                              type="button"
                              className={`relay-conversation-item${isActive ? ' is-active' : ''}`}
                              onClick={() => handleSelectConversation(conv.id)}
                            >
                              <span className="relay-conversation-item__main">
                                <span className="relay-conversation-item__title">{conv.title}</span>
                              </span>
                              <span className="relay-conversation-item__side">
                                <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                                {!conv.readOnly && (
                                  <span
                                    className="relay-conversation-item__delete"
                                    onClick={(event) => void handleDelete(event, conv.id)}
                                  >
                                    ×
                                  </span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                        {hiddenConversationCount > 0 && (
                          <button
                            type="button"
                            className="relay-project-group__more"
                            onClick={() => handleShowMoreProject(project)}
                          >
                            See more
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </section>

            {grouped.unassigned.length > 0 && (
              <section className="relay-sidebar-section">
                <div className="relay-sidebar-section__header">
                  <span className="relay-sidebar-section__label">Chats</span>
                </div>

                <div className="relay-project-group__list relay-project-group__list--root">
                  {grouped.unassigned.map((conv) => {
                    const isActive = conv.id === activeId
                    return (
                      <button
                        key={conv.id}
                        type="button"
                        className={`relay-conversation-item${isActive ? ' is-active' : ''}`}
                        onClick={() => handleSelectConversation(conv.id)}
                      >
                        <span className="relay-conversation-item__main">
                          <span className="relay-conversation-item__title">{conv.title}</span>
                        </span>
                        <span className="relay-conversation-item__side">
                          <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                          {!conv.readOnly && (
                            <span
                              className="relay-conversation-item__delete"
                              onClick={(event) => void handleDelete(event, conv.id)}
                            >
                              ×
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}
        </>
      </div>
    </aside>
  )
}
