import type { LibraryKind } from './library'

export type SearchHitType = 'session' | 'skill' | 'agent' | 'rule'

export type SearchHit = {
  id: string
  type: SearchHitType
  title: string
  where: string
  text: string
  when: string
  sessionId?: string
  message?: number
  absPath?: string
  libraryKind?: LibraryKind
}

export type SearchResponse = { query: string; hits: SearchHit[]; counts: Record<SearchHitType, number>; indexing: boolean }
