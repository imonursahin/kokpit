import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Page, SessionSummary } from '@shared/types'
import type { SessionIndexItem } from '@shared/sessionIndex'
import type { JiraIssue, MyPullRequests } from '@shared/integrations'
import type { DoctorCheck, PlanUsage, PlanWindow } from '@shared/settings'
import { Icon, PrimaryButton } from '@/components/primitives'
import { SessionRow } from '@/components/SessionRow'
import { DoctorButton } from '@/components/DoctorButton'
import { openAboutSettings, openSettingsSection, useUpdate } from '@/data/useUpdate'

const DAY_MS = 86_400_000
const cleanError = (m: string) => m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const usd = (n: number) => (n >= 100 ? `$${Math.round(n)}` : `$${n.toFixed(2)}`)

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

type Day = { start: number; label: string; cost: number }

function lastSevenDays(items: SessionIndexItem[], nowMs: number): Day[] {
  const today = startOfDay(nowMs)
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const start = today - (6 - i) * DAY_MS
    return { start, label: new Date(start).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), cost: 0 }
  })
  for (const it of items) {
    const t = Date.parse(it.lastAt)
    const day = days.find((d) => t >= d.start && t < d.start + DAY_MS)
    if (day) day.cost += it.costUsd
  }
  return days
}

function Section({ title, count, action, children }: { title: ReactNode; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '22px 28px 10px' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        {count !== undefined && <span style={{ fontSize: 13, color: 'var(--tx3)' }}>{count}</span>}
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </section>
  )
}

type NowTab = 'running' | 'unread'

const NOW_TABS: { id: NowTab; label: string; empty: string }[] = [
  { id: 'running', label: 'Running now', empty: 'Nothing is running.' },
  { id: 'unread', label: 'Unread', empty: 'You opened every finished session.' }
]

function NowTabs({ tab, counts, onTab }: { tab: NowTab; counts: Record<NowTab, number>; onTab: (t: NowTab) => void }) {
  return (
    <span role="tablist" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, padding: 2, background: 'var(--hover)', borderRadius: 8, fontSize: 12.5, fontWeight: 400, color: 'var(--tx2)' }}>
      {NOW_TABS.map((t) => {
        const on = tab === t.id
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              ...(on ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)', fontWeight: 500, color: 'var(--tx)' } : {})
            }}
          >
            {t.label}
            <span style={{ color: 'var(--tx3)', fontWeight: 400 }}>{counts[t.id]}</span>
          </button>
        )
      })}
    </span>
  )
}

function LinkButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12.5, color: 'var(--tx2)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {children}
      <Icon name="chevron_right" size={16} color="var(--tx3)" />
    </button>
  )
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 12 }}>
      <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{hint}</span>
    </div>
  )
}

function CostChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(...days.map((d) => d.cost), 0.01)
  const h = 96
  return (
    <div style={{ gridColumn: 4, gridRow: '1 / 3', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 12, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Cost per day, last 7 days</span>
      <div role="list" aria-label="Cost per day, last 7 days" style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h, position: 'relative' }}>
        {days.map((d, i) => {
          const barH = d.cost > 0 ? Math.max(3, Math.round((d.cost / max) * (h - 18))) : 0
          return (
            <div
              key={d.start}
              role="listitem"
              aria-label={`${d.label}: ${usd(d.cost)}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative', cursor: 'default' }}
            >
              {hover === i && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: barH + 6,
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    boxShadow: 'var(--pop)',
                    fontSize: 11.5,
                    whiteSpace: 'nowrap',
                    color: 'var(--tx)',
                    zIndex: 2,
                    pointerEvents: 'none'
                  }}
                >
                  {d.label} · {usd(d.cost)}
                </span>
              )}
              <span
                style={{
                  width: '100%',
                  maxWidth: 28,
                  height: barH,
                  borderRadius: '4px 4px 0 0',
                  background: 'var(--tx)',
                  opacity: hover === null || hover === i ? 0.85 : 0.35
                }}
              />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 2, borderTop: '1px solid var(--line)', paddingTop: 6 }}>
        {days.map((d) => (
          <span key={d.start} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
            {d.label.split(' ')[0]}
          </span>
        ))}
      </div>
    </div>
  )
}

function resetsIn(iso: string, nowMs: number): string {
  const ms = Date.parse(iso) - nowMs
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'resets now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h >= 24) return `resets in ${Math.floor(h / 24)}d ${h % 24}h`
  return h ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

function LimitBar({ w, nowMs }: { w: PlanWindow; nowMs: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(w.utilization)))
  const color = pct >= 90 ? 'var(--err)' : pct >= 70 ? 'var(--wait-tx)' : 'var(--tx)'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.label}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={w.label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: 6, borderRadius: 3, background: 'var(--hover)', overflow: 'hidden' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: color, opacity: color === 'var(--tx)' ? 0.85 : 1 }} />
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{w.resetsAt ? resetsIn(w.resetsAt, nowMs) : ''}</span>
    </div>
  )
}

function PlanLimits({ usage, nowMs }: { usage: Load<PlanUsage>; nowMs: number }) {
  if (usage.state === 'ready' && !usage.data.available) return null
  const windows = usage.state === 'ready' ? usage.data.windows : []
  return (
    <div style={{ gridColumn: '1 / 4', padding: '16px 18px', border: '1px solid var(--line)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>Plan limits</span>
        {usage.state === 'ready' && usage.data.plan && (
          <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Claude {usage.data.plan[0]?.toUpperCase()}{usage.data.plan.slice(1)}</span>
        )}
      </div>
      {usage.state === 'loading' && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Loading…</span>}
      {usage.state === 'error' && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Could not read plan limits: {cleanError(usage.message)}</span>}
      {usage.state === 'ready' && windows.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No limit used yet in the current windows.</span>}
      {windows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 22 }}>
          {windows.map((w) => (
            <LimitBar key={w.id} w={w} nowMs={nowMs} />
          ))}
        </div>
      )}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action: ReactNode; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid var(--line-soft)' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <span style={{ flex: 1 }} />
        {action}
      </div>
      {children}
    </div>
  )
}

function Counts({ items }: { items: { label: string; value: number; color?: string }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', padding: '14px 18px', gap: 10 }}>
      {items.map((c) => (
        <div key={c.label} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '12px 14px', borderRadius: 10, background: 'var(--hover)' }}>
          <span style={{ fontSize: 20, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.value > 0 && c.color ? c.color : 'var(--tx)' }}>{c.value}</span>
          <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>{c.label}</span>
        </div>
      ))}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--tx3)' }}>{children}</div>
}

const JIRA_GROUPS: { id: string; label: string; match: (i: JiraIssue) => boolean }[] = [
  { id: 'todo', label: 'To do', match: (i) => i.statusCategory === 'new' },
  { id: 'progress', label: 'In progress', match: (i) => i.statusCategory === 'indeterminate' && !/review/i.test(i.status) },
  { id: 'review', label: 'In review', match: (i) => i.statusCategory === 'indeterminate' && /review/i.test(i.status) },
  { id: 'done', label: 'Done', match: (i) => i.statusCategory === 'done' }
]

type Load<T> = { state: 'loading' } | { state: 'off' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

export function OverviewPage({
  sessions,
  items,
  onOpen,
  onAllow,
  onNew,
  onGo
}: {
  sessions: SessionSummary[]
  items: SessionIndexItem[]
  onOpen: (id: string) => void
  onAllow: (id: string, askId?: string) => void
  onNew: () => void
  onGo: (page: Page) => void
}) {
  const api = window.kokpit
  const [jira, setJira] = useState<Load<JiraIssue[]>>({ state: 'loading' })
  const [prs, setPrs] = useState<Load<MyPullRequests>>({ state: 'loading' })
  const [checks, setChecks] = useState<DoctorCheck[] | null>(null)
  const update = useUpdate()
  const [plan, setPlan] = useState<Load<PlanUsage>>({ state: 'loading' })
  const [nowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!api) return
    let alive = true
    void api.integrations.status().then((list) => {
      if (!alive) return
      const on = (id: 'jira' | 'github') => list.find((c) => c.id === id)?.status === 'connected'
      if (on('jira'))
        api.integrations
          .jiraIssues()
          .then((data) => alive && setJira({ state: 'ready', data }))
          .catch((err: Error) => alive && setJira({ state: 'error', message: err.message }))
      else setJira({ state: 'off' })
      if (on('github'))
        api.integrations
          .myPullRequests()
          .then((data) => alive && setPrs({ state: 'ready', data }))
          .catch((err: Error) => alive && setPrs({ state: 'error', message: err.message }))
      else setPrs({ state: 'off' })
    })
    void api.doctor().then((list) => alive && setChecks(list))
    api
      .planUsage()
      .then((data) => alive && setPlan({ state: 'ready', data }))
      .catch((err: Error) => alive && setPlan({ state: 'error', message: err.message }))
    return () => {
      alive = false
    }
  }, [api])

  const waiting = sessions.filter((s) => s.status === 'waiting')
  const running = sessions.filter((s) => s.status === 'running')
  const unread = sessions.filter((s) => s.unread && s.status === 'done')
  const [nowTab, setNowTab] = useState<NowTab | null>(null)
  const nowLists: Record<NowTab, SessionSummary[]> = { running: [...waiting, ...running], unread }
  const activeNow: NowTab = nowTab ?? (waiting.length + running.length ? 'running' : 'unread')
  const recent = sessions.filter((s) => s.status !== 'waiting' && s.status !== 'running').slice(0, 5)

  const shown = useMemo(() => {
    const ids = new Set(sessions.map((s) => s.id))
    return items.filter((i) => ids.has(i.id))
  }, [items, sessions])
  const days = useMemo(() => lastSevenDays(shown, nowMs), [shown, nowMs])
  const today = days[days.length - 1]
  const todayStart = today?.start ?? startOfDay(nowMs)
  const activeToday = shown.filter((i) => Date.parse(i.lastAt) >= todayStart).length
  const week = days.reduce((sum, d) => sum + d.cost, 0)

  const failing = prs.state === 'ready' ? prs.data.mine.filter((p) => p.checks.failed > 0) : []
  const reviews = prs.state === 'ready' ? prs.data.reviews : []

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)', overflow: 'auto' }}>
      <div className="drag" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Overview</h1>
          <span style={{ fontSize: 13, color: 'var(--tx2)' }}>
            {new Date(nowMs).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
          </span>
        </div>
        <span style={{ flex: 1 }} />
        {update?.hasUpdate && (
          <button
            onClick={() => openAboutSettings(onGo)}
            className="no-drag"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              height: 32,
              padding: '0 12px 0 10px',
              borderRadius: 8,
              background: 'var(--run-bg)',
              border: '1px solid var(--line)',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--tx)'
            }}
          >
            <Icon name="system_update_alt" size={17} color="var(--run)" />
            Kokpit {update.latest} is available
          </button>
        )}
        <DoctorButton checks={checks} onOpen={() => openSettingsSection('doctor', onGo)} />
        <PrimaryButton icon="add" hint="⌘N" onClick={onNew}>
          New session
        </PrimaryButton>
      </div>


      {waiting.length + running.length + unread.length > 0 && (
        <Section title={<NowTabs tab={activeNow} counts={{ running: waiting.length + running.length, unread: unread.length }} onTab={setNowTab} />}>
          <div role="tabpanel" style={{ borderTop: '1px solid var(--line)' }}>
            {nowLists[activeNow].length ? (
              nowLists[activeNow].map((s) => <SessionRow key={s.id} s={s} onOpen={() => onOpen(s.id)} onAllow={() => onAllow(s.id, s.askId)} />)
            ) : (
              <Empty>{NOW_TABS.find((t) => t.id === activeNow)?.empty}</Empty>
            )}
          </div>
        </Section>
      )}

      <Section title="Usage">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr)) minmax(260px, 2fr)', gap: 12, padding: '0 28px' }}>
          <Tile label="Active today" value={String(activeToday)} hint={`session${activeToday === 1 ? '' : 's'} with activity today`} />
          <Tile label="Spent today" value={usd(today?.cost ?? 0)} hint="by last activity" />
          <Tile label="Last 7 days" value={usd(week)} hint="by last activity" />
          <CostChart days={days} />
          <PlanLimits usage={plan} nowMs={nowMs} />
        </div>
      </Section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, padding: '22px 28px 0' }}>
        <Card title="Jira · active sprint" action={<LinkButton onClick={() => onGo('jira')}>Jira tasks</LinkButton>}>
          {jira.state === 'loading' && <Empty>Loading…</Empty>}
          {jira.state === 'off' && (
            <Empty>
              Jira isn’t connected. <LinkButton onClick={() => onGo('connections')}>Connect</LinkButton>
            </Empty>
          )}
          {jira.state === 'error' && <Empty>{cleanError(jira.message)}</Empty>}
          {jira.state === 'ready' && <Counts items={JIRA_GROUPS.map((g) => ({ label: g.label, value: jira.data.filter(g.match).length }))} />}
        </Card>

        <Card title="Pull requests" action={<LinkButton onClick={() => onGo('prs')}>Pull requests</LinkButton>}>
          {prs.state === 'loading' && <Empty>Loading…</Empty>}
          {prs.state === 'off' && (
            <Empty>
              GitHub isn’t connected. <LinkButton onClick={() => onGo('connections')}>Connect</LinkButton>
            </Empty>
          )}
          {prs.state === 'error' && <Empty>{cleanError(prs.message)}</Empty>}
          {prs.state === 'ready' && (
            <Counts
              items={[
                { label: 'CI failing', value: failing.length, color: 'var(--err)' },
                { label: 'Open', value: prs.data.mine.filter((p) => p.state !== 'Draft').length },
                { label: 'Draft', value: prs.data.mine.filter((p) => p.state === 'Draft').length },
                { label: 'Waiting your review', value: reviews.length, color: 'var(--wait-tx)' }
              ]}
            />
          )}
        </Card>
      </div>

      <Section title="Recent sessions" action={<LinkButton onClick={() => onGo('sessions')}>All sessions</LinkButton>}>
        <div style={{ borderTop: '1px solid var(--line)', marginBottom: 28 }}>
          {recent.length ? (
            recent.map((s) => <SessionRow key={s.id} s={s} onOpen={() => onOpen(s.id)} onAllow={() => onAllow(s.id, s.askId)} />)
          ) : (
            <Empty>No sessions yet.</Empty>
          )}
        </div>
      </Section>
    </main>
  )
}
