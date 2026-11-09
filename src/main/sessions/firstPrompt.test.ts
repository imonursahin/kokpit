import { expect, test } from 'vitest'
import { SessionAccumulator, slashCommand } from './parse'

test('a session that starts with a slash command and has a typed title still shows up with that command as its first prompt', () => {
  const cmd = '<command-message>kokpit:task-init</command-message>\n<command-name>/kokpit:task-init</command-name>\n<command-args>https://x.atlassian.net/browse/PA-1</command-args>'
  expect(slashCommand(cmd)).toBe('/kokpit:task-init https://x.atlassian.net/browse/PA-1')
  expect(slashCommand('fix the bug')).toBe('')
  const acc = new SessionAccumulator('s')
  acc.feed(JSON.stringify({ type: 'custom-title', customTitle: 'PA-1', sessionId: 's' }))
  acc.feed(JSON.stringify({ type: 'user', timestamp: '2026-11-09T13:23:32Z', message: { role: 'user', content: cmd } }))
  const s = acc.snapshot()
  expect(s.firstPrompt).toBe('/kokpit:task-init https://x.atlassian.net/browse/PA-1')
  expect(s.customTitle).toBe('PA-1')
  acc.feed(JSON.stringify({ type: 'user', timestamp: '2026-11-09T13:24:00Z', message: { role: 'user', content: 'now fix the cart test' } }))
  expect(acc.snapshot().firstPrompt).toBe('now fix the cart test')
})

test('a background task notice or a compaction summary never becomes the first prompt, and a finished turn clears stale pending tools', () => {
  const acc = new SessionAccumulator('s')
  const user = (content: unknown, extra: Record<string, unknown> = {}) => acc.feed(JSON.stringify({ type: 'user', timestamp: '2026-11-09T10:00:00Z', message: { role: 'user', content }, ...extra }))
  user('<command-message>x</command-message>\n<command-name>/sdlc:develop</command-name>\n<command-args>PA-1</command-args>')
  user('<task-notification>\n<task-id>w1</task-id>\n<status>completed</status>\n</task-notification>')
  user('This session is being continued from a previous conversation that ran out of context.', { isCompactSummary: true })
  expect(acc.snapshot().firstPrompt).toBe('/sdlc:develop PA-1')
  acc.feed(JSON.stringify({ type: 'assistant', timestamp: '2026-11-09T10:00:01Z', message: { id: 'm1', role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }] } }))
  expect(acc.snapshot().pendingTool).not.toBe('')
  acc.feed(JSON.stringify({ type: 'assistant', timestamp: '2026-11-09T10:00:02Z', message: { id: 'm2', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } }))
  expect(acc.snapshot().pendingTool).toBe('')
})
