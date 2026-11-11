import { useEffect, useState } from 'react'
import type { CalendarEvent } from '@shared/integrations'
import { LIBRARY_KINDS, type LibraryKind } from '@shared/library'

export type MeetingState = { state: 'live' | 'soon'; title: string }

export type ConfigCounts = Record<LibraryKind, number> & { jira: number; prs: number | null; connectionWarning: boolean; calendar: boolean; meetings: number; meeting?: MeetingState }

const MOCK: ConfigCounts = {
  instructions: 5,
  skills: 6,
  agents: 4,
  commands: 0,
  hooks: 0,
  mcp: 0,
  memory: 0,
  jira: 8,
  prs: 3,
  connectionWarning: true,
  calendar: false,
  meetings: 0
}

const EMPTY: ConfigCounts = {
  instructions: 0,
  skills: 0,
  agents: 0,
  commands: 0,
  hooks: 0,
  mcp: 0,
  memory: 0,
  jira: 0,
  prs: null,
  connectionWarning: false,
  calendar: false,
  meetings: 0
}

export function meetingsLeft(events: CalendarEvent[], nowMs: number): number {
  return events.filter((e) => !e.allDay && e.response !== 'declined' && Date.parse(e.end) > nowMs).length
}

export function meetingState(events: CalendarEvent[], nowMs: number, reminderMinutes: number): MeetingState | undefined {
  const timed = events.filter((e) => !e.allDay && e.response !== 'declined')
  const live = timed.find((e) => Date.parse(e.start) <= nowMs && nowMs < Date.parse(e.end))
  if (live) return { state: 'live', title: `In a meeting · ${live.title}` }
  const soon = timed
    .map((e) => ({ e, left: Date.parse(e.start) - nowMs }))
    .filter((x) => x.left > 0 && x.left <= reminderMinutes * 60_000)
    .sort((a, b) => a.left - b.left)[0]
  return soon ? { state: 'soon', title: `${soon.e.title} starts in ${Math.ceil(soon.left / 60_000)} min` } : undefined
}

export function useConfigCounts(page: string, refreshMinutes = 1, includeDraftReviews = true, reminderMinutes = 5): ConfigCounts {
  const api = window.kokpit
  const [counts, setCounts] = useState<ConfigCounts>(api ? EMPTY : MOCK)
  const [today, setToday] = useState<CalendarEvent[]>([])
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((n) => n + 1)
    }, refreshMinutes * 60_000)
    return () => window.clearInterval(t)
  }, [refreshMinutes])

  useEffect(() => {
    if (!api) return
    let alive = true
    void Promise.allSettled([
      api.library.list(),
      api.integrations.status(),
      api.integrations.jiraIssues(),
      api.integrations.myPullRequestCounts(),
      api.integrations.calendarEvents('day')
    ]).then(([lib, conn, jira, prs, today]) => {
      if (!alive) return
      if (today.status === 'fulfilled') setToday(today.value)
      setCounts((prev) => {
        const next = { ...prev }
        if (lib.status === 'fulfilled')
          for (const kind of LIBRARY_KINDS) if (kind !== 'mcp') next[kind] = lib.value.entries.filter((e) => e.kind === kind && !e.parent && !(kind === 'memory' && e.name === 'MEMORY.md')).length
        if (conn.status === 'fulfilled') {
          next.connectionWarning = conn.value.some((c) => c.status === 'expired' || (c.status === 'disconnected' && c.id !== 'google'))
          next.calendar = conn.value.some((c) => c.id === 'google' && c.status !== 'disconnected')
        }
        if (jira.status === 'fulfilled') next.jira = jira.value.filter((i) => i.statusCategory !== 'done').length
        if (prs.status === 'fulfilled') next.prs = prs.value.mine + prs.value.reviews
        return next
      })
    })
    return () => {
      alive = false
    }
  }, [api, page, tick, includeDraftReviews])

  const [mcpCheck, setMcpCheck] = useState(0)
  useEffect(() => {
    if (page === 'mcp') setMcpCheck((n) => n + 1)
  }, [page])
  useEffect(() => {
    if (!api) return
    let alive = true
    api.mcp
      .status()
      .then((list) => alive && setCounts((prev) => ({ ...prev, mcp: list.length })))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api, mcpCheck])

  return { ...counts, meetings: meetingsLeft(today, now), meeting: counts.calendar ? meetingState(today, now, reminderMinutes) : undefined }
}
