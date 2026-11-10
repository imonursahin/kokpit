import { expect, test } from 'vitest'
import { activityLabel } from './SessionDetailPage'

test('the working row names what Claude is actually doing', () => {
  expect(activityLabel({ kind: 'thinking' })).toEqual({ label: 'Thinking…' })
  expect(activityLabel({ kind: 'writing' })).toEqual({ label: 'Writing…' })
  expect(activityLabel({ kind: 'tool', tool: 'Bash', detail: 'npm test' })).toEqual({ label: 'Running…', detail: 'npm test' })
  expect(activityLabel({ kind: 'tool', tool: 'mcp__zoe__jira' })).toEqual({ label: 'Calling zoe · jira', detail: undefined })
  expect(activityLabel(undefined, { kind: 'read', label: 'Read', target: 'a.ts', state: 'running' })).toEqual({ label: 'Reading…', detail: 'a.ts' })
  expect(activityLabel(undefined)).toEqual({ label: 'Working…' })
})

test('turn keys stay attached to the same turns when older turns drop out of view', async () => {
  const { turnKeys } = await import('./SessionDetailPage')
  const u = (uuid: string) => ({ kind: 'user', text: [], uuid }) as never
  const c = { kind: 'claude', steps: [] } as never
  const all = [u('a'), c, u('b'), c, c]
  const keys = turnKeys(all).map(([, k]) => k)
  expect(keys).toEqual(['a', 'a:1', 'b', 'b:1', 'b:2'])
  expect(turnKeys(all.slice(2)).map(([, k]) => k)).toEqual(['b', 'b:1', 'b:2'])
})
