import { expect, test } from 'vitest'
import type { SessionIndexItem } from '../shared/sessionIndex'
import { sessionState } from './sessionState'

const item = (id: string, lastAt: string, extra: Partial<SessionIndexItem> = {}): SessionIndexItem => ({
  id, file: '', title: `T ${id}`, cwd: '/r', repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: lastAt, lastAt, costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: 'did it', headless: false, ...extra
})

test('the session state file lists pinned sessions first, then the newest, with unread and pinned flags, skipping automated ones', () => {
  const s = sessionState(
    [item('a', '2026-11-18T09:00:00Z'), item('b', '2026-11-18T10:00:00Z', { status: 'waiting', onPhone: true }), item('c', '2026-11-18T11:00:00Z', { headless: true })],
    new Set(['a']),
    new Set(['a']),
    new Date('2026-11-18T12:00:00Z')
  )
  expect(s.updatedAt).toBe('2026-11-18T12:00:00.000Z')
  expect(s.sessions.map((x) => [x.name, x.status, x.unread, x.pinned, x.onPhone])).toEqual([
    ['T a', 'done', true, true, false],
    ['T b', 'waiting', false, false, true]
  ])
})

test('writes that overlap finish in order without failing, and the last one wins', async () => {
  const { mkdtempSync, readFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { writeSessionState } = await import('./sessionState')
  const file = join(mkdtempSync(join(tmpdir(), 'kokpit-state-')), 'sessions-state.json')
  const state = (n: number) => ({ updatedAt: String(n), sessions: [] })
  await Promise.all([1, 2, 3, 4, 5].map((n) => writeSessionState(file, state(n))))
  expect(JSON.parse(readFileSync(file, 'utf8')).updatedAt).toBe('5')
})
