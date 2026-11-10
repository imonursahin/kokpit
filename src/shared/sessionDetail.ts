import type { SessionStatus } from './types'

export type DetailStepKind = 'read' | 'edit' | 'create' | 'command' | 'search' | 'fetch' | 'jira' | 'todo'

export type DetailStep = {
  kind: DetailStepKind
  label: string
  target: string
  meta?: string
  add?: number
  del?: number
  state?: 'done' | 'running' | 'error'
  output?: string
  agent?: { id: string; type: string }
  workflow?: { runId: string; name: string }
  toolUseId?: string
  taskId?: string
  startedAt?: string
  command?: string
}

export type DetailTurn =
  | { kind: 'user'; text: string; uuid?: string; parentUuid?: string }
  | { kind: 'note'; text: string; tone?: 'error' | 'info' }
  | { kind: 'claude'; steps: DetailStep[]; text?: string; output?: string; parts?: DetailPart[]; meta?: { model: string; time: string; cost: string } }

export type DetailPart = { kind: 'text'; text: string } | { kind: 'thinking'; text: string } | { kind: 'steps'; steps: DetailStep[] }

export type DetailDiffLine = { o: number | ''; n: number | ''; sign: '+' | '-' | ' ' | '@'; t: string }

export type DetailFile = {
  path: string
  change: 'M' | 'A' | 'D'
  add: number
  del: number
  test: boolean
  lines: DetailDiffLine[]
}

export type SessionDetailData = {
  id: string
  header: {
    title: string
    status: SessionStatus
    elapsed: string
    cost: string
    repo: string
    branch: string
    jira?: { key: string; title: string }
    pr?: { number: string; url: string }
    context?: { used: number; window: number }
  }
  turns: DetailTurn[]
  earlierCount: number
  model: string
  running: boolean
  activeSince?: string
  files: DetailFile[]
  filesSource: 'git' | 'transcript' | 'none'
  filesRoot: string | null
  plan?: { file: string; path: string; markdown: string; updatedAt: string }
}

export type WorkflowStep = { agentId: string; label: string; phase: string; state: 'running' | 'done' | 'error'; startedAt?: string; endedAt?: string }

export type WorkflowRun = { runId: string; steps: WorkflowStep[] }

export type SubagentDetail = SessionDetailData & {
  agent: { id: string; type: string; description: string; finished: boolean }
}
