import { useEffect, useState } from 'react'
import type { CalendarEvent, CalendarRange } from '@shared/integrations'
import { Icon, PrimaryButton } from '@/components/primitives'
import { errorText } from '@/data/useIntegrations'

const DAY_MS = 86_400_000

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

function startOf(e: CalendarEvent): Date {
  return e.allDay ? new Date(`${e.start}T00:00:00`) : new Date(e.start)
}

export function groupByDay(events: CalendarEvent[]): { day: Date; events: CalendarEvent[] }[] {
  const out = new Map<string, { day: Date; events: CalendarEvent[] }>()
  for (const e of events) {
    const s = startOf(e)
    const day = new Date(s.getFullYear(), s.getMonth(), s.getDate())
    const k = dayKey(day)
    if (!out.has(k)) out.set(k, { day, events: [] })
    out.get(k)?.events.push(e)
  }
  return [...out.values()]
    .sort((a, b) => a.day.getTime() - b.day.getTime())
    .map((g) => ({ ...g, events: g.events.sort((a, b) => Number(b.allDay) - Number(a.allDay) || startOf(a).getTime() - startOf(b).getTime()) }))
}

export function todayFirst<T extends { day: Date }>(groups: T[], nowMs: number): T[] {
  const today = dayKey(new Date(nowMs))
  return [...groups.filter((g) => dayKey(g.day) === today), ...groups.filter((g) => dayKey(g.day) !== today)]
}

export function whenLabel(e: CalendarEvent, nowMs: number): { text: string; tone: 'now' | 'soon' | 'past' | '' } {
  if (e.allDay) return { text: '', tone: '' }
  const start = Date.parse(e.start)
  const end = Date.parse(e.end)
  if (nowMs >= end) return { text: '', tone: 'past' }
  if (nowMs >= start) return { text: 'Now', tone: 'now' }
  const min = Math.ceil((start - nowMs) / 60_000)
  if (min <= 60) return { text: `in ${min} min`, tone: 'soon' }
  return { text: '', tone: '' }
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function duration(e: CalendarEvent): string {
  const min = Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000)
  if (!Number.isFinite(min) || min <= 0) return ''
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
}

function dayTitle(day: Date, nowMs: number): string {
  const today = new Date(nowMs)
  const diff = Math.round((day.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / DAY_MS)
  const date = day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
  return diff === 0 ? `Today · ${date}` : diff === 1 ? `Tomorrow · ${date}` : diff === -1 ? `Yesterday · ${date}` : date
}

const RESPONSE_LABEL: Record<CalendarEvent['response'], string> = { accepted: '', declined: 'Declined', tentative: 'Maybe', needsAction: 'Not answered' }

function EventRow({ e, nowMs }: { e: CalendarEvent; nowMs: number }) {
  const when = whenLabel(e, nowMs)
  const dim = when.tone === 'past' || e.response === 'declined'
  const open = (url: string) => window.open(url, '_blank')
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr auto',
        alignItems: 'center',
        columnGap: 16,
        padding: '10px 28px',
        borderBottom: '1px solid var(--line-soft)',
        background: when.tone === 'now' ? 'var(--ok-bg)' : undefined,
        opacity: dim ? 0.55 : 1
      }}
    >
      <span style={{ font: "500 12.5px/1.4 'Geist Mono',monospace", color: 'var(--tx2)' }}>
        {e.allDay ? 'All day' : `${time(e.start)}–${time(e.end)}`}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            className="selectable"
            style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: e.response === 'declined' ? 'line-through' : undefined }}
          >
            {e.title}
          </span>
          {when.text && <span style={{ fontSize: 12, fontWeight: 500, color: when.tone === 'now' ? 'var(--ok)' : 'var(--wait-tx)', flexShrink: 0 }}>{when.text}</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[!e.allDay && duration(e), RESPONSE_LABEL[e.response], e.location].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        {e.meetUrl && !dim && (
          <PrimaryButton onClick={() => open(e.meetUrl)} style={{ height: 28, borderRadius: 7, fontSize: 12.5 }}>
            Join
          </PrimaryButton>
        )}
        {e.url && (
          <button
            aria-label="Open in Google Calendar"
            title="Open in Google Calendar"
            className="menu-item"
            onClick={() => open(e.url)}
            style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid var(--line)', cursor: 'pointer' }}
          >
            <Icon name="open_in_new" size={15} color="var(--tx2)" />
          </button>
        )}
      </span>
    </div>
  )
}

