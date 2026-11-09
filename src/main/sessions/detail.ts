import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { open, readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import type { SessionIndexItem } from '../../shared/sessionIndex'
import type { DetailFile, DetailStep, DetailStepKind, DetailTurn, SessionDetailData, SubagentDetail, WorkflowRun, WorkflowStep } from '../../shared/sessionDetail'
import { editAsDiff, isTestPath, lineCount, parseUnifiedDiff } from './diff'
import { contextTokens, contextWindow, costOf, type Usage } from './pricing'
import { gitRoot } from './repo'

const run = promisify(execFile)

const MAX_TURNS = 60
const MAX_TEXT = 6000
const MAX_OUTPUT = 2000
const MAX_PLAN = 200_000

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const chain = (o: Obj): { uuid?: string; parentUuid?: string } => ({ uuid: str(o['uuid']) || undefined, parentUuid: str(o['parentUuid']) || undefined })
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…` : s)

type ClaudeTurn = Extract<DetailTurn, { kind: 'claude' }>
type EditRecord = { path: string; oldText: string; newText: string; created: boolean }

function rel(path: string, base: string): string {
  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
}

export function todoStep(input: Obj): DetailStep {
  const todos = (Array.isArray(input['todos']) ? input['todos'] : []).filter(isObj)
  const done = todos.filter((t) => t['status'] === 'completed').length
  const active = todos.find((t) => t['status'] === 'in_progress')
  const mark = (s: unknown) => (s === 'completed' ? '[x]' : s === 'in_progress' ? '[>]' : '[ ]')
  return {
    kind: 'todo',
    label: 'Todos',
    target: `${done}/${todos.length} done${active ? ` · ${str(active['activeForm']) || str(active['content'])}` : ''}`,
    state: 'done',
    output: todos.map((t) => `${mark(t['status'])} ${str(t['content'])}`).join('\n')
  }
}

function stepFor(name: string, input: Obj, cwd: string): DetailStep {
  const path = rel(str(input['file_path']) || str(input['notebook_path']) || str(input['path']), cwd)
  const step = (kind: DetailStepKind, label: string, target: string, extra: Partial<DetailStep> = {}): DetailStep => ({
    kind,
    label,
    target,
    state: 'done',
    ...extra
  })
  switch (name) {
    case 'Read':
      return step('read', 'Read', path)
    case 'Edit':
      return step('edit', 'Edited', path, { add: lineCount(str(input['new_string'])), del: lineCount(str(input['old_string'])) })
    case 'MultiEdit': {
      const edits = Array.isArray(input['edits']) ? input['edits'].filter(isObj) : []
      return step('edit', 'Edited', path, {
        add: edits.reduce((s, e) => s + lineCount(str(e['new_string'])), 0),
        del: edits.reduce((s, e) => s + lineCount(str(e['old_string'])), 0)
      })
    }
    case 'NotebookEdit':
      return step('edit', 'Edited', path)
    case 'Write':
      return step('create', 'Wrote', path, { add: lineCount(str(input['content'])) })
    case 'Bash':
      return step('command', 'Ran', str(input['command']).split('\n')[0] ?? '')
    case 'Grep':
      return step('search', 'Searched', str(input['pattern']))
    case 'Glob':
      return step('search', 'Found', str(input['pattern']))
    case 'WebFetch':
      return step('fetch', 'Fetched', str(input['url']))
    case 'WebSearch':
      return step('fetch', 'Searched the web', str(input['query']))
    case 'Agent':
    case 'Task':
      return step('command', 'Agent', str(input['description']))
    case 'Skill':
      return step('read', 'Skill', str(input['skill']))
    case 'TodoWrite':
      return todoStep(input)
    default: {
      if (name.startsWith('mcp__')) {
        const parts = name.split('__')
        const tool = parts.slice(2).join(' ') || name
        const kind: DetailStepKind = /jira/i.test(name) ? 'jira' : 'fetch'
        return step(kind, 'Called', `${parts[1] ?? ''} · ${tool}`)
      }
      return step('command', name, '')
    }
  }
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(isObj)
    .map((b) => (b['type'] === 'text' ? str(b['text']) : b['type'] === 'image' ? '[image]' : ''))
    .join('\n')
}

function resultMeta(step: DetailStep, text: string, isError: boolean): string {
  if (isError) return text.split('\n').find((l) => l.trim())?.slice(0, 80) ?? 'failed'
  if (step.kind === 'read') {
    const n = lineCount(text)
    return n === 1 ? '1 line' : `${n} lines`
  }
  if (step.kind === 'search') {
    const n = text.split('\n').filter((l) => l.trim()).length
    return n ? `${n} results` : 'no matches'
  }
  return ''
}

function promptOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(isObj)
    .filter((b) => b['type'] === 'text')
    .map((b) => str(b['text']))
    .join('\n')
}

const tag = (text: string, name: string): string | null => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text)
  return m ? (m[1] ?? '') : null
}

export function commandPrompt(text: string): string {
  const name = tag(text, 'command-name')?.trim()
  if (!name) return ''
  const args = tag(text, 'command-args')?.trim() ?? ''
  return `${name.startsWith('/') ? name : `/${name}`}${args ? ` ${args}` : ''}`
}

export function localCommandOutput(content: string): string {
  const out = [tag(content, 'local-command-stdout'), tag(content, 'local-command-stderr')].filter((x): x is string => !!x && !!x.trim())
  const raw = out.length ? out.join('\n\n') : /<local-command-std(out|err)>/.test(content) ? '' : content
  return raw.replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function isNoise(text: string): boolean {
  const t = text.trimStart()
  return !t || t.startsWith('<command-') || t.startsWith('<local-command') || t.startsWith('<system-reminder>') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted') || t.startsWith('<task-notification>')
}

const AGENT_MESSAGE = /^<agent-message from="([A-Za-z0-9_-]+)">\n?([\s\S]*?)<\/agent-message>\s*$/

export function agentReport(prompt: string): { id: string; text: string } | null {
  const m = AGENT_MESSAGE.exec(prompt.trim())
  if (!m?.[1]) return null
  let body = m[2] ?? ''
  const start = body.indexOf('The report follows:')
  if (start >= 0) body = body.slice(body.indexOf('\n', start) + 1)
  const text = body
    .split('\n')
    .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
    .join('\n')
    .replace(/^\[harness:[^\n]*\]\s*/, '')
    .trim()
  return { id: m[1], text }
}

type AgentMeta = { id: string; type: string; description: string; finished: boolean; toolUseId: string; active: boolean }

const AGENT_ID = /^[A-Za-z0-9_-]{1,64}$/
const WORKFLOW_RUN = /^wf_[A-Za-z0-9-]{1,64}$/
const AGENT_ACTIVE_MS = 10 * 60_000

function subagentDir(sessionFile: string): string {
  return join(sessionFile.replace(/\.jsonl$/, ''), 'subagents')
}

async function readAgentMeta(dir: string, id: string, nowMs: number): Promise<AgentMeta | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(join(dir, `agent-${id}.meta.json`), 'utf8'))
    if (!isObj(raw)) return null
    const mtime = await stat(join(dir, `agent-${id}.jsonl`)).then((s) => s.mtimeMs, () => 0)
    return {
      id,
      type: str(raw['agentType']) || 'agent',
      description: str(raw['description']),
      finished: raw['finished'] === true,
      toolUseId: str(raw['toolUseId']),
      active: nowMs - mtime < AGENT_ACTIVE_MS
    }
  } catch {
    return null
  }
}

async function subagentMetas(sessionFile: string, nowMs: number): Promise<AgentMeta[]> {
  const dir = subagentDir(sessionFile)
  const names = await readdir(dir).catch(() => [] as string[])
  const ids = names.filter((n) => n.startsWith('agent-') && n.endsWith('.meta.json')).map((n) => n.slice(6, -10)).filter((id) => AGENT_ID.test(id))
  return (await Promise.all(ids.map((id) => readAgentMeta(dir, id, nowMs)))).filter((m): m is AgentMeta => m !== null)
}

export function taskNotification(prompt: string): { toolUseId: string; status: string } | null {
  const text = prompt.trim()
  if (!text.startsWith('<task-notification>')) return null
  const toolUseId = tag(text, 'tool-use-id')?.trim()
  const status = tag(text, 'status')?.trim()
  return toolUseId && status ? { toolUseId, status } : null
}

const HOOK_STATES: Record<string, DetailStep['state']> = {
  hook_blocking_error: 'error',
  hook_non_blocking_error: 'error',
  hook_cancelled: 'error',
  hook_system_message: 'done'
}

function firstText(v: unknown, depth = 0): string {
  if (typeof v === 'string') return v
  if (!isObj(v) || depth > 3) return ''
  for (const key of ['blockingError', 'error', 'stderr', 'content', 'message']) {
    const t = firstText(v[key], depth + 1)
    if (t.trim()) return t
  }
  return ''
}

export function hookStep(att: Obj): DetailStep | null {
  const state = HOOK_STATES[str(att['type'])]
  if (!state) return null
  const event = str(att['hookEvent'])
  if (att['type'] === 'hook_system_message' && event === 'SessionStart') return null
  const text = (att['type'] === 'hook_cancelled' ? firstText(att) || 'Hook was cancelled' : firstText(att)).trim()
  if (!text) return null
  return {
    kind: 'command',
    label: `Hook · ${str(att['hookName']) || event || 'hook'}`,
    target: text.split('\n')[0]?.slice(0, 160) ?? '',
    state,
    output: clip(text, MAX_OUTPUT)
  }
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return ''
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function shortModel(model: string): string {
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/.exec(model)
  if (!m?.[1]) return model
  const name = m[1][0]?.toUpperCase() + m[1].slice(1)
  return `${name} ${m[2]}${m[3] && m[3].length <= 2 ? `.${m[3]}` : ''}`
}

async function unpushedBase(root: string): Promise<string> {
  for (const ref of ['@{upstream}', 'origin/HEAD']) {
    try {
      return (await run('git', ['merge-base', 'HEAD', ref], { cwd: root, timeout: 10_000 })).stdout.trim() || 'HEAD'
    } catch {
      continue
    }
  }
  return 'HEAD'
}

export async function gitFiles(root: string, paths: string[]): Promise<DetailFile[]> {
  if (!paths.length) return []
  const relPaths = paths.map((p) => rel(p, root))
  const opts = { cwd: root, maxBuffer: 32 * 1024 * 1024, timeout: 15_000 }
  let diff = ''
  try {
    const base = await unpushedBase(root)
    diff = (await run('git', ['diff', '--no-color', '--no-ext-diff', '-U3', base, '--', ...relPaths], opts)).stdout
  } catch (err) {
    if (!/bad revision|unknown revision|ambiguous argument 'HEAD'/i.test((err as Error).message)) throw err
  }
  const files: DetailFile[] = parseUnifiedDiff(diff).map((d) => ({ ...d, test: isTestPath(d.path) }))
  const { stdout: untracked } = await run('git', ['ls-files', '--others', '--exclude-standard', '--', ...relPaths], opts)
  for (const p of untracked.split('\n').filter(Boolean)) {
    try {
      const content = await readFile(`${root}/${p}`, 'utf8')
      const body = content.split('\n')
      files.push({
        path: p,
        change: 'A',
        add: body.length,
        del: 0,
        test: isTestPath(p),
        lines: [{ o: '', n: '', sign: '@', t: `@@ -0,0 +1,${body.length} @@` }, ...body.map((t, i) => ({ o: '' as const, n: i + 1, sign: '+' as const, t }))]
      })
    } catch {
      continue
    }
  }
  return files
}

function transcriptFiles(edits: EditRecord[], base: string): DetailFile[] {
  const byPath = new Map<string, DetailFile>()
  for (const e of edits) {
    const path = rel(e.path, base)
    const f = byPath.get(path) ?? { path, change: e.created ? 'A' : 'M', add: 0, del: 0, test: isTestPath(path), lines: [] }
    const lines = editAsDiff(e.oldText, e.newText)
    f.lines.push(...lines)
    f.add += lineCount(e.newText)
    f.del += lineCount(e.oldText)
    byPath.set(path, f)
  }
  return [...byPath.values()]
}

const PLAN_FILE = /(^|\/)([A-Z][A-Z0-9]+-\d+-)?plan\.md$|\/\.claude\/plans\/[^/]+\.md$/i

export async function buildDetail(item: SessionIndexItem, nowMs = Date.now(), opts: { sidechain?: boolean; maxTurns?: number; processAlive?: boolean } = {}): Promise<SessionDetailData> {
  const maxTurns = opts.maxTurns ?? MAX_TURNS
  const turns: DetailTurn[] = []
  const steps = new Map<string, DetailStep>()
  const seen = new Set<string>()
  const edits: EditRecord[] = []
  let planPath = ''
  let planFallback = ''
  let current: ClaudeTurn | null = null
  let turnStart = ''
  let turnEnd = ''
  let turnCost = 0
  let model = item.model

  const closeTurn = () => {
    if (current && current.meta) {
      current.meta.time = formatDuration(Date.parse(turnEnd) - Date.parse(turnStart))
      current.meta.cost = `$${turnCost.toFixed(2)}`
    }
    current = null
    turnCost = 0
  }

  let lastUserAt = ''
  const reports = new Map<string, string>()
  const background = new Set<string>()
  const finishBackground = (done: { toolUseId: string; status: string }) => {
    const step = steps.get(done.toolUseId)
    if (!step || !background.has(done.toolUseId)) return
    step.state = done.status === 'completed' ? 'done' : 'error'
    step.meta = done.status === 'completed' ? 'finished in background' : done.status
  }
  let lastContext = 0
  const rl = createInterface({ input: createReadStream(item.file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const raw of rl) {
    if (!raw.trim()) continue
    let o: unknown
    try {
      o = JSON.parse(raw)
    } catch {
      continue
    }
    if (!isObj(o) || (o['isSidechain'] === true && !opts.sidechain)) continue
    const type = str(o['type'])
    const ts = str(o['timestamp'])
    const message = isObj(o['message']) ? o['message'] : {}

    const compactNote = () => {
      if (turns.at(-1)?.kind === 'note') return
      closeTurn()
      turns.push({ kind: 'note', text: 'Conversation compacted' })
    }
    if (type === 'system' && str(o['subtype']) === 'compact_boundary') {
      compactNote()
      continue
    }
    if (type === 'user' && o['isCompactSummary'] === true) {
      compactNote()
      continue
    }

    if (type === 'user') {
      if (o['isMeta'] === true) continue
      const content = message['content']
      if (Array.isArray(content)) {
        for (const b of content.filter(isObj)) {
          if (b['type'] !== 'tool_result') continue
          const step = steps.get(str(b['tool_use_id']))
          if (!step) continue
          const text = resultText(b['content'])
          const isError = b['is_error'] === true
          step.state = isError ? 'error' : 'done'
          step.meta = resultMeta(step, text, isError)
          const launched = isObj(o['toolUseResult']) ? o['toolUseResult'] : {}
          if (!isError && (launched['status'] === 'async_launched' || str(launched['backgroundTaskId']))) background.add(str(b['tool_use_id']))
          const taskId = str(launched['taskId']) || str(launched['backgroundTaskId'])
          if (!isError && taskId) step.taskId = taskId
          if (!isError && WORKFLOW_RUN.test(str(launched['runId']))) step.workflow = { runId: str(launched['runId']), name: str(launched['workflowName']) }
          if (!isError && background.has(str(b['tool_use_id']))) {
            step.state = 'running'
            step.meta = 'in background'
          }
          if (step.kind === 'command' || isError) step.output = clip(text, MAX_OUTPUT)
        }
      }
      const prompt = promptOf(content)
      const finished = taskNotification(prompt)
      if (finished) {
        finishBackground(finished)
        continue
      }
      const command = commandPrompt(prompt)
      if (command) {
        closeTurn()
        turns.push({ kind: 'user', text: clip(command, MAX_TEXT), ...chain(o) })
        lastUserAt = ts
        continue
      }
      if (!isNoise(prompt) && o['toolUseResult'] === undefined) {
        closeTurn()
        turns.push({ kind: 'user', text: clip(prompt, MAX_TEXT), ...chain(o) })
        lastUserAt = ts
      }
      continue
    }

    if (type === 'attachment') {
      const att = isObj(o['attachment']) ? o['attachment'] : {}
      const hook = hookStep(att)
      if (hook) {
        if (!current) {
          current = { kind: 'claude', steps: [], meta: { model: shortModel(model), time: '', cost: '' } }
          turns.push(current)
          turnStart = ts
        }
        current.steps.push(hook)
        const parts = (current.parts ??= [])
        const last = parts[parts.length - 1]
        if (last?.kind === 'steps') last.steps.push(hook)
        else parts.push({ kind: 'steps', steps: [hook] })
        continue
      }
      if (str(att['type']) !== 'queued_command') continue
      const prompt = promptOf(att['prompt'])
      const report = agentReport(prompt)
      if (report) {
        reports.set(report.id, report.text)
        continue
      }
      const done = taskNotification(prompt)
      if (done) {
        finishBackground(done)
        continue
      }
      if (att['humanTurn'] === false) continue
      const command = commandPrompt(prompt)
      if (!command && (isNoise(prompt) || prompt.trimStart().startsWith('<'))) continue
      closeTurn()
      turns.push({ kind: 'user', text: clip(command || prompt, MAX_TEXT), ...chain(o) })
      lastUserAt = ts
      continue
    }

    if (type === 'system' && str(o['subtype']) === 'local_command') {
      const output = localCommandOutput(str(o['content']))
      if (output) {
        closeTurn()
        const markdown = /^(#{1,6} |\|)/m.test(output)
        turns.push({ kind: 'claude', steps: [], ...(markdown ? { text: clip(output, MAX_TEXT) } : { output: clip(output, MAX_TEXT) }), meta: { model: 'Command output', time: '', cost: '' } })
      }
      continue
    }

    if (type !== 'assistant') continue
    const msgModel = str(message['model'])
    if (msgModel && msgModel !== '<synthetic>') model = msgModel
    if (!current) {
      current = { kind: 'claude', steps: [], meta: { model: shortModel(model), time: '', cost: '' } }
      turns.push(current)
      turnStart = ts
    }
    if (ts) turnEnd = ts
    if (current.meta) current.meta.model = shortModel(model)
    const id = str(message['id'])
    if (isObj(message['usage']) && msgModel && msgModel !== '<synthetic>') {
      const used = contextTokens(message['usage'] as Usage)
      if (used > 0) lastContext = used
    }
    if (id && !seen.has(id) && isObj(message['usage']) && msgModel && msgModel !== '<synthetic>') {
      seen.add(id)
      turnCost += costOf(msgModel, message['usage'] as Usage).usd
    }
    const content = message['content']
    if (!Array.isArray(content)) continue
    for (const b of content.filter(isObj)) {
      if (b['type'] === 'text' && str(b['text']).trim()) {
        current.text = clip(current.text ? `${current.text}\n\n${str(b['text'])}` : str(b['text']), MAX_TEXT)
        const parts = (current.parts ??= [])
        const last = parts[parts.length - 1]
        if (last?.kind === 'text') last.text = clip(`${last.text}\n\n${str(b['text'])}`, MAX_TEXT)
        else parts.push({ kind: 'text', text: clip(str(b['text']), MAX_TEXT) })
      } else if (b['type'] === 'thinking' && str(b['thinking']).trim()) {
        const parts = (current.parts ??= [])
        const last = parts[parts.length - 1]
        if (last?.kind === 'thinking') last.text = clip(`${last.text}\n\n${str(b['thinking'])}`, MAX_TEXT)
        else parts.push({ kind: 'thinking', text: clip(str(b['thinking']), MAX_TEXT) })
      } else if (b['type'] === 'tool_use') {
        const name = str(b['name'])
        const input = isObj(b['input']) ? b['input'] : {}
        const step = stepFor(name, input, item.cwd)
        step.state = 'running'
        step.toolUseId = str(b['id'])
        step.startedAt = ts || undefined
        steps.set(str(b['id']), step)
        if (input['run_in_background'] === true) background.add(str(b['id']))
        current.steps.push(step)
        const parts = (current.parts ??= [])
        const last = parts[parts.length - 1]
        if (last?.kind === 'steps') last.steps.push(step)
        else parts.push({ kind: 'steps', steps: [step] })
        const path = str(input['file_path'])
        if (path && (name === 'Edit' || name === 'Write' || name === 'MultiEdit')) {
          if (name === 'Write') edits.push({ path, oldText: '', newText: str(input['content']), created: true })
          else if (name === 'Edit') edits.push({ path, oldText: str(input['old_string']), newText: str(input['new_string']), created: false })
          else
            for (const e of (Array.isArray(input['edits']) ? input['edits'] : []).filter(isObj))
              edits.push({ path, oldText: str(e['old_string']), newText: str(e['new_string']), created: false })
          if (PLAN_FILE.test(path)) {
            planPath = path
            if (name === 'Write') planFallback = str(input['content'])
          }
        }
      }
    }
  }
  closeTurn()

  const running = item.status === 'running' || item.status === 'waiting'
  if (!running) {
    for (const [id, s] of steps) {
      if (s.state !== 'running') continue
      const live = background.has(id) && (s.workflow ? opts.processAlive !== false && (await workflowActive(item.file, s.workflow.runId, nowMs)) : opts.processAlive === true)
      if (live) continue
      s.state = 'done'
      if (background.has(id) && s.meta === 'in background') s.meta = 'stopped'
    }
  }
  for (const meta of await subagentMetas(item.file, nowMs)) {
    const step = steps.get(meta.toolUseId)
    if (!step) continue
    step.agent = { id: meta.id, type: meta.type }
    const report = reports.get(meta.id)
    if (report) step.output = clip(report, MAX_OUTPUT)
    else if (step.output?.startsWith('Async agent launched')) step.output = undefined
    step.state = step.state === 'running' && !meta.finished && meta.active && !report ? 'running' : step.state === 'error' ? 'error' : 'done'
  }
  for (const s of steps.values()) {
    if (s.state === 'running') continue
    delete s.toolUseId
    delete s.taskId
    delete s.startedAt
  }

  const editedPaths = [...new Set(edits.map((e) => e.path))].filter((p) => !PLAN_FILE.test(p))
  let files: DetailFile[] = []
  let filesSource: SessionDetailData['filesSource'] = 'none'
  const rootVotes = new Map<string, number>()
  for (const p of editedPaths) {
    const r = gitRoot(p.slice(0, p.lastIndexOf('/')))
    if (r) rootVotes.set(r, (rootVotes.get(r) ?? 0) + 1)
  }
  const root = [...rootVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  let fromGit = false
  if (root) {
    try {
      files = await gitFiles(root, editedPaths.filter((p) => p.startsWith(`${root}/`)))
      fromGit = true
      if (files.length) filesSource = 'git'
    } catch (err) {
      console.log(`[kokpit] git diff failed in ${root}: ${(err as Error).message}`)
    }
  }
  if (!fromGit && edits.length) {
    const base = root ?? item.cwd
    files = transcriptFiles(
      edits.filter((e) => !PLAN_FILE.test(e.path) && e.path.startsWith(`${base}/`)),
      base
    )
    filesSource = files.length ? 'transcript' : 'none'
  }

  let plan: SessionDetailData['plan']
  if (planPath) {
    try {
      const st = await stat(planPath)
      const markdown = st.size <= MAX_PLAN ? await readFile(planPath, 'utf8') : planFallback
      plan = { file: planPath.split('/').pop() ?? planPath, path: planPath, markdown, updatedAt: st.mtime.toISOString() }
    } catch {
      if (planFallback) plan = { file: planPath.split('/').pop() ?? planPath, path: planPath, markdown: planFallback, updatedAt: item.lastAt }
    }
  }

  const earlierCount = Math.max(0, turns.length - maxTurns)
  return {
    id: item.id,
    header: {
      title: item.title,
      status: item.status,
      elapsed: formatDuration(Date.parse(item.lastAt) - Date.parse(item.startedAt)),
      cost: `$${item.costUsd.toFixed(2)}`,
      repo: item.repo,
      branch: item.branch,
      jira: item.jira ? { key: item.jira, title: '' } : undefined,
      pr: item.prNumber ? { number: `#${item.prNumber}`, url: item.prUrl } : undefined,
      context: lastContext ? { used: lastContext, window: contextWindow(model, lastContext) } : undefined
    },
    turns: turns.slice(-maxTurns),
    earlierCount,
    model: shortModel(model),
    running,
    activeSince: running && lastUserAt ? lastUserAt : undefined,
    files,
    filesSource,
    filesRoot: filesSource === 'git' ? root : null,
    plan
  }
}

