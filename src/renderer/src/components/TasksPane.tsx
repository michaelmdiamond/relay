import { useEffect, useState } from 'react'
import { DndContext, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type {
  TaskItem,
  TaskSignal,
  TaskState,
  TerminalLauncherId,
} from '../../../shared/types'

const columns: Array<{ state: TaskState; label: string }> = [
  { state: 'idea', label: 'Idea' },
  { state: 'running', label: 'Running' },
  { state: 'blocked', label: 'Blocked' },
  { state: 'review', label: 'Review' },
  { state: 'done', label: 'Done' },
]

const signalLabels: Record<TaskSignal, string> = {
  active: 'Active',
  idle: 'Idle',
  waiting: 'Waiting',
  exited: 'Exited',
  failed: 'Failed',
  stale: 'Stale',
  complete: 'Complete',
}

const launcherOptions: Array<{ id: TerminalLauncherId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'local', label: 'Local' },
  { id: 'shell', label: 'Shell' },
]

function formatRelativeTime(value?: string): string {
  if (!value) return ''
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''
  const diffMs = Date.now() - timestamp
  const minutes = Math.max(1, Math.floor(diffMs / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function stateActionLabel(state: TaskState): string {
  if (state === 'blocked') return 'Mark blocked'
  if (state === 'review') return 'Move to review'
  if (state === 'done') return 'Mark done'
  if (state === 'running') return 'Move to running'
  return 'Move to idea'
}

function DroppableColumn({
  state,
  label,
  tasks,
  onNudge,
  onLaunchTerminal,
  onLaunchWorkflow,
  onArchive,
}: {
  state: TaskState
  label: string
  tasks: TaskItem[]
  onNudge: (task: TaskItem, state: TaskState) => void
  onLaunchTerminal: (task: TaskItem, launcherId: TerminalLauncherId) => void
  onLaunchWorkflow: (task: TaskItem) => void
  onArchive: (task: TaskItem) => void
}) {
  const { isOver, setNodeRef } = useDroppable({ id: state })

  return (
    <section ref={setNodeRef} className={`task-column${isOver ? ' is-over' : ''}`}>
      <header className="task-column__header">
        <span className="task-column__title">{label}</span>
        <span className="task-column__count">{tasks.length}</span>
      </header>
      <div className="task-column__body">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onNudge={onNudge}
            onLaunchTerminal={onLaunchTerminal}
            onLaunchWorkflow={onLaunchWorkflow}
            onArchive={onArchive}
          />
        ))}
        {tasks.length === 0 && <div className="task-column__empty">No tasks</div>}
      </div>
    </section>
  )
}

function TaskCard({
  task,
  onNudge,
  onLaunchTerminal,
  onLaunchWorkflow,
  onArchive,
}: {
  task: TaskItem
  onNudge: (task: TaskItem, state: TaskState) => void
  onLaunchTerminal: (task: TaskItem, launcherId: TerminalLauncherId) => void
  onLaunchWorkflow: (task: TaskItem) => void
  onArchive: (task: TaskItem) => void
}) {
  const [launcherId, setLauncherId] = useState<TerminalLauncherId>('codex')
  const [menuOpen, setMenuOpen] = useState(false)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

  return (
    <article
      ref={setNodeRef}
      className={`task-card${isDragging ? ' is-dragging' : ''}${task.signal ? ` task-card--${task.signal}` : ''}`}
    >
      <TaskCardMenu
        task={task}
        launcherId={launcherId}
        menuOpen={menuOpen}
        setLauncherId={setLauncherId}
        setMenuOpen={setMenuOpen}
        onLaunchTerminal={onLaunchTerminal}
        onLaunchWorkflow={onLaunchWorkflow}
        onArchive={onArchive}
      />
      <TaskCardContent task={task} dragProps={{ ...listeners, ...attributes }} />
      <div className="task-card__footer">
        {task.suggestedState && task.suggestedState !== task.state && (
          <button type="button" className="task-card__nudge" onClick={() => onNudge(task, task.suggestedState!)}>
            {stateActionLabel(task.suggestedState)}
          </button>
        )}
      </div>
    </article>
  )
}

function TaskCardMenu({
  task,
  launcherId,
  menuOpen,
  setLauncherId,
  setMenuOpen,
  onLaunchTerminal,
  onLaunchWorkflow,
  onArchive,
}: {
  task: TaskItem
  launcherId: TerminalLauncherId
  menuOpen: boolean
  setLauncherId: (launcherId: TerminalLauncherId) => void
  setMenuOpen: (value: boolean | ((value: boolean) => boolean)) => void
  onLaunchTerminal: (task: TaskItem, launcherId: TerminalLauncherId) => void
  onLaunchWorkflow: (task: TaskItem) => void
  onArchive: (task: TaskItem) => void
}) {
  return (
    <div className="task-card__menu">
      <button
        type="button"
        className="task-card__menu-trigger"
        aria-label={`More actions for ${task.title}`}
        title="More actions"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          setMenuOpen((value) => !value)
        }}
      >
        ⋮
      </button>
      {menuOpen && (
        <div className="task-card__menu-popover" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <label>
            <span>Terminal</span>
            <select value={launcherId} onChange={(event) => setLauncherId(event.target.value as TerminalLauncherId)}>
              {launcherOptions.map((launcher) => (
                <option key={launcher.id} value={launcher.id}>{launcher.label}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onLaunchTerminal(task, launcherId)
            }}
          >
            Start terminal
          </button>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              onLaunchWorkflow(task)
            }}
          >
            Start workflow
          </button>
          <button
            type="button"
            className="task-card__menu-danger"
            onClick={() => {
              setMenuOpen(false)
              onArchive(task)
            }}
          >
            Archive task
          </button>
        </div>
      )}
    </div>
  )
}

