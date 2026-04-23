import { useEffect, useState } from 'react'
import { useSessionStore } from '../store/sessions'

interface Props {
  onClose: () => void
}

export function NewSessionModal({ onClose }: Props) {
  const { setSessions, setMainView, setActiveTerminal } = useSessionStore()
  const [name, setName] = useState('')
  const [cwd, setCwd] = useState('')
  const [project, setProject] = useState('')
  const [mode, setMode] = useState<'spawn' | 'attach'>('spawn')
  const [pid, setPid] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getEnv().then(env => {
      setCwd(env.HOME)
    })
  }, [])

  async function handleCreate() {
    setError('')
    try {
      if (mode === 'spawn') {
        const session = await window.api.createSession(name || cwd.split('/').pop() || 'session', cwd, project || null)
        setActiveTerminal(session.id)
        setMainView('terminal')
      } else {
        const pidNum = parseInt(pid)
        if (isNaN(pidNum)) { setError('Invalid PID'); return }
        const s = await window.api.attachSession(pidNum, name || `pid-${pidNum}`, project || null)
        if (!s) { setError('Process not found'); return }
      }
      const sessions = await window.api.getSessions()
      setSessions(sessions)
      onClose()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New Session</h2>

        <label className="field-label">Name</label>
        <input
          className="field-input"
          placeholder="auto from cwd"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label className="field-label">Working Directory</label>
        <input
          className="field-input"
          value={cwd}
          onChange={(e) => setCwd(e.target.value)}
        />

        <label className="field-label">Project (optional)</label>
        <input
          className="field-input"
          placeholder="auto-detected"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        />

        <label className="field-label">Mode</label>
        <div className="seg-control" style={{ marginBottom: 12 }}>
          <button className={`seg-btn ${mode === 'spawn' ? 'active' : ''}`} onClick={() => setMode('spawn')}>
            Spawn shell
          </button>
          <button className={`seg-btn ${mode === 'attach' ? 'active' : ''}`} onClick={() => setMode('attach')}>
            Attach to PID
          </button>
        </div>

        {mode === 'attach' && (
          <>
            <label className="field-label">PID</label>
            <input
              className="field-input"
              placeholder="12345"
              value={pid}
              onChange={(e) => setPid(e.target.value)}
            />
          </>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="modal-actions">
          <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={handleCreate}>Create</button>
        </div>
      </div>
    </div>
  )
}
