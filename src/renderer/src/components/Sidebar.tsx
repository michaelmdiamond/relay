import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  Conversation,
  ThreadStatus,
} from '../../../shared/types'
import { useChatStore } from '../store/chat'

interface Props {
  onNew: () => void
  onConversationSelect?: () => void
  workspaceId?: string | null
  workspaceKind?: 'repo' | 'general'
  workspaceProjectPath?: string
  repoWorkspacePaths?: string[]
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

function conversationMatchesWorkspace(
  conversation: Conversation,
  workspaceId?: string | null,
  workspaceKind?: 'repo' | 'general',
  workspaceProjectPath?: string,
  repoWorkspacePaths: string[] = [],
): boolean {
  if (!workspaceId) return true
  if (conversation.workspaceId === workspaceId) return true
  if (workspaceKind === 'repo' && workspaceProjectPath && conversation.projectPath) {
    return conversation.projectPath === workspaceProjectPath || conversation.projectPath.startsWith(`${workspaceProjectPath}/`)
  }
  if (workspaceKind === 'general') {
    return !conversation.projectPath || !repoWorkspacePaths.some((repoPath) => (
      conversation.projectPath === repoPath || conversation.projectPath.startsWith(`${repoPath}/`)
    ))
  }
  return false
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

function FolderIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2.5 6.2c0-1.4 1.1-2.5 2.5-2.5H7l1.4 1.6h6.5c1.7 0 2.6 0 3.2.5.6.6.6 1.5.6 3.2v3.8c0 1.7 0 2.6-.6 3.2-.6.6-1.5.6-3.2.6H5c-1.7 0-2.6 0-3.2-.6-.6-.6-.6-1.5-.6-3.2V6.2Z" />
    </svg>
  )
}

function statusLabel(status: ThreadStatus | undefined): string | null {
  if (status === 'paused') return 'Paused'
  if (status === 'completed') return 'Done'
  if (status === 'archived') return 'Archived'
  return null
}

