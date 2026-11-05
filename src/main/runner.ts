import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import {
  query,
  renameSession,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage
} from '@anthropic-ai/claude-agent-sdk'
import type { AskDecision, LiveSession, PendingAsk, RunnerEvent, StartSession } from '../shared/runner'
import { memoryDir } from './assistant'

class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = []
  private waiters: ((r: IteratorResult<SDKUserMessage>) => void)[] = []
  private closed = false

  push(text: string): void {
    const msg: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      origin: { kind: 'human' }
    }
    const waiter = this.waiters.shift()
    if (waiter) waiter({ value: msg, done: false })
    else this.items.push(msg)
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

type Pending = PendingAsk & { suggestions?: PermissionUpdate[]; resolve: (r: PermissionResult) => void }

type Live = {
  key: string
  pendingTitle: string
  info: LiveSession
  input: InputQueue
  q: Query
  pending: Map<string, Pending>
  interrupted?: boolean
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
    default:
      return {
        title: toolName.startsWith('mcp__') ? `Wants to call ${toolName.split('__').slice(1).join(' · ')}` : `Wants to use ${toolName}`,
        detail: JSON.stringify(input).slice(0, 400)
      }
  }
}

export class Runner {
  private live = new Map<string, Live>()
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
    return { ...l.info, pending: [...l.pending.values()].map(({ resolve: _r, suggestions: _s, ...p }) => p) }
  }

  private publish(l: Live): void {
    this.emit({ type: 'state', session: this.snapshot(l) })
  }

  async start(req: StartSession): Promise<{ tempId: string }> {
    if (!req || typeof req.cwd !== 'string' || typeof req.prompt !== 'string') throw new Error('invalid start request')
    if (!existsSync(req.cwd) || !statSync(req.cwd).isDirectory()) throw new Error(`Folder not found: ${req.cwd}`)
    const hasPrompt = !!req.prompt.trim()
    if (req.resumeId && !hasPrompt) throw new Error('Write a message first')
    if (req.resumeId && this.find(req.resumeId)) {
      this.send(req.resumeId, req.prompt)
      return { tempId: req.resumeId }
    }

    const tempId = req.resumeId ?? `pending-${randomUUID()}`
    const input = new InputQueue()
    if (hasPrompt) input.push(req.prompt)
    const pending = new Map<string, Pending>()
    const info: LiveSession = {
      sessionId: tempId,
      title: typeof req.title === 'string' && req.title.trim() ? req.title.trim().slice(0, 120) : undefined,
      cwd: req.cwd,
      state: hasPrompt ? 'starting' : 'idle',
      model: req.model ?? '',
      costUsd: 0,
      pending: [],
      startedAt: new Date().toISOString()
    }

    let liveRef: Live | null = null
    const kokpit = await this.assistant()
    const q = query({
      prompt: input,
      options: {
        cwd: req.cwd,
        model: req.model,
        effort: req.effort,
        resume: req.resumeId,
        settingSources: ['user', 'project', 'local'],
        pathToClaudeCodeExecutable: this.executable(),
        plugins: kokpit ? [{ type: 'local', path: kokpit.home }] : undefined,
        // The autoMemoryDirectory setting is dropped for SDK-launched sessions; this undocumented override is what the CLI honors (checked on 2.1.318).
        env: kokpit ? { ...process.env, CLAUDE_COWORK_MEMORY_PATH_OVERRIDE: memoryDir(kokpit.home) } : undefined,
        systemPrompt: kokpit?.prompt ? { type: 'preset', preset: 'claude_code', append: kokpit.prompt } : undefined,
        permissionMode: 'default',
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

    const title = typeof req.title === 'string' ? req.title.trim().slice(0, 120) : ''
    const l: Live = { key: tempId, pendingTitle: title, info, input, q, pending }
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
          l.info.state = 'running'
          this.publish(l)
        } else if (msg.type === 'system' && msg.subtype === 'informational') {
          if (/blocked by hook|blocked/i.test(msg.content)) {
            l.info.lastError = msg.content.split('\n').slice(0, 3).join(' ')
            l.info.state = 'error'
          }
          this.emit({ type: 'text', sessionId: l.key, text: msg.content })
          this.publish(l)
        } else if (msg.type === 'assistant') {
          if (l.info.state !== 'waiting') l.info.state = 'running'
          for (const block of msg.message.content) {
            if (block.type === 'text' && block.text.trim()) this.emit({ type: 'text', sessionId: l.key, text: block.text })
          }
          this.publish(l)
        } else if (msg.type === 'result') {
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
    }
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

  send(sessionId: unknown, text: unknown): void {
    if (typeof sessionId !== 'string' || typeof text !== 'string' || !text.trim()) throw new Error('invalid message')
    const l = this.find(sessionId)
    if (!l) throw new Error('This session is not running in Kokpit')
    l.input.push(text)
    l.info.state = 'running'
    this.publish(l)
  }

  respond(sessionId: unknown, requestId: unknown, decision: unknown, note?: unknown): void {
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
      p.resolve({ behavior: 'allow', updatedInput: p.input, updatedPermissions: d === 'always' ? p.suggestions : undefined })
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
