import { useEffect, useState } from 'react'
import type { CalendarEvent } from '@shared/integrations'
import { LIBRARY_KINDS, type LibraryKind } from '@shared/library'

export type ConfigCounts = Record<LibraryKind, number> & { jira: number; prs: number | null; connectionWarning: boolean; calendar: boolean; meetings: number }

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

export function useConfigCounts(page: string, refreshMinutes = 1, includeDraftReviews = true): ConfigCounts {
  const api = window.kokpit
  const [counts, setCounts] = useState<ConfigCounts>(api ? EMPTY : MOCK)

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
      setCounts((prev) => {
        const next = { ...prev }
        if (lib.status === 'fulfilled')
          for (const kind of LIBRARY_KINDS) if (kind !== 'mcp') next[kind] = lib.value.entries.filter((e) => e.kind === kind && !(kind === 'memory' && e.name === 'MEMORY.md')).length
        if (conn.status === 'fulfilled') {
          next.connectionWarning = conn.value.some((c) => c.status === 'expired' || (c.status === 'disconnected' && c.id !== 'google'))
          next.calendar = conn.value.some((c) => c.id === 'google' && c.status !== 'disconnected')
        }
        if (today.status === 'fulfilled') next.meetings = meetingsLeft(today.value, Date.now())
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

  return counts
}
