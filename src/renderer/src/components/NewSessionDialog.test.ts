import { expect, test } from 'vitest'
import type { SessionSummary } from '@shared/types'
import { sessionsForTask } from './NewSessionDialog'

const s = (id: string, title: string, jira: string, lastAt: string) => ({ id, title, jira, lastAt }) as SessionSummary

test('a new session for a Jira task offers the sessions already working on it, newest first', () => {
  const list = [s('a', 'PA-45401', 'PA-45401', '2026-11-09T09:00:00Z'), s('b', 'feedback', '', '2026-11-09T10:00:00Z'), s('c', 'Fix login', 'PA-45401', '2026-11-09T11:00:00Z')]
  expect(sessionsForTask(list, 'PA-45401 ')).toMatchObject({ key: 'PA-45401', list: [{ id: 'c' }, { id: 'a' }] })
  expect(sessionsForTask(list, 'quick question').list).toEqual([])
  expect(sessionsForTask(list, 'PA-99999').list).toEqual([])
})
