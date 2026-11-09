import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { JiraIssue, PullRequestInfo } from '@shared/integrations'
import { Icon, JiraKey, Spinner } from './primitives'

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key) as Promise<T> | undefined
  if (hit) return hit
  const p = load()
  cache.set(key, p)
  p.catch(() => cache.delete(key))
  setTimeout(() => cache.delete(key), 120_000)
  return p
}

const cleanError = (m: string) => m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function useHoverLoad<T>(key: string, load: () => Promise<T>) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Load<T>>({ state: 'loading' })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = () => {
    timer.current = setTimeout(() => {
      setOpen(true)
      cached(key, load)
        .then((d) => setData({ state: 'ready', data: d }))
        .catch((err: Error) => setData({ state: 'error', message: cleanError(err.message) }))
    }, 350)
  }
  const hide = () => {
    if (timer.current) clearTimeout(timer.current)
    setOpen(false)
  }
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  return { open, data, show, hide }
}

function Popover({ children, width }: { children: ReactNode; width: number }) {
  return (
    <span role="tooltip" style={{ display: 'block', position: 'absolute', top: '100%', right: 0, paddingTop: 6, zIndex: 40 }}>
      <span
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 10,
          boxShadow: 'var(--pop)',
          overflow: 'hidden',
          cursor: 'default',
          textAlign: 'left',
          whiteSpace: 'normal'
        }}
      >
        {children}
      </span>
    </span>
  )
}

function Note({ children, color = 'var(--tx3)' }: { children: ReactNode; color?: string }) {
  return <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', fontSize: 12.5, color }}>{children}</span>
}

const open = (url: string) => window.open(url, '_blank')

const DOT: Record<JiraIssue['statusCategory'], string> = { new: 'var(--tx3)', indeterminate: 'var(--run)', done: 'var(--ok)' }

export function openJiraIssue(jiraKey: string): void {
  const api = window.kokpit
  void cached(`jira:${jiraKey}`, () => api?.integrations.jiraIssue(jiraKey) ?? Promise.resolve(null)).then((i) => i && open(i.url))
}

export function JiraChip({ jiraKey }: { jiraKey: string }) {
  const api = window.kokpit
  const { open: isOpen, data, show, hide } = useHoverLoad(`jira:${jiraKey}`, () => api?.integrations.jiraIssue(jiraKey) ?? Promise.resolve(null))
  const issue = data.state === 'ready' ? data.data : null
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => {
        e.stopPropagation()
        if (issue) open(issue.url)
        else openJiraIssue(jiraKey)
      }}
    >
      <span style={{ cursor: 'pointer' }}>
        <JiraKey>{jiraKey}</JiraKey>
      </span>
      {isOpen && (
        <Popover width={340}>
          {data.state === 'loading' && (
            <Note>
              <Spinner size={11} /> Loading {jiraKey}…
            </Note>
          )}
          {data.state === 'error' && <Note color="var(--err)">{data.message}</Note>}
          {data.state === 'ready' && !issue && <Note>Jira isn’t connected. Connect it on the Connections page.</Note>}
          {issue && (
            <>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ font: "500 12px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>{issue.key}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 20, padding: '0 7px', border: '1px solid var(--line)', borderRadius: 10, color: 'var(--tx2)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT[issue.statusCategory] }} />
                    {issue.status}
                  </span>
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: 'var(--tx)' }}>{issue.title}</span>
                <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{[issue.priority, issue.sprint, issue.reporter && `by ${issue.reporter}`].filter(Boolean).join(' · ')}</span>
              </span>
              <button
                className="menu-item"
                onClick={() => open(issue.url)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderTop: '1px solid var(--line-soft)', fontSize: 12.5, fontWeight: 500, color: 'var(--tx)', textAlign: 'left', cursor: 'pointer' }}
              >
                Open in Jira
                <Icon name="open_in_new" size={14} color="var(--tx3)" />
              </button>
            </>
          )}
        </Popover>
      )}
    </span>
  )
}

function checksLine(c: PullRequestInfo['checks']): [string, string] {
  if (!c.total) return ['No checks', 'var(--tx3)']
  if (c.failed) return [`${c.failed} failed`, 'var(--err)']
  if (c.pending) return [`${c.pending} running`, 'var(--run)']
  return ['Checks passed', 'var(--ok)']
}

export function PrChip({ label, url, jiraKey }: { label: string; url: string; jiraKey: string }) {
  const api = window.kokpit
  const load = async (): Promise<PullRequestInfo[]> => {
    if (!api) return []
    const list = jiraKey ? await api.integrations.pullRequests(jiraKey) : url ? await api.integrations.pullRequestsByUrl([url]) : []
    const rank = { Open: 0, Draft: 1, Merged: 2, Closed: 3 }
    return [...list].sort((a, b) => rank[a.state] - rank[b.state])
  }
  const key = `prs:${jiraKey || url}`
  const { open: isOpen, data, show, hide } = useHoverLoad(key, load)
  const many = data.state === 'ready' && data.data.length > 1
  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onClick={(e) => {
        e.stopPropagation()
        void cached(key, load).then((list) => {
          if (list.length > 1) return
          const target = list[0]?.url ?? url
          if (target) open(target)
        })
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, font: "12px/1 'Geist Mono',monospace", color: 'var(--tx2)', cursor: many ? 'default' : 'pointer' }}>
        <Icon name="merge" size={14} color="var(--tx3)" />
        {label}
      </span>
      {isOpen && (
        <Popover width={380}>
          <span style={{ padding: '10px 14px 6px', fontSize: 11.5, color: 'var(--tx3)' }}>
            {jiraKey ? `Pull requests for ${jiraKey}` : 'Pull request'}
          </span>
          {data.state === 'loading' && (
            <Note>
              <Spinner size={11} /> Loading…
            </Note>
          )}
          {data.state === 'error' && <Note color="var(--err)">{data.message}</Note>}
          {data.state === 'ready' && data.data.length === 0 && <Note>No pull requests.</Note>}
          {data.state === 'ready' &&
            data.data.map((p) => {
              const [text, color] = checksLine(p.checks)
              return (
                <span
                  key={p.url}
                  role="link"
                  tabIndex={0}
                  className="menu-item"
                  onClick={() => open(p.url)}
                  onKeyDown={(e) => e.key === 'Enter' && open(p.url)}
                  style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 14px', borderTop: '1px solid var(--line-soft)', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>
                    {p.repo.split('/')[1] ?? p.repo} #{p.number} · {p.state} · <span style={{ color }}>{text}</span>
                    {p.reviews.approved ? ` · ${p.reviews.approved} approved` : ''}
                    {p.reviews.changesRequested ? <span style={{ color: 'var(--err)' }}> · changes requested</span> : null}
                  </span>
                </span>
              )
            })}
          {many && data.state === 'ready' && (
            <button
              className="menu-item"
              onClick={() => data.data.forEach((p) => open(p.url))}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderTop: '1px solid var(--line)', fontSize: 12.5, fontWeight: 500, color: 'var(--tx)', textAlign: 'left' }}
            >
              Open all {data.data.length}
              <Icon name="open_in_new" size={14} color="var(--tx3)" />
            </button>
          )}
        </Popover>
      )}
    </span>
  )
}
