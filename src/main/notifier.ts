import type { CalendarEvent, MyPullRequests } from '../shared/integrations'
import type { SessionIndexItem } from '../shared/sessionIndex'
import type { NotifyEvent } from '../shared/settings'
import type { SessionStatus } from '../shared/types'

export type NoticeTarget = { page: 'session'; id: string } | { page: 'prs' | 'overview' | 'calendar' }
export type Notice = { event: NotifyEvent; title: string; body: string; target: NoticeTarget }

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function sessionNotices(prev: Map<string, SessionStatus>, items: SessionIndexItem[], showHeadless: boolean): Notice[] {
  const out: Notice[] = []
  for (const it of items) {
    if (it.headless && !showHeadless) continue
    const before = prev.get(it.id)
    if (before === it.status) continue
    const target: NoticeTarget = { page: 'session', id: it.id }
    const title = short(it.title || 'Session', 60)
    if (it.status === 'waiting') out.push({ event: 'sessionWaiting', title: `Needs you · ${title}`, body: short(it.sub || 'Claude is waiting for you.'), target })
    else if (it.status === 'error') out.push({ event: 'sessionError', title: `Error · ${title}`, body: short(it.sub || 'The session stopped with an error.'), target })
    else if (it.status === 'done' && before === 'running') out.push({ event: 'sessionDone', title: `Finished · ${title}`, body: short(it.sub || 'Claude is done.'), target })
  }
  return out
}

export function prNotices(prev: MyPullRequests, next: MyPullRequests): Notice[] {
  const out: Notice[] = []
  const before = new Map(prev.mine.map((p) => [p.url, p]))
  for (const p of next.mine) {
    const old = before.get(p.url)
    const label = `${p.repo.split('/')[1] ?? p.repo} #${p.number}`
    if (p.checks.failed > 0 && (old?.checks.failed ?? 0) === 0)
      out.push({ event: 'prChecksFailed', title: `CI failed · ${label}`, body: short(p.checks.failedNames.join(', ') || p.title), target: { page: 'prs' } })
    if (p.reviews.changesRequested > (old?.reviews.changesRequested ?? 0))
      out.push({ event: 'prChangesRequested', title: `Changes requested · ${label}`, body: short(p.title), target: { page: 'prs' } })
  }
  const asked = new Set(prev.reviews.map((p) => p.url))
  for (const p of next.reviews) {
    if (!asked.has(p.url))
      out.push({
        event: 'prReviewRequested',
        title: `Review requested · ${p.repo.split('/')[1] ?? p.repo} #${p.number}`,
        body: short(`${p.author ? `@${p.author}: ` : ''}${p.title}`),
        target: { page: 'prs' }
      })
  }
  return out
}

export const MEETING_MINUTES = [10, 5, 3, 1] as const

export type MeetingNotice = { key: string; title: string; body: string; url: string }

export function meetingNotices(events: CalendarEvent[], nowMs: number, sent: Set<string>): MeetingNotice[] {
  const out: MeetingNotice[] = []
  for (const e of events) {
    if (e.allDay || e.response === 'declined') continue
    const start = Date.parse(e.start)
    if (!Number.isFinite(start)) continue
    const left = start - nowMs
    for (const m of MEETING_MINUTES) {
      if (left > m * 60_000 || left <= (m - 1) * 60_000) continue
      const key = `${e.id}:${e.start}:${m}`
      if (sent.has(key)) continue
      sent.add(key)
      const at = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      out.push({ key, title: `Meeting in ${m} min · ${short(e.title, 60)}`, body: e.meetUrl ? `Starts at ${at}. Click to join.` : `Starts at ${at}.`, url: e.meetUrl || e.url })
    }
  }
  return out
}
