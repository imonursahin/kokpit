export type SessionStatus = 'running' | 'waiting' | 'error' | 'done'

export type SessionSummary = {
  id: string
  status: SessionStatus
  askType?: 'permission' | 'question'
  title: string
  sub: string
  repo: string
  branch: string
  jira: string
  pr: string
  prUrl?: string
  time: string
  lastAt?: string
  cost: string
  unread?: boolean
  pinned?: boolean
}

export type Page =
  | 'overview'
  | 'sessions'
  | 'session'
  | 'jira'
  | 'prs'
  | 'instructions'
  | 'skills'
  | 'agents'
  | 'commands'
  | 'hooks'
  | 'mcp'
  | 'memory'
  | 'connections'
  | 'settings'
