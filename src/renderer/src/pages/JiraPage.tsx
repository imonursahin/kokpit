import { useEffect, useMemo, useRef, useState } from 'react'
import type { JiraIssue, PullRequestInfo } from '@shared/integrations'
import { relativeTime } from '@shared/time'
import type { SessionStatus, SessionSummary } from '@shared/types'
import { errorText, useConnectionStatus } from '@/data/useIntegrations'
import { toSummary, useSessions } from '@/data/useSessions'
import { SessionRow } from '@/components/SessionRow'
import { SelectChip } from '@/components/Menu'
import { Status } from '@/components/Status'
import { Icon, OpenButton, PrimaryButton } from '@/components/primitives'
import { JIRA_SITE, MOCK_JIRA_TASKS, type JiraPr, type JiraStatus, type JiraTask } from '@/mock/jira'

type Tab = 'open' | 'done'

const DOTS: Record<JiraStatus, string> = {
  'To Do': 'var(--tx3)',
  'In Progress': 'var(--run)',
  'In Review': 'var(--rev)',
  Done: 'var(--ok)'
}

const CHECK_COLORS: Record<JiraPr['checksTone'], string> = { ok: 'var(--ok)', neutral: 'var(--tx2)', err: 'var(--err)' }

const LIVE_ORDER: SessionStatus[] = ['waiting', 'error', 'running']

const PR_COLS = '18px 56px minmax(0,1fr) 150px 70px 96px'

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function dotColor(t: JiraTask) {
  if (t.statusCategory === 'done') return DOTS.Done
  if (/review/i.test(t.status)) return DOTS['In Review']
  return t.statusCategory === 'new' ? DOTS['To Do'] : DOTS['In Progress']
}

function toPr(p: PullRequestInfo): JiraPr {
  const { total, passed, failed, pending } = p.checks
  const [checks, checksTone]: [string, JiraPr['checksTone']] =
    total === 0
      ? ['no checks', 'neutral']
      : failed > 0
        ? [`${failed} failed`, 'err']
        : pending > 0
          ? [`${passed}/${total} checks · ${pending} running`, 'neutral']
          : ['All checks passed', 'ok']
  return { num: `#${p.number}`, title: p.title, branch: `${p.branch} → ${p.base}`, checks, checksTone, state: p.state, url: p.url }
}

function liveStatus(t: JiraTask): SessionStatus | undefined {
  return LIVE_ORDER.find((st) => t.sessions.some((s) => s.status === st))
}

function countsLabel(t: JiraTask) {
  const parts = [plural(t.sessions.length, 'session')]
  if (t.prs.length) parts.push(plural(t.prs.length, 'PR'))
  return parts.join(' · ')
}

function SectionTitle({ title, count, top }: { title: string; count: number; top: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: `${top}px 28px 10px` }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{title}</span>
      <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{count}</span>
    </div>
  )
}

function TaskRow({ t, selected, onSelect }: { t: JiraTask; selected: boolean; onSelect: () => void }) {
  const live = liveStatus(t)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect()
      }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '12px 20px',
        borderBottom: '1px solid var(--line-soft)',
        background: selected ? 'var(--sel)' : 'transparent',
        cursor: 'pointer'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ font: "500 11.5px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>{t.key}</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 20,
            padding: '0 7px',
            border: '1px solid var(--line)',
            borderRadius: 10,
            fontSize: 11.5,
            color: 'var(--tx2)',
            background: 'var(--panel)'
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(t) }} />
          {t.status}
        </span>
        <span style={{ flex: 1 }} />
        {live && <Status status={live} />}
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{countsLabel(t)}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, textWrap: 'pretty' }}>{t.title}</div>
    </div>
  )
}

function PrRow({ p }: { p: JiraPr }) {
  return (
    <div
      className="menu-item"
      style={{
        display: 'grid',
        gridTemplateColumns: PR_COLS,
        columnGap: 14,
        alignItems: 'center',
        padding: '0 28px',
        height: 52,
        borderBottom: '1px solid var(--line-soft)'
      }}
    >
      <Icon name="merge" size={17} color={p.state === 'Merged' ? 'var(--rev)' : 'var(--tx2)'} />
      <span style={{ font: "500 12px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>{p.num}</span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
        <span style={{ font: "11.5px 'Geist Mono',monospace", color: 'var(--tx3)' }}>{p.branch}</span>
      </div>
      <span style={{ fontSize: 12, color: CHECK_COLORS[p.checksTone] }}>{p.checks}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifySelf: 'end',
          height: 22,
          padding: '0 8px',
          border: '1px solid var(--line)',
          borderRadius: 11,
          fontSize: 12,
          color: 'var(--tx2)'
        }}
      >
        {p.state}
      </span>
      {p.url ? <OpenButton url={p.url} /> : <span />}
    </div>
  )
}

