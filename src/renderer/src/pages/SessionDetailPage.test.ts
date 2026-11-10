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

test('turn keys stay attached to the same turns when older turns drop out of view', async () => {
  const { turnKeys } = await import('./SessionDetailPage')
  const u = (uuid: string) => ({ kind: 'user', text: [], uuid }) as never
  const c = { kind: 'claude', steps: [] } as never
  const all = [u('a'), c, u('b'), c, c]
  const keys = turnKeys(all).map(([, k]) => k)
  expect(keys).toEqual(['a', 'a:1', 'b', 'b:1', 'b:2'])
  expect(turnKeys(all.slice(2)).map(([, k]) => k)).toEqual(['b', 'b:1', 'b:2'])
})

test('only a prompt with nothing but hooks after it counts as unanswered', async () => {
  const { unansweredPrompt, stripImageMarkers } = await import('./SessionDetailPage')
  const u = { kind: 'user', text: ['hi'], uuid: 'u' } as never
  const hooks = { kind: 'claude', steps: [{ kind: 'command', label: 'Hook · guard', target: '', state: 'done' }] } as never
  const answered = { kind: 'claude', steps: [], markdown: 'Hello' } as never
  const tool = { kind: 'claude', steps: [{ kind: 'command', label: 'Bash', target: 'ls', state: 'running' }] } as never
  expect(unansweredPrompt([answered, u])).toBe(1)
  expect(unansweredPrompt([answered, u, hooks])).toBe(1)
  expect(unansweredPrompt([u, answered])).toBe(-1)
  expect(unansweredPrompt([u, tool])).toBe(-1)
  expect(unansweredPrompt([])).toBe(-1)
  expect(stripImageMarkers('[Image #1] [Image #2] look at this')).toBe('look at this')
  expect(stripImageMarkers('plain [Image #1] text')).toBe('plain [Image #1] text')
})

test('a background shell that redirects its output names the file it writes to', async () => {
  const { redirectTarget } = await import('@shared/shellRedirect')
  expect(redirectTarget('cd /tmp/d && vite --port 5199 > /tmp/d/vite.log 2>&1')).toBe('/tmp/d/vite.log')
  expect(redirectTarget('npm run dev >> out.log')).toBe('out.log')
  expect(redirectTarget('npm run dev &> all.log')).toBe('all.log')
  expect(redirectTarget('npm test 2> err.log')).toBe('')
  expect(redirectTarget('npm run dev >/dev/null 2>&1')).toBe('/dev/null')
  expect(redirectTarget('npm run dev')).toBe('')
})

test('every Claude message stays in the conversation and only tools and thinking go into work blocks', async () => {
  const { groupParts } = await import('./SessionDetailPage')
  const step = { kind: 'command', label: 'Ran', target: 'ls', state: 'done' } as never
  const groups = groupParts([
    { kind: 'thinking', text: 'plan' },
    { kind: 'steps', steps: [step] },
    { kind: 'text', text: 'First reply' },
    { kind: 'steps', steps: [step, step] },
    { kind: 'text', text: 'Second reply' },
    { kind: 'text', text: 'Third reply' },
    { kind: 'steps', steps: [step] }
  ])
  expect(groups.map((g) => (g.kind === 'text' ? g.text : `work:${g.parts.length}`))).toEqual(['work:2', 'First reply', 'work:1', 'Second reply', 'Third reply', 'work:1'])
})

test('edit approvals show the change, other approvals show the command', async () => {
  const { approvalRequest } = await import('./SessionDetailPage')
  const base = { requestId: 'r', sessionId: 's', title: 'Wants to edit a file', detail: '/repo/a.ts', canAlwaysAllow: true, createdAt: new Date().toISOString() }
  const edit = approvalRequest({ ...base, toolName: 'Edit', input: { file_path: '/repo/a.ts', old_string: 'a\nb', new_string: 'c' } }, '/repo')
  expect(edit).toMatchObject({ type: 'edit', file: 'a.ts', add: 1, del: 2, preview: '- a\n- b\n+ c' })
  const write = approvalRequest({ ...base, toolName: 'Write', input: { file_path: '/repo/n.ts', content: 'x' } }, '/repo')
  expect(write).toMatchObject({ type: 'edit', add: 1, del: 0, preview: '+ x' })
  expect(approvalRequest({ ...base, toolName: 'Bash', detail: 'npm test', input: { command: 'npm test' } }, '/repo')).toMatchObject({ type: 'command', command: 'npm test' })
})

test('the working row says when Claude is retrying the API or compacting', async () => {
  const { activityLabel } = await import('./SessionDetailPage')
  expect(activityLabel({ kind: 'retry', detail: 'API error 529 · attempt 2/10 in 4s' })).toEqual({ label: 'Retrying…', detail: 'API error 529 · attempt 2/10 in 4s' })
  expect(activityLabel({ kind: 'compacting' })).toEqual({ label: 'Compacting conversation…' })
})

test('background shells and subagents show only in the background list, not again in the work block', async () => {
  const { runsInBackground } = await import('./SessionDetailPage')
  expect(runsInBackground({ kind: 'command', label: 'Ran', target: 'vite', state: 'running', meta: 'in background' })).toBe(true)
  expect(runsInBackground({ kind: 'command', label: 'Agent', target: 'review', state: 'running', agent: { id: 'a', type: 'Explore' } })).toBe(true)
  expect(runsInBackground({ kind: 'command', label: 'Ran', target: 'npm test', state: 'running' })).toBe(false)
  expect(runsInBackground({ kind: 'command', label: 'Ran', target: 'vite', state: 'done', meta: 'in background' })).toBe(false)
})
