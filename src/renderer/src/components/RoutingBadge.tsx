import { useState } from 'react'
import type { RoutingDecision } from '../../../shared/types'

const MODEL_COLOR: Record<string, string> = {
  Haiku:            '#4ade80',
  Sonnet:           '#60a5fa',
  Opus:             '#c084fc',
  Codex:            '#f59e0b',
  'Gemini Pro':     '#34d399',
  'Gemini Flash':   '#2dd4bf',
  'Gemini Flash-Lite': '#5eead4',
  'DeepSeek Flash': '#7dd3fc',
  'DeepSeek Pro': '#38bdf8',
  'Cursor Auto': '#f472b6',
  'Cursor Composer': '#f472b6',
}

export function RoutingBadge({ routing }: { routing: RoutingDecision }) {
  const [open, setOpen] = useState(false)
  const color = MODEL_COLOR[routing.modelLabel] ?? '#94a3b8'

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          padding: '2px 8px',
          borderRadius: 99,
          border: `1px solid ${color}33`,
          background: `${color}18`,
          cursor: 'pointer',
          fontSize: 11,
          color: color,
          fontWeight: 500,
        }}
      >
        {routing.autoSelected && (
          <span style={{ opacity: 0.7, fontSize: 10 }}>Auto →</span>
        )}
        {routing.modelLabel}
        <span style={{ opacity: 0.5, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          {routing.reason}
        </span>
      )}
    </div>
  )
}
