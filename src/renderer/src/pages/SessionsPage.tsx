import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { SessionStatus, SessionSummary } from '@shared/types'
import { SESSION_COLS, SessionRow } from '@/components/SessionRow'
import { SelectChip } from '@/components/Menu'
import { Icon, PrimaryButton, SecondaryButton } from '@/components/primitives'

export type LoadState = 'list' | 'loading' | 'empty' | 'error'

type Tab = 'all' | SessionStatus

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'waiting', label: 'Needs you' },
  { id: 'running', label: 'Running' },
  { id: 'error', label: 'Error' },
  { id: 'done', label: 'Done' }
]

const SKELETON: [string, string][] = [
  ['58%', '34%'],
  ['44%', '52%'],
  ['63%', '30%'],
  ['38%', '46%'],
  ['52%', '40%'],
  ['47%', '28%'],
  ['60%', '36%'],
  ['41%', '44%']
]

function parseCost(cost: string): number {
  const n = Number.parseFloat(cost.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function Dot({ color }: { color: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
}

function KeyLegend({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span
        style={{
          font: "500 10.5px/1 'Geist Mono',monospace",
          color: 'var(--tx2)',
          border: '1px solid var(--line)',
          borderBottomWidth: 2,
          borderRadius: 4,
          padding: '2px 4px'
        }}
      >
        {k}
      </span>
      {label}
    </span>
  )
}

function CenterState({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingBottom: 60,
        textAlign: 'center'
      }}
    >
      {children}
    </div>
  )
}

const RECENT_DAYS = 14

export function movePin(order: string[], id: string, target: string): string[] {
  const from = order.indexOf(id)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return order
  const next = order.filter((x) => x !== id)
  next.splice(next.indexOf(target) + (from < to ? 1 : 0), 0, id)
  return next
}

function GroupLabel({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div
      style={{
        flexShrink: 0,
        padding: first ? '12px 28px 6px' : '18px 28px 6px',
        borderTop: first ? undefined : '1px solid var(--line)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '.04em',
        textTransform: 'uppercase',
        color: 'var(--tx3)'
      }}
    >
      {children}
    </div>
  )
}

export function SessionsPage({
  sessions,
  state,
  errorDetail,
  footer,
  onOpen,
  onAllow,
  onArchive,
  onUnarchive,
  onPin,
  pinOrder = [],
  onReorderPins,
  onNew,
  onPickJira,
  onRetry,
  onViewLogs
}: {
  sessions: SessionSummary[]
  state: LoadState
  errorDetail?: string
  footer?: string
  onOpen: (id: string) => void
  onAllow: (id: string, askId?: string) => void
  onArchive: (id: string) => void
  onUnarchive?: (id: string) => void
  onPin: (id: string) => void
  pinOrder?: string[]
  onReorderPins?: (ids: string[]) => void
  onNew: () => void
  onPickJira: () => void
  onRetry: () => void
  onViewLogs: () => void
}) {
  const [tab, setTab] = useState<Tab>('all')
  const [jira, setJira] = useState('')
  const [tag, setTag] = useState('')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingG = useRef(false)

  const [showAll, setShowAll] = useState(false)
  const scoped = useMemo(() => {
    if (showAll) return sessions
    const since = Date.now() - RECENT_DAYS * 86_400_000
    return sessions.filter((s) => s.pinned || s.status !== 'done' || !s.lastAt || Date.parse(s.lastAt) >= since)
  }, [sessions, showAll])
  const olderCount = sessions.length - scoped.length

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: scoped.length, waiting: 0, running: 0, error: 0, done: 0 }
    for (const s of scoped) c[s.status] += 1
    return c
  }, [scoped])

  const jiraKeys = useMemo(() => [...new Set(scoped.map((s) => s.jira).filter(Boolean))].sort(), [scoped])
  const tagNames = useMemo(() => [...new Set(sessions.flatMap((s) => (s.tags ?? []).map((t) => t.name)))].sort((a, b) => a.localeCompare(b)), [sessions])
  const activeTag = tagNames.includes(tag) ? tag : ''

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q || activeTag ? sessions : scoped)
      .filter(
        (s) =>
          (tab === 'all' || s.status === tab) &&
          (!jira || s.jira === jira) &&
          (!activeTag || !!s.tags?.some((t) => t.name === activeTag)) &&
          (!q || s.title.toLowerCase().includes(q))
      )
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (a.pinned && b.pinned ? pinOrder.indexOf(a.id) - pinOrder.indexOf(b.id) : 0))
  }, [sessions, scoped, tab, jira, activeTag, query, pinOrder])
  const [drag, setDrag] = useState<{ id: string; over?: string } | null>(null)
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), 8000)
    return () => clearTimeout(t)
  }, [undo])
  const dropPin = (target: string) => {
    if (!drag || drag.id === target || !onReorderPins) return setDrag(null)
    onReorderPins(movePin(rows.filter((r) => r.pinned).map((r) => r.id), drag.id, target))
    setDrag(null)
  }

  const selected = rows.find((r) => r.id === selectedId) ?? null

  useEffect(() => {
    if (!selectedId) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-session-id="${CSS.escape(selectedId)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])
  const total = sessions.reduce((sum, s) => sum + parseCost(s.cost), 0)

  useEffect(() => {
    if (state !== 'list') return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === 'Escape' && target === filterRef.current) filterRef.current?.blur()
        return
      }
      const idx = rows.findIndex((r) => r.id === selectedId)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!rows.length) return
        const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx < 0 ? 0 : idx - 1)
        setSelectedId(rows[next]?.id ?? null)
      } else if (e.key === 'Enter' && selected && !(e.target as HTMLElement).closest('button,[role="button"],a')) {
        onOpen(selected.id)
      } else if ((e.key === 'y' || e.key === 'Y') && selected?.status === 'waiting') {
        onAllow(selected.id, selected.askId)
      } else if (e.key === 'Backspace' && selected) {
        onArchive(selected.id)
        setUndo({ id: selected.id, title: selected.title })
      } else if ((e.key === 'p' || e.key === 'P') && selected) {
        onPin(selected.id)
      } else if (e.key === '/') {
        e.preventDefault()
        filterRef.current?.focus()
      } else if (e.key === 'g') {
        pendingG.current = true
        window.setTimeout(() => (pendingG.current = false), 800)
        return
      } else if (e.key === 'w' && pendingG.current) {
        const ordered = [...rows.slice(idx + 1), ...rows.slice(0, idx + 1)]
        const next = ordered.find((r) => r.status === 'waiting')
        if (next) setSelectedId(next.id)
      }
      pendingG.current = false
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state, rows, selectedId, selected, onOpen, onAllow, onArchive, onPin])

  const isList = state === 'list'

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
      <div className="drag" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 16px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Sessions</h1>
        {isList && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12.5, color: 'var(--tx2)' }}>
            {counts.waiting > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Dot color="var(--wait)" />
                {counts.waiting} need you
              </span>
            )}
            {counts.running > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Dot color="var(--run)" />
                {counts.running} running
              </span>
            )}
            {counts.error > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Dot color="var(--err)" />
                {counts.error} failed
              </span>
            )}
          </div>
        )}
        {state === 'loading' && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Loading sessions…</span>}
        <span style={{ flex: 1 }} />
        <PrimaryButton icon="add" hint="⌘N" onClick={onNew} style={{ padding: '0 10px' }}>
          New session
        </PrimaryButton>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 28px 14px',
          opacity: isList ? 1 : 0.45,
          pointerEvents: isList ? 'auto' : 'none'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            padding: 2,
            background: 'var(--hover)',
            borderRadius: 8,
            fontSize: 12.5,
            color: 'var(--tx2)'
          }}
        >
          {TABS.map((t) => {
            const on = tab === t.id
            const n = counts[t.id]
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  ...(on
                    ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)', fontWeight: 500, color: 'var(--tx)' }
                    : {})
                }}
              >
                {t.label}
                {t.id === 'waiting' && n > 0 ? (
                  <span
                    style={{
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      borderRadius: 8,
                      background: 'var(--wait)',
                      color: '#1C1B19',
                      fontSize: 10.5,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {n}
                  </span>
                ) : (
                  <span style={{ color: 'var(--tx3)', fontWeight: 400 }}>{n}</span>
                )}
              </button>
            )
          })}
        </div>
        <SelectChip
          label="Jira task"
          value={jira}
          onChange={setJira}
          options={[{ value: '', label: 'Any' }, ...jiraKeys.map((k) => ({ value: k, label: k }))]}
        />
        {tagNames.length > 0 && (
          <SelectChip label="Tag" value={activeTag} onChange={setTag} options={[{ value: '', label: 'Any' }, ...tagNames.map((n) => ({ value: n, label: n }))]} />
        )}
        <span style={{ flex: 1 }} />
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: 220,
            height: 30,
            padding: '0 8px',
            border: '1px solid var(--line)',
            borderRadius: 7,
            fontSize: 12.5,
            color: 'var(--tx3)'
          }}
        >
          <Icon name="filter_list" size={16} />
          <input
            ref={filterRef}
            className="bare"
            style={{ flex: 1 }}
            placeholder="Filter by title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span
            style={{
              font: "500 10.5px/1 'Geist Mono',monospace",
              border: '1px solid var(--line)',
              borderBottomWidth: 2,
              borderRadius: 4,
              padding: '2px 5px'
            }}
          >
            /
          </span>
        </label>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: SESSION_COLS,
          columnGap: 16,
          padding: '8px 28px',
          fontSize: 11.5,
          color: 'var(--tx3)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)'
        }}
      >
        <span />
        <span>Session</span>
        <span>Jira</span>
        <span>PR</span>
        <span style={{ textAlign: 'right' }}>Activity</span>
        <span style={{ textAlign: 'right' }}>Cost</span>
      </div>

      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflow: isList ? 'auto' : 'hidden', display: 'flex', flexDirection: 'column' }}>
        {isList &&
          rows.map((s, i) => (
            <Fragment key={s.id}>
              {i === 0 && s.pinned && <GroupLabel first>Pinned</GroupLabel>}
              {!s.pinned && rows[i - 1]?.pinned && <GroupLabel>Others</GroupLabel>}
              <div
                draggable={!!s.pinned && !!onReorderPins}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move'
                  setDrag({ id: s.id })
                }}
                onDragOver={(e) => {
                  if (!drag || !s.pinned) return
                  e.preventDefault()
                  if (drag.over !== s.id) setDrag({ ...drag, over: s.id })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  dropPin(s.id)
                }}
                onDragEnd={() => setDrag(null)}
                style={{
                  flexShrink: 0,
                  opacity: drag?.id === s.id ? 0.5 : 1,
                  boxShadow: drag?.over === s.id && drag.id !== s.id ? `inset 0 ${rows.findIndex((r) => r.id === drag.id) < i ? -2 : 2}px 0 var(--tx)` : undefined
                }}
              >
                <SessionRow
                  s={s}
                  selected={s.id === selectedId}
                  onOpen={() => onOpen(s.id)}
                  onAllow={() => onAllow(s.id, s.askId)}
                  onPin={() => onPin(s.id)}
                />
              </div>
            </Fragment>
          ))}

        {undo && onUnarchive && (
          <div role="status" style={{ position: 'sticky', bottom: 12, alignSelf: 'center', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px 8px 14px', borderRadius: 10, background: 'var(--tx)', color: 'var(--panel)', fontSize: 12.5, boxShadow: 'var(--pop)' }}>
            <span style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Archived {undo.title}</span>
            <button
              onClick={() => {
                onUnarchive(undo.id)
                setUndo(null)
              }}
              style={{ fontWeight: 600, padding: '2px 8px', borderRadius: 6, cursor: 'pointer', color: 'var(--panel)', border: '1px solid currentColor' }}
            >
              Undo
            </button>
          </div>
        )}
        {isList && olderCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 6, margin: '18px 0 24px', height: 32, padding: '0 14px', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)', cursor: 'pointer', flexShrink: 0 }}
          >
            <Icon name="history" size={16} color="var(--tx3)" />
            Load all · {olderCount} older than {RECENT_DAYS} days
          </button>
        )}

        {state === 'loading' &&
          SKELETON.map(([w, w2], i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: SESSION_COLS,
                columnGap: 16,
                alignItems: 'center',
                padding: '10px 28px',
                height: 60,
                borderBottom: '1px solid var(--line-soft)',
                opacity: 1 - i * 0.1
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--hover)' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ height: 10, width: w, borderRadius: 4, background: 'var(--hover)' }} />
                <span style={{ height: 8, width: w2, borderRadius: 4, background: 'var(--hover)' }} />
              </div>
              <span style={{ height: 16, width: 62, borderRadius: 4, background: 'var(--hover)' }} />
              <span style={{ height: 8, width: 34, borderRadius: 4, background: 'var(--hover)' }} />
              <span style={{ height: 8, width: 44, borderRadius: 4, background: 'var(--hover)', justifySelf: 'end' }} />
              <span style={{ height: 8, width: 36, borderRadius: 4, background: 'var(--hover)', justifySelf: 'end' }} />
            </div>
          ))}

        {state === 'empty' && (
          <CenterState>
            <span
              className="ms"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: "300 24px/1 'Material Symbols Rounded'",
                color: 'var(--tx3)'
              }}
            >
              forum
            </span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>No sessions yet</div>
            <div style={{ maxWidth: 380, fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)', textWrap: 'pretty' }}>
              Start from a Jira task or a blank prompt. Claude works in your repo and asks before running commands or changing
              files.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <PrimaryButton hint="⌘N" onClick={onNew}>
                New session
              </PrimaryButton>
              <SecondaryButton hint="⌘2" onClick={onPickJira}>
                Pick a Jira task
              </SecondaryButton>
            </div>
          </CenterState>
        )}

        {state === 'error' && (
          <CenterState>
            <span
              className="ms"
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: 'var(--err-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                font: "400 24px/1 'Material Symbols Rounded'",
                color: 'var(--err)'
              }}
            >
              cloud_off
            </span>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Can’t reach the Claude runtime</div>
            <div style={{ maxWidth: 400, fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)', textWrap: 'pretty' }}>
              The local agent stopped responding. Your sessions are safe and will reappear as soon as it’s back.
            </div>
            {errorDetail && (
              <div
                className="selectable"
                style={{
                  font: "12px/1 'Geist Mono',monospace",
                  color: 'var(--tx3)',
                  background: 'var(--code)',
                  border: '1px solid var(--line-soft)',
                  borderRadius: 6,
                  padding: '7px 10px'
                }}
              >
                {errorDetail}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <PrimaryButton hint="⌘R" onClick={onRetry}>
                Retry
              </PrimaryButton>
              <SecondaryButton onClick={onViewLogs}>View logs</SecondaryButton>
            </div>
          </CenterState>
        )}
      </div>

      <div
        style={{
          height: 36,
          flexShrink: 0,
          borderTop: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 28px',
          fontSize: 12,
          color: 'var(--tx3)'
        }}
      >
        <KeyLegend k="↑↓" label="Navigate" />
        <KeyLegend k="↵" label="Open" />
        <KeyLegend k="Y" label="Allow" />
        <KeyLegend k="G W" label="Jump to next waiting" />
        <KeyLegend k="P" label="Pin" />
        <KeyLegend k="⌫" label="Archive" />
        <span style={{ flex: 1 }} />
        {isList && <span>{footer ?? `Today · ${sessions.length} sessions · $${total.toFixed(2)}`}</span>}
      </div>
    </main>
  )
}
