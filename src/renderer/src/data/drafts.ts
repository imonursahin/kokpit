const KEY = 'kokpit.drafts'
const MAX_DRAFTS = 200
const MAX_LENGTH = 20_000

type Store = Pick<Storage, 'getItem' | 'setItem'>

let drafts: Map<string, string> | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function storage(): Store | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

function load(store: Store | null): Map<string, string> {
  if (drafts) return drafts
  drafts = new Map()
  try {
    const raw: unknown = JSON.parse(store?.getItem(KEY) ?? '{}')
    if (raw && typeof raw === 'object') for (const [id, text] of Object.entries(raw)) if (typeof text === 'string' && text) drafts.set(id, text)
  } catch {
    drafts = new Map()
  }
  return drafts
}

const moved = new Map<string, string>()
const movers: ((from: string, to: string) => void)[] = []

function resolveKey(id: string): string {
  let key = id
  for (let i = 0; i < 5 && moved.has(key); i++) key = moved.get(key) ?? key
  return key
}

export function onSessionMoved(fn: (from: string, to: string) => void): void {
  movers.push(fn)
}

export function moveSessionState(from: string, to: string, store: Store | null = storage()): void {
  moved.set(from, to)
  const text = load(store).get(from)
  if (text && !load(store).get(to)) setDraft(to, text, store)
  const q = queued.get(from)
  if (q?.length) queued.set(to, [...(queued.get(to) ?? []), ...q])
  queued.delete(from)
  for (const fn of movers) fn(from, to)
}

export function getDraft(id: string, store: Store | null = storage()): string {
  return load(store).get(resolveKey(id)) ?? ''
}

export function setDraft(rawId: string, text: string, store: Store | null = storage()): void {
  const id = resolveKey(rawId)
  const all = load(store)
  all.delete(id)
  if (text.trim()) all.set(id, text.slice(0, MAX_LENGTH))
  while (all.size > MAX_DRAFTS) all.delete(all.keys().next().value as string)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => store?.setItem(KEY, JSON.stringify(Object.fromEntries(all))), 300)
}

export function resetDraftsForTest(): void {
  drafts = null
  if (timer) clearTimeout(timer)
}

export type QueuedMessage = { id: number; text: string; before: number; uuid?: string }

const queued = new Map<string, QueuedMessage[]>()

export function getQueued(id: string): QueuedMessage[] {
  return queued.get(resolveKey(id)) ?? []
}

export function setQueued(rawId: string, list: QueuedMessage[]): void {
  const id = resolveKey(rawId)
  if (list.length) queued.set(id, list)
  else queued.delete(id)
}
