import { costOf, type Usage } from './pricing'

export type ParsedSummary = {
  sessionId: string
  title: string
  customTitle: string
  firstPrompt: string
  cwd: string
  branch: string
  entrypoint: string
  model: string
  mode: string
  prNumber: number | null
  prUrl: string
  startedAt: string
  lastAt: string
  costUsd: number
  costComplete: boolean
  lastActivity: string
  lastText: string
  pendingTool: string
  lastWasApiError: boolean
  lastStopReason: string
  lineCount: number
  skippedLines: number
  editedDirs: Record<string, number>
  uses: Record<string, number>
}

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

export type AccumulatorState = {
  summary: ParsedSummary
  recentMessageIds: string[]
  pending: [string, string][]
}

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function firstLine(text: string, max = 160): string {
  const line = text.trim().split('\n').find((l) => l.trim()) ?? ''
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

function shortPath(p: string, cwd: string): string {
  if (cwd && p.startsWith(`${cwd}/`)) return p.slice(cwd.length + 1)
  return p
}

export function describeTool(name: string, input: unknown, cwd: string): string {
  const i = isObj(input) ? input : {}
  const path = shortPath(str(i['file_path']) || str(i['path']) || str(i['notebook_path']), cwd)
  switch (name) {
    case 'Read':
      return `Reading ${path}`
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return `Editing ${path}`
    case 'Write':
      return `Writing ${path}`
    case 'Bash':
      return `Running ${firstLine(str(i['command']), 120)}`
    case 'Grep':
      return `Searching ${firstLine(str(i['pattern']), 80)}`
    case 'Glob':
      return `Finding ${firstLine(str(i['pattern']), 80)}`
    case 'WebFetch':
      return `Fetching ${str(i['url'])}`
    case 'WebSearch':
      return `Searching the web for ${firstLine(str(i['query']), 80)}`
    case 'Agent':
    case 'Task':
      return `Agent: ${firstLine(str(i['description']), 80)}`
    case 'Skill':
      return `Skill ${str(i['skill'])}`
    default:
      return name.startsWith('mcp__') ? `Calling ${name.split('__').slice(1).join(' · ')}` : `Using ${name}`
  }
}

function promptText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  for (const block of content) {
    if (isObj(block) && block['type'] === 'text') return str(block['text'])
  }
  return ''
}

function isNoisePrompt(text: string): boolean {
  const t = text.trimStart()
  return (
    !t ||
    t.startsWith('<command-') ||
    t.startsWith('<local-command') ||
    t.startsWith('<system-reminder>') ||
    t.startsWith('Caveat:') ||
    t.startsWith('[Request interrupted')
  )
}

export class SessionAccumulator {
  private s: ParsedSummary
  private seenMessages = new Set<string>()
  private pending = new Map<string, string>()

  constructor(sessionId: string) {
    this.s = {
      sessionId,
      title: '',
      customTitle: '',
      firstPrompt: '',
      cwd: '',
      branch: '',
      entrypoint: '',
      model: '',
      mode: '',
      prNumber: null,
      prUrl: '',
      startedAt: '',
      lastAt: '',
      costUsd: 0,
      costComplete: true,
      lastActivity: '',
      lastText: '',
      pendingTool: '',
      lastWasApiError: false,
      lastStopReason: '',
      lineCount: 0,
      skippedLines: 0,
      editedDirs: {},
      uses: {}
    }
  }

  feed(raw: string): void {
    if (!raw.trim()) return
    this.s.lineCount += 1
    let o: unknown
    try {
      o = JSON.parse(raw)
    } catch {
      this.s.skippedLines += 1
      return
    }
    if (!isObj(o)) {
      this.s.skippedLines += 1
      return
    }
    const type = str(o['type'])
    const ts = str(o['timestamp'])
    if (ts) {
      if (!this.s.startedAt) this.s.startedAt = ts
      if (ts > this.s.lastAt) this.s.lastAt = ts
    }
    if (!this.s.cwd && str(o['cwd'])) this.s.cwd = str(o['cwd'])
    if (str(o['gitBranch'])) this.s.branch = str(o['gitBranch'])
    if (!this.s.entrypoint && str(o['entrypoint'])) this.s.entrypoint = str(o['entrypoint'])
    if (str(o['permissionMode']) && o['isSidechain'] !== true) this.s.mode = str(o['permissionMode'])

    switch (type) {
      case 'ai-title':
        if (str(o['aiTitle'])) this.s.title = str(o['aiTitle'])
        break
      case 'custom-title':
        this.s.customTitle = str(o['customTitle']).trim()
        break
      case 'pr-link':
        if (typeof o['prNumber'] === 'number') this.s.prNumber = o['prNumber']
        this.s.prUrl = str(o['prUrl'])
        break
      case 'user':
        this.onUser(o)
        break
      case 'assistant':
        this.onAssistant(o)
        break
      default:
        break
    }
  }

