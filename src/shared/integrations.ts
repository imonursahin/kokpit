export type ConnectionId = 'github' | 'jira' | 'google'

export type ConnectionInfo = {
  id: ConnectionId
  status: 'connected' | 'expired' | 'disconnected'
  account: string
  site: string
  org: string
  projects: string[]
  lastSync: string
  warning: string
}

export type JiraIssue = {
  key: string
  title: string
  status: string
  statusCategory: 'new' | 'indeterminate' | 'done'
  priority: string
  sprint: string
  reporter: string
  points: number | null
  updated: string
  description: string
  url: string
}

export type PullRequestInfo = {
  number: number
  repo: string
  title: string
  url: string
  branch: string
  base: string
  state: 'Draft' | 'Open' | 'Merged' | 'Closed'
  checks: { total: number; passed: number; failed: number; pending: number; failedNames: string[] }
  reviews: { approved: number; changesRequested: number }
  author: string
  updatedAt: string
}

export type MyPullRequests = { mine: PullRequestInfo[]; reviews: PullRequestInfo[]; fetchedAt?: string; staleReason?: string }

export type JiraConnectInput = { site: string; email: string; token: string }
export type GithubConnectInput = { token?: string; useCli?: boolean }
export type GoogleConnectInput = { clientId: string; clientSecret: string }

export type CalendarRange = 'day' | 'week'

export type CalendarEvent = {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  meetUrl: string
  url: string
  location: string
  response: 'accepted' | 'declined' | 'tentative' | 'needsAction'
}
