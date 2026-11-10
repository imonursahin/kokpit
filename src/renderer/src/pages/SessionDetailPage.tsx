import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MODE_LABELS, MODES, type Activity, type AskDecision, type BackgroundTask, type ImageInput, type LiveSession, type LiveState, type RewindResult, type RunnerMode } from '@shared/runner'
import type { SessionDetailData, SubagentDetail, WorkflowRun, WorkflowStep } from '@shared/sessionDetail'
import type { SessionStatus } from '@shared/types'
import { relativeTime } from '@shared/time'
import { ApprovalCard } from '@/components/ApprovalCard'
import { QuestionCard } from '@/components/QuestionCard'
import { DiffFileHeader, type DiffFile } from '@/components/DiffFileHeader'
import { Icon, KeyHint, Spinner } from '@/components/primitives'
import { Status } from '@/components/Status'
import { Markdown } from '@/components/Markdown'
import { openJiraIssue, PrChip } from '@/components/LinkChips'
import { TagPicker } from '@/components/TagChip'
import { getDraft, getQueued, setDraft, setQueued, type QueuedMessage } from '@/data/drafts'
import type { SessionTag } from '@shared/settings'
import { StepRow, SubagentOpen, type Step } from '@/components/StepRow'
import { useSlashCommands } from '@/components/SlashCommands'
import { useFileMentions } from '@/components/FileMentions'
import { usePastedImages, withImageMarkers } from '@/components/PastedImages'
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey, true)
    }
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
          role="menu"
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
  const startEditing = () => {
    setValue(title)
    setError(null)
    setEditing(true)
  }
  if (!editing || !onRename)
    return (
      <span className="no-drag title-edit-wrap" style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
        <span
          style={{ ...style, cursor: onRename ? 'text' : undefined }}
          title={onRename ? 'Double-click to rename' : undefined}
          onDoubleClick={() => onRename && startEditing()}
        >
          {title}
        </span>
        {onRename && (
          <button
            className="title-edit"
            aria-label="Rename session"
            title="Rename"
            onClick={startEditing}
            style={{ display: 'flex', flexShrink: 0, padding: 3, borderRadius: 5, cursor: 'pointer' }}
          >
            <Icon name="edit" size={15} color="var(--tx3)" />
          </button>
        )}
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
  onDelete,
  tags,
  tagId,
  onTag
}: {
  h: SessionHeader
  linkPlaceholders: boolean
  panelOpen: boolean
  onBack: () => void
  onOpenPanel: () => void
  onRename?: (t: string) => Promise<void>
  onDelete?: () => void
  tags?: SessionTag[]
  tagId?: string
  onTag?: (tagId: string | null) => void
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
        {onTag && <TagPicker tags={tags ?? []} tagId={tagId} onTag={onTag} />}
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
          <button onClick={() => h.jira && openJiraIssue(h.jira.key)} title="Open in Jira" style={{ ...chip, cursor: 'pointer' }}>
            <Icon name="task_alt" size={14} color="var(--run)" />
            <span style={{ font: `500 11.5px/1 ${MONO}`, color: 'var(--tx)' }}>{h.jira.key}</span>
            {h.jira.title && (
              <span style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.jira.title}</span>
            )}
          </button>
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
            {h.pr.url || h.jira ? (
              <PrChip label={h.pr.number} url={h.pr.url ?? ''} jiraKey={h.jira?.key ?? ''} align="left" />
            ) : (
              <>
                <Icon name="merge" size={14} color="var(--tx3)" />
                <span style={{ font: `500 11.5px/1 ${MONO}`, color: 'var(--tx)' }}>{h.pr.number}</span>
              </>
            )}
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

