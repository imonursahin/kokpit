import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { deriveStatus, jiraKeyFrom, type CliStatus, type SessionIndexItem } from '../../shared/sessionIndex'
import { SessionAccumulator, type AccumulatorState } from './parse'
import { workRepo } from './repo'

type CacheEntry = { size: number; mtimeMs: number; offset: number; state: AccumulatorState }
type CacheFile = { version: 5; entries: Record<string, CacheEntry> }

const CACHE_VERSION = 5
const CONCURRENCY = 4

export const PROJECTS_DIR = join(homedir(), '.claude', 'projects')

async function readFrom(file: string, start: number, end: number, onLine: (line: string) => void): Promise<number> {
  if (end <= start) return start
  let consumed = start
  let carry = ''
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(file, { start, end: end - 1, encoding: 'utf8' })
    stream.on('data', (chunk) => {
      const text = carry + String(chunk)
      const lines = text.split('\n')
      carry = lines.pop() ?? ''
      for (const line of lines) {
        onLine(line)
        consumed += Buffer.byteLength(line, 'utf8') + 1
      }
    })
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return consumed
}

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T
      await run(item)
    }
  })
  await Promise.all(workers)
}

export class SessionStore {
  private cache: CacheFile = { version: CACHE_VERSION, entries: {} }
  private loaded = false
  private saving: Promise<void> = Promise.resolve()

  constructor(
    private readonly cachePath: string,
    private readonly root: string = PROJECTS_DIR,
    private readonly log: (msg: string) => void = () => {},
    private readonly cliStatuses: () => Map<string, CliStatus> = () => new Map()
  ) {}

  private async loadCache(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed: unknown = JSON.parse(await readFile(this.cachePath, 'utf8'))
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        (parsed as CacheFile).version === CACHE_VERSION &&
        typeof (parsed as CacheFile).entries === 'object'
      ) {
        this.cache = parsed as CacheFile
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.log(`session cache unreadable, rebuilding: ${(err as Error).message}`)
    }
  }

  private persist(): Promise<void> {
    this.saving = this.saving.then(async () => {
      await mkdir(dirname(this.cachePath), { recursive: true })
      const tmp = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tmp, JSON.stringify(this.cache))
      await rename(tmp, this.cachePath)
    }).catch((err: Error) => this.log(`session cache write failed: ${err.message}`))
    return this.saving
  }

  forget(file: string): void {
    delete this.cache.entries[file]
    void this.persist()
  }

  reset(): void {
    this.cache = { version: CACHE_VERSION, entries: {} }
  }

  async listFiles(): Promise<string[]> {
    const files: string[] = []
    let dirs: string[]
    try {
      dirs = await readdir(this.root)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw err
    }
    await pool(dirs, 8, async (d) => {
      try {
        for (const f of await readdir(join(this.root, d))) {
          if (f.endsWith('.jsonl')) files.push(join(this.root, d, f))
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        if (code !== 'ENOTDIR' && code !== 'ENOENT') this.log(`skip ${d}: ${(err as Error).message}`)
      }
    })
    return files
  }

  private async refreshFile(file: string): Promise<CacheEntry | null> {
    let st
    try {
      st = await stat(file)
    } catch {
      delete this.cache.entries[file]
      return null
    }
    const prev = this.cache.entries[file]
    if (prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) return prev

    const resume = prev && st.size >= prev.offset
    const acc = resume ? SessionAccumulator.restore(prev.state) : new SessionAccumulator(basename(file, '.jsonl'))
    const offset = await readFrom(file, resume ? prev.offset : 0, st.size, (line) => acc.feed(line))
    const entry: CacheEntry = { size: st.size, mtimeMs: st.mtimeMs, offset, state: acc.state() }
    this.cache.entries[file] = entry
    return entry
  }

  async refresh(): Promise<SessionIndexItem[]> {
    await this.loadCache()
    const files = await this.listFiles()
    const live = new Set(files)
    for (const known of Object.keys(this.cache.entries)) if (!live.has(known)) delete this.cache.entries[known]

    let failed = 0
    await pool(files, CONCURRENCY, async (file) => {
      try {
        await this.refreshFile(file)
      } catch (err) {
        failed += 1
        this.log(`session parse failed for ${basename(file)}: ${(err as Error).message}`)
      }
    })
    if (failed) this.log(`${failed} session files could not be read`)
    await this.persist()
    return this.items()
  }

  usage(): Record<string, number> {
    const total: Record<string, number> = {}
    for (const entry of Object.values(this.cache.entries))
      for (const [k, v] of Object.entries(entry.state.summary.uses ?? {})) total[k] = (total[k] ?? 0) + v
    return total
  }

  workRoots(): string[] {
    const roots = new Set<string>()
    for (const entry of Object.values(this.cache.entries)) {
      const s = entry.state.summary
      const work = workRepo(s.cwd, s.branch, s.editedDirs ?? {})
      if (work.root) roots.add(work.root)
      if (s.cwd) roots.add(workRepo(s.cwd, s.branch, {}).root)
    }
    return [...roots].filter(Boolean)
  }

  items(nowMs = Date.now()): SessionIndexItem[] {
    const out: SessionIndexItem[] = []
    const cli = this.cliStatuses()
    for (const [file, entry] of Object.entries(this.cache.entries)) {
      const s = entry.state.summary
      if (!s.firstPrompt && !s.title && !s.customTitle) continue
      const lastAtMs = Date.parse(s.lastAt) || entry.mtimeMs
      const status = deriveStatus(
        { lastAtMs, pendingTool: s.pendingTool, lastWasApiError: s.lastWasApiError, lastStopReason: s.lastStopReason, cli: cli.get(s.sessionId) },
        nowMs
      )
      const title = s.customTitle || s.title || s.firstPrompt
      const work = workRepo(s.cwd, s.branch, s.editedDirs ?? {})
      out.push({
        id: s.sessionId,
        file,
        title,
        cwd: s.cwd,
        repo: work.repo || basename(dirname(file)),
        branch: work.branch,
        jira: jiraKeyFrom(work.branch, s.branch, title),
        prNumber: s.prNumber,
        prUrl: s.prUrl,
        startedAt: s.startedAt,
        lastAt: s.lastAt || new Date(entry.mtimeMs).toISOString(),
        costUsd: s.costUsd,
        costComplete: s.costComplete,
        model: s.model,
        mode: s.mode ?? '',
        status,
        sub:
          status === 'waiting' || status === 'running'
            ? s.pendingTool || s.lastActivity
            : status === 'error'
              ? s.lastText || 'The last request failed'
              : s.lastText || s.lastActivity,
        headless: s.entrypoint === 'sdk-cli' || s.cwd.startsWith('/private/tmp') || s.cwd.startsWith('/tmp')
      })
    }
    return out.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  }
}
