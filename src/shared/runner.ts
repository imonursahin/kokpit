export type RunnerEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORTS: RunnerEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export type TurnSettings = { model?: string; effort?: RunnerEffort }

export type SlashCommandInfo = { name: string; description: string; argumentHint: string }

export type ModelOption = { id: string; label: string }

export type RewindResult = { canRewind: boolean; error?: string; filesChanged: string[]; insertions: number; deletions: number }

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

export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const

export type ImageInput = { mediaType: (typeof IMAGE_TYPES)[number]; data: string }

export type StartSession = {
  cwd: string
  prompt: string
  images?: ImageInput[]
  title?: string
  model?: string
  effort?: RunnerEffort
  mode?: RunnerMode
  resumeId?: string
  resumeAt?: string
}

export type PendingAsk = {
  requestId: string
  sessionId: string
  toolName: string
  title: string
  detail: string
  input: Record<string, unknown>
  canAlwaysAllow: boolean
  defaultToNo?: boolean
  createdAt: string
}

export type AskDecision = 'allow' | 'deny' | 'always'

export type LiveState = 'starting' | 'running' | 'waiting' | 'idle' | 'error'

export type Activity = { kind: 'thinking' | 'writing' | 'tool' | 'retry' | 'compacting'; tool?: string; detail?: string }

export type BackgroundTask = { id: string; kind: string; description: string; startedAt: string; toolUses?: number; lastTool?: string; ref?: string; toolUseId?: string; taskId?: string }

export const claudeStillWorking = (background: BackgroundTask[] = []) => background.some((b) => b.kind !== 'Shell' && b.kind !== 'Monitor')

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
  background?: BackgroundTask[]
  activity?: Activity
}

export type RunnerEvent =
  | { type: 'state'; session: LiveSession }
  | { type: 'started'; tempId: string; sessionId: string }
  | { type: 'text'; sessionId: string; text: string }
  | { type: 'partial'; sessionId: string; text: string }
  | { type: 'ended'; sessionId: string }