export function CalendarPage({ onConnect }: { onConnect: () => void }) {
  const api = window.kokpit
  const [range, setRange] = useState<CalendarRange>('day')
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(true)
  const [now, setNow] = useState(() => Date.now())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!api) return
    let alive = true
    setEvents(null)
    setError('')
    const load = () =>
      Promise.all([api.integrations.status(), api.integrations.calendarEvents(range)])
        .then(([list, evs]) => {
          if (!alive) return
          setConnected(list.some((c) => c.id === 'google' && c.status !== 'disconnected'))
          setEvents(evs)
          setError('')
        })
        .catch((e: unknown) => alive && setError(errorText(e)))
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 60_000)
    return () => {
      alive = false
      window.clearInterval(t)
    }
  }, [api, range, attempt])

  const groups = events ? todayFirst(groupByDay(events), now) : []
  const tab = (id: CalendarRange, label: string) => (
    <button
      key={id}
      onClick={() => setRange(id)}
      aria-pressed={range === id}
      style={{
        height: 28,
        padding: '0 12px',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        border: '1px solid var(--line)',
        background: range === id ? 'var(--hover)' : 'transparent',
        color: range === id ? 'var(--tx)' : 'var(--tx2)',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
      <div className="drag" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '22px 28px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Calendar</h1>
        <span style={{ flex: 1 }} />
        {tab('day', 'Today')}
        {tab('week', 'This week')}
        <button
          aria-label="Refresh"
          className="menu-item"
          onClick={() => setAttempt((a) => a + 1)}
          style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid var(--line)', cursor: 'pointer' }}
        >
          <Icon name="refresh" size={17} color="var(--tx2)" />
        </button>
      </div>
      <div style={{ padding: '0 28px 12px', fontSize: 12.5, color: 'var(--tx3)' }}>Your primary Google calendar · pick the reminder time in Settings → Notifications</div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', paddingBottom: 24, borderTop: '1px solid var(--line)' }}>
        {!connected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Google Calendar is not connected</div>
            <div style={{ fontSize: 13, color: 'var(--tx2)', maxWidth: 380 }}>Connect it to see your meetings here and get a reminder before each one starts.</div>
            <PrimaryButton onClick={onConnect}>Connect Google Calendar</PrimaryButton>
          </div>
        ) : error ? (
          <div className="selectable" style={{ padding: '18px 28px', fontSize: 12.5, color: 'var(--err)' }}>
            {error}
          </div>
        ) : events === null ? (
          <div style={{ padding: '18px 28px', fontSize: 13, color: 'var(--tx3)' }}>Loading…</div>
        ) : !groups.length ? (
          <div style={{ padding: '18px 28px', fontSize: 13, color: 'var(--tx3)' }}>{range === 'day' ? 'No meetings today.' : 'No meetings this week.'}</div>
        ) : (
          groups.map((g, i) => (
            <section
              key={g.day.toISOString()}
              style={
                range === 'week' && i === 0 && dayKey(g.day) === dayKey(new Date(now))
                  ? { position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg)', borderBottom: '1px solid var(--line)' }
                  : undefined
              }
            >
              <div style={{ padding: '14px 28px 6px', fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>{dayTitle(g.day, now)}</div>
              {g.events.map((e) => (
                <EventRow key={`${e.id}:${e.start}`} e={e} nowMs={now} />
              ))}
            </section>
          ))
        )}
      </div>
    </main>
  )
}