async function workflowActive(sessionFile: string, runId: string, nowMs: number): Promise<boolean> {
  if (!WORKFLOW_RUN.test(runId)) return false
  const dir = join(subagentDir(sessionFile), 'workflows', runId)
  const names = await readdir(dir).catch(() => [] as string[])
  const times = await Promise.all(names.map((n) => stat(join(dir, n)).then((st) => st.mtimeMs, () => 0)))
  return times.some((t) => nowMs - t < AGENT_ACTIVE_MS)
}

async function firstTimestamp(file: string): Promise<string | undefined> {
  const fh = await open(file, 'r').catch(() => null)
  if (!fh) return undefined
  try {
    const buf = Buffer.alloc(16_384)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    return /"timestamp":"([^"]+)"/.exec(buf.subarray(0, bytesRead).toString('utf8'))?.[1]
  } finally {
    await fh.close()
  }
}

const TASK_ID = /^[A-Za-z0-9_-]{1,64}$/
const MAX_TASK_OUTPUT = 40_000

export async function readTaskOutput(item: SessionIndexItem, taskId: string): Promise<{ text: string; truncated: boolean; missing: boolean }> {
  if (!TASK_ID.test(taskId)) throw new Error('invalid task id')
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0
  const file = join('/tmp', `claude-${uid}`, basename(dirname(item.file)), item.id, 'tasks', `${taskId}.output`)
  const fh = await open(file, 'r').catch(() => null)
  if (!fh) return { text: '', truncated: false, missing: true }
  try {
    const { size } = await fh.stat()
    const start = Math.max(0, size - MAX_TASK_OUTPUT)
    const buf = Buffer.alloc(size - start)
    await fh.read(buf, 0, buf.length, start)
    return { text: buf.toString('utf8').replace(/\x1b\[[0-9;]*m/g, ''), truncated: start > 0, missing: false }
  } finally {
    await fh.close()
  }
}

export async function readWorkflowRun(item: SessionIndexItem, runId: string): Promise<WorkflowRun> {
  if (!WORKFLOW_RUN.test(runId)) throw new Error('invalid workflow run')
  const dir = join(subagentDir(item.file), 'workflows', runId)
  const raw = await readFile(join(dir, 'journal.jsonl'), 'utf8').catch(() => '')
  const byAgent = new Map<string, WorkflowStep>()
  for (const line of raw.split('\n')) {
    let e: unknown
    try {
      e = JSON.parse(line)
    } catch {
      continue
    }
    if (!isObj(e)) continue
    const agentId = str(e['agentId'])
    if (!AGENT_ID.test(agentId)) continue
    const type = str(e['type'])
    if (type === 'started') byAgent.set(agentId, { agentId, label: str(e['label']) || 'Step', phase: str(e['phase']).replace(/^▸\s*/, ''), state: 'running' })
    const step = byAgent.get(agentId)
    if (step && type === 'result') step.state = 'done'
    if (step && type === 'failed') step.state = 'error'
  }
  const steps = [...byAgent.values()]
  await Promise.all(
    steps.map(async (s) => {
      const file = join(dir, `agent-${s.agentId}.jsonl`)
      s.startedAt = await firstTimestamp(file)
      if (s.state !== 'running') s.endedAt = await stat(file).then((st) => st.mtime.toISOString(), () => undefined)
    })
  )
  return { runId, steps }
}

export async function buildSubagentDetail(item: SessionIndexItem, ref: string, nowMs = Date.now()): Promise<SubagentDetail> {
  const [runId, agentId] = ref.includes('/') ? ref.split('/', 2) : ['', ref]
  if (!agentId || !AGENT_ID.test(agentId) || (runId && !WORKFLOW_RUN.test(runId))) throw new Error('invalid agent id')
  const dir = runId ? join(subagentDir(item.file), 'workflows', runId) : subagentDir(item.file)
  const meta = await readAgentMeta(dir, agentId, nowMs)
  if (!meta) throw new Error('Subagent not found')
  const live = !meta.finished && meta.active
  const detail = await buildDetail(
    { ...item, file: join(dir, `agent-${agentId}.jsonl`), title: meta.description || item.title, status: live ? 'running' : 'done' },
    nowMs,
    { sidechain: true }
  )
  return { ...detail, agent: { id: meta.id, type: meta.type, description: meta.description, finished: !live } }
}
