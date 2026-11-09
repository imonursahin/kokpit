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