export function Sidebar({
  onNew,
  onConversationSelect,
  workspaceId,
  workspaceKind,
  workspaceProjectPath,
  repoWorkspacePaths = [],
}: Props) {
  const { conversations, activeId, setActiveId, replaceConversation } = useChatStore()
  const [searchTerm, setSearchTerm] = useState('')
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({})
  const [expandedProjectHistory, setExpandedProjectHistory] = useState<Record<string, boolean>>({})
  const [archivedOpen, setArchivedOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null
  const shouldGroupByProject = !workspaceId

  const visibleConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    const workspaceScoped = conversations
      .filter((conv) => conversationMatchesWorkspace(
        conv,
        workspaceId,
        workspaceKind,
        workspaceProjectPath,
        repoWorkspacePaths,
      ))
    if (!query) return workspaceScoped
    return workspaceScoped.filter((conv) => {
      const haystack = [
        conv.title,
        conv.projectName,
        conv.projectPath,
        conv.workspaceSnapshot?.gitBranch,
        conv.resumeState?.userGoal,
        conv.resumeState?.currentState,
        ...(conv.resumeState?.filesTouched ?? []),
        ...(conv.resumeState?.nextSteps ?? []),
        conv.messages.at(-1)?.content,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [conversations, searchTerm, workspaceId, workspaceKind, workspaceProjectPath, repoWorkspacePaths])

  const openConversations = useMemo(
    () => visibleConversations.filter((conversation) => conversation.status !== 'archived'),
    [visibleConversations],
  )

  const archivedConversations = useMemo(
    () => visibleConversations.filter((conversation) => conversation.status === 'archived'),
    [visibleConversations],
  )

  const activeConversationIsOutsideWorkspace = !!(
    activeConversation &&
    !conversationMatchesWorkspace(
      activeConversation,
      workspaceId,
      workspaceKind,
      workspaceProjectPath,
      repoWorkspacePaths,
    )
  )

  function groupConversations(source: Conversation[]) {
    const projectMap = new Map<string, ProjectGroup>()
    const unassigned: Conversation[] = []

    source.forEach((conv) => {
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
  }

  const grouped = useMemo(() => groupConversations(openConversations), [openConversations])
  const archivedGrouped = useMemo(() => groupConversations(archivedConversations), [archivedConversations])
  const sortedOpenConversations = useMemo(() => [...openConversations].sort((a, b) => {
    const aTime = a.updatedAt ?? a.createdAt
    const bTime = b.updatedAt ?? b.createdAt
    return bTime.localeCompare(aTime)
  }), [openConversations])
  const sortedArchivedConversations = useMemo(() => [...archivedConversations].sort((a, b) => {
    const aTime = a.updatedAt ?? a.createdAt
    const bTime = b.updatedAt ?? b.createdAt
    return bTime.localeCompare(aTime)
  }), [archivedConversations])

  async function handleThreadStatus(event: React.MouseEvent, conversation: Conversation) {
    event.stopPropagation()
    const next = await window.api.updateThreadStatus(
      conversation.id,
      conversation.status === 'archived' ? 'active' : 'archived',
    )
    if (next) replaceConversation(next)
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
      </div>

      <div className="relay-sidebar__content">
        <>
            {activeConversationIsOutsideWorkspace && activeConversation && (
              <section className="relay-sidebar-section relay-sidebar-section--current">
                <div className="relay-sidebar-section__header">
                  <span className="relay-sidebar-section__label">Current chat</span>
                  <span className="relay-sidebar-section__hint">Outside workspace</span>
                </div>

                <div className="relay-project-group__list relay-project-group__list--root">
                  <button
                    type="button"
                    className="relay-conversation-item is-active"
                    onClick={() => handleSelectConversation(activeConversation.id)}
                  >
                      <span className="relay-conversation-item__main">
                        <span className="relay-conversation-item__title">{activeConversation.title}</span>
                        {statusLabel(activeConversation.status) && (
                          <span className="relay-conversation-item__status">{statusLabel(activeConversation.status)}</span>
                        )}
                      </span>
                    <span className="relay-conversation-item__side">
                      <span className="relay-conversation-item__time">
                        {formatRelativeTime(activeConversation.updatedAt ?? activeConversation.createdAt)}
                      </span>
                      {!activeConversation.readOnly && (
                        <span
                          className="relay-conversation-item__delete"
                          title={activeConversation.status === 'archived' ? 'Restore thread' : 'Archive thread'}
                          onClick={(event) => void handleThreadStatus(event, activeConversation)}
                        >
                          {activeConversation.status === 'archived' ? '↺' : '×'}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              </section>
            )}

            {shouldGroupByProject ? (
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
                                    {statusLabel(conv.status) && (
                                      <span className="relay-conversation-item__status">{statusLabel(conv.status)}</span>
                                    )}
                                  </span>
                                  <span className="relay-conversation-item__side">
                                    <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                                    {!conv.readOnly && (
                                      <span
                                        className="relay-conversation-item__delete"
                                        title={conv.status === 'archived' ? 'Restore thread' : 'Archive thread'}
                                        onClick={(event) => void handleThreadStatus(event, conv)}
                                      >
                                        {conv.status === 'archived' ? '↺' : '×'}
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
                                {statusLabel(conv.status) && (
                                  <span className="relay-conversation-item__status">{statusLabel(conv.status)}</span>
                                )}
                              </span>
                            <span className="relay-conversation-item__side">
                              <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                              {!conv.readOnly && (
                                <span
                                  className="relay-conversation-item__delete"
                                  title={conv.status === 'archived' ? 'Restore thread' : 'Archive thread'}
                                  onClick={(event) => void handleThreadStatus(event, conv)}
                                >
                                  {conv.status === 'archived' ? '↺' : '×'}
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
            ) : (
              <section className="relay-sidebar-section">
                <div className="relay-sidebar-section__header">
                  <span className="relay-sidebar-section__label">Chats</span>
                </div>

                {sortedOpenConversations.length === 0 && (
                  <div className="relay-sidebar-empty">No chats in this workspace yet.</div>
                )}

                <div className="relay-project-group__list relay-project-group__list--root">
                  {sortedOpenConversations.map((conv) => {
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
                            {statusLabel(conv.status) && (
                              <span className="relay-conversation-item__status">{statusLabel(conv.status)}</span>
                            )}
                          </span>
                        <span className="relay-conversation-item__side">
                          <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                          {!conv.readOnly && (
                            <span
                              className="relay-conversation-item__delete"
                              title={conv.status === 'archived' ? 'Restore thread' : 'Archive thread'}
                              onClick={(event) => void handleThreadStatus(event, conv)}
                            >
                              {conv.status === 'archived' ? '↺' : '×'}
                            </span>
                          )}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {archivedConversations.length > 0 && (
              <section className="relay-sidebar-section relay-sidebar-section--archived">
                <button
                  type="button"
                  className="relay-sidebar-section__toggle"
                  onClick={() => setArchivedOpen((value) => !value)}
                  aria-expanded={archivedOpen}
                >
                  <span className="relay-sidebar-section__label">Archived</span>
                  <span className="relay-sidebar-section__hint">
                    {archivedConversations.length}
                  </span>
                  <span className={`relay-sidebar-section__chevron${archivedOpen ? '' : ' is-collapsed'}`}>▾</span>
                </button>

                {archivedOpen && (
                  <div className="relay-archive-stack">
                    {shouldGroupByProject ? (
                      <>
                        {archivedGrouped.projects.map((project) => (
                          <div key={`archived-${projectKey(project)}`} className="relay-project-group relay-project-group--archived">
                            <div className="relay-project-group__title relay-project-group__title--static">
                              <span className="relay-project-group__icon"><FolderIcon /></span>
                              <span className="relay-project-group__name">{project.name}</span>
                              <span className="relay-project-group__count">{project.conversations.length}</span>
                            </div>

                            <div className="relay-project-group__list">
                              {project.conversations.map((conv) => {
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
                                      <span className="relay-conversation-item__status">Archived</span>
                                    </span>
                                    <span className="relay-conversation-item__side">
                                      <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                                      {!conv.readOnly && (
                                        <span
                                          className="relay-conversation-item__delete"
                                          title="Restore thread"
                                          onClick={(event) => void handleThreadStatus(event, conv)}
                                        >
                                          ↺
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        ))}

                        {archivedGrouped.unassigned.length > 0 && (
                          <div className="relay-project-group relay-project-group--archived">
                            <div className="relay-project-group__title relay-project-group__title--static">
                              <span className="relay-project-group__name">Chats</span>
                              <span className="relay-project-group__count">{archivedGrouped.unassigned.length}</span>
                            </div>

                            <div className="relay-project-group__list relay-project-group__list--root">
                              {archivedGrouped.unassigned.map((conv) => {
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
                                      <span className="relay-conversation-item__status">Archived</span>
                                    </span>
                                    <span className="relay-conversation-item__side">
                                      <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                                      {!conv.readOnly && (
                                        <span
                                          className="relay-conversation-item__delete"
                                          title="Restore thread"
                                          onClick={(event) => void handleThreadStatus(event, conv)}
                                        >
                                          ↺
                                        </span>
                                      )}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="relay-project-group__list relay-project-group__list--root">
                        {sortedArchivedConversations.map((conv) => {
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
                                <span className="relay-conversation-item__status">Archived</span>
                              </span>
                              <span className="relay-conversation-item__side">
                                <span className="relay-conversation-item__time">{formatRelativeTime(conv.updatedAt ?? conv.createdAt)}</span>
                                {!conv.readOnly && (
                                  <span
                                    className="relay-conversation-item__delete"
                                    title="Restore thread"
                                    onClick={(event) => void handleThreadStatus(event, conv)}
                                  >
                                    ↺
                                  </span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
        </>
      </div>
    </aside>
  )
}
