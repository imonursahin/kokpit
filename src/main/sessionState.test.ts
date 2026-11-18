import { expect, test } from 'vitest'
import type { SessionIndexItem } from '../shared/sessionIndex'
import { sessionState } from './sessionState'

const item = (id: string, lastAt: string, extra: Partial<SessionIndexItem> = {}): SessionIndexItem => ({
  id, file: '', title: `T ${id}`, cwd: '/r', repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: lastAt, lastAt, costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: 'did it', headless: false, ...extra
})

test('the session state file lists named sessions newest first with their unread flag, skipping automated ones', () => {
  const s = sessionState(
    [item('a', '2026-11-18T09:00:00Z'), item('b', '2026-11-18T10:00:00Z', { status: 'waiting', onPhone: true }), item('c', '2026-11-18T11:00:00Z', { headless: true })],
    new Set(['a']),
    new Date('2026-11-18T12:00:00Z')
  )
  expect(s.updatedAt).toBe('2026-11-18T12:00:00.000Z')
  expect(s.sessions.map((x) => [x.name, x.status, x.unread, x.onPhone])).toEqual([
    ['T b', 'waiting', false, true],
    ['T a', 'done', true, false]
  ])
})
