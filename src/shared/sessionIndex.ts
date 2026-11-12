import type { SessionStatus } from './types'

export type SessionIndexItem = {
  id: string
  file: string
  title: string
  cwd: string
  repo: string
  branch: string
  jira: string
  prNumber: number | null
  prUrl: string
  startedAt: string
  lastAt: string
  costUsd: number
  costComplete: boolean
  model: string
  mode: string
  status: SessionStatus
  sub: string
  headless: boolean
  askId?: string
  onPhone?: boolean
}

export type CliStatus = 'busy' | 'idle'

export type StatusInput = {
  lastAtMs: number
  pendingTool: string
  lastWasApiError: boolean
  lastStopReason: string
  cli?: CliStatus
}

const RUNNING_WINDOW_MS = 90_000
const WAITING_WINDOW_MS = 30 * 60_000

export function deriveStatus(s: StatusInput, nowMs: number): SessionStatus {
  const guess = guessStatus(s, nowMs)
  if (s.cli === 'busy') return guess === 'waiting' || guess === 'error' ? guess : 'running'
  if (s.cli === 'idle' && guess === 'running') return 'done'
  return guess
}

function guessStatus(s: StatusInput, nowMs: number): SessionStatus {
  const idle = nowMs - s.lastAtMs
  if (s.lastWasApiError) return 'error'
  if (s.pendingTool) {
    const slowTool = /^(Running|Agent:|Calling|Fetching|Searching the web)/.test(s.pendingTool)
    if (idle < (slowTool ? 180_000 : 20_000)) return 'running'
    if (idle < WAITING_WINDOW_MS) return 'waiting'
    return 'done'
  }
  if (idle < RUNNING_WINDOW_MS && s.lastStopReason !== 'end_turn') return 'running'
  return 'done'
}

const JIRA_KEY = /\b([A-Z][A-Z0-9]{1,9}-\d{1,6})\b/

export function jiraKeyFrom(...sources: string[]): string {
  for (const src of sources) {
    const m = JIRA_KEY.exec(src)
    if (m?.[1]) return m[1]
  }
  return ''
}
