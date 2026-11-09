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

test('pasted images go to Claude as image blocks before the text', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let prompt: AsyncIterable<{ message: { content: unknown } }> | undefined
  vi.mocked(sdk.query).mockImplementation(((args: { prompt: typeof prompt }) => {
    prompt = args.prompt
    return { close: vi.fn(), async *[Symbol.asyncIterator]() {} }
  }) as never)
  const { Runner, imageInputs } = await import('./runner')
  const runner = new Runner(() => {})
  await runner.start({ cwd: process.cwd(), prompt: '[Image #1] what is wrong here?', images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }] })
  const first = await prompt?.[Symbol.asyncIterator]().next()
  expect(first?.value?.message.content).toEqual([
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
    { type: 'text', text: '[Image #1] what is wrong here?' }
  ])
  expect(() => imageInputs([{ mediaType: 'image/tiff', data: 'AAAA' }])).toThrow('Only PNG')
  expect(() => imageInputs([{ mediaType: 'image/png', data: 'not base64!' }])).toThrow('invalid image')
  expect(() => imageInputs([{ mediaType: 'image/png', data: 'A'.repeat(7_000_000) }])).toThrow('under 5 MB')
  expect(imageInputs(undefined)).toEqual([])
  runner.dispose()
})

test('answers reach Claude and model or effort changes apply to the running session', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  type CanUse = (tool: string, input: Record<string, unknown>, o: { signal: AbortSignal; suggestions?: unknown[] }) => Promise<{ behavior: string; updatedInput?: Record<string, unknown> }>
  let canUseTool: CanUse | undefined
  const setModel = vi.fn(async () => {})
  const applyFlagSettings = vi.fn(async () => {})
  vi.mocked(sdk.query).mockImplementation(((args: { options: { canUseTool: CanUse } }) => {
    canUseTool = args.options.canUseTool
    return { setModel, applyFlagSettings, close: vi.fn(), async *[Symbol.asyncIterator]() { await new Promise(() => {}) } }
  }) as never)
  const { Runner, answerInputs } = await import('./runner')
  const runner = new Runner(() => {})
  const { tempId } = await runner.start({ cwd: process.cwd(), prompt: 'go', model: 'claude-opus-5-5', effort: 'high' })

  const questions = [{ question: 'Which DB?', header: 'DB', options: [{ label: 'Postgres', description: '' }, { label: 'MySQL', description: '' }], multiSelect: false }]
  const pending = canUseTool?.('AskUserQuestion', { questions }, { signal: new AbortController().signal })
  const ask = runner.list()[0]?.pending[0]
  expect(ask?.toolName).toBe('AskUserQuestion')
  runner.respond(tempId, ask?.requestId, 'allow', undefined, { 'Which DB?': 'Postgres' })
  expect(await pending).toMatchObject({ behavior: 'allow', updatedInput: { questions, answers: { 'Which DB?': 'Postgres' } } })
  expect(() => answerInputs({ q: '' })).toThrow('invalid answers')

  await runner.send(tempId, 'next', undefined, { model: 'claude-sonnet-5-5', effort: 'low' })
  expect(setModel).toHaveBeenCalledWith('claude-sonnet-5-5')
  expect(applyFlagSettings).toHaveBeenCalledWith({ effortLevel: 'low' })
  await runner.send(tempId, 'again', undefined, { model: 'claude-sonnet-5-5', effort: 'low' })
  expect(setModel).toHaveBeenCalledTimes(1)
  expect(applyFlagSettings).toHaveBeenCalledTimes(1)
  runner.dispose()
})

test('streamed text is sent as it arrives and cleared when the turn ends', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let wake: () => void = () => {}
  const msgs: unknown[] = []
  const feed = (m: unknown) => {
    msgs.push(m)
    wake()
  }
  vi.mocked(sdk.query).mockImplementation(((args: { options: { includePartialMessages?: boolean } }) => {
    expect(args.options.includePartialMessages).toBe(true)
    return {
      close: vi.fn(),
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (msgs.length) yield msgs.shift()
          else await new Promise<void>((r) => (wake = r))
        }
      }
    }
  }) as never)
  const { Runner } = await import('./runner')
  const partials: string[] = []
  const runner = new Runner((e) => {
    if (e.type === 'partial') partials.push(e.text)
  })
  const { tempId } = await runner.start({ cwd: process.cwd(), prompt: 'hi' })
  const ev = (event: unknown) => feed({ type: 'stream_event', session_id: tempId, event })
  ev({ type: 'message_start' })
  ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello ' } })
  ev({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } })
  await vi.waitFor(() => expect(partials.at(-1)).toBe('Hello world'))
  feed({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, session_id: tempId })
  await vi.waitFor(() => expect(partials.at(-1)).toBe(''))
  runner.dispose()
})