function Note({ children, color = 'var(--tx3)' }: { children: string; color?: string }) {
  return (
    <div className="selectable" style={{ padding: '14px 28px 0', fontSize: 12.5, lineHeight: 1.5, color }}>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      {label} <span style={{ color: 'var(--tx)' }}>{value}</span>
    </span>
  )
}

export function JiraPage({
  onOpenSession,
  onNewSession,
  onConnect
}: {
  onOpenSession: (id: string) => void
  onNewSession: (jiraKey: string) => void
  onConnect?: () => void
}) {
  const api = window.kokpit
  const { items } = useSessions()
  const status = useConnectionStatus()
  const jira = status.list?.find((c) => c.id === 'jira')
  const [tab, setTab] = useState<Tab>('open')
  const [sprint, setSprint] = useState('')
  const [selectedKey, setSelectedKey] = useState(api ? '' : (MOCK_JIRA_TASKS[0]?.key ?? ''))
  const [synced, setSynced] = useState('2 min ago')
  const [issues, setIssues] = useState<JiraIssue[] | null>(null)
  const [issuesError, setIssuesError] = useState('')
  const [syncedAt, setSyncedAt] = useState('')
  const [nowMs, setNowMs] = useState(Date.now())
  const [prs, setPrs] = useState<{ key: string; list?: JiraPr[]; error?: string } | null>(null)
  const loading = useRef(false)

  const load = (force: boolean) => {
    if (!api || loading.current) return
    loading.current = true
    api.integrations
      .jiraIssues(force)
      .then((list) => {
        setIssues(list)
        setIssuesError('')
        setSyncedAt(new Date().toISOString())
        setNowMs(Date.now())
      })
      .catch((e: unknown) => setIssuesError(errorText(e)))
      .finally(() => {
        loading.current = false
      })
  }

  useEffect(() => load(false), [])

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const allTasks = useMemo<JiraTask[]>(() => {
    if (!api) return MOCK_JIRA_TASKS
    const byKey = new Map<string, SessionSummary[]>()
    for (const item of items) {
      if (!item.jira) continue
      const s = toSummary(item, nowMs)
      const list = byKey.get(item.jira)
      if (list) list.push(s)
      else byKey.set(item.jira, [s])
    }
    return (issues ?? []).map((i) => ({
      key: i.key,
      title: i.title,
      status: i.status,
      statusCategory: i.statusCategory,
      priority: i.priority,
      sprint: i.sprint,
      reporter: i.reporter,
      points: i.points,
      updated: relativeTime(i.updated, nowMs),
      description: i.description,
      url: i.url,
      sessions: byKey.get(i.key) ?? [],
      prs: []
    }))
  }, [api, issues, items, nowMs])

  const sprints = useMemo(() => [...new Set(allTasks.map((t) => t.sprint).filter(Boolean))].sort(), [allTasks])
  const inSprint = useMemo(() => allTasks.filter((t) => !sprint || t.sprint === sprint), [allTasks, sprint])
  const isDone = (t: JiraTask) => t.statusCategory === 'done'
  const counts = { open: inSprint.filter((t) => !isDone(t)).length, done: inSprint.filter(isDone).length }
  const tasks = inSprint.filter((t) => (tab === 'done') === isDone(t))
  const task = tasks.find((t) => t.key === selectedKey) ?? tasks[0]
  const taskKey = task?.key

  useEffect(() => {
    if (!taskKey) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onNewSession(taskKey)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [taskKey, onNewSession])

  useEffect(() => {
    if (!api || !taskKey) return
    let alive = true
    setPrs({ key: taskKey })
    api.integrations
      .pullRequests(taskKey)
      .then((list) => {
        if (alive) setPrs({ key: taskKey, list: list.map(toPr) })
      })
      .catch((e: unknown) => {
        if (alive) setPrs({ key: taskKey, error: errorText(e) })
      })
    return () => {
      alive = false
    }
  }, [api, taskKey])

  const current = prs?.key === taskKey ? prs : null
  const taskPrs = api ? (current?.list ?? []) : (task?.prs ?? [])
  const prsLoading = !!api && !!taskKey && !current?.list && !current?.error
  const site = api ? (jira?.site ?? '…') : JIRA_SITE
  const syncedLabel = api ? (syncedAt ? relativeTime(syncedAt, nowMs) : '…') : synced

  if (api && jira?.status === 'disconnected') {
    return (
      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          paddingBottom: 60,
          textAlign: 'center',
          background: 'var(--panel)'
        }}
      >
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
          task_alt
        </span>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Jira isn’t connected</div>
        <div style={{ maxWidth: 380, fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)', textWrap: 'pretty' }}>
          Connect Jira Cloud to see the tasks assigned to you and start sessions from them.
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <PrimaryButton onClick={onConnect}>Connect Jira</PrimaryButton>
        </div>
      </main>
    )
  }

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', background: 'var(--panel)' }}>
      <section
        style={{
          width: 440,
          flexShrink: 0,
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)'
        }}
      >
        <div className="drag" style={{ padding: '22px 20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Jira tasks</h1>
            <span style={{ flex: 1 }} />
            <button aria-label="Refresh" onClick={() => (api ? load(true) : setSynced('just now'))} style={{ display: 'flex' }}>
              <Icon name="refresh" size={18} color="var(--tx3)" />
            </button>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
            Assigned to you in the active sprint · {site} · synced {syncedLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 12px' }}>
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
            {(['open', 'done'] as const).map((id) => {
              const on = tab === id
              return (
                <button
                  key={id}
                  onClick={() => setTab(id)}
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
                  {id === 'open' ? 'Open' : 'Done'}
                  <span style={{ color: 'var(--tx3)', fontWeight: 400 }}>{counts[id]}</span>
                </button>
              )
            })}
          </div>
          <span style={{ flex: 1 }} />
          <SelectChip
            label="Sprint"
            value={sprint}
            onChange={setSprint}
            options={[{ value: '', label: 'Current' }, ...sprints.map((s) => ({ value: s, label: s }))]}
          />
        </div>
        <div style={{ borderTop: '1px solid var(--line)', flex: 1, minHeight: 0, overflow: 'auto' }}>
          {issuesError && (
            <div className="selectable" style={{ padding: '12px 20px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--err)' }}>
              {issuesError}
            </div>
          )}
          {tasks.map((t) => (
            <TaskRow key={t.key} t={t} selected={t.key === task?.key} onSelect={() => setSelectedKey(t.key)} />
          ))}
        </div>
      </section>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
        {task && (
          <>
            <div
              className="drag"
              style={{ padding: '24px 28px 18px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--line)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
                <span style={{ font: "500 12.5px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>{task.key}</span>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 22,
                    padding: '0 8px',
                    border: '1px solid var(--line)',
                    borderRadius: 11,
                    color: 'var(--tx2)'
                  }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor(task) }} />
                  {task.status}
                </span>
                <span style={{ flex: 1 }} />
                <a
                  href={task.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--tx3)', textDecoration: 'none' }}
                >
                  Open in Jira
                  <Icon name="open_in_new" size={14} />
                </a>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                <h2
                  style={{
                    margin: 0,
                    flex: 1,
                    fontSize: 21,
                    lineHeight: 1.3,
                    fontWeight: 600,
                    letterSpacing: '-.01em',
                    textWrap: 'pretty'
                  }}
                >
                  {task.title}
                </h2>
                <PrimaryButton icon="add" hint="⌘N" onClick={() => onNewSession(task.key)} style={{ height: 34, flexShrink: 0 }}>
                  New session for this task
                </PrimaryButton>
              </div>
              <div style={{ display: 'flex', gap: 22, fontSize: 12.5, color: 'var(--tx3)' }}>
                <Meta label="Priority" value={task.priority} />
                <Meta label="Sprint" value={task.sprint} />
                <Meta label="Reporter" value={task.reporter} />
                {task.points !== null && <Meta label="Points" value={task.points} />}
                <Meta label="Updated" value={task.updated} />
              </div>
              <div
                className="selectable no-drag"
                style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--tx2)', maxWidth: 720, textWrap: 'pretty', whiteSpace: 'pre-wrap' }}
              >
                {task.description}
              </div>
            </div>
            <div style={{ padding: '18px 0 0', display: 'flex', flexDirection: 'column' }}>
              <SectionTitle title="Sessions" count={task.sessions.length} top={0} />
              <div style={{ borderTop: '1px solid var(--line)' }}>
                {task.sessions.map((s) => (
                  <SessionRow key={s.id} s={s} compact onOpen={() => onOpenSession(s.id)} onAllow={() => onOpenSession(s.id)} />
                ))}
              </div>
              {prsLoading && <Note>Loading pull requests…</Note>}
              {current?.error && <Note color="var(--err)">{current.error}</Note>}
              {taskPrs.length > 0 && (
                <>
                  <SectionTitle title="Pull requests" count={taskPrs.length} top={24} />
                  <div style={{ borderTop: '1px solid var(--line)' }}>
                    {taskPrs.map((p) => (
                      <PrRow key={`${p.num}${p.branch}`} p={p} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
