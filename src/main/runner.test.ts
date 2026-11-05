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

test('the session mode follows the CLI and can be switched while it runs', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let feed: (m: unknown) => void = () => {}
  const msgs: unknown[] = []
  const setPermissionMode = vi.fn(async () => {})
  vi.mocked(sdk.query).mockImplementation(((args: { options: { permissionMode?: string } }) => {
    expect(args.options.permissionMode).toBe('plan')
    return {
      setPermissionMode,
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        while (true) {
          const m = msgs.shift() ?? (await new Promise((r) => (feed = r)))
          yield m
        }
      }
    }
  }) as never)
  const { Runner } = await import('./runner')
  const states: string[] = []
  const runner = new Runner((e) => {
    if (e.type === 'state') states.push(e.session.mode)
  })
  const { tempId } = await runner.start({ cwd: process.cwd(), prompt: 'hi', mode: 'plan' })
  expect(runner.list()[0]?.mode).toBe('plan')

  feed({ type: 'system', subtype: 'status', status: null, permissionMode: 'auto', session_id: tempId })
  await vi.waitFor(() => expect(runner.list()[0]?.mode).toBe('auto'))

  await runner.setMode(tempId, 'acceptEdits')
  expect(setPermissionMode).toHaveBeenCalledWith('acceptEdits')
  expect(runner.list()[0]?.mode).toBe('acceptEdits')
  await expect(runner.setMode(tempId, 'toString')).rejects.toThrow('invalid mode')
  await expect(runner.start({ cwd: process.cwd(), prompt: 'x', mode: 'yolo' as never })).rejects.toThrow('invalid mode')
  runner.dispose()
})
