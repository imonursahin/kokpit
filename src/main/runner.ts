import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import {
  query,
  renameSession,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import { EFFORTS, IMAGE_TYPES, isRunnerMode, type Activity, type AskDecision, type BackgroundTask, type ImageInput, type LiveSession, type PendingAsk, type RunnerEvent, type ModelOption, type RewindResult, type SlashCommandInfo, type StartSession, type TurnSettings } from '../shared/runner'
import { memoryDir } from './assistant'

class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private closed = false

  push(text: string, images: ImageInput[] = []): string {
    const uuid = randomUUID()
    const content = images.length
      ? [
          ...images.map((i) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: i.mediaType, data: i.data } })),
          ...(text ? [{ type: 'text' as const, text }] : [])
        ]
      : text
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content },
      parent_tool_use_id: null,
      origin: { kind: 'human' },
      uuid: uuid as SDKUserMessage['uuid']
    }
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: msg, done: false })
    else this.items.push(msg)
    return uuid
  }

  close(): void {
    this.closed = true
    for (const w of this.waiters.splice(0)) w({ value: undefined, done: true })
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift()
        if (item) return Promise.resolve({ value: item, done: false })
        if (this.closed) return Promise.resolve({ value: undefined, done: true })
        return new Promise((resolve) => this.waiters.push(resolve))
      }
    }
  }
}

const MAX_IMAGES = 10
const MAX_IMAGE_BASE64 = 6_900_000

export function imageInputs(input: unknown): ImageInput[] {
  if (input === undefined || input === null) return []
  if (!Array.isArray(input)) throw new Error('invalid images')
  if (input.length > MAX_IMAGES) throw new Error(`Attach at most ${MAX_IMAGES} images`)
  return input.map((item: unknown) => {
    const o = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
    const mediaType = o['mediaType']
    const data = o['data']
    if (typeof mediaType !== 'string' || !(IMAGE_TYPES as readonly string[]).includes(mediaType)) throw new Error('Only PNG, JPEG, GIF and WebP images can be attached')
    if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('invalid image')
    if (data.length > MAX_IMAGE_BASE64) throw new Error('Images must be under 5 MB')
    return { mediaType: mediaType as ImageInput['mediaType'], data }
  })
}

export function turnSettings(input: unknown): TurnSettings {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const model = typeof o['model'] === 'string' && /^claude-[a-z0-9.-]+$/.test(o['model']) ? o['model'] : undefined
  const effort = typeof o['effort'] === 'string' && (EFFORTS as string[]).includes(o['effort']) ? (o['effort'] as TurnSettings['effort']) : undefined
  return { model, effort }
}

export function answerInputs(input: unknown): Record<string, string> | undefined {
  if (input === undefined || input === null) return undefined
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid answers')
  const entries = Object.entries(input as Record<string, unknown>)
  if (!entries.length || entries.length > 4 || entries.some(([k, v]) => !k || typeof v !== 'string' || !v.trim() || v.length > 4000))
    throw new Error('invalid answers')
  return Object.fromEntries(entries) as Record<string, string>
}

type Pending = PendingAsk & { suggestions?: PermissionUpdate[]; resolve: (r: PermissionResult) => void }

type Live = {
  key: string
  pendingTitle: string
  info: LiveSession
  input: InputQueue
  q: Query
  pending: Map<string, Pending>
  interrupted?: boolean
  effort?: string
  partial?: string
  partialTimer?: ReturnType<typeof setTimeout>
  tasks: Map<string, BackgroundTask>
}

const TASK_KINDS: Record<string, string> = { local_agent: 'Subagent', local_workflow: 'Workflow', local_bash: 'Shell', shell: 'Shell', workflow: 'Workflow', subagent: 'Subagent', monitor: 'Monitor' }

export function toolActivity(name: string, input: Record<string, unknown>): Activity {
  const pick = ['command', 'description', 'file_path', 'pattern', 'url', 'query', 'path', 'prompt'].map((k) => input[k]).find((v) => typeof v === 'string' && v.trim())
  return { kind: 'tool', tool: name, detail: typeof pick === 'string' ? pick.replace(/\s+/g, ' ').trim().slice(0, 160) : undefined }
}

