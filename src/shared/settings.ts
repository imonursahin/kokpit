import type { RunnerEffort, RunnerMode } from './runner'

export const NOTIFY_EVENTS = [
  { id: 'sessionWaiting', label: 'A session needs you', hint: 'It asks for permission or has a question' },
  { id: 'sessionDone', label: 'A session finished', hint: 'Claude is done and waiting for your next message' },
  { id: 'sessionError', label: 'A session stopped with an error', hint: '' },
  { id: 'prChecksFailed', label: 'CI failed on your pull request', hint: '' },
  { id: 'prChangesRequested', label: 'Changes requested on your pull request', hint: '' },
  { id: 'prReviewRequested', label: 'Someone asked for your review', hint: '' },
  { id: 'meetingSoon', label: 'A meeting is about to start', hint: 'From Google Calendar, at the time you pick below' }
] as const

export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]['id']

export const TAG_COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'pink', 'yellow', 'indigo', 'gray'] as const

export type TagColor = (typeof TAG_COLORS)[number]

export type SessionTag = { id: string; name: string; color: TagColor }

export const MAX_SESSION_TAGS = 10

export type KokpitSettings = {
  defaultModel: string
  defaultEffort: RunnerEffort
  defaultMode: RunnerMode
  showHeadless: boolean
  claudeExecutable: string
  assistantHome: string
  githubRefreshMinutes: number
  meetingReminderMinutes: number
  includeDraftReviews: boolean
  notifyEnabled: boolean
  notifyWhenFocused: boolean
  menuBar: boolean
  menuBarMeetings: boolean
  notify: Record<NotifyEvent, boolean>
  sessionTags: SessionTag[]
  sessionTagOf: Record<string, string>
}

export const GITHUB_REFRESH_CHOICES = [1, 2, 5, 10, 30]
export const MEETING_REMINDER_CHOICES = [1, 3, 5, 10]

export const DEFAULT_SETTINGS: KokpitSettings = {
  defaultModel: 'claude-opus-5-5',
  defaultEffort: 'high',
  defaultMode: 'default',
  showHeadless: false,
  claudeExecutable: '',
  assistantHome: '',
  githubRefreshMinutes: 1,
  meetingReminderMinutes: 5,
  includeDraftReviews: true,
  notifyEnabled: true,
  notifyWhenFocused: false,
  menuBar: true,
  menuBarMeetings: false,
  sessionTags: [],
  sessionTagOf: {},
  notify: { sessionWaiting: false, sessionDone: false, sessionError: false, prChecksFailed: false, prChangesRequested: false, prReviewRequested: false, meetingSoon: true }
}

export const MODEL_CHOICES: { id: string; label: string }[] = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' }
]

export const EFFORT_CHOICES: RunnerEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export type AppInfo = { version: string; dataDir: string; projectsDir: string; packaged: boolean; bundledClaude: string; assistantHome: string }

export type DoctorCheck = {
  id: string
  label: string
  status: 'ok' | 'warn' | 'err'
  value: string
  detail: string
}

export type PlanWindow = { id: string; label: string; utilization: number; resetsAt: string }

export type PlanUsage = { available: boolean; plan: string | null; windows: PlanWindow[] }

export type UpdateStatus = {
  current: string
  latest?: string
  url?: string
  notes?: string
  newVersions?: string[]
  publishedAt?: string
  checkedAt: string
  hasUpdate: boolean
  canUpdate: boolean
  error?: string
}
