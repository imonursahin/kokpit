import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MODE_LABELS, MODES, type AskDecision, type LiveSession, type LiveState, type RunnerMode } from '@shared/runner'
import type { SessionDetailData } from '@shared/sessionDetail'
import type { SessionStatus } from '@shared/types'
import { relativeTime } from '@shared/time'
import { ApprovalCard } from '@/components/ApprovalCard'
import { DiffFileHeader, type DiffFile } from '@/components/DiffFileHeader'
import { Icon, KeyHint, Spinner } from '@/components/primitives'
import { Status } from '@/components/Status'
import { Markdown } from '@/components/Markdown'
import { StepRow, type Step } from '@/components/StepRow'
import { useSlashCommands } from '@/components/SlashCommands'
import { toDetailView, toRich } from '@/data/detailAdapter'
import {
  DIFF_FILES,
  DIFF_LINES,
  MODELS,
  PLAN,
  SESSION_DETAIL,
  THINKING,
  type DetailMode,
  type DetailView,
  type DiffLine,
  type Plan,
  type Rich, type TurnPart,
  type RightTab,
  type SessionHeader,
  type Turn
} from '@/mock/sessionDetail'

const MONO = "'Geist Mono',monospace"
const CODE: CSSProperties = { font: `12.5px ${MONO}`, background: 'var(--hover)', padding: '1px 5px', borderRadius: 4 }
const SMALL_KEY: CSSProperties = { font: `400 10.5px/1 ${MONO}`, color: 'var(--tx3)' }
const PRE: CSSProperties = {
  margin: 0,
  padding: '10px 12px',
  background: 'var(--code)',
  border: '1px solid var(--line-soft)',
  borderRadius: 7,
  font: `12px/1.6 ${MONO}`,
  color: 'var(--tx2)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere'
}

const TABS: { id: RightTab; label: string; key: string; code: string }[] = [
  { id: 'changes', label: 'Changes', key: '⌥1', code: 'Digit1' },
  { id: 'plan', label: 'Plan', key: '⌥2', code: 'Digit2' }
]

const LINE_BG = { '+': 'var(--add-bg)', '-': 'var(--del-bg)', '@': 'var(--hover)', ' ': 'transparent' } as const
const SIGN_FG = { '+': 'var(--ok)', '-': 'var(--err)', '@': 'var(--tx3)', ' ': 'var(--tx3)' } as const

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

function RichText({ parts, code }: { parts: Rich; code?: CSSProperties }) {
  return (
    <>
      {parts.map((p, i) =>
        typeof p === 'string' ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <span key={i} style={{ ...CODE, ...code }}>
            {p.code}
          </span>
        )
      )}
    </>
  )
}

function richToMarkdown(parts: Rich) {
  return parts.map((p) => (typeof p === 'string' ? p : `\`${p.code}\``)).join('')
}

function planToMarkdown(p: Plan) {
  const out = [`# ${p.title}`, '', ...(p.subtitle ? [`_${p.subtitle}_`, ''] : [])]
  for (const b of p.blocks) {
    if (b.kind === 'h2') out.push(`## ${b.text}`, '')
    else if (b.kind === 'p') out.push(richToMarkdown(b.text), '')
    else out.push(...b.items.map((it, i) => `${b.kind === 'ol' ? `${i + 1}.` : '-'} ${richToMarkdown(it)}`), '')
  }
  if (p.question) out.push(`> **Open question** ${p.question}`, '')
  return out.join('\n')
}

function IconButton({ icon, label, onClick, size = 18 }: { icon: string; label: string; onClick?: () => void; size?: number }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} style={{ display: 'flex', alignItems: 'center' }}>
      <Icon name={icon} size={size} color="var(--tx3)" />
    </button>
  )
}

function PanelButton({
  icon,
  hint,
  primary,
  onClick,
  children
}: {
  icon?: string
  hint?: string
  primary?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: primary ? 8 : 7,
        height: 32,
        padding: primary ? '0 10px 0 12px' : '0 9px 0 10px',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...(primary ? { background: 'var(--pri)', color: 'var(--inv)' } : { border: '1px solid var(--line)' })
      }}
    >
      {icon && <Icon name={icon} size={16} color="var(--tx2)" />}
      {children}
      {hint && <KeyHint inverted={primary}>{hint}</KeyHint>}
    </button>
  )
}

function PanelFooter({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--line)',
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}
    >
      {children}
    </div>
  )
}

function Avatar({ initials }: { initials: string }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: 'var(--hover)',
        border: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 9,
        fontWeight: 600,
        color: 'var(--tx2)',
        flexShrink: 0
      }}
    >
      {initials}
    </span>
  )
}

function Pill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 7px',
        border: '1px solid var(--line)',
        borderRadius: 10,
        color: 'var(--tx2)'
      }}
    >
      {children}
    </span>
  )
}

function ExternalLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      {label}
      <Icon name="open_in_new" size={14} />
    </button>
  )
}

