import { useEffect, useState } from 'react'
import type { SessionIndexItem } from '@shared/sessionIndex'
import type { SessionSummary } from '@shared/types'
import type { LoadState } from '@/pages/SessionsPage'
import { MOCK_SESSIONS } from '@/mock/sessions'
import { relativeTime } from '@shared/time'

export { relativeTime }

export function toSummary(item: SessionIndexItem, nowMs: number): SessionSummary {
  return {
    id: item.id,
    status: item.status,
    askType: 'permission',
    title: item.title,
    sub: item.sub,
    repo: item.repo,
    branch: item.branch && item.branch !== 'HEAD' ? item.branch : '—',
    jira: item.jira,
    pr: item.prNumber ? `#${item.prNumber}` : '',
    prUrl: item.prUrl,
    time: relativeTime(item.lastAt, nowMs),
    lastAt: item.lastAt,
    cost: `${item.costComplete ? '' : '≥'}$${item.costUsd.toFixed(2)}`
  }
}

export function todayFooter(items: SessionIndexItem[], nowMs: number, showHeadless = false): string {
  const start = new Date(nowMs).setHours(0, 0, 0, 0)
  const today = items.filter((i) => (showHeadless || !i.headless) && Date.parse(i.lastAt) >= start)
  const cost = today.reduce((sum, i) => sum + i.costUsd, 0)
  return `Today · ${today.length} sessions · $${cost.toFixed(2)}`
}

export function useSessions(showHeadless = false): {
  items: SessionIndexItem[]
  sessions: SessionSummary[]
  state: LoadState
  error?: string
  footer?: string
  retry: () => void
} {
  const api = window.kokpit
  const [items, setItems] = useState<SessionIndexItem[]>([])
  const [state, setState] = useState<LoadState>(api ? 'loading' : 'list')
  const [error, setError] = useState<string>()
  const [nowMs, setNowMs] = useState(Date.now())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!api) return
    let alive = true
    api
      .listSessions()
      .then((list) => {
        if (!alive) return
        setItems(list)
        setState(list.some((i) => !i.headless) ? 'list' : 'empty')
      })
      .catch((err: Error) => {
        if (!alive) return
        setError(err.message)
        setState('error')
      })
    const off = api.onSessionsChanged((list) => {
      if (!alive) return
      setItems(list)
      setNowMs(Date.now())
      setState(list.some((i) => !i.headless) ? 'list' : 'empty')
    })
    return () => {
      alive = false
      off()
    }
  }, [api, attempt])

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!api) return { items: [], sessions: MOCK_SESSIONS, state: 'list', retry: () => {} }

  const sessions = items.filter((i) => showHeadless || !i.headless).map((i) => toSummary(i, nowMs))
  return { items, sessions, state, error, footer: todayFooter(items, nowMs, showHeadless), retry: () => setAttempt((a) => a + 1) }
}
