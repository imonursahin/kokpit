import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import type { LibraryEntry } from '../shared/library'
import type { SearchHit, SearchHitType, SearchResponse } from '../shared/search'
import type { SessionIndexItem } from '../shared/sessionIndex'

type Msg = { role: 'You' | 'Claude'; n: number; text: string; lower: string }
type Doc = { mtimeMs: number; size: number; messages: Msg[] }

const MAX_MSG = 20_000
const PER_TYPE = 50
const SNIPPET = 90

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(isObj)
    .filter((b) => b['type'] === 'text' && typeof b['text'] === 'string')
    .map((b) => b['text'] as string)
    .join('\n')
}

function noise(t: string): boolean {
  const s = t.trimStart()
  return !s || s.startsWith('<command-') || s.startsWith('<local-command') || s.startsWith('<system-reminder>') || s.startsWith('<task-notification>') || s.startsWith('Caveat:')
}

export function snippet(text: string, lower: string, q: string): string {
  const i = lower.indexOf(q)
  if (i < 0) return text.slice(0, SNIPPET * 2).replace(/\s+/g, ' ')
  const start = Math.max(0, i - SNIPPET)
  const end = Math.min(text.length, i + q.length + SNIPPET)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

async function readMessages(file: string): Promise<Msg[]> {
  const out: Msg[] = []
  let n = 0
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const raw of rl) {
    if (!raw.includes('"type":"user"') && !raw.includes('"type":"assistant"')) continue
    let o: unknown
    try {
      o = JSON.parse(raw)
    } catch {
      continue
    }
    if (!isObj(o) || o['isSidechain'] === true || o['isMeta'] === true) continue
    const message = isObj(o['message']) ? o['message'] : {}
    const text = textOf(message['content'])
    if (noise(text)) continue
    n += 1
    const clipped = text.length > MAX_MSG ? text.slice(0, MAX_MSG) : text
    out.push({ role: o['type'] === 'user' ? 'You' : 'Claude', n, text: clipped, lower: clipped.toLowerCase() })
  }
  return out
}

export class SearchIndex {
  private docs = new Map<string, Doc>()
  private building: Promise<void> | null = null
  private ready = false

  constructor(private readonly log: (m: string) => void = () => {}) {}

  drop(file: string): void {
    this.docs.delete(file)
  }

  sync(items: SessionIndexItem[]): Promise<void> {
    if (this.building) return this.building
    this.building = (async () => {
      const live = new Set(items.map((i) => i.file))
      for (const k of this.docs.keys()) if (!live.has(k)) this.docs.delete(k)
      let next = 0
      const work = items.filter((i) => !i.headless)
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (next < work.length) {
            const item = work[next++]
            if (!item) break
            try {
              const st = await stat(item.file)
              const prev = this.docs.get(item.file)
              if (prev && prev.mtimeMs === st.mtimeMs && prev.size === st.size) continue
              this.docs.set(item.file, { mtimeMs: st.mtimeMs, size: st.size, messages: await readMessages(item.file) })
            } catch (err) {
              this.log(`search index skipped ${item.id}: ${(err as Error).message}`)
            }
          }
        })
      )
      this.ready = true
    })().finally(() => {
      this.building = null
    })
    return this.building
  }

  search(query: string, items: SessionIndexItem[], library: LibraryEntry[], timeOf: (iso: string) => string): SearchResponse {
    const q = query.trim().toLowerCase()
    const counts: Record<SearchHitType, number> = { session: 0, skill: 0, agent: 0, rule: 0 }
    const hits: SearchHit[] = []
    if (q.length < 2) return { query, hits, counts, indexing: !this.ready }

    for (const item of items) {
      if (item.headless) continue
      const doc = this.docs.get(item.file)
      const titleHit = item.title.toLowerCase().includes(q)
      const msg = doc?.messages.find((m) => m.lower.includes(q))
      if (!titleHit && !msg) continue
      counts.session += 1
      if (counts.session > PER_TYPE) continue
      hits.push({
        id: `${item.id}:${msg?.n ?? 0}`,
        type: 'session',
        title: item.title,
        where: msg ? `${msg.role} · message ${msg.n}` : 'title',
        text: msg ? snippet(msg.text, msg.lower, q) : item.sub,
        when: timeOf(item.lastAt),
        sessionId: item.id,
        message: msg?.n
      })
    }

    for (const e of library) {
      const lower = e.body.toLowerCase()
      const nameHit = e.name.toLowerCase().includes(q)
      const at = lower.indexOf(q)
      if (!nameHit && at < 0) continue
      const type: SearchHitType = e.kind === 'skills' ? 'skill' : e.kind === 'agents' ? 'agent' : 'rule'
      counts[type] += 1
      if (counts[type] > PER_TYPE) continue
      const line = at >= 0 ? e.body.slice(0, at).split('\n').length : 0
      hits.push({
        id: e.id,
        type,
        title: e.name,
        where: `Kokpit · ${e.kind}`,
        text: at >= 0 ? snippet(e.body, lower, q) : e.desc,
        when: type === 'rule' ? (line ? `line ${line}` : '') : e.displayPath.split('/').pop() ?? '',
        absPath: e.absPath,
        libraryKind: e.kind
      })
    }
    return { query, hits, counts, indexing: !this.ready || !!this.building }
  }
}
