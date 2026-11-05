import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { McpAddInput, McpServerInfo, McpStatus } from '../shared/mcp'

const run = promisify(execFile)
const NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const AUTH_NAME = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const EDITABLE_SCOPES = new Set(['user', 'local', 'project'])

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export type McpContext = {
  executable?: string
  plugin?: string
}

export function idleInput(): AsyncIterable<SDKUserMessage> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => new Promise<IteratorResult<SDKUserMessage>>(() => {}) })
  }
}

export function toInfo(raw: unknown): McpServerInfo | null {
  if (!isObj(raw) || !str(raw['name'])) return null
  const config = isObj(raw['config']) ? raw['config'] : {}
  const scope = str(raw['scope'])
  const source = str(raw['source']) || scope
  const transport = str(config['type']) || (config['command'] ? 'stdio' : '')
  const target = str(config['url']) || [str(config['command']), ...(Array.isArray(config['args']) ? config['args'].map(str) : [])].filter(Boolean).join(' ')
  const tools = Array.isArray(raw['tools']) ? raw['tools'].length : 0
  const serverInfo = isObj(raw['serverInfo']) ? raw['serverInfo'] : {}
  const status = str(raw['status']) as McpStatus
  return {
    name: str(raw['name']),
    status: ['connected', 'failed', 'needs-auth', 'pending', 'disabled'].includes(status) ? status : 'failed',
    scope,
    source,
    error: str(raw['error']),
    target,
    transport,
    tools,
    version: str(serverInfo['version']),
    removable: EDITABLE_SCOPES.has(source) || EDITABLE_SCOPES.has(scope),
    canLogin: (transport === 'http' || transport === 'sse') && source !== 'claudeai' && scope !== 'claudeai'
  }
}

export async function mcpStatus(ctx: McpContext, cwd = homedir(), timeoutMs = 20_000): Promise<McpServerInfo[]> {
  const abort = new AbortController()
  const q = query({
    prompt: idleInput(),
    options: {
      cwd,
      abortController: abort,
      settingSources: ['user', 'project', 'local'],
      pathToClaudeCodeExecutable: ctx.executable,
      plugins: ctx.plugin ? [{ type: 'local', path: ctx.plugin }] : undefined
    }
  })
  const deadline = Date.now() + timeoutMs
  try {
    let list: unknown[] = []
    while (Date.now() < deadline) {
      list = await q.mcpServerStatus()
      if (!list.some((s) => isObj(s) && s['status'] === 'pending')) break
      await new Promise((r) => setTimeout(r, 700))
    }
    return list.map(toInfo).filter((s): s is McpServerInfo => !!s).sort((a, b) => a.name.localeCompare(b.name))
  } finally {
    abort.abort()
    q.close()
  }
}

async function cli(ctx: McpContext, args: string[], timeout = 30_000): Promise<string> {
  const bin = ctx.executable || 'claude'
  try {
    const { stdout, stderr } = await run(bin, ['mcp', ...args], { cwd: homedir(), timeout, maxBuffer: 4 * 1024 * 1024 })
    return `${stdout}${stderr}`.trim()
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string }
    throw new Error((e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' '))
  }
}

function checkName(name: unknown): string {
  if (typeof name !== 'string' || !NAME.test(name)) throw new Error('Invalid server name')
  return name
}

export async function mcpRemove(ctx: McpContext, name: unknown, scope: unknown, transport?: unknown): Promise<string> {
  const n = checkName(name)
  if (typeof scope !== 'string' || !EDITABLE_SCOPES.has(scope)) throw new Error('This server is managed elsewhere and cannot be removed here')
  if (transport === 'http' || transport === 'sse') await cli(ctx, ['logout', n]).catch(() => '')
  const removed: string[] = []
  const errors: string[] = []
  for (const s of [scope, ...[...EDITABLE_SCOPES].filter((x) => x !== scope)]) {
    try {
      await cli(ctx, ['remove', n, '-s', s])
      removed.push(s)
    } catch (err) {
      errors.push((err as Error).message)
    }
  }
  if (!removed.length) throw new Error(errors[0] ?? `Could not remove ${n}`)
  return `Removed from ${removed.join(', ')}`
}

function checkAuthName(name: unknown): string {
  if (typeof name !== 'string' || !AUTH_NAME.test(name)) throw new Error('Invalid server name')
  return name
}

export function mcpLogout(ctx: McpContext, name: unknown): Promise<string> {
  return cli(ctx, ['logout', checkAuthName(name)])
}

export function splitCommand(text: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}

export function mcpAdd(ctx: McpContext, input: unknown): Promise<string> {
  if (!isObj(input)) throw new Error('invalid request')
  const name = checkName(input['name'])
  const scope = str(input['scope']) || 'user'
  if (!EDITABLE_SCOPES.has(scope)) throw new Error('invalid scope')
  const transport = str(input['transport'])
  const target = str(input['target']).trim()
  if (!target) throw new Error('Enter a URL or a command')
  if (transport === 'http' || transport === 'sse') {
    if (!/^https?:\/\//.test(target)) throw new Error('URL must start with http:// or https://')
    return cli(ctx, ['add', '--transport', transport, '-s', scope, name, target])
  }
  if (transport === 'stdio') {
    const parts = splitCommand(target)
    if (!parts.length) throw new Error('Enter a command')
    return cli(ctx, ['add', '-s', scope, name, '--', ...parts])
  }
  throw new Error('invalid transport')
}

export type { McpAddInput }
