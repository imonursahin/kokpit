import { expect, test } from 'vitest'
import { commandPrompt, localCommandOutput } from './detail'

test('slash command messages turn back into what the user typed', () => {
  expect(commandPrompt('<command-name>/context</command-name>\n<command-message>context</command-message>\n<command-args></command-args>')).toBe('/context')
  expect(commandPrompt('<command-name>kokpit:review</command-name><command-args>https://x/pull/1</command-args>')).toBe('/kokpit:review https://x/pull/1')
  expect(commandPrompt('plain message')).toBe('')
})

test('local command output drops the wrapper tags and color codes', () => {
  expect(localCommandOutput('<local-command-stdout>\u001b[32mReloaded 3 plugins\u001b[0m</local-command-stdout>')).toBe('Reloaded 3 plugins')
  expect(localCommandOutput('<local-command-stderr>Unknown command</local-command-stderr>')).toBe('Unknown command')
})

test('a claude turn keeps text and tool steps in the order they happened', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  const a = (content: unknown[], ts: string) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { id: ts, model: 'claude-opus-5-5', content } })
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'fix it' } }),
      a([{ type: 'text', text: 'Looking first.' }], '2026-01-01T10:00:01Z'),
      a([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], '2026-01-01T10:00:02Z'),
      a([{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/r/a.ts' } }], '2026-01-01T10:00:03Z'),
      a([{ type: 'text', text: 'Found it.' }], '2026-01-01T10:00:04Z'),
      a([{ type: 'text', text: 'Done.' }], '2026-01-01T10:00:05Z')
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:05Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  const claude = detail.turns.find((t) => t.kind === 'claude')
  expect(claude?.kind === 'claude' && claude.parts?.map((p) => (p.kind === 'text' ? `text:${p.text}` : `steps:${p.steps.length}`))).toEqual([
    'text:Looking first.',
    'steps:2',
    'text:Found it.\n\nDone.'
  ])
})

test('a message sent while Claude was working shows up where it was sent', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  const a = (text: string, ts: string) => JSON.stringify({ type: 'assistant', timestamp: ts, message: { id: ts, model: 'claude-opus-5-5', content: [{ type: 'text', text }] } })
  const queued = (prompt: string, ts: string, humanTurn = true) =>
    JSON.stringify({ type: 'attachment', timestamp: ts, attachment: { type: 'queued_command', prompt, humanTurn } })
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'fix it' } }),
      a('Working on it.', '2026-01-01T10:00:01Z'),
      queued('also check the tests', '2026-01-01T10:00:02Z'),
      queued('<task-notification>done</task-notification>', '2026-01-01T10:00:03Z'),
      queued('subagent report', '2026-01-01T10:00:04Z', false),
      a('Tests checked too.', '2026-01-01T10:00:05Z')
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:05Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  expect(detail.turns.map((t) => (t.kind === 'user' ? `user:${t.text}` : 'claude'))).toEqual(['user:fix it', 'claude', 'user:also check the tests', 'claude'])
})

test('the changes list only shows files inside the session folder', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  const write = (id: string, path: string, ts: string) =>
    JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model: 'claude-opus-5-5', content: [{ type: 'tool_use', id, name: 'Write', input: { file_path: path, content: 'x\n' } }] } })
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'go' } }),
      write('w1', join(dir, 'src', 'app.ts'), '2026-01-01T10:00:01Z'),
      write('w2', '/var/folders/xy/T/task-draft.md', '2026-01-01T10:00:02Z')
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:02Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  expect(detail.files.map((f) => f.path)).toEqual(['src/app.ts'])
})
