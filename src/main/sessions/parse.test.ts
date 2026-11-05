import { describe, expect, test } from 'vitest'
import { deriveStatus, jiraKeyFrom } from '../../shared/sessionIndex'
import { SessionAccumulator } from './parse'

const line = (o: unknown) => JSON.stringify(o)

const usage = { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

function feedAll(acc: SessionAccumulator, lines: string[]) {
  for (const l of lines) acc.feed(l)
  return acc.snapshot()
}

describe('SessionAccumulator', () => {
  test('summarises a session and counts each API message once', () => {
    const acc = new SessionAccumulator('abc')
    const s = feedAll(acc, [
      line({ type: 'user', cwd: '/r/web', gitBranch: 'feature/PA-12', timestamp: '2026-01-01T10:00:00Z', message: { content: '<command-name>/clear</command-name>' } }),
      line({ type: 'user', timestamp: '2026-01-01T10:00:01Z', message: { content: 'fix the cart test' } }),
      line({ type: 'assistant', timestamp: '2026-01-01T10:00:02Z', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'text', text: 'Looking.' }] } }),
      line({ type: 'assistant', timestamp: '2026-01-01T10:00:03Z', message: { id: 'm1', model: 'claude-opus-5-5', usage, content: [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/r/web/src/cart.ts' } }] } }),
      'not json',
      line({ type: 'ai-title', aiTitle: 'Fix cart test' }),
      line({ type: 'pr-link', prNumber: 7, prUrl: 'https://x/pull/7' }),
      line({ type: 'custom-title', customTitle: ' My name ' })
    ])
    expect(s.customTitle).toBe('My name')
    expect(s.firstPrompt).toBe('fix the cart test')
    expect(s.title).toBe('Fix cart test')
    expect(s.cwd).toBe('/r/web')
    expect(s.branch).toBe('feature/PA-12')
    expect(s.pendingTool).toBe('Editing src/cart.ts')
    expect(s.prNumber).toBe(7)
    expect(s.skippedLines).toBe(1)
    expect(s.costUsd).toBeCloseTo((1000 * 4 + 1000 * 20) / 1_000_000)
  })

  test('a tool result clears the pending tool and restore keeps dedupe state', () => {
    const acc = new SessionAccumulator('abc')
    acc.feed(line({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5-5', usage, content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm test' } }] } }))
    const restored = SessionAccumulator.restore(acc.state())
    restored.feed(line({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-5-5', usage, content: [] } }))
    restored.feed(line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } }))
    const s = restored.snapshot()
    expect(s.pendingTool).toBe('')
    expect(s.costUsd).toBeCloseTo((1000 * 2 + 1000 * 10) / 1_000_000)
  })

  test('unknown models mark the cost incomplete instead of guessing', () => {
    const acc = new SessionAccumulator('abc')
    acc.feed(line({ type: 'assistant', message: { id: 'm1', model: 'claude-future-9', usage, content: [] } }))
    expect(acc.snapshot().costComplete).toBe(false)
    expect(acc.snapshot().costUsd).toBe(0)
  })
})

describe('deriveStatus', () => {
  const now = 1_000_000_000
  test('pending tool: running while fresh, waiting when idle, done when stale', () => {
    const base = { pendingTool: 'Editing x', lastWasApiError: false, lastStopReason: 'tool_use' }
    expect(deriveStatus({ ...base, lastAtMs: now - 5_000 }, now)).toBe('running')
    expect(deriveStatus({ ...base, lastAtMs: now - 60_000 }, now)).toBe('waiting')
    expect(deriveStatus({ ...base, lastAtMs: now - 3_600_000 }, now)).toBe('done')
  })
  test('a long shell command stays running longer than a quick edit', () => {
    const cmd = { pendingTool: 'Running npm test', lastWasApiError: false, lastStopReason: 'tool_use' }
    const edit = { ...cmd, pendingTool: 'Editing src/a.ts' }
    expect(deriveStatus({ ...cmd, lastAtMs: now - 60_000 }, now)).toBe('running')
    expect(deriveStatus({ ...edit, lastAtMs: now - 60_000 }, now)).toBe('waiting')
  })
  test('api error wins, end_turn is done', () => {
    expect(deriveStatus({ lastAtMs: now, pendingTool: '', lastWasApiError: true, lastStopReason: '' }, now)).toBe('error')
    expect(deriveStatus({ lastAtMs: now, pendingTool: '', lastWasApiError: false, lastStopReason: 'end_turn' }, now)).toBe('done')
  })
})

test('jiraKeyFrom takes the first key from branch, then title', () => {
  expect(jiraKeyFrom('feature/PA-43801', 'x')).toBe('PA-43801')
  expect(jiraKeyFrom('main', 'MB-10811 coverage')).toBe('MB-10811')
  expect(jiraKeyFrom('main', 'no key here')).toBe('')
})

describe('parseUnifiedDiff', () => {
  test('reads files, line numbers and counts', async () => {
    const { parseUnifiedDiff } = await import('./diff')
    const diff = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1..2 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -10,3 +10,3 @@ fn',
      ' keep',
      '-old',
      '+new',
      'diff --git a/src/__tests__/a.test.ts b/src/__tests__/a.test.ts',
      'new file mode 100644',
      '@@ -0,0 +1,1 @@',
      '+it()'
    ].join('\n')
    const [a, t] = parseUnifiedDiff(diff)
    expect(a?.path).toBe('src/a.ts')
    expect([a?.add, a?.del, a?.change]).toEqual([1, 1, 'M'])
    expect(a?.lines.map((l) => [l.o, l.n, l.sign])).toEqual([['', '', '@'], [10, 10, ' '], [11, '', '-'], ['', 11, '+']])
    expect(t?.change).toBe('A')
  })
})
