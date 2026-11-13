import { execFile } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import type { PluginAction, PluginInfo, PluginInstall, PluginScope, PluginUpdate, PluginUpdates } from '../shared/plugins'

const run = promisify(execFile)
const PLUGINS_DIR = join(homedir(), '.claude', 'plugins')
let lastUpdates: PluginUpdates | null = null
let checking: Promise<PluginUpdates> | null = null
const ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}@[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/
const SCOPES: PluginScope[] = ['user', 'managed', 'project', 'local']
const ACTIONS: PluginAction[] = ['enable', 'disable', 'update', 'uninstall']

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export type PluginContext = { executable?: string }

export function toPlugins(raw: unknown): PluginInfo[] {
  const byId = new Map<string, PluginInfo>()
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r) || !ID.test(str(r['id']))) continue
    const id = str(r['id'])
    const scope = str(r['scope']) as PluginScope
    if (!SCOPES.includes(scope)) continue
    const [name = id, marketplace = ''] = id.split('@')
    const p = byId.get(id) ?? { id, name, marketplace, installs: [] }
    p.installs.push({ scope, enabled: r['enabled'] === true, projectPath: str(r['projectPath']), version: str(r['version']), lastUpdated: str(r['lastUpdated']) })
    byId.set(id, p)
  }
  for (const p of byId.values()) p.installs.sort((a, b) => SCOPES.indexOf(a.scope) - SCOPES.indexOf(b.scope) || a.projectPath.localeCompare(b.projectPath))
  return [...byId.values()].sort((a, b) => a.marketplace.localeCompare(b.marketplace) || a.name.localeCompare(b.name))
}

async function cli(ctx: PluginContext, args: string[], cwd = homedir(), timeout = 60_000, before: string[] = []): Promise<string> {
  try {
    const { stdout, stderr } = await run(ctx.executable || 'claude', [...before, 'plugin', ...args], { cwd, timeout, maxBuffer: 16 * 1024 * 1024 })
    return `${stdout}${stderr}`.trim()
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string }
    throw new Error((e.stderr || e.stdout || e.message).trim().split('\n').slice(-3).join(' '))
  }
}

function checkId(id: unknown): string {
  if (typeof id !== 'string' || !ID.test(id)) throw new Error('Invalid plugin id')
  return id
}

export async function pluginList(ctx: PluginContext): Promise<PluginInfo[]> {
  const out = await cli(ctx, ['list', '--json'])
  const raw: unknown = JSON.parse(out.slice(out.indexOf('[')))
  rememberInstallPaths(raw)
  return toPlugins(raw)
}

function projectDir(projectPath: unknown): string {
  if (typeof projectPath !== 'string' || !isAbsolute(projectPath) || !existsSync(projectPath) || !statSync(projectPath).isDirectory())
    throw new Error(`Project folder not found: ${String(projectPath)}`)
  return projectPath
}

const installPaths = new Map<string, string[]>()

export function rememberInstallPaths(raw: unknown): void {
  installPaths.clear()
  for (const r of Array.isArray(raw) ? raw : []) {
    if (!isObj(r) || !ID.test(str(r['id'])) || !isAbsolute(str(r['installPath']))) continue
    installPaths.set(str(r['id']), [...(installPaths.get(str(r['id'])) ?? []), str(r['installPath'])])
  }
}

export async function pluginDetails(ctx: PluginContext, id: unknown): Promise<string> {
  const pid = checkId(id)
  if (!installPaths.has(pid)) await pluginList(ctx)
  const dir = installPaths.get(pid)?.find((p) => existsSync(p) && statSync(p).isDirectory())
  if (!dir) throw new Error(`No installed copy of ${pid} was found on disk`)
  return cli(ctx, ['details', pid.split('@')[0] ?? pid], homedir(), 60_000, ['--plugin-dir', dir])
}

export function pluginActionArgs(action: unknown, id: unknown, scope: unknown, projectPath: unknown): { args: string[]; cwd: string } {
  if (!ACTIONS.includes(action as PluginAction)) throw new Error('Invalid plugin action')
  if (!SCOPES.includes(scope as PluginScope)) throw new Error('Invalid plugin scope')
  const inProject = scope === 'project' || scope === 'local'
  return { args: [action as string, checkId(id), '--scope', scope as string], cwd: inProject ? projectDir(projectPath) : homedir() }
}

export async function pluginAction(ctx: PluginContext, action: unknown, id: unknown, scope: unknown, projectPath: unknown): Promise<string> {
  const { args, cwd } = pluginActionArgs(action, id, scope, projectPath)
  const out = await cli(ctx, args, cwd, action === 'update' ? 180_000 : 60_000)
  if (lastUpdates && (action === 'update' || action === 'uninstall')) lastUpdates = { ...lastUpdates, items: localUpdates() }
  return out
}

