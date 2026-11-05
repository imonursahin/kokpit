import { Icon } from './primitives'

export type DiffFile = {
  path: string
  change: 'M' | 'A' | 'D'
  add: number
  del: number
  included: boolean
  test?: boolean
  active?: boolean
  comments?: number
}

const BADGE = { M: 'var(--run)', A: 'var(--ok)', D: 'var(--err)' } as const

export function DiffFileHeader({
  f,
  expanded,
  collapsed,
  onToggleInclude,
  onToggleCollapse
}: {
  f: DiffFile
  expanded?: boolean
  collapsed?: boolean
  onToggleInclude?: () => void
  onToggleCollapse?: () => void
}) {
  const i = f.path.lastIndexOf('/')
  const dir = f.path.slice(0, i + 1)
  const name = f.path.slice(i + 1)

  return (
    <div
      role={expanded ? 'button' : undefined}
      aria-expanded={expanded ? !collapsed : undefined}
      onClick={expanded ? onToggleCollapse : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: expanded ? 40 : 34,
        padding: '0 16px',
        background: expanded ? 'var(--bg)' : f.active ? 'var(--sel)' : 'transparent',
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 12.5,
        color: 'var(--tx)',
        flexShrink: 0
      }}
    >
      {expanded && <Icon name={collapsed ? 'chevron_right' : 'expand_more'} size={17} color="var(--tx3)" />}
      <button
        role="checkbox"
        aria-checked={f.included}
        aria-label={`Include ${f.path}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggleInclude?.()
        }}
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          ...(f.included ? { background: 'var(--pri)' } : { border: '1.5px solid var(--tx3)' })
        }}
      >
        {f.included && <Icon name="check" size={13} weight={600} color="var(--inv)" />}
      </button>
      <span style={{ font: "600 10.5px/1 'Geist Mono',monospace", color: BADGE[f.change], width: 9, flexShrink: 0 }}>{f.change}</span>
      <span
        style={{
          font: "12px/1.2 'Geist Mono',monospace",
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          opacity: f.included ? 1 : 0.5
        }}
      >
        <span style={{ color: 'var(--tx3)' }}>{dir}</span>
        <span style={{ color: 'var(--tx)' }}>{name}</span>
      </span>
      {f.test && (
        <span
          style={{
            font: "600 9.5px/1 'Geist Mono',monospace",
            letterSpacing: '.04em',
            color: 'var(--tx2)',
            border: '1px solid var(--line)',
            borderRadius: 4,
            padding: '3px 5px',
            flexShrink: 0
          }}
        >
          TEST
        </span>
      )}
      <span style={{ flex: 1 }} />
      {!!f.comments && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--tx2)', fontSize: 12 }}>
          <Icon name="chat_bubble" size={14} />
          {f.comments}
        </span>
      )}
      <span style={{ font: "12px/1 'Geist Mono',monospace", color: 'var(--ok)' }}>+{f.add}</span>
      {f.del > 0 && <span style={{ font: "12px/1 'Geist Mono',monospace", color: 'var(--err)' }}>−{f.del}</span>}
    </div>
  )
}