  private onUser(o: Obj): void {
    if (o['isMeta'] === true || o['isSidechain'] === true) return
    const message = isObj(o['message']) ? o['message'] : {}
    const content = message['content']
    if (Array.isArray(content)) {
      for (const block of content) {
        if (isObj(block) && block['type'] === 'tool_result') this.pending.delete(str(block['tool_use_id']))
      }
    }
    const text = promptText(content)
    if (!isNoisePrompt(text)) {
      if (!this.s.firstPrompt) this.s.firstPrompt = firstLine(text)
      this.s.lastStopReason = ''
    }
    this.s.pendingTool = [...this.pending.values()].at(-1) ?? ''
  }

  private onAssistant(o: Obj): void {
    if (o['isSidechain'] === true) return
    const message = isObj(o['message']) ? o['message'] : {}
    const id = str(message['id'])
    const model = str(message['model'])
    if (model && model !== '<synthetic>') this.s.model = model
    this.s.lastWasApiError = o['isApiErrorMessage'] === true
    if (str(message['stop_reason'])) this.s.lastStopReason = str(message['stop_reason'])

    if (id && !this.seenMessages.has(id) && isObj(message['usage']) && model && model !== '<synthetic>') {
      this.seenMessages.add(id)
      const { usd, known } = costOf(model, message['usage'] as Usage)
      this.s.costUsd += usd
      if (!known) this.s.costComplete = false
    }

    const content = message['content']
    if (!Array.isArray(content)) return
    for (const block of content) {
      if (!isObj(block)) continue
      if (block['type'] === 'tool_use') {
        this.noteEdit(str(block['name']), block['input'])
        this.noteUse(str(block['name']), block['input'])
        const label = describeTool(str(block['name']), block['input'], this.s.cwd)
        this.pending.set(str(block['id']), label)
        this.s.lastActivity = label
      } else if (block['type'] === 'text' && str(block['text']).trim()) {
        this.s.lastText = firstLine(str(block['text']))
        this.s.lastActivity = this.s.lastText
      }
    }
    this.s.pendingTool = [...this.pending.values()].at(-1) ?? ''
  }

  private noteEdit(name: string, input: unknown): void {
    if (!EDIT_TOOLS.has(name) || !isObj(input)) return
    const file = str(input['file_path']) || str(input['notebook_path'])
    if (!file.startsWith('/')) return
    const dir = file.slice(0, file.lastIndexOf('/')) || '/'
    const dirs = this.s.editedDirs
    dirs[dir] = (dirs[dir] ?? 0) + 1
    const keys = Object.keys(dirs)
    if (keys.length > 40) {
      const weakest = keys.reduce((a, b) => ((dirs[a] ?? 0) <= (dirs[b] ?? 0) ? a : b))
      delete dirs[weakest]
    }
  }

  private noteUse(name: string, input: unknown): void {
    if (!isObj(input)) return
    const key =
      name === 'Skill' ? `skill:${str(input['skill'])}` : name === 'Agent' || name === 'Task' ? `agent:${str(input['subagent_type'])}` : ''
    if (!key || key.endsWith(':')) return
    this.s.uses[key] = (this.s.uses[key] ?? 0) + 1
  }

  snapshot(): ParsedSummary {
    return { ...this.s, editedDirs: { ...this.s.editedDirs }, uses: { ...this.s.uses } }
  }

  state(): AccumulatorState {
    return {
      summary: this.snapshot(),
      recentMessageIds: [...this.seenMessages].slice(-64),
      pending: [...this.pending.entries()]
    }
  }

  static restore(state: AccumulatorState): SessionAccumulator {
    const acc = new SessionAccumulator(state.summary.sessionId)
    acc.s = { ...state.summary, editedDirs: { ...(state.summary.editedDirs ?? {}) }, uses: { ...(state.summary.uses ?? {}) } }
    acc.seenMessages = new Set(state.recentMessageIds)
    acc.pending = new Map(state.pending)
    return acc
  }
}