function localUpdates(): PluginUpdate[] {
  return computeUpdates(readJson(join(PLUGINS_DIR, 'installed_plugins.json')), readJson(join(PLUGINS_DIR, 'known_marketplaces.json')), readCatalog)
}

const readJson = (file: string): unknown => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

export type Catalog = { commit: string; entries: Map<string, { version: string; sha: string; pluginJsonVersion: string }> }

function marketplaceCommit(dir: string): string {
  try {
    const gcs = readFileSync(join(dir, '.gcs-sha'), 'utf8').trim()
    if (gcs) return gcs
  } catch {
    /* not a gcs copy */
  }
  const head = str(readFileSync(join(dir, '.git', 'HEAD'), { encoding: 'utf8', flag: 'r' })).trim()
  const ref = head.startsWith('ref: ') ? head.slice(5) : ''
  if (!ref) return head
  try {
    return readFileSync(join(dir, '.git', ref), 'utf8').trim()
  } catch {
    const packed = readFileSync(join(dir, '.git', 'packed-refs'), 'utf8')
    return packed.split('\n').find((l) => l.endsWith(` ${ref}`))?.split(' ')[0] ?? ''
  }
}

export function readCatalog(dir: string): Catalog | null {
  const file = readJson(join(dir, '.claude-plugin', 'marketplace.json'))
  if (!isObj(file) || !Array.isArray(file['plugins'])) return null
  let commit = ''
  try {
    commit = marketplaceCommit(dir)
  } catch {
    commit = ''
  }
  const entries: Catalog['entries'] = new Map()
  for (const e of file['plugins']) {
    if (!isObj(e) || !str(e['name'])) continue
    const src = e['source']
    const local = typeof src === 'string' ? join(dir, src, '.claude-plugin', 'plugin.json') : ''
    const pj = local && local.startsWith(dir) ? readJson(local) : null
    entries.set(str(e['name']), { version: str(e['version']), sha: isObj(src) ? str(src['sha']) : '', pluginJsonVersion: isObj(pj) ? str(pj['version']) : '' })
  }
  return { commit, entries }
}

export function updateState(install: { version: string; gitCommitSha: string }, entry: { version: string; sha: string; pluginJsonVersion: string } | undefined, commit: string): { state: PluginUpdate['state']; latest: string } {
  if (!entry) return { state: 'unknown', latest: '' }
  if (entry.sha) {
    const latest = entry.version || entry.sha.slice(0, 12)
    if (!install.gitCommitSha) return { state: 'unknown', latest }
    return { state: install.gitCommitSha === entry.sha ? 'current' : 'outdated', latest }
  }
  const latest = entry.pluginJsonVersion || entry.version || commit.slice(0, 12)
  if (!latest || !install.version) return { state: 'unknown', latest }
  return { state: latest === install.version ? 'current' : 'outdated', latest }
}

export function computeUpdates(installed: unknown, known: unknown, catalogOf: (dir: string) => Catalog | null): PluginUpdate[] {
  const plugins = isObj(installed) && isObj(installed['plugins']) ? installed['plugins'] : {}
  const markets = isObj(known) ? known : {}
  const catalogs = new Map<string, Catalog | null>()
  const out: PluginUpdate[] = []
  for (const [id, list] of Object.entries(plugins)) {
    if (!ID.test(id) || !Array.isArray(list)) continue
    const [name = '', market = ''] = id.split('@')
    if (!catalogs.has(market)) {
      const m = markets[market]
      const dir = isObj(m) ? str(m['installLocation']) : ''
      catalogs.set(market, dir && isAbsolute(dir) ? catalogOf(dir) : null)
    }
    const catalog = catalogs.get(market)
    for (const i of list) {
      if (!isObj(i)) continue
      const scope = str(i['scope']) as PluginScope
      if (!SCOPES.includes(scope)) continue
      const installedVersion = str(i['version'])
      const { state, latest } = updateState({ version: installedVersion, gitCommitSha: str(i['gitCommitSha']) }, catalog?.entries.get(name), catalog?.commit ?? '')
      out.push({ id, scope, projectPath: str(i['projectPath']), state, installed: installedVersion, latest })
    }
  }
  return out
}

const UPDATE_TTL_MS = 30 * 60_000

export function pluginUpdates(ctx: PluginContext, force = false): Promise<PluginUpdates> {
  if (!force && lastUpdates && Date.now() - Date.parse(lastUpdates.checkedAt) < UPDATE_TTL_MS) return Promise.resolve(lastUpdates)
  if (checking) return checking
  checking = (async () => {
    const refreshError = await cli(ctx, ['marketplace', 'update'], homedir(), 180_000).then(
      () => '',
      (err: Error) => err.message
    )
    lastUpdates = { checkedAt: new Date().toISOString(), refreshError, items: localUpdates() }
    return lastUpdates
  })().finally(() => {
    checking = null
  })
  return checking
}
