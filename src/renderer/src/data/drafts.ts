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

export function getDraft(id: string, store: Store | null = storage()): string {
  return load(store).get(id) ?? ''
}

export function setDraft(id: string, text: string, store: Store | null = storage()): void {
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