function ComposerChip({
  icon,
  prefix,
  value,
  options,
  onChange
}: {
  icon?: string
  prefix?: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: icon ? 5 : 4,
          height: 28,
          padding: icon ? '0 6px 0 8px' : '0 6px 0 9px',
          borderRadius: 7,
          border: '1px solid var(--line)',
          fontSize: 12.5,
          color: 'var(--tx)',
          whiteSpace: 'nowrap'
        }}
      >
        {icon && <Icon name={icon} size={15} color="var(--tx3)" />}
        {prefix}
        {value}
        <Icon name="expand_more" size={16} color="var(--tx3)" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            bottom: 34,
            left: 0,
            minWidth: 160,
            background: 'var(--panel)',
            borderRadius: 9,
            boxShadow: 'var(--pop)',
            border: '1px solid var(--line)',
            padding: 4,
            zIndex: 20
          }}
        >
          {options.map((o) => (
            <button
              key={o}
              className="menu-item"
              onClick={() => {
                onChange(o)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                height: 28,
                padding: '0 8px',
                borderRadius: 6,
                fontSize: 12.5,
                textAlign: 'left',
                color: 'var(--tx)'
              }}
            >
              <span style={{ flex: 1 }}>{o}</span>
              {o === value && <Icon name="check" size={15} color="var(--tx2)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EditableTitle({ title, onRename }: { title: string; onRename?: (t: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const style: CSSProperties = { fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  if (!editing || !onRename)
    return (
      <span
        className="no-drag"
        style={{ ...style, cursor: onRename ? 'text' : undefined }}
        title={onRename ? 'Double-click to rename' : undefined}
        onDoubleClick={() => {
          if (!onRename) return
          setValue(title)
          setError(null)
          setEditing(true)
        }}
      >
        {title}
      </span>
    )
  const commit = () => {
    const t = value.trim()
    if (!t || t === title) return setEditing(false)
    onRename(t)
      .then(() => setEditing(false))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }
  return (
    <span className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: '0 1 520px' }}>
      <input
        autoFocus
        aria-label="Session title"
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        style={{ ...style, flex: 1, minWidth: 0, height: 28, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 6, background: 'var(--panel)', color: 'var(--tx)', font: 'inherit', fontSize: 15, fontWeight: 600 }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--err)', whiteSpace: 'nowrap' }}>{error}</span>}
    </span>
  )
}

function Header({
  h,
  linkPlaceholders,
  panelOpen,
  onBack,
  onOpenPanel,
  onRename,
  onDelete
}: {
  h: SessionHeader
  linkPlaceholders: boolean
  panelOpen: boolean
  onBack: () => void
  onOpenPanel: () => void
  onRename?: (t: string) => Promise<void>
  onDelete?: () => void
}) {
  const chip: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    height: 24,
    padding: '0 8px',
    border: '1px solid var(--line)',
    borderRadius: 6,
    background: 'var(--panel)'
  }
  return (
    <header
      className="drag"
      style={{
        flexShrink: 0,
        padding: '12px 20px',
        borderBottom: '1px solid var(--line)',
        background: 'var(--panel)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <IconButton icon="arrow_back" label="Back to sessions" onClick={onBack} />
        <button onClick={onBack} style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
          Sessions
        </button>
        <span style={{ color: 'var(--tx3)' }}>/</span>
        <EditableTitle key={h.title} title={h.title} onRename={onRename} />
        <Status status={h.status} label />
        <span style={{ flex: 1 }} />
        {h.context && <ContextMeter used={h.context.used} window={h.context.window} />}
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{h.elapsed}</span>
        <span style={{ font: `12.5px/1 ${MONO}`, color: 'var(--tx2)' }}>{h.cost}</span>
        <span style={{ width: 1, height: 18, background: 'var(--line)' }} />
        {!panelOpen && <IconButton icon="right_panel_open" label="Show panel" onClick={onOpenPanel} />}
        {onDelete ? (
          <IconButton icon="delete" label="Delete session" onClick={onDelete} />
        ) : (
          <IconButton icon="more_horiz" label="More" onClick={() => console.log('session menu')} />
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--tx2)', paddingLeft: 28 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: MONO }}>
          <Icon name="folder" size={15} color="var(--tx3)" />
          {h.repo}
          <span style={{ color: 'var(--tx3)' }}>/</span>
          {h.branch}
        </span>
        {(linkPlaceholders || h.jira || h.pr) && <span style={{ color: 'var(--line)' }}>|</span>}
        {h.jira ? (
          <span style={chip}>
            <Icon name="task_alt" size={14} color="var(--run)" />
            <span style={{ font: `500 11.5px/1 ${MONO}`, color: 'var(--tx)' }}>{h.jira.key}</span>
            {h.jira.title && (
              <span style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.jira.title}</span>
            )}
          </span>
        ) : (
          linkPlaceholders && (
            <button
              onClick={() => console.log('link jira')}
              style={{ ...chip, background: 'transparent', border: '1px dashed var(--tx3)', color: 'var(--tx)' }}
            >
              <Icon name="add_link" size={15} color="var(--tx2)" />
              Link to Jira task
              <span style={SMALL_KEY}>⌘J</span>
            </button>
          )
        )}
        {h.pr ? (
          <span style={chip}>
            <Icon name="merge" size={14} color="var(--tx3)" />
            <span style={{ font: `500 11.5px/1 ${MONO}`, color: 'var(--tx)' }}>{h.pr.number}</span>
            {h.pr.state}
            {h.pr.checks && (
              <>
                <span style={{ color: 'var(--tx3)' }}>·</span>
                <span style={{ color: 'var(--ok)' }}>{h.pr.checks}</span>
              </>
            )}
          </span>
        ) : (
          linkPlaceholders && <span style={{ color: 'var(--tx3)' }}>No PR yet</span>
        )}
      </div>
    </header>
  )
}

const richToText = (r: Rich) => r.map((p) => (typeof p === 'string' ? p : `\`${p.code}\``)).join('')
const sameMessage = (a: string, b: string) => a.trim().slice(0, 200) === b.trim().slice(0, 200)

const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}k`)

function ContextMeter({ used, window }: { used: number; window: number }) {
  const pct = Math.min(100, Math.round((used / window) * 100))
  const color = pct >= 90 ? 'var(--err)' : pct >= 80 ? 'var(--wait-tx)' : 'var(--tx2)'
  const tip = `Context: about ${tokens(used)} of ${tokens(window)} tokens. Claude compacts on its own when it fills up; send /compact to free space now.`
  return (
    <span
      title={tip}
      aria-label={tip}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color, whiteSpace: 'nowrap', cursor: 'default' }}
    >
      <span style={{ width: 54, height: 5, borderRadius: 3, background: 'var(--hover)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', borderRadius: 3, background: pct >= 80 ? color : 'var(--tx3)' }} />
      </span>
      Context {pct}%{pct >= 80 ? ' · /compact' : ''}
    </span>
  )
}

function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

function WorkingRow({ since, busyTool }: { since?: string; busyTool: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const start = since ? Date.parse(since) : NaN
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx2)', flexShrink: 0 }}>
      <Spinner size={12} />
      <span>{busyTool ? 'Working…' : 'Thinking…'}</span>
      {Number.isFinite(start) && <span style={{ color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel(now - start)}</span>}
    </div>
  )
}

const STEP_NOUN: Record<Step['kind'], [string, string]> = {
  command: ['command', 'commands'],
  read: ['read', 'reads'],
  edit: ['edit', 'edits'],
  create: ['new file', 'new files'],
  search: ['search', 'searches'],
  fetch: ['fetch', 'fetches'],
  jira: ['Jira call', 'Jira calls']
}

function stepSummary(steps: Step[]): string {
  const counts = new Map<Step['kind'], number>()
  for (const st of steps) counts.set(st.kind, (counts.get(st.kind) ?? 0) + 1)
  const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${STEP_NOUN[k][n === 1 ? 0 : 1]}`)
  return `${steps.length} steps · ${parts.join(', ')}`
}

function StepGroup({ steps }: { steps: Step[] }) {
  const [open, setOpen] = useState(false)
  if (steps.length <= 3)
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {steps.map((st, i) => (
          <StepRow key={i} step={st} />
        ))}
      </div>
    )
  const running = steps.filter((st) => st.state === 'running')
  const errors = steps.filter((st) => st.state === 'error').length
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="step-row"
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 8px', margin: '0 -8px', borderRadius: 6, fontSize: 12.5, color: 'var(--tx2)', textAlign: 'left' }}
      >
        <Icon name={running.length ? 'progress_activity' : 'checklist'} size={16} color={running.length ? 'var(--run)' : 'var(--tx3)'} />
        <span>{stepSummary(steps)}</span>
        {errors > 0 && <span style={{ color: 'var(--err)' }}>· {errors} failed</span>}
        <span style={{ flex: 1 }} />
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} color="var(--tx3)" />
      </button>
      {(open ? steps : running).map((st, i) => (
        <div key={i} style={{ paddingLeft: open ? 14 : 0 }}>
          <StepRow step={st} />
        </div>
      ))}
    </div>
  )
}

