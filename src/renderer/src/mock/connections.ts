export type ConnectionStatus = 'connected' | 'expired' | 'disconnected'

export type ConnectionDetail =
  | { label: string; value: string; mono?: boolean; muted?: boolean }
  | { label: string; chips: string[] }

export type Connection = {
  id: string
  name: string
  icon: string
  description: string
  status: ConnectionStatus
  warning: string
  details: ConnectionDetail[]
  lastSync: string
}

export const MOCK_CONNECTIONS: Connection[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'code',
    description: 'Pull requests, checks and reviews',
    status: 'expired',
    warning: 'Your token expired on Nov 2. Claude can’t open or update PRs until you reconnect — sessions keep working locally.',
    details: [
      { label: 'Account', value: '@denizaksoy', mono: true },
      { label: 'Organisation', value: 'parcel · 14 repositories' },
      { label: 'Permissions', value: 'repo · pull_requests · checks:read', mono: true, muted: true }
    ],
    lastSync: '3 days ago'
  },
  {
    id: 'jira',
    name: 'Jira Cloud',
    icon: 'task_alt',
    description: 'Assigned tasks, comments and acceptance criteria',
    status: 'connected',
    warning: '',
    details: [
      { label: 'Account', value: 'deniz.aksoy@parcel.io', mono: true },
      { label: 'Site', value: 'parcel.atlassian.net', mono: true },
      { label: 'Projects', chips: ['PAY', 'WEB', 'OPS', 'NOT'] }
    ],
    lastSync: '2 minutes ago'
  }
]
