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
  expect(localCommandOutput('<local-command-stdout></local-command-stdout>')).toBe('')
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
      a([{ type: 'thinking', thinking: 'Where is the bug?' }, { type: 'text', text: 'Looking first.' }], '2026-01-01T10:00:01Z'),
      a([{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }], '2026-01-01T10:00:02Z'),
      a([{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/r/a.ts' } }], '2026-01-01T10:00:03Z'),
      a([{ type: 'text', text: 'Found it.' }], '2026-01-01T10:00:04Z'),
      a([{ type: 'text', text: 'Done.' }], '2026-01-01T10:00:05Z')
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:05Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  const claude = detail.turns.find((t) => t.kind === 'claude')
  expect(claude?.kind === 'claude' && claude.parts?.map((p) => (p.kind === 'steps' ? `steps:${p.steps.length}` : `${p.kind}:${p.text}`))).toEqual([
    'thinking:Where is the bug?',
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

test('a subagent step links to its own transcript and shows its background report', async () => {
  const { mkdirSync, mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail, buildSubagentDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  const sub = join(dir, 's', 'subagents')
  mkdirSync(sub, { recursive: true })
  const report = '<agent-message from="a12ab">\n[Subagent hand-back] Framing text. The report follows:\n  [harness: control tags neutralized]\n  \n  Found 2 bugs.\n  \n  - one\n</agent-message>'
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'audit it' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:00:01Z', message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 't1', name: 'Agent', input: { description: 'Audit the code', subagent_type: 'Explore' } }] } }),
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'Async agent launched successfully.' }] }, toolUseResult: { isAsync: true } }),
      JSON.stringify({ type: 'attachment', timestamp: '2026-01-01T10:05:00Z', attachment: { type: 'queued_command', prompt: report, humanTurn: false } })
    ].join('\n')
  )
  writeFileSync(join(sub, 'agent-a12ab.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Audit the code', toolUseId: 't1', finished: true }))
  writeFileSync(
    join(sub, 'agent-a12ab.jsonl'),
    [
      JSON.stringify({ type: 'user', isSidechain: true, timestamp: '2026-01-01T10:00:02Z', message: { content: 'Audit the code in src/' } }),
      JSON.stringify({ type: 'assistant', isSidechain: true, timestamp: '2026-01-01T10:04:00Z', message: { id: 'x1', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Found 2 bugs.' }] } })
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:05:00Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  const step = detail.turns.flatMap((t) => (t.kind === 'claude' ? t.steps : [])).find((s) => s.agent)
  expect(step?.agent).toEqual({ id: 'a12ab', type: 'Explore' })
  expect(step?.output).toBe('Found 2 bugs.\n\n- one')
  expect(step?.state).toBe('done')
  expect(detail.turns.filter((t) => t.kind === 'user').length).toBe(1)

  const agent = await buildSubagentDetail({ ...item }, 'a12ab')
  expect(agent.agent).toMatchObject({ type: 'Explore', description: 'Audit the code', finished: true })
  expect(agent.turns.map((t) => (t.kind === 'user' ? `user:${t.text}` : 'claude'))).toEqual(['user:Audit the code in src/', 'claude'])
  await expect(buildSubagentDetail({ ...item }, '../../etc')).rejects.toThrow('invalid agent id')
})

test('compaction shows as one divider, not as a long user message', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  writeFileSync(
    file,
    [
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'fix it' } }),
      JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:00:01Z', message: { id: 'a', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Done.' }] } }),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', timestamp: '2026-01-01T10:10:00Z' }),
      JSON.stringify({ type: 'user', isCompactSummary: true, timestamp: '2026-01-01T10:10:01Z', message: { content: 'This session is being continued... long summary' } }),
      JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:11:00Z', message: { content: 'next' } })
    ].join('\n')
  )
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:11:00Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const detail = await buildDetail({ ...item })
  expect(detail.turns.map((t) => (t.kind === 'claude' ? 'claude' : `${t.kind}:${t.text}`))).toEqual(['user:fix it', 'claude', 'note:Conversation compacted', 'user:next'])
})

test('a todo update shows progress and the checklist', async () => {
  const { todoStep } = await import('./detail')
  const step = todoStep({
    todos: [
      { content: 'Read the code', status: 'completed', activeForm: 'Reading the code' },
      { content: 'Fix the bug', status: 'in_progress', activeForm: 'Fixing the bug' },
      { content: 'Write a test', status: 'pending', activeForm: 'Writing a test' }
    ]
  })
  expect(step.target).toBe('1/3 done · Fixing the bug')
  expect(step.output).toBe('[x] Read the code\n[>] Fix the bug\n[ ] Write a test')
})

test('hook errors and messages show as steps, session start notes stay hidden', async () => {
  const { hookStep } = await import('./detail')
  expect(hookStep({ type: 'hook_blocking_error', hookName: 'Stop', hookEvent: 'Stop', blockingError: { blockingError: 'push-gate: report drafted\nmore' } })).toMatchObject({
    label: 'Hook · Stop',
    target: 'push-gate: report drafted',
    state: 'error'
  })
  expect(hookStep({ type: 'hook_system_message', hookName: 'SessionStart:startup', hookEvent: 'SessionStart', content: 'up to date' })).toBeNull()
  expect(hookStep({ type: 'hook_system_message', hookName: 'PostToolUse', hookEvent: 'PostToolUse', content: 'formatted 2 files' })?.state).toBe('done')
  expect(hookStep({ type: 'queued_command', prompt: 'x' })).toBeNull()
})

