import type { SessionStatus } from '@shared/types'
import { Spinner } from './primitives'

const META: Record<SessionStatus, [string, string, string]> = {
  running: ['Running', 'var(--run)', 'var(--run-bg)'],
  waiting: ['Needs you', 'var(--wait-tx)', 'var(--wait-bg)'],
  error: ['Error', 'var(--err)', 'var(--err-bg)'],
  done: ['Done', 'var(--ok)', 'var(--ok-bg)']
}

const badge = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden'
} as const

function Glyph({ status }: { status: SessionStatus }) {
  if (status === 'running') return <Spinner />
  if (status === 'waiting')
    return (
      <span style={{ ...badge, background: 'var(--wait)', font: "700 11px/1 'Material Symbols Rounded'", color: 'var(--panel)' }}>
        priority_high
      </span>
    )
  if (status === 'error')
    return (
      <span style={{ ...badge, background: 'var(--err)', font: "700 11px/1 'Material Symbols Rounded'", color: 'var(--panel)' }}>
        close
      </span>
    )
  return (
    <span
      style={{
        ...badge,
        border: '1.5px solid var(--ok)',
        boxSizing: 'border-box',
        font: "700 10px/1 'Material Symbols Rounded'",
        color: 'var(--ok)'
      }}
    >
      check
    </span>
  )
}

export function Status({ status, label }: { status: SessionStatus; label?: boolean }) {
  const [text, color, tint] = META[status]
  const glyph = (
    <span
      style={{
        width: 14,
        height: 14,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      <Glyph status={status} />
    </span>
  )
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, verticalAlign: 'middle' }}>
      {label ? (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            height: 22,
            padding: '0 9px 0 5px',
            borderRadius: 11,
            background: tint,
            color,
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap'
          }}
        >
          {glyph}
          <span>{text}</span>
        </span>
      ) : (
        glyph
      )}
    </span>
  )
}