test('editing an earlier message forks the session at that point', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let options: Record<string, unknown> = {}
  vi.mocked(sdk.query).mockImplementation(((args: { options: Record<string, unknown> }) => {
    options = args.options
    return { close: vi.fn(), async *[Symbol.asyncIterator]() {} }
  }) as never)
  const { Runner } = await import('./runner')
  const runner = new Runner(() => {})
  const at = '11111111-2222-3333-4444-555555555555'
  const { tempId } = await runner.start({ cwd: process.cwd(), prompt: 'try again', resumeId: 'old-session', resumeAt: at })
  expect(tempId.startsWith('pending-')).toBe(true)
  expect(options).toMatchObject({ resume: 'old-session', forkSession: true, resumeSessionAt: at })
  await expect(runner.start({ cwd: process.cwd(), prompt: 'x', resumeId: 'old-session', resumeAt: 'nope' })).rejects.toThrow('invalid rewind point')
  runner.dispose()
})

test('a queued message can be taken back, models come from Claude Code, files can be rewound', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const sent: { uuid?: string }[] = []
  const cancelAsyncMessage = vi.fn(async () => true)
  const rewindFiles = vi.fn(async () => ({ canRewind: true, filesChanged: ['/r/a.ts'], insertions: 1, deletions: 2 }))
  const supportedModels = vi.fn(async () => [
    { value: 'default', resolvedModel: 'claude-opus-5-5', displayName: 'Default (recommended)' },
    { value: 'opus', resolvedModel: 'claude-opus-5-5', displayName: 'Opus 5.5' },
    { value: 'claude-sonnet-4-6', resolvedModel: 'claude-sonnet-4-6', displayName: 'Sonnet 4.6' },
    { value: 'weird', resolvedModel: 'not a model', displayName: 'Nope' }
  ])
  vi.mocked(sdk.query).mockImplementation(((args: { prompt: AsyncIterable<{ uuid?: string }> }) => {
    void (async () => {
      for await (const m of args.prompt) sent.push(m)
    })()
    return { cancelAsyncMessage, rewindFiles, supportedModels, close: vi.fn(), async *[Symbol.asyncIterator]() { await new Promise(() => {}) } }
  }) as never)
  const { Runner } = await import('./runner')
  const runner = new Runner(() => {})
  const { tempId } = await runner.start({ cwd: process.cwd(), prompt: 'first' })
  const uuid = await runner.send(tempId, 'second')
  await vi.waitFor(() => expect(sent.at(-1)?.uuid).toBe(uuid))
  expect(await runner.cancelQueued(tempId, uuid)).toBe(true)
  expect(cancelAsyncMessage).toHaveBeenCalledWith(uuid)
  await expect(runner.cancelQueued(tempId, 'not-a-uuid')).rejects.toThrow('invalid message id')

  expect(await runner.models()).toEqual([
    { id: 'claude-opus-5-5', label: 'Opus 5.5' },
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' }
  ])

  const at = '11111111-2222-3333-4444-555555555555'
  expect(await runner.rewindFiles(tempId, process.cwd(), at, true)).toEqual({ canRewind: true, error: undefined, filesChanged: ['/r/a.ts'], insertions: 1, deletions: 2 })
  expect(rewindFiles).toHaveBeenCalledWith(at, { dryRun: true })
  await expect(runner.rewindFiles(tempId, process.cwd(), 'x', true)).rejects.toThrow('invalid rewind point')
  runner.dispose()
})

test('when the Claude process ends the session is dropped and the UI is told', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  vi.mocked(sdk.query).mockImplementation((() => ({
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield { type: 'system', subtype: 'init', session_id: 'sess-1', model: 'm', permissionMode: 'default' }
      yield { type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, session_id: 'sess-1' }
    }
  })) as never)
  const { Runner } = await import('./runner')
  const ended: string[] = []
  const runner = new Runner((e) => {
    if (e.type === 'ended') ended.push(e.sessionId)
  })
  await runner.start({ cwd: process.cwd(), prompt: 'hi' })
  await vi.waitFor(() => expect(ended).toEqual(['sess-1']))
  expect(runner.list()).toEqual([])
  await expect(runner.send('sess-1', 'again')).rejects.toThrow('not running')
})

test('a title typed for a new session is given to Claude Code at start, so it is never auto-named', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const titles: unknown[] = []
  vi.mocked(sdk.query).mockImplementation(((args: { options: { title?: string } }) => {
    titles.push(args.options.title)
    return { close: vi.fn(), async *[Symbol.asyncIterator]() {} }
  }) as never)
  const { Runner } = await import('./runner')
  const runner = new Runner(() => {})
  await runner.start({ cwd: process.cwd(), prompt: 'hi', title: '  abc  ' })
  await runner.start({ cwd: process.cwd(), prompt: 'hi', title: '' })
  await runner.start({ cwd: process.cwd(), prompt: 'hi', title: 'abc', resumeId: '11111111-1111-1111-1111-111111111111' })
  expect(titles).toEqual(['abc', undefined, undefined])
  runner.dispose()
})

