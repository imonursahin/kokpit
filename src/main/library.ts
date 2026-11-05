import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { CreateLibraryEntry, LibraryEntry, LibraryFormat, LibraryKind, LibraryListing } from '../shared/library'

const HOME = homedir()
const MAX_BODY = 512 * 1024
const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const SCRIPT_EXT = new Set(['.py', '.sh', '.js', '.mjs', '.ts', '.rb'])
const MEMORY_INDEX = 'MEMORY.md'
const MCP_FILE = '.mcp.json'

type Source = { kind: LibraryKind; absPath: string; name: string }

function tilde(p: string): string {
  return p.startsWith(`${HOME}/`) ? `~/${p.slice(HOME.length + 1)}` : p
}

export function frontmatter(body: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---/.exec(body)
  const out: Record<string, string> = {}
  if (!m?.[1]) return out
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv?.[1]) out[kv[1]] = (kv[2] ?? '').replace(/^["']|["']$/g, '').trim()
  }
  return out
}

function firstParagraph(body: string): string {
  const text = body.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const line = text.split('\n').find((l) => l.trim() && !l.startsWith('#') && !l.startsWith('>'))
  return (line ?? '').trim().slice(0, 200)
}

function formatOf(path: string): LibraryFormat {
  const ext = extname(path)
  return ext === '.json' ? 'json' : SCRIPT_EXT.has(ext) ? 'script' : 'md'
}

async function listDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort()
  } catch {
    return []
  }
}

async function sources(home: string): Promise<Source[]> {
  const out: Source[] = []
  for (const f of ['CLAUDE.md', 'ASSISTANT.md']) {
    if (existsSync(join(home, f))) {
      out.push({ kind: 'instructions', absPath: join(home, f), name: f })
      break
    }
  }
  for (const d of await listDir(join(home, 'skills'))) {
    const file = join(home, 'skills', d, 'SKILL.md')
    if (existsSync(file)) out.push({ kind: 'skills', absPath: file, name: d })
  }
  for (const f of await listDir(join(home, 'agents'))) {
    if (f.endsWith('.md')) out.push({ kind: 'agents', absPath: join(home, 'agents', f), name: basename(f, '.md') })
  }
  for (const f of await listDir(join(home, 'commands'))) {
    if (f.endsWith('.md')) out.push({ kind: 'commands', absPath: join(home, 'commands', f), name: basename(f, '.md') })
  }
  for (const f of await listDir(join(home, 'hooks'))) {
    if (f === 'hooks.json' || SCRIPT_EXT.has(extname(f))) out.push({ kind: 'hooks', absPath: join(home, 'hooks', f), name: f })
  }
  if (existsSync(join(home, MCP_FILE))) out.push({ kind: 'mcp', absPath: join(home, MCP_FILE), name: MCP_FILE })
  const memory = await listDir(join(home, 'memory'))
  if (memory.includes(MEMORY_INDEX)) out.push({ kind: 'memory', absPath: join(home, 'memory', MEMORY_INDEX), name: MEMORY_INDEX })
  for (const f of memory) {
    if (f.endsWith('.md') && f !== MEMORY_INDEX) out.push({ kind: 'memory', absPath: join(home, 'memory', f), name: basename(f, '.md') })
  }
  return out
}

export function argumentLines(hint: string): string {
  const names = hint.match(/<[^>]+>|\S+/g) ?? []
  if (names.length === 0) return ''
  if (names.length === 1) return '$ARGUMENTS\n'
  return names.map((n, i) => `${n}: $${i}\n`).join('')
}

export function dropIndexLines(index: string, file: string): string {
  const link = `](${file})`
  return index
    .split('\n')
    .filter((line) => !line.includes(link))
    .join('\n')
}

function jsonKeys(body: string, key: 'hooks' | 'mcpServers'): string[] | null {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const value = parsed[key]
    return value && typeof value === 'object' ? Object.keys(value) : []
  } catch {
    return null
  }
}