export function trackTask(tasks: Map<string, BackgroundTask>, msg: Record<string, unknown>, now = new Date()): boolean {
  const id = typeof msg['task_id'] === 'string' ? msg['task_id'] : ''
  if (!id) return false
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  switch (msg['subtype']) {
    case 'task_started': {
      if (msg['ambient'] === true || msg['skip_transcript'] === true) return false
      const type = text(msg['task_type'])
      tasks.set(id, { id, kind: TASK_KINDS[type] ?? (type || 'Task'), description: (text(msg['workflow_name']) || text(msg['description']) || 'Task').slice(0, 160), startedAt: now.toISOString(), taskId: id, toolUseId: text(msg['tool_use_id']) || undefined })
      return true
    }
    case 'task_progress': {
      const t = tasks.get(id)
      if (!t) return false
      const usage = msg['usage'] as { tool_uses?: unknown } | undefined
      tasks.set(id, { ...t, toolUses: typeof usage?.tool_uses === 'number' ? usage.tool_uses : t.toolUses, lastTool: text(msg['last_tool_name']) || t.lastTool })
      return true
    }
    case 'task_notification':
      return tasks.delete(id)
    case 'task_updated': {
      const status = (msg['patch'] as { status?: unknown } | undefined)?.status
      return typeof status === 'string' && ['completed', 'failed', 'killed'].includes(status) ? tasks.delete(id) : false
    }
    default:
      return false
  }
}

export function stateAfterResult(
  prev: LiveSession['state'],
  result: { is_error: boolean; subtype: string },
  interrupted: boolean
): Pick<LiveSession, 'state' | 'lastError'> | null {
  if (interrupted) return { state: 'idle', lastError: undefined }
  if (prev === 'error' && !result.is_error) return null
  return { state: result.is_error ? 'error' : 'idle', lastError: result.subtype === 'success' ? undefined : result.subtype }
}

function describe(toolName: string, input: Record<string, unknown>): { title: string; detail: string } {
  const s = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  switch (toolName) {
    case 'Bash':
      return { title: 'Wants to run a command', detail: s('command') }
    case 'Edit':
    case 'MultiEdit':
      return { title: 'Wants to edit a file', detail: s('file_path') }
    case 'Write':
      return { title: 'Wants to write a file', detail: s('file_path') }
    case 'WebFetch':
      return { title: 'Wants to fetch a page', detail: s('url') }
    case 'WebSearch':
      return { title: 'Wants to search the web', detail: s('query') }
    case 'ExitPlanMode':
      return { title: 'Wants to leave plan mode and start working', detail: s('plan').slice(0, 4000) }
    default:
      return {
        title: toolName.startsWith('mcp__') ? `Wants to call ${toolName.split('__').slice(1).join(' · ')}` : `Wants to use ${toolName}`,
        detail: JSON.stringify(input).slice(0, 400)
      }
  }
}

const COMMANDS_TTL_MS = 10 * 60_000
const MODELS_TTL_MS = 30 * 60_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type StreamEvent = {
  type: string
  content_block?: { type: string; name?: string }
  delta?: { type: string; text?: string }
}

export class Runner {
  private live = new Map<string, Live>()
  private commandCache = new Map<string, { at: number; list: Promise<SlashCommandInfo[]> }>()
  private modelCache: { at: number; list: Promise<ModelOption[]> } | null = null
  private alias = new Map<string, string>()

  private find(id: string): Live | undefined {
    return this.live.get(id) ?? this.live.get(this.alias.get(id) ?? '')
  }

  constructor(
    private readonly emit: (e: RunnerEvent) => void,
    private readonly log: (m: string) => void = () => {},
    private readonly executable: () => string | undefined = () => undefined,
    private readonly assistant: () => Promise<{ home: string; prompt?: string } | null> = async () => null
  ) {}

  list(): LiveSession[] {
    return [...this.live.values()].map((l) => this.snapshot(l))
  }

  private snapshot(l: Live): LiveSession {
    return { ...l.info, pending: [...l.pending.values()].map(({ resolve: _r, suggestions: _s, ...p }) => p), background: [...l.tasks.values()] }
  }

  private publish(l: Live): void {
    this.emit({ type: 'state', session: this.snapshot(l) })
  }

