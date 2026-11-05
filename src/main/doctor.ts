import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { ConnectionInfo } from '../shared/integrations'
import type { DoctorCheck } from '../shared/settings'
import { memoryDir } from './assistant'
import { PROJECTS_DIR } from './sessions/store'

const run = promisify(execFile)
const HOME = homedir()

export type DoctorContext = {
  executable: string | undefined
  home: string
  connections: () => Promise<ConnectionInfo[]>
}

const tilde = (p: string) => (p.startsWith(`${HOME}/`) ? `~/${p.slice(HOME.length + 1)}` : p)

async function output(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await run(cmd, args, { timeout: 15_000, maxBuffer: 1024 * 1024 })
    return (stdout || stderr).trim()
  } catch {
    return null
  }
}

async function count(dir: string, keep: (name: string, isDir: boolean) => boolean): Promise<number | null> {
  try {
    return (await readdir(dir, { withFileTypes: true })).filter((d) => keep(d.name, d.isDirectory())).length
  } catch {
    return null
  }
}

async function tool(id: string, label: string, cmd: string, args: string[], missing: DoctorCheck['status'], why: string): Promise<DoctorCheck> {
  const out = await output(cmd, args)
  return out
    ? { id, label, status: 'ok', value: out.split('\n')[0] ?? out, detail: '' }
    : { id, label, status: missing, value: 'Not found', detail: why }
}

async function claudeCli(exe: string): Promise<DoctorCheck> {
  const out = await output(exe, ['--version'])
  return out
    ? { id: 'claude', label: 'Claude Code', status: 'ok', value: out, detail: exe === 'claude' ? '' : tilde(exe) }
    : { id: 'claude', label: 'Claude Code', status: 'err', value: 'Not found', detail: `Could not run ${tilde(exe)}. Check Claude executable above.` }
}

async function claudeLogin(exe: string): Promise<DoctorCheck> {
  const base = { id: 'login', label: 'Claude login' }
  const out = await output(exe, ['auth', 'status', '--json'])
  try {
    const s = JSON.parse(out ?? '') as { loggedIn?: boolean; authMethod?: string; email?: string; subscriptionType?: string }
    if (!s.loggedIn) return { ...base, status: 'err', value: 'Not logged in', detail: 'Run claude in a terminal and sign in.' }
    return { ...base, status: 'ok', value: s.email || 'Logged in', detail: [s.authMethod, s.subscriptionType].filter(Boolean).join(' · ') }
  } catch {
    return { ...base, status: 'warn', value: 'Unknown', detail: 'Could not read the login status.' }
  }
}

async function kokpitFolder(home: string): Promise<DoctorCheck> {
  const base = { id: 'home', label: 'Kokpit folder' }
  if (!existsSync(home)) return { ...base, status: 'err', value: 'Missing', detail: tilde(home) }
  const skills = (await count(join(home, 'skills'), (_n, dir) => dir)) ?? 0
  const agents = (await count(join(home, 'agents'), (n) => n.endsWith('.md'))) ?? 0
  return { ...base, status: 'ok', value: tilde(home), detail: `${skills} skills · ${agents} agents` }
}

async function memoryFolder(home: string): Promise<DoctorCheck> {
  const n = await count(memoryDir(home), (name) => name.endsWith('.md') && name !== 'MEMORY.md')
  return n === null
    ? { id: 'memory', label: 'Memory', status: 'warn', value: 'Missing', detail: tilde(memoryDir(home)) }
    : { id: 'memory', label: 'Memory', status: 'ok', value: `${n} ${n === 1 ? 'memory' : 'memories'}`, detail: tilde(memoryDir(home)) }
}

async function transcripts(): Promise<DoctorCheck> {
  const n = await count(PROJECTS_DIR, (_n, dir) => dir)
  return n === null
    ? { id: 'transcripts', label: 'Claude transcripts', status: 'err', value: 'Missing', detail: tilde(PROJECTS_DIR) }
    : { id: 'transcripts', label: 'Claude transcripts', status: 'ok', value: `${n} projects`, detail: tilde(PROJECTS_DIR) }
}

function connection(list: ConnectionInfo[], id: 'github' | 'jira', label: string): DoctorCheck {
  const c = list.find((x) => x.id === id)
  if (c?.status === 'connected') return { id, label, status: 'ok', value: c.account || 'Connected', detail: c.site || c.org || '' }
  if (c?.status === 'expired') return { id, label, status: 'err', value: 'Token expired', detail: 'Reconnect it on the Connections page.' }
  return { id, label, status: 'warn', value: 'Not connected', detail: 'Connect it on the Connections page.' }
}

export async function runDoctor(ctx: DoctorContext): Promise<DoctorCheck[]> {
  const exe = ctx.executable || 'claude'
  const connections = await ctx.connections().catch(() => [] as ConnectionInfo[])
  return Promise.all([
    claudeCli(exe),
    claudeLogin(exe),
    kokpitFolder(ctx.home),
    memoryFolder(ctx.home),
    transcripts(),
    tool('git', 'git', 'git', ['--version'], 'err', 'Kokpit uses git for diffs, branches and reverts.'),
    tool('node', 'node', 'node', ['--version'], 'warn', 'Some hooks and MCP servers need Node.js.'),
    tool('python', 'python3', 'python3', ['--version'], 'err', 'The in-app terminal and the skill guard hook need python3.'),
    Promise.resolve(connection(connections, 'github', 'GitHub')),
    Promise.resolve(connection(connections, 'jira', 'Jira'))
  ])
}