function describe(kind: LibraryKind, name: string, body: string): string {
  if (kind === 'hooks' && name === 'hooks.json') {
    const events = jsonKeys(body, 'hooks')
    return events === null ? 'Invalid JSON' : events.length ? `Runs on ${events.join(', ')}` : 'No hooks configured'
  }
  if (kind === 'mcp') {
    const servers = jsonKeys(body, 'mcpServers')
    return servers === null ? 'Invalid JSON' : servers.length ? servers.join(', ') : 'No MCP servers yet'
  }
  if (kind === 'hooks') return 'Hook script'
  if (kind === 'memory' && name === MEMORY_INDEX) return 'Index Claude reads at the start of every Kokpit session'
  return frontmatter(body)['description'] || firstParagraph(body)
}

async function toEntry(home: string, src: Source, uses: Record<string, number>): Promise<LibraryEntry | null> {
  try {
    const st = await stat(src.absPath)
    if (st.size > MAX_BODY) return null
    const body = await readFile(src.absPath, 'utf8')
    const name = src.kind === 'skills' || src.kind === 'agents' || src.kind === 'memory' ? frontmatter(body)['name'] || src.name : src.name
    const useKey = src.kind === 'skills' ? `skill:kokpit:${name}` : src.kind === 'agents' ? `agent:kokpit:${name}` : ''
    return {
      id: src.absPath,
      kind: src.kind,
      name,
      desc: describe(src.kind, src.name, body),
      repo: null,
      repoRoot: home,
      displayPath: tilde(src.absPath),
      absPath: src.absPath,
      body,
      savedAt: st.mtime.toISOString(),
      uses: useKey ? (uses[useKey] ?? 0) : 0,
      readOnly: false,
      format: formatOf(src.absPath)
    }
  } catch {
    return null
  }
}

export class Library {
  private home = ''
  private known = new Set<string>()

  async list(home: string, uses: Record<string, number>): Promise<LibraryListing> {
    this.home = home
    const entries = (await Promise.all((await sources(home)).map((s) => toEntry(home, s, uses)))).filter(
      (e): e is LibraryEntry => !!e
    )
    this.known = new Set(entries.map((e) => e.absPath))
    return { entries, repos: [{ name: 'Kokpit', root: home, assistant: true }], home }
  }

  private async entryFor(file: string, uses: Record<string, number>): Promise<LibraryEntry | null> {
    const src = (await sources(this.home)).find((s) => s.absPath === file)
    return src ? toEntry(this.home, src, uses) : null
  }