  async start(req: StartSession): Promise<{ tempId: string }> {
    if (!req || typeof req.cwd !== 'string' || typeof req.prompt !== 'string') throw new Error('invalid start request')
    if (!existsSync(req.cwd) || !statSync(req.cwd).isDirectory()) throw new Error(`Folder not found: ${req.cwd}`)
    const images = imageInputs(req.images)
    const hasPrompt = !!req.prompt.trim() || images.length > 0
    if (req.resumeId && !hasPrompt) throw new Error('Write a message first')
    if (req.mode !== undefined && !isRunnerMode(req.mode)) throw new Error('invalid mode')
    if (req.resumeAt !== undefined && (typeof req.resumeAt !== 'string' || !req.resumeId || !/^[0-9a-f-]{36}$/i.test(req.resumeAt))) throw new Error('invalid rewind point')
    if (req.resumeId && !req.resumeAt && this.find(req.resumeId)) {
      await this.send(req.resumeId, req.prompt, images, { model: req.model, effort: req.effort })
      return { tempId: req.resumeId }
    }

    const tempId = req.resumeId && !req.resumeAt ? req.resumeId : `pending-${randomUUID()}`
    const input = new InputQueue()
    if (hasPrompt) input.push(req.prompt, images)
    const pending = new Map<string, Pending>()
    const info: LiveSession = {
      sessionId: tempId,
      title: typeof req.title === 'string' && req.title.trim() ? req.title.trim().slice(0, 120) : undefined,
      cwd: req.cwd,
      state: hasPrompt ? 'starting' : 'idle',
      model: req.model ?? '',
      mode: req.mode ?? 'default',
      costUsd: 0,
      pending: [],
      startedAt: new Date().toISOString()
    }

    const title = typeof req.title === 'string' ? req.title.trim().slice(0, 120) : ''
    let liveRef: Live | null = null
    const kokpit = await this.assistant()
    const q = query({
      prompt: input,
      options: {
        cwd: req.cwd,
        model: req.model,
        effort: req.effort,
        resume: req.resumeId,
        ...(title && !req.resumeId ? { title } : {}),
        ...(req.resumeAt ? { forkSession: true, resumeSessionAt: req.resumeAt } : {}),
        settingSources: ['user', 'project', 'local'],
        includePartialMessages: true,
        perTaskStopAffordance: true,
        enableFileCheckpointing: true,
        pathToClaudeCodeExecutable: this.executable(),
        plugins: kokpit ? [{ type: 'local', path: kokpit.home }] : undefined,
        // The autoMemoryDirectory setting is dropped for SDK-launched sessions; this undocumented override is what the CLI honors (checked on 2.1.318).
        env: kokpit ? { ...process.env, CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: memoryDir(kokpit.home) } : undefined,
        systemPrompt: kokpit?.prompt ? { type: 'preset', preset: 'claude_code', append: kokpit.prompt } : undefined,
        permissionMode: req.mode ?? 'default',
        allowDangerouslySkipPermissions: true,
        canUseTool: (toolName, toolInput, opts) =>
          new Promise<PermissionResult>((resolve) => {
            const l = liveRef
            if (!l) {
              resolve({ behavior: 'deny', message: 'Session is not ready yet' })
              return
            }
            const requestId = randomUUID()
            const { title, detail } = describe(toolName, toolInput)
            const ask: Pending = {
              requestId,
              sessionId: l.info.sessionId,
              toolName,
              title,
              detail,
              input: toolInput,
              canAlwaysAllow: !!opts.suggestions?.length,
              createdAt: new Date().toISOString(),
              suggestions: opts.suggestions,
              resolve
            }
            l.pending.set(requestId, ask)
            l.info.state = 'waiting'
            this.publish(l)
            opts.signal.addEventListener('abort', () => {
              if (l.pending.delete(requestId)) {
                resolve({ behavior: 'deny', message: 'Cancelled' })
                l.info.state = 'running'
                this.publish(l)
              }
            })
          })
      }
    })

    const l: Live = { key: tempId, pendingTitle: title, info, input, q, pending, effort: req.effort, tasks: new Map() }
    liveRef = l
    this.live.set(tempId, l)
    this.publish(l)
    void this.pump(l)
    return { tempId }
  }