test('background work keeps showing after the turn ends, until its task finishes', async () => {
  const { trackTask } = await import('./runner')
  const tasks = new Map()
  const at = new Date('2026-11-09T10:00:00Z')
  expect(trackTask(tasks, { subtype: 'task_started', task_id: 'w1', task_type: 'local_workflow', workflow_name: 'dev-pipeline', description: 'x' }, at)).toBe(true)
  expect(trackTask(tasks, { subtype: 'task_started', task_id: 'a1', ambient: true, description: 'watcher' }, at)).toBe(false)
  expect(trackTask(tasks, { subtype: 'task_progress', task_id: 'w1', usage: { tool_uses: 7 }, last_tool_name: 'Bash' })).toBe(true)
  expect([...tasks.values()]).toEqual([{ id: 'w1', taskId: 'w1', toolUseId: undefined, kind: 'Workflow', description: 'dev-pipeline', startedAt: at.toISOString(), toolUses: 7, lastTool: 'Bash' }])
  expect(trackTask(tasks, { subtype: 'task_updated', task_id: 'w1', patch: { status: 'running' } })).toBe(false)
  expect(trackTask(tasks, { subtype: 'task_notification', task_id: 'w1', status: 'completed' })).toBe(true)
  expect(tasks.size).toBe(0)

  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let wake: () => void = () => {}
  const msgs: unknown[] = []
  const feed = (m: unknown) => {
    msgs.push(m)
    wake()
  }
  vi.mocked(sdk.query).mockImplementation((() => ({
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (msgs.length) yield msgs.shift()
        else await new Promise<void>((r) => (wake = r))
      }
    }
  })) as never)
  const { Runner } = await import('./runner')
  const runner = new Runner(() => {})
  await runner.start({ cwd: process.cwd(), prompt: 'run it' })
  feed({ type: 'system', subtype: 'init', session_id: 's1', model: 'm', permissionMode: 'default' })
  feed({ type: 'system', subtype: 'task_started', task_id: 'w1', task_type: 'local_workflow', workflow_name: 'dev-pipeline', session_id: 's1' })
  feed({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, session_id: 's1' })
  await vi.waitFor(() => expect(runner.list()[0]).toMatchObject({ state: 'idle', background: [{ kind: 'Workflow', description: 'dev-pipeline' }] }))
  feed({ type: 'system', subtype: 'task_notification', task_id: 'w1', status: 'completed', session_id: 's1' })
  await vi.waitFor(() => expect(runner.list()[0]?.background).toEqual([]))
  runner.dispose()
})

test('the session reports what Claude is doing right now: thinking, writing or running a tool', async () => {
  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  let wake: () => void = () => {}
  const msgs: unknown[] = []
  const feed = (m: unknown) => {
    msgs.push(m)
    wake()
  }
  vi.mocked(sdk.query).mockImplementation((() => ({
    close: vi.fn(),
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (msgs.length) yield msgs.shift()
        else await new Promise<void>((r) => (wake = r))
      }
    }
  })) as never)
  const { Runner } = await import('./runner')
  const runner = new Runner(() => {})
  await runner.start({ cwd: process.cwd(), prompt: 'go' })
  const now = () => runner.list()[0]?.activity
  feed({ type: 'stream_event', session_id: 's1', event: { type: 'content_block_start', content_block: { type: 'thinking' } } })
  await vi.waitFor(() => expect(now()).toEqual({ kind: 'thinking' }))
  feed({ type: 'stream_event', session_id: 's1', parent_tool_use_id: 'x', event: { type: 'content_block_start', content_block: { type: 'text' } } })
  feed({ type: 'stream_event', session_id: 's1', event: { type: 'content_block_start', content_block: { type: 'text' } } })
  await vi.waitFor(() => expect(now()).toEqual({ kind: 'writing' }))
  feed({ type: 'assistant', session_id: 's1', parent_tool_use_id: null, message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm   test' } }] } })
  await vi.waitFor(() => expect(now()).toEqual({ kind: 'tool', tool: 'Bash', detail: 'npm test' }))
  feed({ type: 'user', session_id: 's1', parent_tool_use_id: null, message: { content: 'hook note while the command runs' } })
  feed({ type: 'system', subtype: 'status', session_id: 's1' })
  await new Promise((r) => setTimeout(r, 20))
  expect(now()).toEqual({ kind: 'tool', tool: 'Bash', detail: 'npm test' })
  feed({ type: 'user', session_id: 's1', parent_tool_use_id: null, message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } })
  await vi.waitFor(() => expect(now()).toEqual({ kind: 'thinking' }))
  feed({ type: 'result', subtype: 'success', is_error: false, total_cost_usd: 0, session_id: 's1' })
  await vi.waitFor(() => expect(now()).toBeUndefined())
  runner.dispose()
})
