import { beforeEach, expect, test, vi } from 'vitest'
import { getDraft, resetDraftsForTest, setDraft } from './drafts'

beforeEach(() => resetDraftsForTest())

test('a half-written message is kept per session until it is sent or cleared', () => {
  vi.useFakeTimers()
  const saved = new Map<string, string>()
  const store = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => void saved.set(k, v) }
  setDraft('a', 'fix the login bug', store)
  setDraft('b', 'other session', store)
  expect(getDraft('a', store)).toBe('fix the login bug')
  vi.advanceTimersByTime(400)
  resetDraftsForTest()
  expect(getDraft('a', store)).toBe('fix the login bug')
  setDraft('a', '   ', store)
  expect(getDraft('a', store)).toBe('')
  expect(getDraft('b', store)).toBe('other session')
  vi.useRealTimers()
})
