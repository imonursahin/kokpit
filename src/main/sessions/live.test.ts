import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { deriveStatus } from '../../shared/sessionIndex'
import { readCliStatuses } from './live'

test('reads busy and idle sessions of running Claude Code processes only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-live-'))
  const file = (pid: number, sessionId: string, status: string) => writeFileSync(join(dir, `${pid}.json`), JSON.stringify({ pid, sessionId, status }))
  file(101, 'a', 'busy')
  file(102, 'b', 'idle')
  file(103, 'c', 'busy')
  file(104, 'a', 'idle')
  writeFileSync(join(dir, '105.json'), 'not json')
  const statuses = readCliStatuses(dir, (pid) => pid !== 103)
  expect(Object.fromEntries(statuses)).toEqual({ a: 'busy', b: 'idle' })
  expect(readCliStatuses(join(dir, 'missing')).size).toBe(0)
})

test('a busy session stays running while Claude thinks without writing', () => {
  const now = Date.parse('2026-01-01T10:10:00Z')
  const base = { lastAtMs: now - 5 * 60_000, pendingTool: '', lastWasApiError: false, lastStopReason: 'tool_use' }
  expect(deriveStatus(base, now)).toBe('done')
  expect(deriveStatus({ ...base, cli: 'busy' }, now)).toBe('running')
  expect(deriveStatus({ ...base, lastAtMs: now - 10_000, cli: 'idle' }, now)).toBe('done')
  expect(deriveStatus({ ...base, pendingTool: 'Edit a.ts', lastAtMs: now - 60_000, cli: 'busy' }, now)).toBe('waiting')
})
