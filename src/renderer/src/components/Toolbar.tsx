import { useState } from 'react'
import { useSessionStore } from '../store/sessions'
import { NewSessionModal } from './NewSessionModal'

export function Toolbar() {
  const { viewMode, setViewMode, mainView, setMainView, sessions } = useSessionStore()
  const [showNew, setShowNew] = useState(false)
  const attentionCount = sessions.filter(s => s.needsAttention).length

  return (
    <>
      <header className="toolbar">
        <div className="toolbar-drag" />

        <div className="toolbar-left">
          <button
            className="toolbar-title-btn"
            onClick={() => setMainView('kanban')}
            title="Back to board"
          >
            relay
          </button>
          {attentionCount > 0 && (
            <span className="toolbar-attention-badge" title={`${attentionCount} session${attentionCount > 1 ? 's' : ''} waiting`}>
              {attentionCount}
            </span>
          )}
        </div>

        <div className="toolbar-center">
          {mainView === 'kanban' && (
            <div className="seg-control">
              <button
                className={`seg-btn ${viewMode === 'status' ? 'active' : ''}`}
                onClick={() => setViewMode('status')}
              >
                Status
              </button>
              <button
                className={`seg-btn ${viewMode === 'project' ? 'active' : ''}`}
                onClick={() => setViewMode('project')}
              >
                Project
              </button>
            </div>
          )}
          {mainView === 'terminal' && (
            <span className="toolbar-view-label">Terminal</span>
          )}
          {mainView === 'transcript' && (
            <span className="toolbar-view-label">Transcript</span>
          )}
        </div>

        <div className="toolbar-right">
          <button className="btn-new" onClick={() => setShowNew(true)}>
            + New
          </button>
        </div>
      </header>

      {showNew && <NewSessionModal onClose={() => setShowNew(false)} />}
    </>
  )
}
