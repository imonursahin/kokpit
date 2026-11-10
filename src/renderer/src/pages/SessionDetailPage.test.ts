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

test('only a prompt with nothing but hooks after it counts as unanswered', async () => {
  const { unansweredPrompt, stripImageMarkers } = await import('./SessionDetailPage')
  const u = { kind: 'user', text: ['hi'], uuid: 'u' } as never
  const hooks = { kind: 'claude', steps: [{ kind: 'command', label: 'Hook · guard', target: '', state: 'done' }] } as never
  const answered = { kind: 'claude', steps: [], markdown: 'Hello' } as never
  const tool = { kind: 'claude', steps: [{ kind: 'command', label: 'Bash', target: 'ls', state: 'running' }] } as never
  expect(unansweredPrompt([answered, u])).toBe(1)
  expect(unansweredPrompt([answered, u, hooks])).toBe(1)
  expect(unansweredPrompt([u, answered])).toBe(-1)
  expect(unansweredPrompt([u, tool])).toBe(-1)
  expect(unansweredPrompt([])).toBe(-1)
  expect(stripImageMarkers('[Image #1] [Image #2] look at this')).toBe('look at this')
  expect(stripImageMarkers('plain [Image #1] text')).toBe('plain [Image #1] text')
})
