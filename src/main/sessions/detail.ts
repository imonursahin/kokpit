import { execFile } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { promisify } from 'node:util'
import type { SessionIndexItem } from '../../shared/sessionIndex'
import type { DetailFile, DetailStep, DetailStepKind, DetailTurn, SessionDetailData } from '../../shared/sessionDetail'
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
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}\n…` : s)

type ClaudeTurn = Extract<DetailTurn, { kind: 'claude' }>
type EditRecord = { path: string; oldText: string; newText: string; created: boolean }

function rel(path: string, base: string): string {
  return base && path.startsWith(`${base}/`) ? path.slice(base.length + 1) : path
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
  return (out.length ? out.join('\n\n') : content).replace(/\x1b\[[0-9;]*m/g, '').trim()
}

function isNoise(text: string): boolean {
  const t = text.trimStart()
  return !t || t.startsWith('<command-') || t.startsWith('<local-command') || t.startsWith('<system-reminder>') || t.startsWith('Caveat:') || t.startsWith('[Request interrupted') || t.startsWith('<task-notification>')
}

function formatDuration(ms: number): string {
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

const PLAN_FILE = /(^|\/)([^/]*plan[^/]*\.md|plans\/[^/]+\.md)$/i

export async function buildDetail(item: SessionIndexItem, nowMs = Date.now()): Promise<SessionDetailData> {
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
    if (!isObj(o) || o['isSidechain'] === true) continue
    const type = str(o['type'])
    const ts = str(o['timestamp'])
    const message = isObj(o['message']) ? o['message'] : {}

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
          if (step.kind === 'command' || isError) step.output = clip(text, MAX_OUTPUT)
        }
      }
      const prompt = promptOf(content)
      const command = commandPrompt(prompt)
      if (command) {
        closeTurn()
        turns.push({ kind: 'user', text: clip(command, MAX_TEXT) })
        lastUserAt = ts
        continue
      }
      if (!isNoise(prompt) && o['toolUseResult'] === undefined) {
        closeTurn()
        turns.push({ kind: 'user', text: clip(prompt, MAX_TEXT) })
        lastUserAt = ts
      }
      continue
    }

    if (type === 'attachment') {
      const att = isObj(o['attachment']) ? o['attachment'] : {}
      if (str(att['type']) !== 'queued_command' || att['humanTurn'] === false) continue
      const prompt = promptOf(att['prompt'])
      const command = commandPrompt(prompt)
      if (!command && (isNoise(prompt) || prompt.trimStart().startsWith('<'))) continue
      closeTurn()
      turns.push({ kind: 'user', text: clip(command || prompt, MAX_TEXT) })
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
      } else if (b['type'] === 'tool_use') {
        const name = str(b['name'])
        const input = isObj(b['input']) ? b['input'] : {}
        const step = stepFor(name, input, item.cwd)
        step.state = 'running'
        steps.set(str(b['id']), step)
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

  const running = item.status === 'running'
  if (!running) for (const s of steps.values()) if (s.state === 'running') s.state = 'done'

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
    files = transcriptFiles(edits.filter((e) => !PLAN_FILE.test(e.path)), root ?? item.cwd)
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

  const earlierCount = Math.max(0, turns.length - MAX_TURNS)
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
    turns: turns.slice(-MAX_TURNS),
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
