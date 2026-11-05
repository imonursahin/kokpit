export type RunnerEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type RunnerMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions'

export const MODE_LABELS: Record<RunnerMode, string> = {
  default: 'Ask',
  acceptEdits: 'Accept edits',
  plan: 'Plan',
  auto: 'Auto',
  bypassPermissions: 'Bypass'
}

export const MODES = Object.keys(MODE_LABELS) as RunnerMode[]

export function isRunnerMode(v: unknown): v is RunnerMode {
  return typeof v === 'string' && Object.hasOwn(MODE_LABELS, v)
}

export type StartSession = {
  cwd: string
  prompt: string
  title?: string
  model?: string
  effort?: RunnerEffort
  mode?: RunnerMode
  resumeId?: string
}

export type PendingAsk = {
  requestId: string
  sessionId: string
  toolName: string
  title: string
  detail: string
  input: Record<string, unknown>
  canAlwaysAllow: boolean
  createdAt: string
}

export type AskDecision = 'allow' | 'deny' | 'always'

export type LiveState = 'starting' | 'running' | 'waiting' | 'idle' | 'error'

export type LiveSession = {
  sessionId: string
  title?: string
  cwd: string
  state: LiveState
  model: string
  mode: RunnerMode
  costUsd: number
  pending: PendingAsk[]
  lastError?: string
  startedAt: string
}

export type RunnerEvent =
  | { type: 'state'; session: LiveSession }
  | { type: 'started'; tempId: string; sessionId: string }
  | { type: 'text'; sessionId: string; text: string }