function OrderedParts({ parts }: { parts: TurnPart[] }) {
  const final = parts[parts.length - 1]?.kind === 'text' ? parts.length - 1 : -1
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {parts.map((p, i) =>
        p.kind === 'steps' ? (
          <StepGroup key={i} steps={p.steps} />
        ) : i === final ? (
          <Markdown key={i} source={p.text} size={13.5} />
        ) : (
          <Markdown key={i} source={p.text} size={12.5} muted />
        )
      )}
    </div>
  )
}

function TurnView({ turn }: { turn: Turn }) {
  if (turn.kind === 'earlier')
    return (
      <div
        style={{
          alignSelf: 'center',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 26,
          padding: '0 10px',
          border: '1px solid var(--line)',
          borderRadius: 13,
          fontSize: 12,
          color: 'var(--tx3)',
          background: 'var(--panel)',
          flexShrink: 0
        }}
      >
        <Icon name="unfold_less" size={15} />
        {turn.text}
      </div>
    )
  if (turn.kind === 'user')
    return (
      <div
        className="selectable"
        style={{
          alignSelf: 'flex-end',
          maxWidth: '84%',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '12px 12px 4px 12px',
          padding: '10px 14px',
          fontSize: 13.5,
          lineHeight: 1.55,
          textWrap: 'pretty',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          flexShrink: 0
        }}
      >
        <RichText parts={turn.text} />
      </div>
    )
  if (turn.kind === 'ask')
    return (
      <ApprovalCard
        request={turn.request}
        onAllow={() => console.log('allow once')}
        onAlwaysAllow={() => console.log('always allow', turn.request)}
        onDeny={() => console.log('deny')}
        onAnswer={(key) => console.log('answer', key)}
        onViewDiff={() => console.log('view diff')}
      />
    )
  const m = turn.meta
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
      {turn.name && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>Claude</div>}
      {turn.parts?.length ? (
        <OrderedParts parts={turn.parts} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {turn.steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
        </div>
      )}
      {turn.parts?.length ? null : turn.output ? (
        <div
          className="selectable"
          style={{
            padding: '12px 14px',
            background: 'var(--code)',
            border: '1px solid var(--line-soft)',
            borderRadius: 9,
            fontSize: 13,
            lineHeight: 1.6,
            color: 'var(--tx)',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere'
          }}
        >
          {turn.output}
        </div>
      ) : turn.markdown ? (
        <Markdown source={turn.markdown} size={13.5} />
      ) : turn.blocks?.length ? (
        <div
          className="selectable"
          style={{ fontSize: 13.5, lineHeight: 1.6, textWrap: 'pretty', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {turn.blocks.map((b, i) =>
            b.kind === 'pre' ? (
              <pre key={i} style={PRE}>
                {b.text}
              </pre>
            ) : (
              <div key={i} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                <RichText parts={b.text} />
              </div>
            )
          )}
        </div>
      ) : (
        turn.text && (
          <div className="selectable" style={{ fontSize: 13.5, lineHeight: 1.6, textWrap: 'pretty' }}>
            <RichText parts={turn.text} />
          </div>
        )
      )}
      {m && (
        <div style={{ display: 'flex', gap: 8, fontSize: 11.5, color: 'var(--tx3)' }}>
          {[m.model, m.thinking && `Thinking: ${m.thinking}`, m.time, m.cost].filter(Boolean).map((t, i) => (
            <Fragment key={`${i}-${t}`}>
              {i > 0 && <span>·</span>}
              <span style={t === m.cost ? { fontFamily: MONO } : undefined}>{t}</span>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

function CommentEditor({
  label,
  initial,
  onSave,
  onCancel,
  onDelete
}: {
  label: string
  initial: string
  onSave: (t: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [t, setT] = useState(initial)
  return (
    <div
      style={{
        margin: '8px 16px 10px 56px',
        border: '1px solid var(--line)',
        borderRadius: 9,
        background: 'var(--panel)',
        boxShadow: 'var(--shadow)',
        fontFamily: 'Geist,sans-serif',
        padding: '9px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        position: 'sticky',
        left: 0,
        width: 440,
        maxWidth: 'calc(100% - 72px)'
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{label}</span>
      <textarea
        autoFocus
        className="bare"
        value={t}
        onChange={(e) => setT(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && e.metaKey && t.trim()) onSave(t.trim())
        }}
        placeholder="What should Claude change here?"
        rows={3}
        style={{ font: '13px/1.5 Geist,sans-serif', color: 'var(--tx)', background: 'none', border: 0, outline: 'none', resize: 'vertical' }}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {onDelete && (
          <button onClick={onDelete} style={{ marginRight: 'auto', fontSize: 12.5, fontWeight: 500, color: 'var(--err)', padding: '0 4px' }}>
            Delete
          </button>
        )}
        <PanelButton onClick={onCancel}>Cancel</PanelButton>
        <PanelButton primary hint="⌘↵" onClick={() => t.trim() && onSave(t.trim())}>
          Save comment
        </PanelButton>
      </div>
    </div>
  )
}

function DiffRow({ l, onLineClick, editor }: { l: DiffLine; onLineClick?: () => void; editor?: ReactNode }) {
  return (
    <>
      <div
        className="selectable"
        style={{
          display: 'grid',
          gridTemplateColumns: '38px 38px 18px 1fr',
          paddingRight: 16,
          font: `12px/20px ${MONO}`,
          background: LINE_BG[l.sign],
          color: l.sign === '@' ? 'var(--tx3)' : 'var(--tx)'
        }}
      >
        <span
          role={onLineClick ? 'button' : undefined}
          title={onLineClick ? 'Comment on this line' : undefined}
          onClick={onLineClick}
          style={{ textAlign: 'right', paddingRight: 6, color: 'var(--tx3)', cursor: onLineClick ? 'pointer' : undefined }}
        >
          {l.o}
        </span>
        <span
          role={onLineClick ? 'button' : undefined}
          onClick={onLineClick}
          style={{ textAlign: 'right', paddingRight: 6, color: 'var(--tx3)', cursor: onLineClick ? 'pointer' : undefined }}
        >
          {l.n}
        </span>
        <span style={{ color: SIGN_FG[l.sign], textAlign: 'center' }}>{l.sign}</span>
        <span style={{ whiteSpace: 'pre' }}>{l.t}</span>
      </div>
      {l.comment && (
        <div
          style={{
            margin: '8px 16px 10px 56px',
            border: '1px solid var(--line)',
            borderRadius: 9,
            background: 'var(--panel)',
            boxShadow: 'var(--shadow)',
            fontFamily: 'Geist,sans-serif',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px 0' }}>
            <Avatar initials={l.comment.initials} />
            <span style={{ fontSize: 12.5, fontWeight: 500 }}>{l.comment.author}</span>
            <span style={{ fontSize: 12, color: 'var(--tx3)' }}>on line {l.n}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: 'var(--run)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="forward_to_inbox" size={14} />
              Sends to Claude on continue
            </span>
          </div>
          <div
            className="selectable"
            style={{ padding: '6px 12px 11px 40px', fontSize: 13, lineHeight: 1.5, color: 'var(--tx)', textWrap: 'pretty' }}
          >
            <RichText parts={l.comment.body} code={{ font: `12px ${MONO}`, padding: '1px 4px' }} />
          </div>
        </div>
      )}
      {editor}
    </>
  )
}

function ChangesPanel({
  files,
  lines,
  note,
  collapsed,
  onSelectFile,
  onToggleFile,
  onToggleTests,
  onToggleCollapse,
  onContinue,
  onRevert,
  revertLabel = 'Revert',
  onComment,
  commentCount,
  onLineClick,
  lineEditor,
  fileEditor,
  message
}: {
  files: DiffFile[]
  lines: DiffLine[]
  note?: string
  collapsed: boolean
  onSelectFile?: (path: string) => void
  onToggleFile: (path: string) => void
  onToggleTests: () => void
  onToggleCollapse: () => void
  onContinue: () => void
  onRevert?: () => void
  revertLabel?: string
  onComment?: () => void
  commentCount?: number
  onLineClick?: (index: number) => void
  lineEditor?: (index: number) => ReactNode
  fileEditor?: ReactNode
  message?: { tone: 'ok' | 'err'; text: string } | null
}) {
  const included = files.filter((f) => f.included)
  const add = included.reduce((n, f) => n + f.add, 0)
  const del = included.reduce((n, f) => n + f.del, 0)
  const tests = files.filter((f) => f.test)
  const testsOn = tests.length > 0 && tests.every((f) => f.included)
  const comments = files.reduce((n, f) => n + (f.comments ?? 0), 0)
  const visible = testsOn ? files : files.filter((f) => !f.test)
  const hiddenTests = testsOn ? 0 : tests.length
  const active = visible.find((f) => f.active)

  return (
    <>
      {note && <div style={{ padding: '8px 18px 0', fontSize: 11.5, color: 'var(--tx3)', flexShrink: 0 }}>{note}</div>}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          fontSize: 12.5,
          color: 'var(--tx2)',
          borderBottom: '1px solid var(--line-soft)',
          flexShrink: 0
        }}
      >
        <span>
          <span style={{ color: 'var(--tx)', fontWeight: 500 }}>
            {included.length} of {visible.length} files
          </span>{' '}
          included
          {hiddenTests > 0 && (
            <span style={{ color: 'var(--tx3)' }}>
              {' '}
              · {hiddenTests} test{hiddenTests === 1 ? '' : 's'} hidden
            </span>
          )}
        </span>
        <span style={{ font: `12px ${MONO}`, color: 'var(--ok)' }}>+{add}</span>
        <span style={{ font: `12px ${MONO}`, color: 'var(--err)' }}>−{del}</span>
        <span style={{ flex: 1 }} />
        <button
          role="switch"
          aria-checked={testsOn}
          onClick={onToggleTests}
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--tx2)' }}
        >
          Include tests<span style={{ color: 'var(--tx3)' }}>{tests.length}</span>
          <span
            style={{
              width: 28,
              height: 16,
              borderRadius: 8,
              background: testsOn ? 'var(--pri)' : 'var(--line)',
              position: 'relative',
              display: 'inline-block'
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: testsOn ? 14 : 2,
                top: 2,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: 'var(--panel)',
                boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                transition: 'left .12s'
              }}
            />
          </span>
          <span style={SMALL_KEY}>⌘T</span>
        </button>
      </div>
      <div style={{ flexShrink: 0, maxHeight: active ? '38%' : 'none', flexGrow: active ? 0 : 1, minHeight: 0, overflow: 'auto', borderBottom: '1px solid var(--line)' }}>
        {visible.map((f) =>
          onSelectFile ? (
            <div key={f.path} role="button" onClick={() => onSelectFile(f.path)}>
              <DiffFileHeader f={f} onToggleInclude={() => onToggleFile(f.path)} />
            </div>
          ) : (
            <DiffFileHeader key={f.path} f={f} onToggleInclude={() => onToggleFile(f.path)} />
          )
        )}
      </div>
      {active && (
        <div style={{ flexShrink: 0 }}>
          <DiffFileHeader
            f={active}
            expanded
            collapsed={collapsed}
            onToggleInclude={() => onToggleFile(active.path)}
            onToggleCollapse={onToggleCollapse}
          />
        </div>
      )}
      {active && (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {fileEditor}
          {!collapsed && (
            <div style={{ width: 'max-content', minWidth: '100%', display: 'flex', flexDirection: 'column' }}>
              {lines.map((l, i) => (
                <DiffRow
                  key={i}
                  l={l}
                  onLineClick={onLineClick && l.sign !== '@' ? () => onLineClick(i) : undefined}
                  editor={lineEditor?.(i)}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <PanelFooter>
        <PanelButton icon="undo" hint="⌘Z" onClick={onRevert ?? (() => console.log('revert'))}>
          {revertLabel}
        </PanelButton>
        <PanelButton icon="chat_bubble" hint="C" onClick={onComment ?? (() => console.log('comment to claude'))}>
          Comment to Claude
        </PanelButton>
        <span style={{ flex: 1 }} />
        {message && (
          <span
            style={{
              fontSize: 12,
              color: message.tone === 'err' ? 'var(--err)' : 'var(--ok)',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={message.text}
          >
            {message.text}
          </span>
        )}
        {comments > 0 && (
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
            +{comments} comment{comments === 1 ? '' : 's'}
          </span>
        )}
        <PanelButton primary hint="⌘↵" onClick={onContinue}>
          Continue with {included.length} files
        </PanelButton>
      </PanelFooter>
    </>
  )
}

function PlanPanel({
  plan,
  view,
  text,
  onView,
  onText,
  onApprove,
  onSave,
  onAddToJira,
  jiraLabel = 'Add to Jira task…',
  message
}: {
  plan: Plan
  view: 'edit' | 'preview'
  text: string
  onView: (v: 'edit' | 'preview') => void
  onText: (t: string) => void
  onApprove: () => void
  onSave?: () => void
  onAddToJira?: () => void
  jiraLabel?: string
  message?: { tone: 'ok' | 'err'; text: string } | null
}) {
  const listCode: CSSProperties = { color: 'var(--tx)' }
  const seg = (on: boolean): CSSProperties => ({
    height: 22,
    padding: '0 9px',
    display: 'flex',
    alignItems: 'center',
    ...(on
      ? { background: 'var(--panel)', borderRadius: 5, boxShadow: '0 0 0 1px var(--line)', color: 'var(--tx)', fontWeight: 500 }
      : { color: 'var(--tx2)' })
  })

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 18px',
          fontSize: 12.5,
          color: 'var(--tx2)',
          borderBottom: '1px solid var(--line-soft)',
          flexShrink: 0
        }}
      >
        <Icon name="description" size={16} color="var(--tx3)" />
        <span style={{ font: `12px ${MONO}`, color: 'var(--tx)' }}>{plan.file}</span>
        <span style={{ color: 'var(--tx3)' }}>{plan.meta}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', padding: 2, background: 'var(--hover)', borderRadius: 7, fontSize: 12 }}>
          <button style={seg(view === 'edit')} onClick={() => onView('edit')}>
            Edit
          </button>
          <button style={seg(view === 'preview')} onClick={() => onView('preview')}>
            Preview
          </button>
        </span>
      </div>
      {view === 'edit' ? (
        <textarea
          className="selectable"
          value={text}
          onChange={(e) => onText(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            minHeight: 0,
            padding: '26px 36px',
            border: 0,
            outline: 'none',
            resize: 'none',
            background: 'var(--panel)',
            color: 'var(--tx)',
            font: `12.5px/1.65 ${MONO}`
          }}
        />
      ) : (
        <div
          className="selectable"
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '26px 36px',
            fontSize: 13.5,
            lineHeight: 1.65,
            color: 'var(--tx)',
            textWrap: 'pretty'
          }}
        >
          {plan.title && (
            <h1 style={{ margin: '0 0 6px', fontSize: 21, lineHeight: 1.3, fontWeight: 600, letterSpacing: '-.01em' }}>{plan.title}</h1>
          )}
          {plan.subtitle && <div style={{ fontSize: 12, color: 'var(--tx3)', marginBottom: 18 }}>{plan.subtitle}</div>}
          {plan.blocks.map((b, i) => {
            const mb = i === plan.blocks.length - 1 ? 18 : 16
            if (b.kind === 'h2')
              return (
                <h2 key={i} style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600 }}>
                  {b.text}
                </h2>
              )
            if (b.kind === 'p')
              return (
                <p key={i} style={{ margin: `0 0 ${mb}px`, color: 'var(--tx2)' }}>
                  <RichText parts={b.text} />
                </p>
              )
            const List = b.kind
            return (
              <List
                key={i}
                style={{
                  margin: `0 0 ${mb}px`,
                  paddingLeft: 20,
                  color: 'var(--tx2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4
                }}
              >
                {b.items.map((it, j) => (
                  <li key={j}>
                    <RichText parts={it} code={listCode} />
                  </li>
                ))}
              </List>
            )
          })}
          {plan.question && (
            <div
              style={{
                border: '1px solid var(--wait-line)',
                background: 'var(--wait-bg)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                gap: 10
              }}
            >
              <Icon name="help" size={17} color="var(--wait-tx)" style={{ marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 600, color: 'var(--wait-tx)', fontSize: 13 }}>Open question</div>
                <div style={{ color: 'var(--tx)', fontSize: 13 }}>{plan.question}</div>
              </div>
            </div>
          )}
        </div>
      )}
      <PanelFooter>
        {view === 'edit' && onSave ? (
          <PanelButton icon="save" hint="⌘S" onClick={onSave}>
            Save
          </PanelButton>
        ) : (
          <PanelButton icon="edit" hint="E" onClick={() => onView('edit')}>
            Edit
          </PanelButton>
        )}
        <PanelButton icon="task_alt" hint="J" onClick={onAddToJira ?? (() => console.log('add plan to jira'))}>
          {jiraLabel}
        </PanelButton>
        <span style={{ flex: 1 }} />
        {message && (
          <span style={{ fontSize: 12, color: message.tone === 'err' ? 'var(--err)' : 'var(--ok)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={message.text}>
            {message.text}
          </span>
        )}
        <PanelButton primary hint="⌘↵" onClick={onApprove}>
          Approve and implement
        </PanelButton>
      </PanelFooter>
    </>
  )
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12.5,
        color: 'var(--tx3)'
      }}
    >
      {text}
    </div>
  )
}

type LiveProps = {
  live?: LiveSession
  onSend?: (text: string, opts?: { model?: string; effort?: string; mode?: RunnerMode }) => Promise<void>
  onMode?: (mode: RunnerMode) => Promise<void>
  permissionMode?: RunnerMode
  onStop?: () => void
  onRespond?: (requestId: string, decision: AskDecision) => void
  onRevert?: (path: string) => Promise<string>
  onSavePlan?: (body: string) => Promise<void>
  onAddToJira?: (body: string) => Promise<string>
  onAttach?: () => Promise<string[]>
  onRename?: (title: string) => Promise<void>
  onDelete?: () => Promise<void>
  modelOptions?: { id: string; label: string }[]
  effortOptions?: string[]
  defaultEffort?: string
}

const LIVE_STATUS: Record<LiveState, SessionStatus> = {
  starting: 'running',
  running: 'running',
  waiting: 'waiting',
  idle: 'done',
  error: 'error'
}

const WORKING = 'Claude is working — type to queue a message…'

function Detail({
  data,
  onBack,
  live,
  onSend,
  onStop,
  onRespond,
  onRevert,
  onSavePlan,
  onAddToJira,
  onAttach,
  onRename,
  onDelete,
  modelOptions,
  effortOptions,
  defaultEffort,
  onMode,
  permissionMode
}: { data: DetailView; onBack: () => void } & LiveProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleting = useRef(false)
  const deleteSession = () => {
    if (!onDelete || deleting.current) return
    deleting.current = true
    setDeleteError(null)
    onDelete()
      .catch((err: unknown) => setDeleteError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        deleting.current = false
      })
  }
  const [tab, setTab] = useState<RightTab>(data.tab)
  const [panelOpen, setPanelOpen] = useState(true)
  const [files, setFiles] = useState(data.files)
  const [diffCollapsed, setDiffCollapsed] = useState(false)
  const [planView, setPlanView] = useState<'edit' | 'preview'>('preview')
  const [planText, setPlanText] = useState(() => data.planMarkdown ?? (data.plan ? planToMarkdown(data.plan) : ''))
  const [text, setText] = useState('')
  const [outbox, setOutbox] = useState<{ id: number; text: string; before: number }[]>([])
  const sentTexts = useMemo(() => data.turns.flatMap((t) => (t.kind === 'user' ? [richToText(t.text)] : [])), [data.turns])
  const countSent = (t: string) => sentTexts.filter((x) => sameMessage(x, t)).length
  useEffect(() => {
    setOutbox((o) => o.filter((m) => Date.now() - m.id < 600_000 && sentTexts.filter((x) => sameMessage(x, m.text)).length <= m.before))
  }, [sentTexts])
  const slash = useSlashCommands(text, setText, 'above')
  const [model, setModel] = useState(data.model)
  const [thinking, setThinking] = useState(defaultEffort ?? data.thinking)
  const [mode, setMode] = useState<RunnerMode>(permissionMode ?? 'default')
  useEffect(() => {
    if (permissionMode) setMode(permissionMode)
  }, [permissionMode])
  const pickMode = (next: RunnerMode) => {
    setMode(next)
    onMode?.(next).catch((err: unknown) => {
      if (!alive.current) return
      setMode(permissionMode ?? 'default')
      setSendError(err instanceof Error ? err.message : String(err))
    })
  }
  const [planMsg, setPlanMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [jiraArmed, setJiraArmed] = useState(false)
  const [running, setRunning] = useState(data.running)
  const [sendError, setSendError] = useState<string | null>(null)
  const sending = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => setRunning(data.running), [data.running])
  useEffect(
    () =>
      setFiles((prev) => {
        const old = new Map(prev.map((f) => [f.path, f]))
        const activePath = prev.find((f) => f.active)?.path
        const keep = data.files.some((f) => f.path === activePath)
        return data.files.map((f) => ({
          ...f,
          included: old.get(f.path)?.included ?? f.included,
          active: keep ? f.path === activePath : f.active
        }))
      }),
    [data.files]
  )

  const showChanges = panelOpen && tab === 'changes' && data.hasChanges
  const showPlan = panelOpen && tab === 'plan' && data.hasPlan
  const activeFile = files.find((f) => f.active)
  const rawLines = (activeFile && data.diff[activeFile.path]) ?? []
  const [notes, setNotes] = useState<Record<string, Record<string, string>>>({})
  const [editing, setEditing] = useState<{ path: string; key: string } | null>(null)
  const [revertArmed, setRevertArmed] = useState<string | null>(null)
  const [panelMsg, setPanelMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const fileNotes = (activeFile && notes[activeFile.path]) || {}
  const activeLines = useMemo(
    () =>
      rawLines.map((l, i) => {
        const note = fileNotes[`L${i}`]
        return note ? { ...l, comment: { initials: 'You', author: 'You', body: [note] } } : l
      }),
    [rawLines, fileNotes]
  )
  const noteCount = Object.values(notes).reduce((n, m) => n + Object.keys(m).length, 0)

  const saveNote = (path: string, key: string, t: string) => {
    setNotes((all) => ({ ...all, [path]: { ...(all[path] ?? {}), [key]: t } }))
    setEditing(null)
  }
  const dropNote = (path: string, key: string) => {
    setNotes((all) => {
      const next = { ...(all[path] ?? {}) }
      delete next[key]
      return { ...all, [path]: next }
    })
    setEditing(null)
  }
  const editorFor = (key: string, label: string): ReactNode =>
    activeFile && editing?.path === activeFile.path && editing.key === key ? (
      <CommentEditor
        key={`${activeFile.path}:${key}`}
        label={label}
        initial={fileNotes[key] ?? ''}
        onSave={(t) => saveNote(activeFile.path, key, t)}
        onCancel={() => (fileNotes[key] ? setEditing(null) : dropNote(activeFile.path, key))}
        onDelete={fileNotes[key] ? () => dropNote(activeFile.path, key) : undefined}
      />
    ) : key === 'file' && activeFile && fileNotes['file'] ? (
      <div
        role="button"
        onClick={() => setEditing({ path: activeFile.path, key: 'file' })}
        style={{
          margin: '8px 16px',
          padding: '8px 8px 8px 12px',
          border: '1px solid var(--line)',
          borderRadius: 9,
          fontSize: 13,
          background: 'var(--panel)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          cursor: 'pointer'
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Your note on this file · </span>
          {fileNotes['file']}
        </span>
        <button
          aria-label="Delete note"
          title="Delete note"
          className="menu-item"
          onClick={(e) => {
            e.stopPropagation()
            dropNote(activeFile.path, 'file')
          }}
          style={{ display: 'flex', borderRadius: 6, padding: 2, flexShrink: 0 }}
        >
          <Icon name="close" size={16} color="var(--tx3)" />
        </button>
      </div>
    ) : null
  const commentOnActive = () => {
    if (activeFile) setEditing({ path: activeFile.path, key: 'file' })
  }
  const lineClick = (i: number) => {
    if (activeFile) setEditing({ path: activeFile.path, key: `L${i}` })
  }

  const selectFile = (path: string) => {
    setFiles((fs) => fs.map((f) => ({ ...f, active: f.path === path })))
    setDiffCollapsed(false)
  }
  const toggleFile = (path: string) =>
    setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, included: !f.included } : f)))
  const toggleTests = () =>
    setFiles((fs) => {
      const on = !fs.filter((f) => f.test).every((f) => f.included)
      return fs.map((f) => (f.test ? { ...f, included: on } : f))
    })
  const stop = () => {
    if (onStop) return onStop()
    console.log('stop')
    setRunning(false)
  }
  const send = () => {
    const t = text.trim()
    if (!t) return
    if (!onSend) {
      console.log(running ? 'queue message' : 'send message', { text: t, model, thinking })
      setText('')
      return
    }
    if (sending.current) return
    sending.current = true
    setSendError(null)
    const modelId = modelOptions?.find((m) => m.label === model)?.id
    const id = Date.now()
    setOutbox((o) => [...o, { id, text: t, before: countSent(t) }])
    setText('')
    onSend(t, modelOptions ? { model: modelId, effort: thinking.toLowerCase(), mode } : undefined)
      .catch((err: unknown) => {
        if (!alive.current) return
        setOutbox((o) => o.filter((m) => m.id !== id))
        setText((cur) => cur || t)
        setSendError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        sending.current = false
      })
  }
  const errorLine = sendError ?? live?.lastError
  const continueWith = () => {
    const keep = files.filter((f) => f.included).map((f) => f.path)
    const drop = files.filter((f) => !f.included).map((f) => f.path)
    const parts: string[] = ['Review of your changes:']
    if (keep.length) parts.push(`Keep: ${keep.join(', ')}`)
    if (drop.length) parts.push(`Undo the changes in: ${drop.join(', ')}`)
    const commentLines: string[] = []
    for (const [path, m] of Object.entries(notes)) {
      const lines = data.diff[path] ?? []
      for (const [key, t] of Object.entries(m)) {
        if (key === 'file') commentLines.push(`- ${path}: ${t}`)
        else {
          const l = lines[Number(key.slice(1))]
          const at = l ? ` line ${l.n || l.o}${l.t.trim() ? ` (\`${l.t.trim().slice(0, 80)}\`)` : ''}` : ''
          commentLines.push(`- ${path}${at}: ${t}`)
        }
      }
    }
    if (commentLines.length) parts.push('Comments:', ...commentLines)
    if (!drop.length && !commentLines.length) parts.push('Looks good, continue.')
    const message = parts.join('\n')
    if (!onSend) {
      console.log('continue', message)
      return
    }
    setPanelMsg(null)
    onSend(message)
      .then(() => {
        if (!alive.current) return
        setNotes({})
        setPanelMsg({ tone: 'ok', text: 'Sent to Claude' })
      })
      .catch((err: unknown) => alive.current && setPanelMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) }))
  }
  const revertActive = () => {
    if (!activeFile) return
    if (!onRevert) {
      console.log('revert', activeFile.path)
      return
    }
    if (revertArmed !== activeFile.path) {
      setRevertArmed(activeFile.path)
      window.setTimeout(() => alive.current && setRevertArmed((p) => (p === activeFile.path ? null : p)), 4000)
      return
    }
    const path = activeFile.path
    setRevertArmed(null)
    onRevert(path)
      .then((how) => {
        if (!alive.current) return
        setFiles((fs) => fs.filter((f) => f.path !== path))
        setPanelMsg({ tone: 'ok', text: how === 'trashed' ? `Moved ${path.split('/').pop()} to Trash` : `Reverted ${path.split('/').pop()}` })
      })
      .catch((err: unknown) => alive.current && setPanelMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) }))
  }
  const approvePlan = () => {
    if (!onSend) return console.log('approve and implement plan')
    setPlanMsg(null)
    onSend('The plan is approved. Implement it now, step by step.')
      .then(() => alive.current && setPlanMsg({ tone: 'ok', text: 'Sent to Claude' }))
      .catch((err: unknown) => alive.current && setPlanMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) }))
  }
  const savePlan = () => {
    if (!onSavePlan) return setPlanView('preview')
    onSavePlan(planText)
      .then(() => {
        if (!alive.current) return
        setPlanMsg({ tone: 'ok', text: 'Plan saved' })
        setPlanView('preview')
      })
      .catch((err: unknown) => alive.current && setPlanMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) }))
  }
  const addPlanToJira = () => {
    if (!onAddToJira) return console.log('add plan to jira')
    if (!jiraArmed) {
      setJiraArmed(true)
      window.setTimeout(() => alive.current && setJiraArmed(false), 5000)
      return
    }
    setJiraArmed(false)
    onAddToJira(planText)
      .then(() => alive.current && setPlanMsg({ tone: 'ok', text: 'Added to Jira as a comment' }))
      .catch((err: unknown) => alive.current && setPlanMsg({ tone: 'err', text: err instanceof Error ? err.message : String(err) }))
  }
  const attach = () => {
    if (!onAttach) return console.log('attach')
    void onAttach().then((paths) => {
      if (!alive.current || !paths.length) return
      setText((cur) => `${cur}${cur && !cur.endsWith(' ') ? ' ' : ''}${paths.map((p) => `@${p}`).join(' ')} `)
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const t = TABS.find((x) => x.code === e.code)
        if (t) {
          e.preventDefault()
          setTab(t.id)
          setPanelOpen(true)
        }
        return
      }
      if (e.metaKey) {
        if (e.key === 't' && showChanges) {
          e.preventDefault()
          toggleTests()
        } else if (e.key === 'Enter' && showChanges) {
          e.preventDefault()
          continueWith()
        } else if (e.key === 'Enter' && showPlan) {
          e.preventDefault()
          approvePlan()
        } else if (e.key === 's' && showPlan && planView === 'edit') {
          e.preventDefault()
          savePlan()
        } else if (e.key === '.' && running) {
          e.preventDefault()
          stop()
        } else if (e.key === 'z' && showChanges && !isTyping(e)) {
          e.preventDefault()
          revertActive()
        } else if (e.key === 'j' && !data.header.jira) {
          e.preventDefault()
          console.log('link jira')
        }
        return
      }
      if (e.key === 'Escape' && running) {
        stop()
        return
      }
      if (e.ctrlKey || isTyping(e)) return
      const k = e.key.toLowerCase()
      if (k === 'c' && showChanges) {
        e.preventDefault()
        commentOnActive()
      }
      else if (k === 'e' && showPlan) setPlanView('edit')
      else if (k === 'j' && showPlan) addPlanToJira()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const el = scrollRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [data.turns, live?.pending])

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--tx)' }}>
      <Header
        h={data.header}
        linkPlaceholders={data.linkPlaceholders}
        panelOpen={panelOpen}
        onBack={onBack}
        onOpenPanel={() => setPanelOpen(true)}
        onRename={onRename}
        onDelete={
          onDelete
            ? () => {
                setDeleteError(null)
                setConfirmDelete(true)
              }
            : undefined
        }
      />
      {confirmDelete && (
        <div
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(false)}
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140, zIndex: 50 }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setConfirmDelete(false)
            }}
            style={{ width: 480, background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--pop)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>Delete this session?</div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)' }}>
              <span style={{ color: 'var(--tx)', fontWeight: 500 }}>{data.header.title}</span> and all of its messages are deleted from this
              Mac: the conversation file, its subagent transcripts, file history and its prompts in Claude Code’s history. It disappears from Kokpit,
              search and <span style={{ font: `12px ${MONO}` }}>claude --resume</span>. This can’t be undone.
            </div>
            {deleteError && <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{deleteError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                autoFocus
                onClick={() => setConfirmDelete(false)}
                style={{ height: 32, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}
              >
                Cancel
              </button>
              <button
                onClick={deleteSession}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, background: 'var(--err)', color: '#fff' }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginTop: 'auto', padding: '20px 32px 12px', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {data.turns.map((t, i) => (
                <TurnView key={i} turn={t} />
              ))}
              {outbox.map((m) => (
                <TurnView key={`out-${m.id}`} turn={{ kind: 'user', text: toRich(m.text) }} />
              ))}
              {(running || data.header.status === 'running') && !live?.pending.length && (
                <WorkingRow
                  since={data.activeSince}
                  busyTool={(() => {
                    const last = data.turns[data.turns.length - 1]
                    return last?.kind === 'claude' && last.steps.some((s) => s.state === 'running')
                  })()}
                />
              )}
              {live?.pending.map((p, i) => (
                <ApprovalCard
                  key={p.requestId}
                  shortcuts={i === 0}
                  request={{
                    type: 'command',
                    action: p.title,
                    command: p.detail,
                    cwd: live.cwd,
                    rule: p.toolName,
                    waited: relativeTime(p.createdAt, Date.now())
                  }}
                  onAllow={() => onRespond?.(p.requestId, 'allow')}
                  onDeny={() => onRespond?.(p.requestId, 'deny')}
                  onAlwaysAllow={p.canAlwaysAllow ? () => onRespond?.(p.requestId, 'always') : undefined}
                />
              ))}
            </div>
          </div>
          <div style={{ padding: '0 24px 18px', flexShrink: 0 }}>
            {errorLine && (
              <div className="selectable" style={{ padding: '0 4px 6px', fontSize: 12, lineHeight: 1.5, color: 'var(--err)' }}>
                {errorLine}
              </div>
            )}
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 12,
                background: 'var(--panel)',
                boxShadow: 'var(--shadow)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ padding: '12px 14px 4px', minHeight: 40, display: 'flex', position: 'relative' }}>
                {slash.menu}
                <textarea
                  className="bare"
                  value={text}
                  placeholder={data.placeholder}
                  rows={Math.min(8, text.split('\n').length)}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (slash.onKeyDown(e)) return
                    if (e.key === 'Tab' && e.shiftKey && modelOptions) {
                      e.preventDefault()
                      pickMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length] ?? 'default')
                      return
                    }
                    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.nativeEvent.isComposing) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  style={{
                    flex: 1,
                    font: 'inherit',
                    fontSize: 13.5,
                    lineHeight: 1.5,
                    color: 'var(--tx)',
                    background: 'none',
                    border: 0,
                    outline: 'none',
                    padding: 0,
                    resize: 'none'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
                <button
                  aria-label="Attach file"
                  onClick={attach}
                  style={{ width: 28, height: 28, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="attach_file" size={18} color="var(--tx2)" />
                </button>
                <ComposerChip value={model} options={modelOptions ? modelOptions.map((m) => m.label) : MODELS} onChange={setModel} />
                <ComposerChip
                  icon="psychology"
                  prefix={effortOptions ? 'Effort: ' : 'Thinking: '}
                  value={thinking}
                  options={effortOptions ?? THINKING}
                  onChange={setThinking}
                />
                {modelOptions && (
                  <ComposerChip
                    icon="shield"
                    prefix="Mode: "
                    value={MODE_LABELS[mode]}
                    options={MODES.map((m) => MODE_LABELS[m])}
                    onChange={(label) => pickMode(MODES.find((m) => MODE_LABELS[m] === label) ?? 'default')}
                  />
                )}
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{running ? 'Esc to interrupt' : '↵ send · ⇧↵ new line · ⇧⇥ mode'}</span>
                {running ? (
                  <button
                    onClick={stop}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      height: 30,
                      padding: '0 9px',
                      borderRadius: 8,
                      background: 'var(--pri)',
                      color: 'var(--inv)',
                      fontSize: 12.5,
                      fontWeight: 500
                    }}
                  >
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--inv)' }} />
                    Stop
                    <KeyHint inverted>⌘.</KeyHint>
                  </button>
                ) : (
                  <button
                    aria-label="Send"
                    onClick={send}
                    disabled={!text.trim()}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: 'var(--pri)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: text.trim() ? 1 : 0.35,
                      cursor: text.trim() ? 'pointer' : 'default'
                    }}
                  >
                    <Icon name="arrow_upward" size={18} weight={500} color="var(--inv)" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {panelOpen && (
          <aside
            style={{
              width: 600,
              flexShrink: 0,
              borderLeft: '1px solid var(--line)',
              background: 'var(--panel)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
              overflow: 'hidden'
            }}
          >
            <div
              role="tablist"
              style={{
                height: 44,
                display: 'flex',
                alignItems: 'stretch',
                gap: 20,
                padding: '0 18px',
                borderBottom: '1px solid var(--line)',
                flexShrink: 0
              }}
            >
              {TABS.map((t) => {
                const on = t.id === tab
                const count = t.id === 'changes' && data.hasChanges ? String(files.length) : ''
                return (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(t.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontWeight: on ? 500 : 400,
                      color: on ? 'var(--tx)' : 'var(--tx3)',
                      borderBottom: `2px solid ${on ? 'var(--tx)' : 'transparent'}`,
                      marginBottom: -1
                    }}
                  >
                    {t.label}
                    {count && <span style={{ fontSize: 11.5, color: 'var(--tx3)', fontWeight: 400 }}>{count}</span>}
                    <span style={{ ...SMALL_KEY, marginLeft: 2 }}>{t.key}</span>
                  </button>
                )
              })}
              <span style={{ flex: 1 }} />
              <IconButton icon="right_panel_close" label="Hide panel" onClick={() => setPanelOpen(false)} />
            </div>
            {tab === 'changes' &&
              (data.hasChanges ? (
                <ChangesPanel
                  files={files}
                  lines={activeLines}
                  note={data.filesNote}
                  collapsed={diffCollapsed}
                  onSelectFile={data.selectableFiles ? selectFile : undefined}
                  onToggleFile={toggleFile}
                  onToggleTests={toggleTests}
                  onToggleCollapse={() => setDiffCollapsed((v) => !v)}
                  onContinue={continueWith}
                  onRevert={revertActive}
                  revertLabel={activeFile && revertArmed === activeFile.path ? 'Click again to revert' : 'Revert'}
                  onComment={commentOnActive}
                  commentCount={noteCount}
                  onLineClick={lineClick}
                  lineEditor={(i) => editorFor(`L${i}`, `Comment on line ${rawLines[i]?.n || rawLines[i]?.o || ''}`)}
                  fileEditor={editorFor('file', `Note on ${activeFile?.path.split('/').pop() ?? 'this file'}`)}
                  message={panelMsg}
                />
              ) : (
                <EmptyPanel text="No changes yet" />
              ))}
            {tab === 'plan' &&
              (data.hasPlan && data.plan ? (
                <PlanPanel
                  plan={data.plan}
                  view={planView}
                  text={planText}
                  onView={setPlanView}
                  onText={setPlanText}
                  onApprove={approvePlan}
                  onSave={savePlan}
                  onAddToJira={addPlanToJira}
                  jiraLabel={jiraArmed ? 'Click again to post to Jira' : 'Add to Jira task…'}
                  message={planMsg}
                />
              ) : (
                <EmptyPanel text="No plan in this session" />
              ))}
          </aside>
        )}
      </div>
    </main>
  )
}

const MOCK_DIFF: Record<string, DiffLine[]> = Object.fromEntries(DIFF_FILES.filter((f) => f.active).map((f) => [f.path, DIFF_LINES]))

export function SessionDetailPage({ mode, onBack }: { mode: DetailMode; onBack: () => void }) {
  const data: DetailView = {
    ...SESSION_DETAIL[mode],
    files: DIFF_FILES,
    diff: MOCK_DIFF,
    plan: PLAN,
    linkPlaceholders: true,
    selectableFiles: false
  }
  return <Detail key={mode} data={data} onBack={onBack} />
}

export function RealSessionDetailPage({
  data,
  onBack,
  live,
  onSend,
  onStop,
  onRespond,
  onRevert,
  ...rest
}: { data: SessionDetailData; onBack: () => void } & LiveProps) {
  const base = useMemo(() => toDetailView(data, Date.now()), [data])
  const view = useMemo<DetailView>(() => {
    if (!live) return { ...base, running: false, placeholder: 'Continue this session in Kokpit…' }
    const s = live.state
    return {
      ...base,
      header: { ...base.header, status: LIVE_STATUS[s] },
      placeholder: s === 'running' || s === 'starting' || s === 'waiting' ? WORKING : 'Message Claude…',
      running: s === 'running' || s === 'waiting'
    }
  }, [base, live])
  return (
    <Detail
      key={data.id}
      data={view}
      onBack={onBack}
      live={live}
      onSend={onSend}
      onStop={live ? onStop : undefined}
      onRespond={onRespond}
      onRevert={onRevert}
      {...rest}
    />
  )
}
