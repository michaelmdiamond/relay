import { useState, useEffect } from 'react'

const THEMES = [
  { id: 'void',     label: 'Void',     swatch: '#101028' },
  { id: 'obsidian', label: 'Obsidian', swatch: '#1c1c1c' },
  { id: 'ember',    label: 'Ember',    swatch: '#221408' },
  { id: 'aurora',   label: 'Aurora',   swatch: '#0a1c16' },
  { id: 'dusk',     label: 'Dusk',     swatch: '#1a0c2e' },
  { id: 'arctic',   label: 'Arctic',   swatch: '#040a12' },
]

const STORAGE_KEY = 'relay-theme'

export function DevPanel() {
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) ?? 'void')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  if (!open) {
    return (
      <button className="dev-toggle-btn" onClick={() => setOpen(true)}>
        dev
      </button>
    )
  }

  return (
    <div className="dev-panel">
      <div className="dev-panel-title">Dev Panel</div>

      <div className="dev-panel-section">
        <div className="dev-panel-label">Theme</div>
        <div className="dev-theme-options">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`dev-theme-btn ${theme === t.id ? 'active' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <span className="dev-theme-swatch" style={{ background: t.swatch }} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <button
        className="dev-theme-btn"
        style={{ marginTop: 6, color: 'var(--text-dim)' }}
        onClick={() => setOpen(false)}
      >
        Close
      </button>
    </div>
  )
}
