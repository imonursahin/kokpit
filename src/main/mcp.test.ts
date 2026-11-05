import { expect, test } from 'vitest'
import { splitCommand, toInfo } from './mcp'

test('splits a stdio command with quotes', () => {
  expect(splitCommand('npx -y "my server" --flag')).toEqual(['npx', '-y', 'my server', '--flag'])
})

test('claude.ai connectors cannot log in or be removed here', () => {
  const s = toInfo({ name: 'docs', status: 'connected', scope: 'claudeai', source: 'claudeai', config: { type: 'claudeai-proxy', url: 'https://x' } })
  expect(s?.canLogin).toBe(false)
  expect(s?.removable).toBe(false)
  const h = toInfo({ name: 'sentry', status: 'needs-auth', scope: 'user', source: 'user', config: { type: 'http', url: 'https://mcp.sentry.dev/mcp' } })
  expect(h?.canLogin).toBe(true)
  expect(h?.removable).toBe(true)
})