  async save(absPath: unknown, body: unknown, uses: Record<string, number>): Promise<LibraryEntry> {
    if (typeof absPath !== 'string' || typeof body !== 'string') throw new Error('invalid save request')
    const target = resolve(absPath)
    if (!this.known.has(target)) throw new Error('This file is not in the library; refresh and try again')
    if (Buffer.byteLength(body) > MAX_BODY) throw new Error('File is too large to save from Kokpit')
    if (formatOf(target) === 'json') {
      try {
        JSON.parse(body)
      } catch (err) {
        throw new Error(`Not valid JSON: ${(err as Error).message}`)
      }
    }
    await writeFile(target, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
    const entry = await this.entryFor(target, uses)
    if (!entry) throw new Error('Saved, but the file could not be read back')
    return entry
  }

  async remove(absPath: unknown): Promise<void> {
    if (typeof absPath !== 'string') throw new Error('invalid delete request')
    const target = resolve(absPath)
    if (!this.known.has(target) || !target.startsWith(this.home + sep)) throw new Error('This file is not in the library; refresh and try again')
    if (dirname(target) === this.home && /^(CLAUDE|ASSISTANT)\.md$/.test(basename(target))) throw new Error('CLAUDE.md can be edited but not deleted')
    const skillsDir = join(this.home, 'skills')
    if (dirname(dirname(target)) === skillsDir && basename(target) === 'SKILL.md') {
      await rm(dirname(target), { recursive: true, force: true })
    } else {
      await rm(target, { force: true })
    }
    this.known.delete(target)
    const index = join(this.home, 'memory', MEMORY_INDEX)
    if (dirname(target) === join(this.home, 'memory') && basename(target) !== MEMORY_INDEX && existsSync(index)) {
      const before = await readFile(index, 'utf8')
      const after = dropIndexLines(before, basename(target))
      if (after !== before) await writeFile(index, after, 'utf8')
    }
  }

  async create(input: CreateLibraryEntry, uses: Record<string, number>): Promise<LibraryEntry> {
    if (!this.home) throw new Error('Library is not loaded yet')
    if (!input || typeof input.name !== 'string') throw new Error('invalid request')
    const desc = typeof input.desc === 'string' ? input.desc.replace(/\n/g, ' ').trim() : ''
    const args = typeof input.args === 'string' ? input.args.replace(/[\r\n]/g, ' ').trim().slice(0, 120) : ''
    const title = (n: string) => n.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())
    let file: string
    let body: string
    switch (input.kind) {
      case 'skills':
      case 'agents':
      case 'commands': {
        if (!NAME.test(input.name)) throw new Error('Name: lowercase letters, digits and dashes')
        file = input.kind === 'skills' ? join(this.home, 'skills', input.name, 'SKILL.md') : join(this.home, input.kind, `${input.name}.md`)
        body =
          input.kind === 'commands'
            ? `---\ndescription: ${desc}\n${args ? `argument-hint: ${args}\n` : ''}---\n\n${argumentLines(args)}`
            : `---\nname: ${input.name}\ndescription: ${desc}\n---\n\n# ${title(input.name)}\n\n`
        break
      }
      case 'hooks': {
        const m = /^([a-z0-9][a-z0-9-]{0,63})\.(py|sh|js|mjs)$/.exec(input.name)
        if (!m) throw new Error('Name a hook script like my-hook.py or my-hook.sh')
        file = join(this.home, 'hooks', input.name)
        body =
          m[2] === 'py' ? '#!/usr/bin/env python3\nimport json\nimport sys\n\npayload = json.load(sys.stdin)\n' : m[2] === 'sh' ? '#!/bin/sh\n' : ''
        break
      }
      case 'memory': {
        if (!NAME.test(input.name)) throw new Error('Name: lowercase letters, digits and dashes')
        file = join(this.home, 'memory', `${input.name}.md`)
        body = `---\nname: ${input.name}\ndescription: ${desc}\nmetadata:\n  type: project\n---\n\n`
        break
      }
      case 'mcp': {
        file = join(this.home, MCP_FILE)
        body = '{\n  "mcpServers": {}\n}\n'
        break
      }
      default:
        throw new Error('invalid kind')
    }
    if (!resolve(file).startsWith(this.home + sep)) throw new Error('Path is outside the Kokpit folder')
    if (existsSync(file)) throw new Error(`${tilde(file)} already exists`)
    await mkdir(resolve(file, '..'), { recursive: true })
    await writeFile(file, body, { encoding: 'utf8', flag: 'wx' })
    this.known.add(file)
    if (input.kind === 'memory') {
      const index = join(this.home, 'memory', MEMORY_INDEX)
      const prev = existsSync(index) ? await readFile(index, 'utf8') : ''
      const line = `- [${title(input.name)}](${input.name}.md)${desc ? ` — ${desc}` : ''}\n`
      await writeFile(index, prev && !prev.endsWith('\n') ? `${prev}\n${line}` : `${prev}${line}`, 'utf8')
      this.known.add(index)
    }
    const entry = await this.entryFor(file, uses)
    if (!entry) throw new Error('Created, but the file could not be read back')
    return entry
  }
}