function BackgroundRows({ tasks, onStop }: { tasks: BackgroundTask[]; onStop?: (taskId: string) => Promise<void> }) {
  const [stopping, setStopping] = useState<Set<string>>(() => new Set())
  const open = useContext(SubagentOpen)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
      {tasks.map((t) => (
        <div
          key={t.id}
          role={t.ref && open ? 'button' : undefined}
          tabIndex={t.ref && open ? 0 : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget && t.ref) open?.(t.ref)
          }}
          title={t.ref && open ? 'Open' : undefined}
          className={t.ref && open ? 'step-row' : undefined}
          onClick={() => t.ref && open?.(t.ref)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx2)', minWidth: 0, padding: '2px 8px', margin: '0 -8px', borderRadius: 6, cursor: t.ref && open ? 'pointer' : undefined }}
        >
          <Spinner size={12} />
          <span style={{ flexShrink: 0, color: 'var(--tx3)' }}>{t.kind}</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
          <span style={{ flexShrink: 0, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>
            {t.startedAt ? elapsedLabel(now - Date.parse(t.startedAt)) : ''}
            {t.toolUses ? ` · ${t.toolUses} tool uses` : ''}
            {t.lastTool ? ` · ${t.lastTool}` : ''}
          </span>
          {onStop && t.taskId && (
            <button
              aria-label={`Stop ${t.description}`}
              title="Stop this task"
              disabled={stopping.has(t.taskId)}
              onClick={(e) => {
                e.stopPropagation()
                const id = t.taskId
                if (!id) return
                setStopping((cur) => new Set(cur).add(id))
                onStop(id).catch(() => setStopping((cur) => {
                  const next = new Set(cur)
                  next.delete(id)
                  return next
                }))
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0, height: 22, padding: '0 8px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 11.5, color: 'var(--tx2)', cursor: 'pointer', opacity: stopping.has(t.taskId) ? 0.5 : 1 }}
            >
              <Icon name="stop" size={13} color="var(--tx3)" />
              {stopping.has(t.taskId) ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function lastRunningStep(turns: { kind: string; steps?: Step[] }[]): Step | undefined {
  const last = turns[turns.length - 1]
  return last?.kind === 'claude' ? [...(last.steps ?? [])].reverse().find((st) => st.state === 'running' && st.meta !== 'in background') : undefined
}

const TOOL_VERBS: Record<string, string> = {
  Bash: 'Running',
  Read: 'Reading',
  Edit: 'Editing',
  MultiEdit: 'Editing',
  Write: 'Writing',
  Grep: 'Searching',
  Glob: 'Searching',
  WebFetch: 'Fetching',
  WebSearch: 'Searching the web',
  Agent: 'Starting a subagent',
  Task: 'Starting a subagent',
  Workflow: 'Starting a workflow',
  TodoWrite: 'Updating the todo list',
  Skill: 'Loading a skill',
  ToolSearch: 'Looking up tools'
}

const STEP_VERBS: Partial<Record<Step['kind'], string>> = {
  command: 'Running',
  read: 'Reading',
  edit: 'Editing',
  create: 'Writing',
  search: 'Searching',
  fetch: 'Fetching',
  jira: 'Calling Jira',
  todo: 'Updating the todo list'
}

export function activityLabel(activity: Activity | undefined, step?: Step): { label: string; detail?: string } {
  if (activity?.kind === 'writing') return { label: 'Writing…' }
  if (activity?.kind === 'tool' && activity.tool) {
    const mcp = activity.tool.startsWith('mcp__') ? activity.tool.split('__').slice(1).join(' · ') : ''
    return { label: mcp ? `Calling ${mcp}` : `${TOOL_VERBS[activity.tool] ?? `Using ${activity.tool}`}…`, detail: activity.detail }
  }
  if (activity?.kind === 'thinking') return { label: 'Thinking…' }
  if (step) return { label: `${STEP_VERBS[step.kind] ?? step.label}…`, detail: step.target }
  return { label: 'Working…' }
}

function WorkingRow({ since, label, detail }: { since?: string; label: string; detail?: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [])
  const start = since ? Date.parse(since) : NaN
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx2)', flexShrink: 0 }}>
      <Spinner size={12} />
      <span style={{ flexShrink: 0 }}>{label}</span>
      {detail && <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--tx3)', font: `12px ${MONO}` }}>{detail}</span>}
      {Number.isFinite(start) && <span style={{ color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{elapsedLabel(now - start)}</span>}
    </div>
  )
}

function SubagentModal({ sessionId, agentId, onClose }: { sessionId: string; agentId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SubagentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      const api = window.kokpit
      if (!api) return
      api
        .subagentDetail(sessionId, agentId)
        .then((d) => {
          if (!alive) return
          setDetail(d)
          setError(null)
          if (!d.agent.finished) timer = setTimeout(load, 2000)
        })
        .catch((err: unknown) => {
          if (!alive) return
          setError(err instanceof Error ? err.message : String(err))
          timer = setTimeout(load, 4000)
        })
    }
    load()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, agentId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const view = useMemo(() => (detail ? toDetailView(detail, Date.now()) : null), [detail])
  useEffect(() => {
    const el = bodyRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [view])

  const running = detail ? !detail.agent.finished : false
  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Subagent"
        style={{ width: 820, maxWidth: '100%', height: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--pop)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="smart_toy" size={20} color="var(--tx2)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {detail?.agent.description || 'Subagent'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{detail ? `${detail.agent.type} · ${detail.header.cost}` : 'Loading…'}</span>
          </div>
          {detail && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: running ? 'var(--run)' : 'var(--ok)' }}>
              {running ? <Spinner size={11} /> : <Icon name="check_circle" size={16} color="var(--ok)" />}
              {running ? 'Running' : 'Done'}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' }}>
            <Icon name="close" size={18} color="var(--tx2)" />
          </button>
        </div>
        <div
          ref={bodyRef}
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}
        >
          {error && <span style={{ fontSize: 12.5, color: 'var(--err)' }}>{error}</span>}
          {!view && !error && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--tx3)' }}>
              <Spinner size={11} /> Loading…
            </span>
          )}
          {view?.turns.map((t, i) => <TurnView key={i} turn={t} />)}
          {running && <WorkingRow since={detail?.activeSince} {...activityLabel(undefined, lastRunningStep(view?.turns ?? []))} />}
        </div>
      </div>
    </div>
  )
}

function ShellOutputModal({ sessionId, taskId, onClose }: { sessionId: string; taskId: string; onClose: () => void }) {
  const [out, setOut] = useState<{ text: string; truncated: boolean; missing: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLPreElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      window.kokpit
        ?.taskOutput(sessionId, taskId)
        .then((o) => alive && (setOut(o), setError(null)))
        .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => {
          if (alive) timer = setTimeout(load, 1500)
        })
    }
    load()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [sessionId, taskId, onClose])

  useEffect(() => {
    const el = bodyRef.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [out])

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Shell output"
        style={{ width: 820, maxWidth: '100%', height: '70vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--pop)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="terminal" size={20} color="var(--tx2)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Background shell</span>
            <span style={{ fontSize: 12, color: 'var(--tx3)', fontFamily: MONO }}>{taskId}{out?.truncated ? ' · showing the end' : ''}</span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' }}>
            <Icon name="close" size={18} color="var(--tx2)" />
          </button>
        </div>
        <pre
          ref={bodyRef}
          className="selectable"
          onScroll={(e) => {
            const el = e.currentTarget
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
          }}
          style={{ flex: 1, minHeight: 0, margin: 0, overflow: 'auto', padding: '16px 20px', font: `12px/1.55 ${MONO}`, color: 'var(--tx)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {error ? error : !out ? 'Loading…' : out.missing ? 'No output file yet.' : out.text || 'No output yet.'}
        </pre>
      </div>
    </div>
  )
}

function WorkflowModal({ sessionId, runId, onOpenStep, onClose }: { sessionId: string; runId: string; onOpenStep: (ref: string) => void; onClose: () => void }) {
  const [run, setRun] = useState<WorkflowRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      window.kokpit
        ?.workflowRun(sessionId, runId)
        .then((r) => {
          if (!alive) return
          setRun(r)
          setError(null)
          setNow(Date.now())
        })
        .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)))
        .finally(() => {
          if (alive) timer = setTimeout(load, 2500)
        })
    }
    load()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, runId])

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const phases = useMemo(() => {
    const out: { phase: string; steps: WorkflowStep[] }[] = []
    for (const st of run?.steps ?? []) {
      const last = out[out.length - 1]
      if (last && last.phase === st.phase) last.steps.push(st)
      else out.push({ phase: st.phase, steps: [st] })
    }
    return out
  }, [run])
  const running = run?.steps.some((st) => st.state === 'running') ?? false
  const failed = run?.steps.filter((st) => st.state === 'error').length ?? 0
  const first = run?.steps.find((st) => st.startedAt)?.startedAt
  const lastEnd = run?.steps.reduce((m, st) => (st.endedAt && st.endedAt > m ? st.endedAt : m), '') ?? ''
  const total = first ? (running ? now : Date.parse(lastEnd || first)) - Date.parse(first) : 0
  const took = (st: WorkflowStep) => (st.startedAt ? elapsedLabel((st.endedAt ? Date.parse(st.endedAt) : now) - Date.parse(st.startedAt)) : '')

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label="Workflow run"
        style={{ width: 720, maxWidth: '100%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--pop)', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="account_tree" size={20} color="var(--tx2)" />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Workflow run</span>
            <span style={{ fontSize: 12, color: 'var(--tx3)', fontFamily: "'Geist Mono',monospace" }}>
              {runId}
              {run ? ` · ${run.steps.length} steps · ${elapsedLabel(total)}` : ''}
            </span>
          </div>
          {run && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: running ? 'var(--run)' : failed ? 'var(--err)' : 'var(--ok)' }}>
              {running ? <Spinner size={11} /> : <Icon name={failed ? 'error' : 'check_circle'} size={16} color={failed ? 'var(--err)' : 'var(--ok)'} />}
              {running ? 'Running' : failed ? `${failed} failed` : 'Done'}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" style={{ display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' }}>
            <Icon name="close" size={18} color="var(--tx2)" />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 18px 18px' }}>
          {error && <div style={{ padding: '10px 0', fontSize: 12.5, color: 'var(--err)' }}>{error}</div>}
          {!run && !error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', fontSize: 12.5, color: 'var(--tx3)' }}>
              <Spinner size={11} /> Loading…
            </div>
          )}
          {run && !run.steps.length && <div style={{ padding: '10px 0', fontSize: 12.5, color: 'var(--tx3)' }}>No steps have started yet.</div>}
          {phases.map((ph, i) => (
            <div key={`${ph.phase}-${i}`} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 0 6px', fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--tx3)' }}>{ph.phase || 'Steps'}</div>
              {ph.steps.map((st) => (
                <button
                  key={st.agentId}
                  className="menu-item"
                  onClick={() => onOpenStep(`${runId}/${st.agentId}`)}
                  title="Open this step"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, height: 32, padding: '0 8px', margin: '0 -8px', borderRadius: 6, fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
                >
                  <span style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                    {st.state === 'running' ? (
                      <Spinner size={11} width={1.75} />
                    ) : (
                      <Icon name={st.state === 'error' ? 'error' : 'check_circle'} size={16} color={st.state === 'error' ? 'var(--err)' : 'var(--ok)'} />
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: st.state === 'running' ? 'var(--run)' : 'var(--tx)' }}>{st.label}</span>
                  <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--tx3)', fontVariantNumeric: 'tabular-nums' }}>{took(st)}</span>
                  <Icon name="chevron_right" size={16} color="var(--tx3)" />
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function turnKeys(turns: Turn[]): [Turn, string][] {
  let anchor = 'start'
  let n = 0
  return turns.map((t) => {
    if (t.kind === 'earlier') return [t, 'earlier']
    if (t.kind === 'user' && t.uuid) {
      anchor = t.uuid
      n = 0
      return [t, t.uuid]
    }
    n += 1
    return [t, `${anchor}:${n}`]
  })
}

function lastClaudeText(turns: Turn[]): string {
  const last = [...turns].reverse().find((t) => t.kind === 'claude')
  if (!last || last.kind !== 'claude') return ''
  return [last.markdown ?? '', ...(last.parts ?? []).map((p) => (p.kind === 'text' ? p.text : ''))].join('\n')
}

function ThinkingPart({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="step-row"
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 8px', margin: '0 -8px', borderRadius: 6, fontSize: 12.5, color: 'var(--tx3)', textAlign: 'left', cursor: 'pointer' }}
      >
        <Icon name="psychology" size={16} color="var(--tx3)" />
        <span style={{ fontStyle: 'italic' }}>Thinking</span>
        <span style={{ flex: 1 }} />
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} color="var(--tx3)" />
      </button>
      {open && (
        <div style={{ margin: '2px 0 4px 24px', paddingLeft: 12, borderLeft: '2px solid var(--line)' }}>
          <Markdown source={text} size={12.5} muted />
        </div>
      )}
    </div>
  )
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function WorkBlock({ parts, expanded }: { parts: TurnPart[]; expanded: boolean }) {
  const [open, setOpen] = useState(expanded)
  useEffect(() => setOpen(expanded), [expanded])
  const steps = parts.flatMap((p) => (p.kind === 'steps' ? p.steps : []))
  const notes = parts.filter((p) => p.kind === 'text').length
  const thoughts = parts.filter((p) => p.kind === 'thinking').length
  const errors = steps.filter((st) => st.state === 'error').length
  const running = steps.filter((st) => st.state === 'running')
  const summary = [steps.length ? plural(steps.length, 'step') : '', notes ? plural(notes, 'note') : '', thoughts && !steps.length && !notes ? 'thinking' : '']
    .filter(Boolean)
    .join(' · ')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--line-soft)', borderRadius: 10, background: 'var(--hover)', padding: '2px 12px' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="step-row"
        style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 8px', margin: '0 -8px', borderRadius: 6, fontSize: 12.5, color: 'var(--tx3)', textAlign: 'left', cursor: 'pointer' }}
      >
        <Icon name={running.length ? 'progress_activity' : 'construction'} size={16} color={running.length ? 'var(--run)' : 'var(--tx3)'} />
        <span style={{ fontWeight: 500, color: 'var(--tx2)' }}>Work</span>
        {summary && <span>{summary}</span>}
        {errors > 0 && <span style={{ color: 'var(--err)' }}>· {errors} failed</span>}
        <span style={{ flex: 1 }} />
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} color="var(--tx3)" />
      </button>
      {open ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '2px 0 8px' }}>
          {parts.map((p, i) =>
            p.kind === 'steps' ? (
              <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
                {p.steps.map((st, j) => (
                  <StepRow key={j} step={st} />
                ))}
              </div>
            ) : p.kind === 'thinking' ? (
              <ThinkingPart key={i} text={p.text} />
            ) : (
              <div key={i} style={{ padding: '2px 0' }}>
                <Markdown source={p.text} size={12.5} muted />
              </div>
            )
          )}
        </div>
      ) : (
        running.map((st, i) => <StepRow key={i} step={st} />)
      )}
    </div>
  )
}