test('a background command stays running until its task notification arrives', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-detail-'))
  const file = join(dir, 's.jsonl')
  const lines = [
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'build it' } }),
    JSON.stringify({ type: 'assistant', timestamp: '2026-01-01T10:00:01Z', message: { id: 'a', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'npm run dist', run_in_background: true } }] } }),
    JSON.stringify({ type: 'user', timestamp: '2026-01-01T10:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'b1', content: 'Command running in background with ID: x1' }] } })
  ]
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:02Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'running', sub: '', headless: false } as const
  const stepOf = async () => (await buildDetail({ ...item })).turns.flatMap((t) => (t.kind === 'claude' ? t.steps : []))[0]
  writeFileSync(file, lines.join('\n'))
  expect(await stepOf()).toMatchObject({ state: 'running', meta: 'in background' })
  const note = '<task-notification>\n<task-id>x1</task-id>\n<tool-use-id>b1</tool-use-id>\n<status>completed</status>\n<summary>done</summary>\n</task-notification>'
  writeFileSync(file, [...lines, JSON.stringify({ type: 'attachment', timestamp: '2026-01-01T10:05:00Z', attachment: { type: 'queued_command', prompt: note } })].join('\n'))
  expect(await stepOf()).toMatchObject({ state: 'done', meta: 'finished in background' })
})

test('a workflow run lists its steps with phase, state and timing from its journal', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { readWorkflowRun } = await import('./detail')
  const root = mkdtempSync(join(tmpdir(), 'kokpit-wf-'))
  const dir = join(root, 's1', 'subagents', 'workflows', 'wf_abc-1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'journal.jsonl'),
    [
      { type: 'launched' },
      { type: 'started', agentId: 'a1', label: 'Preflight', phase: '▸ sdlc-workflows:Prepare' },
      { type: 'result', agentId: 'a1', result: {} },
      { type: 'started', agentId: 'a2', label: 'Develop', phase: '▸ sdlc-workflows:Develop' },
      { type: 'started', agentId: 'a3', label: 'Lint', phase: '▸ sdlc-workflows:Develop' },
      { type: 'failed', agentId: 'a3' }
    ]
      .map((e) => JSON.stringify(e))
      .join('\n')
  )
  writeFileSync(join(dir, 'agent-a1.jsonl'), '{"type":"user","timestamp":"2026-11-09T07:15:00.000Z"}\n')
  const run = await readWorkflowRun({ file: join(root, 's1.jsonl') } as never, 'wf_abc-1')
  expect(run.steps.map((s) => [s.label, s.phase, s.state])).toEqual([
    ['Preflight', 'sdlc-workflows:Prepare', 'done'],
    ['Develop', 'sdlc-workflows:Develop', 'running'],
    ['Lint', 'sdlc-workflows:Develop', 'error']
  ])
  expect(run.steps[0]?.startedAt).toBe('2026-11-09T07:15:00.000Z')
  expect(run.steps[0]?.endedAt).toBeTruthy()
  await expect(readWorkflowRun({ file: join(root, 's1.jsonl') } as never, '../etc')).rejects.toThrow('invalid workflow run')
})

test('a background workflow shows as running until its completion notice, which can arrive as a user message', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { buildDetail } = await import('./detail')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-bgwf-'))
  const file = join(dir, 's.jsonl')
  const lines = [
    { type: 'user', timestamp: '2026-01-01T10:00:00Z', message: { content: 'run it' } },
    { type: 'assistant', timestamp: '2026-01-01T10:00:01Z', message: { id: 'm1', model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'wf1', name: 'Workflow', input: { name: 'dev-pipeline-run' } }] } },
    {
      type: 'user',
      timestamp: '2026-01-01T10:00:02Z',
      message: { content: [{ type: 'tool_result', tool_use_id: 'wf1', content: 'Workflow launched in background.' }] },
      toolUseResult: { status: 'async_launched', taskId: 'w1', runId: 'wf_abc-1', workflowName: 'dev-pipeline-run' }
    },
    { type: 'assistant', timestamp: '2026-01-01T10:00:03Z', message: { id: 'm2', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'Started.' }] } }
  ]
  const item = { id: 's', file, title: 't', cwd: dir, repo: 'r', branch: 'main', jira: '', prNumber: null, prUrl: '', startedAt: '2026-01-01T10:00:00Z', lastAt: '2026-01-01T10:00:03Z', costUsd: 0, costComplete: true, model: '', mode: '', status: 'done', sub: '', headless: false } as const
  const { mkdirSync } = await import('node:fs')
  mkdirSync(join(dir, 's', 'subagents', 'workflows', 'wf_abc-1'), { recursive: true })
  writeFileSync(join(dir, 's', 'subagents', 'workflows', 'wf_abc-1', 'journal.jsonl'), '{"type":"launched"}\n')
  const stepOf = async () => {
    writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'))
    const d = await buildDetail({ ...item })
    return d.turns.flatMap((t) => (t.kind === 'claude' ? t.steps : [])).find((s) => s.workflow)
  }
  expect(await stepOf()).toMatchObject({ state: 'running', meta: 'in background', workflow: { runId: 'wf_abc-1', name: 'dev-pipeline-run' } })
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n'))
  const afterRestart = await buildDetail({ ...item }, Date.now(), { processAlive: false })
  expect(afterRestart.turns.flatMap((t) => (t.kind === 'claude' ? t.steps : [])).find((s) => s.workflow)?.state).toBe('done')
  lines.push({ type: 'user', timestamp: '2026-01-01T10:05:00Z', message: { content: '<task-notification>\n<task-id>w1</task-id>\n<tool-use-id>wf1</tool-use-id>\n<status>completed</status>\n</task-notification>' } })
  expect(await stepOf()).toMatchObject({ state: 'done', meta: 'finished in background' })
})
