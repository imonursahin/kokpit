import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const MAX_FILES = 20_000
const TTL_MS = 30_000
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'build', '.next', 'vendor', '.venv', '__pycache__'])
const PRIVATE_HOME = new Set(['Library', 'Pictures', 'Movies', 'Music', 'Photos Library.photoslibrary'])

const cache = new Map<string, { at: number; files: Promise<string[]> }>()

async function walk(root: string, dir: string, out: string[], depth: number): Promise<void> {
  if (depth > 6 || out.length >= MAX_FILES) return
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (out.length >= MAX_FILES) return
    if (e.name.startsWith('.') && e.name !== '.claude' && e.name !== '.github') continue
    const abs = join(dir, e.name)
    if (e.isDirectory()) {
      if (!SKIP.has(e.name) && !(dir === homedir() && PRIVATE_HOME.has(e.name))) await walk(root, abs, out, depth + 1)
    } else if (e.isFile()) out.push(relative(root, abs))
  }
}

async function load(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await run('git', ['ls-files', '-z', '-co', '--exclude-standard'], { cwd, maxBuffer: 64 * 1024 * 1024, timeout: 10_000 })
    return stdout.split('\0').filter(Boolean).slice(0, MAX_FILES)
  } catch {
    const out: string[] = []
    await walk(cwd, cwd, out, 0)
    return out
  }
}

export function listFiles(cwd: unknown): Promise<string[]> {
  if (typeof cwd !== 'string' || !cwd.startsWith('/') || !existsSync(cwd) || !statSync(cwd).isDirectory()) return Promise.resolve([])
  const hit = cache.get(cwd)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.files
  const files = load(cwd)
  cache.set(cwd, { at: Date.now(), files })
  return files
}

export function rankFiles(files: string[], query: string, limit = 30): string[] {
  const q = query.toLowerCase()
  if (!q) return files.slice(0, limit)
  const scored: { path: string; score: number }[] = []
  for (const path of files) {
    const p = path.toLowerCase()
    const at = p.indexOf(q)
    if (at < 0) continue
    const base = p.slice(p.lastIndexOf('/') + 1)
    const score = (base.startsWith(q) ? 0 : base.includes(q) ? 1 : 2) * 1000 + Math.min(999, p.length)
    scored.push({ path, score })
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.path)
}