  private rekey(l: Live, sessionId: string): void {
    if (l.key === sessionId) return
    const old = l.key
    this.live.delete(old)
    this.alias.set(old, sessionId)
    l.key = sessionId
    l.info.sessionId = sessionId
    for (const p of l.pending.values()) p.sessionId = sessionId
    this.live.set(sessionId, l)
    this.emit({ type: 'started', tempId: old, sessionId })
  }

  private async pump(l: Live): Promise<void> {
    try {
      for await (const msg of l.q as AsyncIterable<SDKMessage>) {
        if ('session_id' in msg && typeof msg.session_id === 'string' && msg.session_id && msg.session_id !== l.key) {
          this.rekey(l, msg.session_id)
          void this.applyTitle(l)
        }
        if (msg.type === 'system' && msg.subtype === 'init') {
          l.info.model = msg.model
          if (isRunnerMode(msg.permissionMode)) l.info.mode = msg.permissionMode
          l.info.state = 'running'
          this.publish(l)
        } else if (msg.type === 'system' && msg.subtype === 'status') {
          if (isRunnerMode(msg.permissionMode) && msg.permissionMode !== l.info.mode) {
            l.info.mode = msg.permissionMode
            this.publish(l)
          }
        } else if (msg.type === 'system' && msg.subtype === 'informational') {
          if (/blocked by hook|blocked/i.test(msg.content)) {
            l.info.lastError = msg.content.split('\n').slice(0, 3).join(' ')
            l.info.state = 'error'
          }
          this.emit({ type: 'text', sessionId: l.key, text: msg.content })
          this.publish(l)
        } else if (msg.type === 'system' && (msg.subtype === 'task_started' || msg.subtype === 'task_progress' || msg.subtype === 'task_notification' || msg.subtype === 'task_updated')) {
          if (trackTask(l.tasks, msg as unknown as Record<string, unknown>)) this.publish(l)
        } else if (msg.type === 'stream_event') {
          if (!msg.parent_tool_use_id) this.onStream(l, msg.event as unknown as StreamEvent)
        } else if (msg.type === 'assistant') {
          if (l.info.state !== 'waiting') l.info.state = 'running'
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text.trim()) this.emit({ type: 'text', sessionId: l.key, text: block.text })
            if (block.type === 'tool_use' && !msg.parent_tool_use_id) l.info.activity = toolActivity(block.name, (block.input ?? {}) as Record<string, unknown>)
          }
          this.publish(l)
        } else if (msg.type === 'user' && !msg.parent_tool_use_id && l.info.activity?.kind === 'tool') {
          l.info.activity = { kind: 'thinking' }
          this.publish(l)
        } else if (msg.type === 'result') {
          l.info.activity = undefined
          this.setPartial(l, '')
          void this.applyTitle(l)
          l.info.costUsd += msg.total_cost_usd
          const next = stateAfterResult(l.info.state, msg, !!l.interrupted)
          l.interrupted = false
          if (next) Object.assign(l.info, next)
          this.publish(l)
        }
      }
      if (l.info.state !== 'error') l.info.state = 'idle'
    } catch (err) {
      l.info.state = 'error'
      l.info.lastError = (err as Error).message
      this.log(`session ${l.key} failed: ${(err as Error).message}`)
    } finally {
      for (const p of l.pending.values()) p.resolve({ behavior: 'deny', message: 'Session ended' })
      l.pending.clear()
      this.publish(l)
      this.live.delete(l.key)
      this.emit({ type: 'ended', sessionId: l.key })
    }
  }

  private onStream(l: Live, ev: StreamEvent): void {
    if (ev.type === 'content_block_start') {
      const t = ev.content_block?.type
      const next: Activity | undefined =
        t === 'thinking' || t === 'redacted_thinking' ? { kind: 'thinking' } : t === 'text' ? { kind: 'writing' } : t === 'tool_use' ? { kind: 'tool', tool: ev.content_block?.name } : undefined
      if (next && (next.kind !== l.info.activity?.kind || next.tool !== l.info.activity?.tool)) {
        l.info.activity = next
        this.publish(l)
      }
    }
    if (ev.type === 'message_start') this.setPartial(l, '')
    else if (ev.type === 'content_block_start' && ev.content_block?.type === 'text' && l.partial) this.setPartial(l, `${l.partial}\n\n`)
    else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) this.setPartial(l, `${l.partial ?? ''}${ev.delta.text}`)
  }

  private setPartial(l: Live, text: string): void {
    l.partial = text
    if (!text) {
      if (l.partialTimer) clearTimeout(l.partialTimer)
      l.partialTimer = undefined
      this.emit({ type: 'partial', sessionId: l.key, text: '' })
      return
    }
    if (l.partialTimer) return
    l.partialTimer = setTimeout(() => {
      l.partialTimer = undefined
      this.emit({ type: 'partial', sessionId: l.key, text: l.partial ?? '' })
    }, 80)
  }

  private async applyTitle(l: Live): Promise<void> {
    if (!l.pendingTitle || l.key.startsWith('pending-')) return
    const title = l.pendingTitle
    try {
      await renameSession(l.key, title)
      if (l.pendingTitle === title) l.pendingTitle = ''
      this.emit({ type: 'state', session: this.snapshot(l) })
    } catch (err) {
      this.log(`rename ${l.key} not applied yet: ${(err as Error).message}`)
    }
  }

  async send(sessionId: unknown, text: unknown, images?: unknown, settings?: unknown): Promise<string> {
    const pics = imageInputs(images)
    if (typeof sessionId !== 'string' || typeof text !== 'string' || (!text.trim() && !pics.length)) throw new Error('invalid message')
    const l = this.find(sessionId)
    if (!l) throw new Error('This session is not running in Kokpit')
    const s = turnSettings(settings)
    if (s.model && s.model !== l.info.model) {
      await l.q.setModel(s.model)
      l.info.model = s.model
    }
    if (s.effort && s.effort !== l.effort) {
      await l.q.applyFlagSettings({ effortLevel: s.effort })
      l.effort = s.effort
    }
    const uuid = l.input.push(text, pics)
    l.info.state = 'running'
    this.publish(l)
    return uuid
  }

  async cancelQueued(sessionId: unknown, uuid: unknown): Promise<boolean> {
    if (typeof sessionId !== 'string' || typeof uuid !== 'string' || !UUID.test(uuid)) throw new Error('invalid message id')
    const l = this.find(sessionId)
    if (!l) return false
    const q = l.q as unknown as { cancelAsyncMessage?: (id: string) => Promise<boolean> }
    return q.cancelAsyncMessage ? q.cancelAsyncMessage(uuid) : false
  }

  models(): Promise<ModelOption[]> {
    if (this.modelCache && Date.now() - this.modelCache.at < MODELS_TTL_MS) return this.modelCache.list
    const list = this.withQuery(homedir(), async (q) => {
      const seen = new Set<string>()
      return (await q.supportedModels()).flatMap((m) => {
        const id = m.resolvedModel ?? m.value
        if (m.value === 'default' || !/^claude-[a-z0-9.-]+$/.test(id) || seen.has(id)) return []
        seen.add(id)
        return [{ id, label: m.displayName }]
      })
    }).catch((err: Error) => {
      this.modelCache = null
      this.log(`model list: ${err.message}`)
      return []
    })
    this.modelCache = { at: Date.now(), list }
    return list
  }

  async rewindFiles(sessionId: unknown, cwd: unknown, userUuid: unknown, dryRun: unknown): Promise<RewindResult> {
    if (typeof sessionId !== 'string' || typeof userUuid !== 'string' || !UUID.test(userUuid)) throw new Error('invalid rewind point')
    if (typeof cwd !== 'string' || !cwd.startsWith('/') || !existsSync(cwd)) throw new Error('Folder not found')
    const run = async (q: Query): Promise<RewindResult> => {
      const r = await q.rewindFiles(userUuid, { dryRun: dryRun === true })
      return { canRewind: r.canRewind, error: r.error, filesChanged: r.filesChanged ?? [], insertions: r.insertions ?? 0, deletions: r.deletions ?? 0 }
    }
    const l = this.find(sessionId)
    return l ? run(l.q) : this.withQuery(cwd, run, { resume: sessionId, enableFileCheckpointing: true })
  }

  commands(cwd: unknown): Promise<SlashCommandInfo[]> {
    if (typeof cwd !== 'string' || !cwd.startsWith('/') || !existsSync(cwd)) return Promise.resolve([])
    const hit = this.commandCache.get(cwd)
    if (hit && Date.now() - hit.at < COMMANDS_TTL_MS) return hit.list
    const list = this.loadCommands(cwd).catch((err: Error) => {
      this.commandCache.delete(cwd)
      this.log(`slash commands for ${cwd}: ${err.message}`)
      return []
    })
    this.commandCache.set(cwd, { at: Date.now(), list })
    return list
  }

  private async withQuery<T>(cwd: string, fn: (q: Query) => Promise<T>, extra: Record<string, unknown> = {}): Promise<T> {
    const kokpit = await this.assistant()
    const idle: AsyncIterable<SDKUserMessage> = { [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>(() => {}) }) }
    const q = query({
      prompt: idle,
      options: {
        cwd,
        settingSources: ['user', 'project', 'local'],
        pathToClaudeCodeExecutable: this.executable(),
        plugins: kokpit ? [{ type: 'local', path: kokpit.home }] : undefined,
        ...extra
      }
    })
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 30_000))
      return await Promise.race([fn(q), timeout])
    } finally {
      q.close?.()
    }
  }

  private async loadCommands(cwd: string): Promise<SlashCommandInfo[]> {
    const list = async (q: Query) =>
      (await q.supportedCommands())
        .map((c) => ({ name: c.name, description: c.description ?? '', argumentHint: c.argumentHint ?? '' }))
        .sort((a, b) => a.name.localeCompare(b.name))
    const live = [...this.live.values()].find((l) => l.info.cwd === cwd)
    return live ? list(live.q) : this.withQuery(cwd, list)
  }

  async setMode(sessionId: unknown, mode: unknown): Promise<void> {
    if (typeof sessionId !== 'string' || !isRunnerMode(mode)) throw new Error('invalid mode')
    const l = this.find(sessionId)
    if (!l) throw new Error('This session is not running in Kokpit')
    await l.q.setPermissionMode(mode)
    l.info.mode = mode
    this.publish(l)
  }

  respond(sessionId: unknown, requestId: unknown, decision: unknown, note?: unknown, answers?: unknown): void {
    const picked = answerInputs(answers)
    if (typeof sessionId !== 'string' || typeof requestId !== 'string') throw new Error('invalid response')
    if (decision !== 'allow' && decision !== 'deny' && decision !== 'always') throw new Error('invalid decision')
    const l = this.find(sessionId)
    const p = l?.pending.get(requestId)
    if (!l || !p) throw new Error('This request is no longer pending')
    l.pending.delete(requestId)
    const d = decision as AskDecision
    if (d === 'deny') {
      p.resolve({ behavior: 'deny', message: typeof note === 'string' && note.trim() ? note : 'The user denied this action' })
    } else {
      p.resolve({ behavior: 'allow', updatedInput: picked ? { ...p.input, answers: picked } : p.input, updatedPermissions: d === 'always' ? p.suggestions : undefined })
    }
    l.info.state = l.pending.size ? 'waiting' : 'running'
    this.publish(l)
  }

  async interrupt(sessionId: unknown): Promise<void> {
    if (typeof sessionId !== 'string') throw new Error('invalid session id')
    const l = this.find(sessionId)
    if (!l) return
    l.interrupted = true
    await l.q.interrupt()
  }

  async stopTask(sessionId: unknown, taskId: unknown): Promise<void> {
    if (typeof sessionId !== 'string' || typeof taskId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) throw new Error('invalid task')
    const l = this.find(sessionId)
    if (!l) throw new Error('This session is not running in Kokpit')
    await l.q.stopTask(taskId)
  }

  close(sessionId: unknown): void {
    if (typeof sessionId !== 'string') return
    const l = this.find(sessionId)
    if (!l) return
    l.input.close()
    l.q.close?.()
  }

  dispose(): void {
    for (const l of this.live.values()) {
      l.input.close()
      l.q.close?.()
    }
  }
}