function OrderedParts({ parts }: { parts: TurnPart[] }) {
  const lastText = parts.map((p) => p.kind).lastIndexOf('text')
  const final = lastText >= 0 && parts.slice(lastText + 1).every((p) => p.kind === 'thinking') ? lastText : -1
  const answer = final >= 0 ? parts[final] : undefined
  const work = parts.filter((_, i) => i !== final)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {work.length > 0 && <WorkBlock parts={work} expanded={!answer} />}
      {answer?.kind === 'text' && <Markdown source={answer.text} size={13.5} />}
    </div>
  )
}

type RewindTarget = { uuid?: string; parentUuid: string; text: string }
const RewindOpen = createContext<((t: RewindTarget) => void) | null>(null)

function TurnView({ turn, onLoadEarlier }: { turn: Turn; onLoadEarlier?: () => void }) {
  const rewind = useContext(RewindOpen)
  if (turn.kind === 'earlier')
    return (
      <div
        role={turn.more && onLoadEarlier ? 'button' : undefined}
        title={turn.more && onLoadEarlier ? 'Load earlier turns' : undefined}
        onClick={turn.more ? onLoadEarlier : undefined}
        style={{
          cursor: turn.more && onLoadEarlier ? 'pointer' : undefined,
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
        className="selectable turn-user"
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
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <RichText parts={turn.text} />
        {rewind && turn.parentUuid && (
          <button
            className="turn-rewind"
            onClick={() => rewind({ uuid: turn.uuid, parentUuid: turn.parentUuid ?? '', text: richToText(turn.text) })}
            title="Edit this message and continue from here in a new branch"
            style={{ position: 'absolute', left: -34, top: 6, display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' }}
          >
            <Icon name="edit_note" size={18} color="var(--tx3)" />
          </button>
        )}
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
  draftKey?: string
  tags?: SessionTag[]
  tagId?: string
  onTag?: (tagId: string | null) => void
  onSend?: (text: string, opts?: { model?: string; effort?: string; mode?: RunnerMode; images?: ImageInput[]; rewindAt?: string }) => Promise<string | void>
  onCancelQueued?: (uuid: string) => Promise<boolean>
  onRewindFiles?: (uuid: string, dryRun: boolean) => Promise<RewindResult>
  onMode?: (mode: RunnerMode) => Promise<void>
  permissionMode?: RunnerMode
  onStop?: () => void
  onRespond?: (requestId: string, decision: AskDecision, answers?: Record<string, string>) => void
  onRevert?: (path: string) => Promise<string>
  onSavePlan?: (body: string) => Promise<void>
  onAddToJira?: (body: string) => Promise<string>
  onAttach?: () => Promise<string[]>
  onRename?: (title: string) => Promise<void>
  onDelete?: () => Promise<void>
  modelOptions?: { id: string; label: string }[]
  effortOptions?: string[]
  defaultEffort?: string
  defaultMode?: RunnerMode
  cwd?: string
  onLoadEarlier?: () => void
  partial?: string
}

const LIVE_STATUS: Record<LiveState, SessionStatus> = {
  starting: 'running',
  running: 'running',
  waiting: 'waiting',
  idle: 'done',
  error: 'error'
}

const COMPOSER_MAX_LINES = 5

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
  draftKey,
  tags,
  tagId,
  onTag,
  onDelete,
  modelOptions,
  effortOptions,
  defaultEffort,
  defaultMode,
  cwd,
  onLoadEarlier,
  partial,
  onCancelQueued,
  onRewindFiles,
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
  const [text, setText] = useState(() => (draftKey ? getDraft(draftKey) : ''))
  useEffect(() => {
    if (draftKey) setDraft(draftKey, text)
  }, [draftKey, text])
  const [outbox, setOutbox] = useState<QueuedMessage[]>(() => (draftKey ? getQueued(draftKey) : []))
  useEffect(() => {
    if (draftKey) setQueued(draftKey, outbox)
  }, [draftKey, outbox])
  const sentTexts = useMemo(() => data.turns.flatMap((t) => (t.kind === 'user' ? [richToText(t.text)] : [])), [data.turns])
  const countSent = (t: string) => sentTexts.filter((x) => sameMessage(x, t)).length
  useEffect(() => {
    setOutbox((o) => o.filter((m) => Date.now() - m.id < 600_000 && sentTexts.filter((x) => sameMessage(x, m.text)).length <= m.before))
  }, [sentTexts])
  const slash = useSlashCommands(text, setText, 'above', live?.cwd ?? cwd)
  const mention = useFileMentions(text, setText, 'above', live?.cwd ?? cwd)
  const pasted = usePastedImages(draftKey)
  const recall = useRef<{ index: number; draft: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [inputFocused, setInputFocused] = useState(false)
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = 'auto'
    const full = el.scrollHeight
    const height = inputFocused ? Math.min(full, line * COMPOSER_MAX_LINES) : line
    el.style.height = `${height}px`
    el.style.overflowY = inputFocused && full > height + 1 ? 'auto' : 'hidden'
    if (!inputFocused) el.scrollTop = 0
  }, [text, inputFocused])
  const [model, setModel] = useState(data.model)
  const [thinking, setThinking] = useState(defaultEffort ?? data.thinking)
  const [mode, setMode] = useState<RunnerMode>(permissionMode ?? defaultMode ?? 'default')
  useEffect(() => {
    if (permissionMode) setMode(permissionMode)
  }, [permissionMode])
  const pickMode = (next: RunnerMode) => {
    setMode(next)
    onMode?.(next).catch((err: unknown) => {
      if (!alive.current) return
      setMode(permissionMode ?? defaultMode ?? 'default')
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
  const sessionCwd = live?.cwd ?? cwd
  const [rewindTo, setRewindTo] = useState<RewindTarget | null>(null)
  const draftBeforeRewind = useRef<string | null>(null)
  const startRewind = useCallback((t: RewindTarget) => {
    setRewindTo(t)
    setText((cur) => {
      if (draftBeforeRewind.current === null) draftBeforeRewind.current = cur
      return t.text
    })
  }, [])
  const [rewindPreview, setRewindPreview] = useState<RewindResult | 'checking' | null>(null)
  const [restoreFiles, setRestoreFiles] = useState(true)
  const rewindFilesRef = useRef(onRewindFiles)
  rewindFilesRef.current = onRewindFiles
  useEffect(() => {
    setRestoreFiles(true)
    const check = rewindFilesRef.current
    if (!rewindTo?.uuid || !check) return setRewindPreview(null)
    let ok = true
    setRewindPreview('checking')
    check(rewindTo.uuid, true)
      .then((r) => ok && setRewindPreview(r))
      .catch(() => ok && setRewindPreview(null))
    return () => {
      ok = false
    }
  }, [rewindTo])
  const restorable = rewindPreview && rewindPreview !== 'checking' && rewindPreview.canRewind ? rewindPreview.filesChanged : []
  const cancelQueued = (m: { id: number; text: string; uuid?: string }) => {
    if (!m.uuid || !onCancelQueued) return
    onCancelQueued(m.uuid)
      .then((cancelled) => {
        if (!alive.current) return
        if (!cancelled) return setNotice('Claude already picked up that message')
        setOutbox((o) => o.filter((x) => x.id !== m.id))
        setText((cur) => cur || m.text)
      })
      .catch((err: unknown) => alive.current && setSendError(err instanceof Error ? err.message : String(err)))
  }
  const [shell, setShell] = useState<{ command: string; code: number | null; output: string; truncated: boolean } | 'running' | null>(null)
  const [memoryNote, setMemoryNote] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const background = useMemo<BackgroundTask[]>(() => {
    const fromTranscript = data.turns.flatMap((t) =>
      t.kind === 'claude'
        ? t.steps
            .filter((st) => st.state === 'running' && (st.meta === 'in background' || !!st.agent))
            .map((st, i) => {
              const match = live?.background?.find((b) => b.toolUseId && b.toolUseId === st.toolUseId)
              const taskId = st.taskId || match?.taskId
              return {
                id: st.toolUseId || `${st.label}-${st.target}-${i}`,
                kind: st.workflow ? 'Workflow' : st.agent ? 'Subagent' : st.kind === 'command' ? 'Shell' : st.label,
                description: st.workflow?.name || (st.agent ? `${st.agent.type} · ${st.target}` : st.target),
                startedAt: st.startedAt || match?.startedAt || '',
                toolUses: match?.toolUses,
                lastTool: match?.lastTool,
                taskId,
                ref: st.workflow ? `workflow:${st.workflow.runId}` : st.agent ? st.agent.id : st.kind === 'command' && taskId ? `shell:${taskId}` : undefined
              }
            })
        : []
    )
    return fromTranscript.length ? fromTranscript : (live?.background ?? [])
  }, [live, data.turns])
  const runBang = (command: string) => {
    if (!sessionCwd || !window.kokpit) return
    setShell('running')
    setText('')
    window.kokpit
      .runShell(sessionCwd, command)
      .then((r) => alive.current && setShell(r))
      .catch((err: unknown) => {
        if (!alive.current) return
        setShell(null)
        setText((cur) => cur || `!${command}`)
        setSendError(err instanceof Error ? err.message : String(err))
      })
  }
  const saveMemory = (target: 'project' | 'user') => {
    const note = memoryNote
    if (!note || !sessionCwd || !window.kokpit) return
    setMemoryNote(null)
    window.kokpit
      .appendMemory(target, sessionCwd, note)
      .then((file) => alive.current && setNotice(`Saved to ${file}`))
      .catch((err: unknown) => alive.current && setSendError(err instanceof Error ? err.message : String(err)))
  }
  const send = () => {
    const typed = text.trim()
    const images = pasted.payload()
    if (!typed && !images.length) return
    if (sessionCwd && !images.length && typed.startsWith('!') && typed.slice(1).trim()) return runBang(typed.slice(1).trim())
    if (sessionCwd && !images.length && typed.startsWith('#') && typed.slice(1).trim()) {
      setMemoryNote(typed.slice(1).trim())
      setText('')
      return
    }
    const t = withImageMarkers(typed, images.length)
    if (!onSend) {
      console.log(running ? 'queue message' : 'send message', { text: t, model, thinking })
      setText('')
      pasted.clear()
      return
    }
    if (sending.current) return
    sending.current = true
    setSendError(null)
    const modelId = modelOptions?.find((m) => m.label === model)?.id
    const id = Date.now()
    const kept = pasted.snapshot()
    if (!rewindTo) setOutbox((o) => [...o, { id, text: t, before: countSent(t) + o.filter((m) => sameMessage(m.text, t)).length }])
    setText('')
    pasted.clear()
    const rewindAt = rewindTo?.parentUuid
    const restoreAt = rewindTo?.uuid && restoreFiles && restorable.length && onRewindFiles ? rewindTo.uuid : null
    const target = rewindTo
    setRewindTo(null)
    draftBeforeRewind.current = null
    const before = restoreAt
      ? onRewindFiles!(restoreAt, false).then((r) => {
          if (!r.canRewind) throw new Error(r.error || 'Files could not be restored')
        })
      : Promise.resolve()
    before
      .then(() =>
        onSend(t, {
          ...(modelOptions ? { model: modelId, effort: thinking.toLowerCase(), mode } : {}),
          ...(images.length ? { images } : {}),
          ...(rewindAt ? { rewindAt } : {})
        })
      )
      .then((uuid) => {
        if (typeof uuid !== 'string') return
        if (alive.current) setOutbox((o) => o.map((m) => (m.id === id ? { ...m, uuid } : m)))
        else if (draftKey) setQueued(draftKey, getQueued(draftKey).map((m) => (m.id === id ? { ...m, uuid } : m)))
      })
      .catch((err: unknown) => {
        if (target && alive.current) setRewindTo(target)
        if (!alive.current) return
        setOutbox((o) => o.filter((m) => m.id !== id))
        setText((cur) => cur || typed)
        pasted.restore(kept)
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
        } else if (e.key === 'Enter' && showChanges && !isTyping(e)) {
          e.preventDefault()
          continueWith()
        } else if (e.key === 'Enter' && showPlan && !isTyping(e)) {
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
        const overlay = document.querySelector('[aria-modal],[role="menu"],[role="listbox"],[role="dialog"]')
        if (!e.defaultPrevented && !overlay && (!isTyping(e) || e.target === inputRef.current)) stop()
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
  }, [data.turns, live?.pending, partial])

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--tx)' }}>
      <Header
        h={data.header}
        linkPlaceholders={data.linkPlaceholders}
        panelOpen={panelOpen}
        onBack={onBack}
        onOpenPanel={() => setPanelOpen(true)}
        onRename={onRename}
        tags={tags}
        tagId={tagId}
        onTag={onTag}
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
              <RewindOpen.Provider value={onSend && sessionCwd && !running ? startRewind : null}>
                {turnKeys(data.turns).map(([t, key]) => (
                  <TurnView key={key} turn={t} onLoadEarlier={onLoadEarlier} />
                ))}
              </RewindOpen.Provider>
              {running && partial && !lastClaudeText(data.turns).includes(partial.trim().slice(-120)) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }} aria-live="polite">
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>Claude</div>
                  <Markdown source={partial} size={13.5} />
                </div>
              )}
              {outbox.map((m) => (
                <div key={`out-${m.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  <TurnView turn={{ kind: 'user', text: toRich(m.text) }} />
                  {running && m.uuid && onCancelQueued && (
                    <button onClick={() => cancelQueued(m)} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--tx3)', cursor: 'pointer' }}>
                      <Icon name="undo" size={14} color="var(--tx3)" />
                      Queued · take back
                    </button>
                  )}
                </div>
              ))}
              {(running || (data.header.status === 'running' && !background.length)) && !live?.pending.length && (
                <WorkingRow since={data.activeSince} {...activityLabel(live?.activity, lastRunningStep(data.turns))} />
              )}
              {background.length > 0 && (
                <BackgroundRows tasks={background} onStop={live ? (taskId) => window.kokpit?.runner.stopTask(live.sessionId, taskId) ?? Promise.resolve() : undefined} />
              )}
              {live?.pending.map((p, i) =>
                p.toolName === 'AskUserQuestion' ? (
                  <QuestionCard
                    key={p.requestId}
                    input={p.input}
                    onSubmit={(answers) => onRespond?.(p.requestId, 'allow', answers)}
                    onDismiss={() => onRespond?.(p.requestId, 'deny')}
                  />
                ) : (
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
                )
              )}
            </div>
          </div>
          <div style={{ padding: '0 24px 18px', flexShrink: 0 }}>
            {rewindTo && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--wait-bg)', fontSize: 12.5 }}>
                <Icon name="edit_note" size={16} color="var(--wait-tx)" />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--wait-tx)' }}>
                  <span>Editing an earlier message. Sending starts a new branch from that point, this session stays as it is.</span>
                  {rewindPreview === 'checking' ? (
                    <span style={{ color: 'var(--tx3)' }}>Checking which files changed after it…</span>
                  ) : restorable.length ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--tx)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={restoreFiles} onChange={(e) => setRestoreFiles(e.target.checked)} />
                      Also restore {restorable.length} file{restorable.length === 1 ? '' : 's'} to how they were before this message
                    </label>
                  ) : (
                    <span style={{ color: 'var(--tx3)' }}>No tracked file changes after this message.</span>
                  )}
                </span>
                <button
                  onClick={() => {
                    setRewindTo(null)
                    setText(draftBeforeRewind.current ?? '')
                    draftBeforeRewind.current = null
                  }}
                  style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            )}
            {shell && (
              <div style={{ marginBottom: 8, border: '1px solid var(--line)', borderRadius: 10, background: 'var(--panel)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line-soft)', fontSize: 12.5 }}>
                  <Icon name="terminal" size={16} color="var(--tx3)" />
                  <span style={{ font: `12.5px ${MONO}`, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                    $ {shell === 'running' ? '…' : shell.command}
                  </span>
                  {shell === 'running' ? (
                    <Spinner size={11} />
                  ) : (
                    <>
                      <span style={{ color: shell.code === 0 ? 'var(--ok)' : 'var(--err)' }}>exit {shell.code ?? '?'}</span>
                      <button
                        onClick={() => {
                          setText((cur) => `${cur ? `${cur}\n\n` : ''}\`\`\`\n$ ${shell.command}\n${shell.output.trimEnd()}\n\`\`\`\n`)
                          setShell(null)
                        }}
                        style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }}
                      >
                        Add to message
                      </button>
                      <button aria-label="Dismiss" onClick={() => setShell(null)} style={{ display: 'flex', cursor: 'pointer' }}>
                        <Icon name="close" size={16} color="var(--tx3)" />
                      </button>
                    </>
                  )}
                </div>
                {shell !== 'running' && (
                  <pre className="selectable" style={{ margin: 0, padding: '8px 12px', maxHeight: 220, overflow: 'auto', font: `12px/1.55 ${MONO}`, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>
                    {(shell.truncated ? '…\n' : '') + (shell.output.trimEnd() || '(no output)')}
                  </pre>
                )}
              </div>
            )}
            {memoryNote && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 10, fontSize: 12.5 }}>
                <Icon name="bookmark_add" size={16} color="var(--tx3)" />
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Remember: {memoryNote}</span>
                <button onClick={() => saveMemory('project')} style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }}>
                  Project CLAUDE.md
                </button>
                <button onClick={() => saveMemory('user')} style={{ fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--line)', cursor: 'pointer' }}>
                  User CLAUDE.md
                </button>
                <button
                  aria-label="Cancel"
                  onClick={() => {
                    setText((cur) => cur || `#${memoryNote}`)
                    setMemoryNote(null)
                  }}
                  style={{ display: 'flex', cursor: 'pointer' }}
                >
                  <Icon name="close" size={16} color="var(--tx3)" />
                </button>
              </div>
            )}
            {notice && (
              <div role="status" style={{ padding: '0 4px 6px', fontSize: 12, color: 'var(--ok)' }} onClick={() => setNotice(null)}>
                {notice}
              </div>
            )}
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
              {pasted.tray}
              <div style={{ padding: '12px 14px 4px', minHeight: 40, display: 'flex', position: 'relative' }}>
                {slash.menu}
                {mention.menu}
                <textarea
                  ref={inputRef}
                  className="bare"
                  value={text}
                  onPaste={pasted.onPaste}
                  placeholder={data.placeholder}
                  rows={1}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onChange={(e) => {
                    recall.current = null
                    setText(e.target.value)
                  }}
                  onKeyDown={(e) => {
                    if (slash.onKeyDown(e) || mention.onKeyDown(e)) return
                    const history = [...sentTexts, ...outbox.map((m) => m.text)].filter((t, i, all) => t.trim() && t !== all[i - 1])
                    const el = e.currentTarget
                    if (e.key === 'ArrowUp' && !e.shiftKey && !e.metaKey && history.length && !el.value.slice(0, el.selectionStart).includes('\n')) {
                      e.preventDefault()
                      const cur = recall.current
                      const index = cur ? Math.max(0, cur.index - 1) : history.length - 1
                      recall.current = { index, draft: cur ? cur.draft : text }
                      setText(history[index] ?? '')
                      return
                    }
                    if (e.key === 'ArrowDown' && !e.shiftKey && !e.metaKey && recall.current && !el.value.slice(el.selectionEnd).includes('\n')) {
                      e.preventDefault()
                      const index = recall.current.index + 1
                      if (index >= history.length) {
                        setText(recall.current.draft)
                        recall.current = null
                      } else {
                        recall.current = { ...recall.current, index }
                        setText(history[index] ?? '')
                      }
                      return
                    }
                    if (e.key === 'Tab' && e.shiftKey && modelOptions) {
                      e.preventDefault()
                      const cycle: RunnerMode[] = MODES.filter((m) => m !== 'bypassPermissions')
                      pickMode(cycle[(cycle.indexOf(mode) + 1) % cycle.length] ?? 'default')
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
                <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{sessionCwd && text.startsWith('!') ? '↵ run in the session folder' : sessionCwd && text.startsWith('#') ? '↵ save to memory' : running ? 'Esc to interrupt' : '↵ send · ⇧↵ new line · ⇧⇥ mode'}</span>
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
                    disabled={!text.trim() && !pasted.count}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: 'var(--pri)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: text.trim() || pasted.count ? 1 : 0.35,
                      cursor: text.trim() || pasted.count ? 'pointer' : 'default'
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
      header: { ...base.header, status: s === 'idle' && live.background?.length ? 'running' : LIVE_STATUS[s] },
      placeholder: s === 'running' || s === 'starting' || s === 'waiting' ? WORKING : 'Message Claude…',
      running: s === 'running' || s === 'waiting'
    }
  }, [base, live])
  const [agentId, setAgentId] = useState<string | null>(null)
  const closeAgent = useCallback(() => setAgentId(null), [])
  return (
    <SubagentOpen.Provider value={setAgentId}>
      <Detail
        key={data.id}
        draftKey={data.id}
        data={view}
        onBack={onBack}
        live={live}
        onSend={onSend}
        onStop={live ? onStop : undefined}
        onRespond={onRespond}
        onRevert={onRevert}
        {...rest}
      />
      {agentId?.startsWith('shell:') ? (
        <ShellOutputModal sessionId={data.id} taskId={agentId.slice(6)} onClose={closeAgent} />
      ) : agentId?.startsWith('workflow:') ? (
        <WorkflowModal sessionId={data.id} runId={agentId.slice(9)} onOpenStep={setAgentId} onClose={closeAgent} />
      ) : agentId ? (
        <SubagentModal sessionId={data.id} agentId={agentId} onClose={agentId.includes('/') ? () => setAgentId(`workflow:${agentId.split('/')[0]}`) : closeAgent} />
      ) : null}
    </SubagentOpen.Provider>
  )
}