function TaskCardContent({
  task,
  dragProps,
}: {
  task: TaskItem
  dragProps?: Record<string, unknown>
}) {
  return (
    <>
      <div className="task-card__drag" {...dragProps}>
        <div className="task-card__title">{task.title}</div>
        {task.projectName && <div className="task-card__project">{task.projectName}</div>}
      </div>
      {task.brief && <div className="task-card__brief">{task.brief}</div>}
      <div className="task-card__meta">
        {task.signal && <span className={`task-signal task-signal--${task.signal}`}>{signalLabels[task.signal]}</span>}
        {task.lastActivityAt && <span>{formatRelativeTime(task.lastActivityAt)}</span>}
        {task.terminalSessionIds.length > 0 && <span>{task.terminalSessionIds.length} terminal</span>}
        {task.workflowRunIds.length > 0 && <span>{task.workflowRunIds.length} workflow</span>}
      </div>
      {task.signalReason && <div className="task-card__reason">{task.signalReason}</div>}
    </>
  )
}

function TaskDragPreview({ task }: { task: TaskItem }) {
  return (
    <article className={`task-card task-card--drag-preview${task.signal ? ` task-card--${task.signal}` : ''}`}>
      <TaskCardContent task={task} />
    </article>
  )
}

export function TasksPane({
  workspaceId,
  workspaceKind,
  workspaceProjectPath,
  repoWorkspacePaths = [],
}: {
  workspaceId?: string | null
  workspaceKind?: 'repo' | 'general'
  workspaceProjectPath?: string
  repoWorkspacePaths?: string[]
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null)

  async function refreshTasks() {
    const nextTasks = await window.api.getTasks()
    setTasks(nextTasks)
  }

  useEffect(() => {
    void refreshTasks()
    const tasksUpdated = window.api.onTasksUpdated(setTasks)
    const interval = window.setInterval(() => void refreshTasks(), 30_000)
    return () => {
      tasksUpdated()
      window.clearInterval(interval)
    }
  }, [])

  const visibleTasks = tasks.filter((task) => {
    if (task.archivedAt) return false
    if (!workspaceId) return true
    if (task.workspaceId === workspaceId) return true
    if (workspaceKind === 'repo' && workspaceProjectPath && task.projectPath) {
      return task.projectPath === workspaceProjectPath || task.projectPath.startsWith(`${workspaceProjectPath}/`)
    }
    if (workspaceKind === 'general') {
      return !task.projectPath || !repoWorkspacePaths.some((repoPath) => (
        task.projectPath === repoPath || task.projectPath.startsWith(`${repoPath}/`)
      ))
    }
    return false
  })
  const activeDragTask = activeDragTaskId
    ? visibleTasks.find((task) => task.id === activeDragTaskId) ?? tasks.find((task) => task.id === activeDragTaskId) ?? null
    : null

  async function handleDragEnd(event: DragEndEvent) {
    setActiveDragTaskId(null)
    const taskId = String(event.active.id)
    const state = event.over?.id as TaskState | undefined
    if (!state || !columns.some((column) => column.state === state)) return
    const task = visibleTasks.find((entry) => entry.id === taskId)
    if (!task || task.state === state) return
    setTasks((current) => current.map((entry) => entry.id === taskId ? { ...entry, state, updatedAt: new Date().toISOString() } : entry))
    const updated = await window.api.updateTaskState(taskId, state)
    if (updated) {
      setTasks((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragTaskId(String(event.active.id))
  }

  async function handleNudge(task: TaskItem, state: TaskState) {
    const updated = await window.api.updateTaskState(task.id, state)
    if (updated) setTasks((current) => current.map((entry) => entry.id === updated.id ? updated : entry))
  }

  async function handleLaunchTerminal(task: TaskItem, launcherId: TerminalLauncherId) {
    setError('')
    setNotice('')
    try {
      const session = await window.api.startTaskTerminal(task.id, launcherId)
      setNotice(`Started ${session.name}.`)
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleLaunchWorkflow(task: TaskItem) {
    setError('')
    setNotice('')
    try {
      const run = await window.api.startTaskWorkflow(task.id)
      setNotice(`Started ${run.workflowName}.`)
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleArchive(task: TaskItem) {
    const archived = await window.api.archiveTask(task.id)
    if (archived) setTasks((current) => current.map((entry) => entry.id === archived.id ? archived : entry))
  }

  return (
    <div className="tasks-view">
      <header className="tasks-header">
        <div className="tasks-header__main">
          <h1 className="tasks-header__title">Tasks</h1>
        </div>
        <div className="tasks-header__stats">
          <span>{visibleTasks.length} tasks</span>
        </div>
      </header>

      {error && <div className="tasks-error">{error}</div>}
      {notice && <div className="tasks-notice">{notice}</div>}

      <DndContext
        onDragStart={handleDragStart}
        onDragCancel={() => setActiveDragTaskId(null)}
        onDragEnd={(event) => void handleDragEnd(event)}
      >
        <div className="tasks-board">
          {columns.map((column) => (
            <DroppableColumn
              key={column.state}
              state={column.state}
              label={column.label}
              tasks={visibleTasks.filter((task) => task.state === column.state)}
              onNudge={(task, state) => void handleNudge(task, state)}
              onLaunchTerminal={(task, launcherId) => void handleLaunchTerminal(task, launcherId)}
              onLaunchWorkflow={(task) => void handleLaunchWorkflow(task)}
              onArchive={(task) => void handleArchive(task)}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragTask ? <TaskDragPreview task={activeDragTask} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
