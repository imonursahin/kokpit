import { expect, test, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn(), renameSession: vi.fn() }))

test('a stopped turn ends idle, not as an error', async () => {
  const { stateAfterResult } = await import('./runner')
  const interrupted = { is_error: true, subtype: 'error_during_execution' }
  expect(stateAfterResult('running', interrupted, true)).toEqual({ state: 'idle', lastError: undefined })
  expect(stateAfterResult('running', interrupted, false)).toEqual({ state: 'error', lastError: 'error_during_execution' })
  expect(stateAfterResult('running', { is_error: false, subtype: 'success' }, false)).toEqual({ state: 'idle', lastError: undefined })
  expect(stateAfterResult('error', { is_error: false, subtype: 'success' }, false)).toBeNull()
})
