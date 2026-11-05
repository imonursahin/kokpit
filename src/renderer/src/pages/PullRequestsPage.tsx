import { useEffect, useMemo, useRef, useState } from 'react'
import type { MyPullRequests, PullRequestInfo } from '@shared/integrations'
import { jiraKeyFrom, type SessionIndexItem } from '@shared/sessionIndex'
import { relativeTime } from '@shared/time'
import { Dash, Icon, JiraKey, OpenButton, PrimaryButton } from '@/components/primitives'

const COLS = '18px 64px minmax(0,1fr) 150px 84px 170px 150px 74px 96px'

function checksText(c: PullRequestInfo['checks']): [string, string, string] {
  if (!c.total) return ['No checks', 'var(--tx3)', 'remove']
  if (c.failed) return [`${c.failed} of ${c.total} failed`, 'var(--err)', 'error']
  if (c.pending) return [`${c.passed}/${c.total} · ${c.pending} running`, 'var(--run)', 'progress_activity']
  return [`All ${c.total} passed`, 'var(--ok)', 'check_circle']
}

function ChecksCell({ checks, text, color, icon }: { checks: PullRequestInfo['checks']; text: string; color: string; icon: string }) {
  const [open, setOpen] = useState(false)
  const names = checks.failedNames
  return (
    <span
      style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color, whiteSpace: 'nowrap' }}
      onMouseEnter={() => names.length && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Icon name={icon} size={15} color={color} />
      <span style={names.length ? { textDecoration: 'underline dotted', textUnderlineOffset: 3 } : undefined}>{text}</span>
      {open && (
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 220,
            maxWidth: 360,
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            boxShadow: 'var(--pop)',
            color: 'var(--tx)',
            cursor: 'default'
          }}
        >
          <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Failed checks</span>
          {names.map((n, i) => (
            <span key={`${n}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, whiteSpace: 'normal' }}>
              <Icon name="cancel" size={14} color="var(--err)" />
              {n || 'Unnamed check'}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}

function ReviewsCell({ reviews }: { reviews: PullRequestInfo['reviews'] }) {
  if (reviews.changesRequested)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--err)', whiteSpace: 'nowrap' }}>
        <Icon name="cancel" size={15} color="var(--err)" />
        Changes requested{reviews.approved ? ` · ${reviews.approved} approved` : ''}
      </span>
    )
  if (reviews.approved)
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok)', whiteSpace: 'nowrap' }}>
        <Icon name="check_circle" size={15} color="var(--ok)" />
        {reviews.approved} approved
      </span>
    )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
      <Icon name="remove" size={15} color="var(--tx3)" />
      No reviews yet
    </span>
  )
}

function StateChip({ state }: { state: PullRequestInfo['state'] }) {
  const draft = state === 'Draft'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 9px 0 7px',
        borderRadius: 11,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        background: draft ? 'var(--hover)' : 'var(--ok-bg)',
        color: draft ? 'var(--tx2)' : 'var(--ok)'
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: draft ? 'var(--tx3)' : 'var(--ok)' }} />
      {state}
    </span>
  )
}

function Header() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLS,
        columnGap: 14,
        padding: '8px 28px',
        fontSize: 11.5,
        color: 'var(--tx3)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)'
      }}
    >
      <span />
      <span>PR</span>
      <span>Title / branch</span>
      <span>Repo</span>
      <span>Jira</span>
      <span>Checks</span>
      <span>Reviews</span>
      <span>Status</span>
      <span />
    </div>
  )
}

function PrRow({
  pr,
  sessions,
  showAuthor,
  nowMs,
  onOpenSession
}: {
  pr: PullRequestInfo
  sessions: SessionIndexItem[]
  showAuthor: boolean
  nowMs: number
  onOpenSession: (id: string) => void
}) {
  const [text, color, icon] = checksText(pr.checks)
  const first = sessions[0]
  const jira = sessions.find((s) => s.jira)?.jira || jiraKeyFrom(pr.branch, pr.title)
  const meta = [
    `${pr.branch} → ${pr.base}`,
    showAuthor && pr.author ? `by @${pr.author}` : '',
    pr.updatedAt ? `updated ${relativeTime(pr.updatedAt, nowMs)}` : '',
    sessions.length ? `${sessions.length} session${sessions.length === 1 ? '' : 's'}` : ''
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <div
      role={first ? 'button' : undefined}
      tabIndex={first ? 0 : undefined}
      onClick={() => first && onOpenSession(first.id)}
      onKeyDown={(e) => e.key === 'Enter' && first && onOpenSession(first.id)}
      className={first ? 'menu-item' : undefined}
      style={{
        display: 'grid',
        gridTemplateColumns: COLS,
        columnGap: 14,
        alignItems: 'center',
        padding: '0 28px',
        minHeight: 58,
        borderBottom: '1px solid var(--line-soft)',
        cursor: first ? 'pointer' : 'default'
      }}
    >
      <Icon name="merge" size={17} color={pr.state === 'Draft' ? 'var(--tx3)' : 'var(--ok)'} />
      <span style={{ font: "500 12px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>#{pr.number}</span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pr.title}</span>
        <span
          style={{ font: "11.5px 'Geist Mono',monospace", color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {meta}
        </span>
      </div>
      <span style={{ font: "12px 'Geist Mono',monospace", color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {pr.repo.split('/')[1] ?? pr.repo}
      </span>
      <div>{jira ? <JiraKey>{jira}</JiraKey> : <Dash />}</div>
      <ChecksCell checks={pr.checks} text={text} color={color} icon={icon} />
      <ReviewsCell reviews={pr.reviews} />
      <div>
        <StateChip state={pr.state} />
      </div>
      <OpenButton url={pr.url} />
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '20px 28px 10px' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 13, color: 'var(--tx3)' }}>{count}</span>
      </div>
      <Header />
      {children}
    </>
  )
}

function Empty({ children }: { children: string }) {
  return <div style={{ padding: '14px 28px', fontSize: 12.5, color: 'var(--tx3)', borderBottom: '1px solid var(--line-soft)' }}>{children}</div>
}

export function PullRequestsPage({
  items,
  onOpenSession,
  onConnect,
  refreshMinutes = 1,
  includeDraftReviews = true
}: {
  items: SessionIndexItem[]
  onOpenSession: (id: string) => void
  onConnect: () => void
  refreshMinutes?: number
  includeDraftReviews?: boolean
}) {
  const api = window.kokpit
  const [data, setData] = useState<MyPullRequests | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(true)
  const [syncedAt, setSyncedAt] = useState('')
  const [attempt, setAttempt] = useState(0)
  const forceNext = useRef(false)
  const [loading, setLoading] = useState(false)
  const request = useRef(0)

  const sessionsByUrl = useMemo(() => {
    const map = new Map<string, SessionIndexItem[]>()
    for (const i of items) {
      if (i.headless || !i.prUrl) continue
      map.set(i.prUrl, [...(map.get(i.prUrl) ?? []), i])
    }
    return map
  }, [items])

  useEffect(() => {
    if (!api) return
    const mine = ++request.current
    setError(null)
    setLoading(true)
    void api.integrations
      .status()
      .then(async (status) => {
        if (mine !== request.current) return
        const gh = status.find((s) => s.id === 'github')
        if (!gh || gh.status === 'disconnected') {
          setConnected(false)
          setData({ mine: [], reviews: [] })
          return
        }
        setConnected(true)
        const force = forceNext.current
        forceNext.current = false
        const result = await api.integrations.myPullRequests(force)
        if (mine !== request.current) return
        setData(result)
        setSyncedAt(result.fetchedAt ?? new Date().toISOString())
      })
      .catch((err: Error) => mine === request.current && setError(err.message))
      .finally(() => mine === request.current && setLoading(false))
  }, [api, attempt])

  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') setAttempt((a) => a + 1)
    }, refreshMinutes * 60_000)
    return () => window.clearInterval(t)
  }, [refreshMinutes])

  const draftSetting = useRef(includeDraftReviews)
  useEffect(() => {
    if (draftSetting.current === includeDraftReviews) return
    draftSetting.current = includeDraftReviews
    setAttempt((a) => a + 1)
  }, [includeDraftReviews])

  const now = Date.now()
  const row = (pr: PullRequestInfo, showAuthor: boolean) => (
    <PrRow key={pr.url} pr={pr} sessions={sessionsByUrl.get(pr.url) ?? []} showAuthor={showAuthor} nowMs={now} onOpenSession={onOpenSession} />
  )

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
      <div className="drag" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Pull requests</h1>
        <span style={{ flex: 1 }} />
        <button
          aria-label={loading ? 'Refreshing' : 'Refresh'}
          aria-busy={loading}
          disabled={loading}
          onClick={() => {
            forceNext.current = true
            setAttempt((a) => a + 1)
          }}
          className="menu-item"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            padding: '0 10px 0 8px',
            borderRadius: 7,
            border: '1px solid var(--line)',
            fontSize: 12.5,
            color: loading ? 'var(--tx3)' : 'var(--tx2)',
            cursor: loading ? 'default' : 'pointer'
          }}
        >
          <Icon
            name="refresh"
            size={17}
            color={loading ? 'var(--run)' : 'var(--tx2)'}
            style={loading ? { animation: 'dcspin .9s linear infinite' } : undefined}
          />
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      <div style={{ padding: '0 28px 4px', fontSize: 12.5, color: 'var(--tx3)' }}>
        Open pull requests, drafts included · GitHub
        {syncedAt ? ` · synced ${relativeTime(syncedAt, now)}` : ''} · checks every {refreshMinutes === 1 ? 'minute' : `${refreshMinutes} minutes`}
        {includeDraftReviews ? '' : ' · draft review requests hidden'}
      </div>
      <div style={{ height: 2, margin: '10px 0 0', background: loading ? 'var(--run-bg)' : 'transparent', overflow: 'hidden', position: 'relative' }}>
        {loading && <div className="kokpit-progress" />}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 24, opacity: loading && data ? 0.6 : 1, transition: 'opacity .15s' }}>
        {!connected && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>GitHub is not connected</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 380 }}>Connect GitHub to see your open pull requests and the ones waiting for your review.</div>
            <PrimaryButton onClick={onConnect}>Connect GitHub</PrimaryButton>
          </div>
        )}
        {error && <div style={{ padding: '18px 28px', fontSize: 12.5, color: 'var(--err)' }}>{error.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}</div>}
        {!error && data?.staleReason && (
          <div style={{ padding: '14px 28px 0', fontSize: 12.5, color: 'var(--wait-tx)' }}>
            GitHub didn’t answer the last refresh ({data.staleReason.replace(/^Error: /, '')}). Showing the list from {relativeTime(syncedAt, now)}.
          </div>
        )}
        {connected && (
          <>
            <Section title="Waiting for your review" count={data?.reviews.length ?? 0}>
              {data === null ? <Empty>Loading…</Empty> : data.reviews.length ? data.reviews.map((p) => row(p, true)) : <Empty>Nobody is waiting for your review.</Empty>}
            </Section>
            <Section title="Your open pull requests" count={data?.mine.length ?? 0}>
              {data === null ? <Empty>Loading…</Empty> : data.mine.length ? data.mine.map((p) => row(p, false)) : <Empty>You have no open pull requests.</Empty>}
            </Section>
          </>
        )}
      </div>
    </main>
  )
}
