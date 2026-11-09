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
