import { useEffect, useRef, useState } from 'react'
import type { Workspace } from '../../../shared/types'

type WorkspaceView = 'tasks' | 'chat' | 'automations' | 'workflows' | 'terminals'

interface Props {
  active: WorkspaceView
  onChange: (view: WorkspaceView) => void
  onConnections: () => void
  onUsage: () => void
  connectionsActive: boolean
  usageActive: boolean
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onWorkspaceChange: (id: string | null) => void
}

function ChatBubbleIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.5 4.5h13c.6 0 1 .4 1 1v7c0 .6-.4 1-1 1H11l-3 3v-3H4.5c-.6 0-1-.4-1-1v-7c0-.6.4-1 1-1Z" />
    </svg>
  )
}

function GridIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1.2" />
      <rect x="11" y="3" width="6" height="6" rx="1.2" />
      <rect x="3" y="11" width="6" height="6" rx="1.2" />
      <rect x="11" y="11" width="6" height="6" rx="1.2" />
    </svg>
  )
}

function LightningIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M11.5 2.5 5 11h5.5L8.5 17.5 15 9h-5.5l2-6.5Z" />
    </svg>
  )
}

function ClockPlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="9" cy="10" r="6.5" />
      <path d="M9 7v3.2l2 1.3" />
      <path d="M15 14.5l4 2.5v-5l-4 2.5Z" />
    </svg>
  )
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="m6 8 3 3-3 3" />
      <path d="M11 14h3" />
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

interface RailBtnProps {
  active: boolean
  onClick: () => void
  title: string
  label: string
  children: React.ReactNode
}

function RailBtn({ active, onClick, title, label, children }: RailBtnProps) {
  return (
    <button
      type="button"
      className={`icon-rail-btn${active ? ' is-active' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
      <span className="icon-rail-btn__label">{label}</span>
    </button>
  )
}

function WorkspaceSelector({ workspaces, activeWorkspaceId, onWorkspaceChange }: {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onWorkspaceChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const active = workspaces.find(w => w.id === activeWorkspaceId)
  const abbr = active ? active.name.slice(0, 2).toUpperCase() : '≡'

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div ref={ref} className="icon-rail-workspace">
      <button
        type="button"
        className={`icon-rail-workspace-btn${open ? ' is-open' : ''}`}
        title={active?.name ?? 'All Work'}
        onClick={() => setOpen(v => !v)}
      >
        {abbr}
      </button>
      {open && (
        <div className="icon-rail-workspace-popover">
          <button
            type="button"
            className={`icon-rail-workspace-option${!activeWorkspaceId ? ' is-active' : ''}`}
            onClick={() => { onWorkspaceChange(null); setOpen(false) }}
          >
            All Work
          </button>
          {workspaces.map(w => (
            <button
              key={w.id}
              type="button"
              className={`icon-rail-workspace-option${activeWorkspaceId === w.id ? ' is-active' : ''}`}
              onClick={() => { onWorkspaceChange(w.id); setOpen(false) }}
            >
              {w.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function IconRail({ active, onChange, onConnections, onUsage, connectionsActive, usageActive, workspaces, activeWorkspaceId, onWorkspaceChange }: Props) {
  return (
    <nav className="icon-rail" aria-label="Primary navigation">
      <WorkspaceSelector
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onWorkspaceChange={onWorkspaceChange}
      />
      <div className="icon-rail__top">
        <RailBtn active={active === 'chat' && !connectionsActive && !usageActive} onClick={() => onChange('chat')} title="Chat" label="Chat">
          <ChatBubbleIcon />
        </RailBtn>
        <RailBtn active={active === 'tasks'} onClick={() => onChange('tasks')} title="Tasks board" label="Tasks">
          <GridIcon />
        </RailBtn>
        <RailBtn active={active === 'automations'} onClick={() => onChange('automations')} title="Automations" label="Agents">
          <LightningIcon />
        </RailBtn>
        <RailBtn active={active === 'workflows'} onClick={() => onChange('workflows')} title="Workflow runs" label="Runs">
          <ClockPlayIcon />
        </RailBtn>
        <RailBtn active={active === 'terminals'} onClick={() => onChange('terminals')} title="Terminal sessions" label="Terminal">
          <TerminalIcon />
        </RailBtn>
      </div>
      <div className="icon-rail__bottom">
        <RailBtn active={connectionsActive} onClick={onConnections} title="Connections" label="Connect">
          <PlugIcon />
        </RailBtn>
        <RailBtn active={usageActive} onClick={onUsage} title="Usage" label="Usage">
          <ChartIcon />
        </RailBtn>
      </div>
    </nav>
  )
}
