import type { SessionStatus } from './types'

export type DetailStepKind = 'read' | 'edit' | 'create' | 'command' | 'search' | 'fetch' | 'jira'

export type DetailStep = {
  kind: DetailStepKind
  label: string
  target: string
  meta?: string
  add?: number
  del?: number
  state?: 'done' | 'running' | 'error'
  output?: string
}

export type DetailTurn =
  | { kind: 'user'; text: string }
  | { kind: 'claude'; steps: DetailStep[]; text?: string; output?: string; parts?: DetailPart[]; meta?: { model: string; time: string; cost: string } }

export type DetailPart = { kind: 'text'; text: string } | { kind: 'steps'; steps: DetailStep[] }

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
