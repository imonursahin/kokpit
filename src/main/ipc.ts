import { app, BrowserWindow, dialog, ipcMain, Notification, powerSaveBlocker, shell } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile as readFileAsync, rm, writeFile as writeFileAsync } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { SessionIndexItem } from '../shared/sessionIndex'
import type { MyPullRequests } from '../shared/integrations'
import type { SessionStatus } from '../shared/types'
import { prNotices, sessionNotices, type Notice } from './notifier'
import type { LibraryEntry, LibraryRepo } from '../shared/library'
import { Library } from './library'
import { Integrations } from './integrations'
import { Secrets } from './integrations/secrets'
import { deleteSession, renameSession } from '@anthropic-ai/claude-agent-sdk'
import { assertSessionId, deleteSessionTraces } from './sessions/delete'
import { mcpAdd, mcpLogout, mcpRemove, mcpStatus, type McpContext } from './mcp'
import { Runner } from './runner'
import { Terminals } from './terminal'
import { assistantHome, assistantPrompt, ensureAssistantHome } from './assistant'
import { SettingsStore } from './settings'
import { runDoctor } from './doctor'
import { planUsage } from './planUsage'
import { checkForUpdate, updateCommand } from './updates'
import { focusAndNavigate } from './tray'
import type { PlanUsage, UpdateStatus } from '../shared/settings'
import { SearchIndex } from './search'
import { relativeTime } from '../shared/time'
import { buildDetail, buildSubagentDetail } from './sessions/detail'
import { revertFile } from './sessions/revert'
import { KokpitSessions } from './sessions/origin'
import { readCliStatuses } from './sessions/live'
import { PROJECTS_DIR, SessionStore } from './sessions/store'

const log = (msg: string) => console.log(`[kokpit] ${msg}`)

export function registerIpc(
  opts: {
    onSessions?: (items: SessionIndexItem[], showHeadless: boolean, menuBar: boolean) => void
    onPlanUsage?: (usage: PlanUsage) => void
    onUnread?: (list: { id: string; title: string }[]) => void
    mainWindow?: () => BrowserWindow | null
  } = {}
): () => void {
  const store = new SessionStore(join(app.getPath('userData'), 'session-index.json'), PROJECTS_DIR, log, readCliStatuses)
  const settings = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  let claudeExecutable = ''
  const showNotices = (list: Notice[], force = false) => {
    void settings.get().then((s) => {
      if (!list.length || !Notification.isSupported() || (!force && !s.notifyEnabled)) return
      const win = opts.mainWindow?.() ?? null
      if (!force && !s.notifyWhenFocused && win?.isFocused()) return
      for (const n of list.filter((x) => force || s.notify[x.event]).slice(0, 5)) {
        const note = new Notification({ title: n.title, body: n.body })
        note.on('click', () => {
          const w = opts.mainWindow?.()
          if (!w) return
          if (w.isMinimized()) w.restore()
          w.show()
          w.focus()
          w.webContents.send('app:navigate', n.target)
        })
        note.show()
      }
    })
  }
  const lastStatus = new Map<string, SessionStatus>()
  let sessionsPrimed = false
  const watchSessions = (items: SessionIndexItem[]) => {
    void settings.get().then((s) => {
      const list = sessionsPrimed ? sessionNotices(lastStatus, items, s.showHeadless) : []
      sessionsPrimed = true
      for (const i of items) lastStatus.set(i.id, i.status)
      showNotices(list)
      opts.onSessions?.(items, s.showHeadless, s.menuBar)
    })
  }
  let lastPrs: MyPullRequests | null = null
  const watchPrs = (data: MyPullRequests) => {
    const list = lastPrs ? prNotices(lastPrs, data) : []
    lastPrs = data
    showNotices(list)
  }
  let home = assistantHome('')
  void settings.get().then(async (s) => {
    claudeExecutable = s.claudeExecutable
    home = assistantHome(s.assistantHome)
    await ensureAssistantHome(home).catch((err: Error) => log(`assistant folder: ${err.message}`))
  })
  const bundledClaude = app.isPackaged
    ? join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@anthropic-ai', `claude-agent-sdk-darwin-${process.arch}`, 'claude')
    : ''
  const kokpitSessions = new KokpitSessions(join(app.getPath('userData'), 'kokpit-sessions.json'))
  void kokpitSessions.load()
  const runner = new Runner((e) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('runner:event', e)
    if (e.type === 'started') kokpitSessions.add(e.sessionId)
    if (e.type === 'state') kokpitSessions.add(e.session.sessionId)
    if (e.type === 'state') {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void broadcast(), 300)
    }
  }, log, () => claudeExecutable || (bundledClaude && existsSync(bundledClaude) ? bundledClaude : undefined), async () => {
    if (!existsSync(home)) return null
    return { home, prompt: await assistantPrompt(home) }
  })
  const withLive = (items: SessionIndexItem[]): SessionIndexItem[] => {
    const live = new Map(runner.list().map((l) => [l.sessionId, l]))
    return items.map((item) => {
      const i = item.headless && kokpitSessions.has(item.id) ? { ...item, headless: false } : item
      const l = live.get(i.id)
      if (!l) return i
      const status = l.state === 'waiting' ? 'waiting' : l.state === 'error' ? 'error' : l.state === 'idle' ? 'done' : 'running'
      const ask = l.pending[0]
      return { ...i, status, sub: ask ? `${ask.title}: ${ask.detail}`.slice(0, 200) : i.sub }
    })
  }
  let timer: NodeJS.Timeout | null = null
  let refreshing: Promise<SessionIndexItem[]> | null = null
  let again = false

  const refresh = (): Promise<SessionIndexItem[]> => {
    if (refreshing) {
      again = true
      return refreshing
    }
    refreshing = store
      .refresh()
      .then(withLive)
      .finally(() => {
        refreshing = null
        if (again) {
          again = false
          void broadcast()
        }
      })
    return refreshing
  }

  const broadcast = async () => {
    try {
      const items = await refresh()
      watchSessions(items)
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('sessions:changed', items)
    } catch (err) {
      log(`session refresh failed: ${(err as Error).message}`)
    }
  }

  const revertable = new Map<string, { root: string; paths: Set<string> }>()
  ipcMain.handle('sessions:list', () => refresh())
  ipcMain.handle('app:user', async () => {
    const git = async (key: string) => {
      try {
        return (await promisify(execFile)('git', ['config', '--global', key], { timeout: 5000 })).stdout.trim()
      } catch {
        return ''
      }
    }
    const [name, email] = await Promise.all([git('user.name'), git('user.email')])
    return { name: name || 'You', email }
  })
  ipcMain.handle('sessions:subagent', async (_e, id: unknown, agentId: unknown) => {
    if (typeof id !== 'string' || typeof agentId !== 'string') throw new Error('invalid subagent request')
    const item = store.items().find((i) => i.id === id)
    if (!item) throw new Error(`session ${id} not found`)
    return buildSubagentDetail(item, agentId)
  })
  ipcMain.handle('sessions:detail', async (_e, id: unknown) => {
    if (typeof id !== 'string') throw new Error('session id must be a string')
    const item = store.items().find((i) => i.id === id) ?? (await refresh()).find((i) => i.id === id)
    if (!item) throw new Error(`session ${id} not found`)
    const detail = await buildDetail(item)
    if (detail.plan?.path && existsSync(detail.plan.path)) planPaths.set(id, detail.plan.path)
    if (detail.filesRoot) revertable.set(id, { root: detail.filesRoot, paths: new Set(detail.files.map((f) => f.path)) })
    else revertable.delete(id)
    return detail
  })
  ipcMain.handle('sessions:rename', async (_e, id: unknown, title: unknown) => {
    if (typeof id !== 'string' || typeof title !== 'string') throw new Error('invalid rename')
    const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120)
    if (!clean) throw new Error('Title cannot be empty')
    if (!store.items().some((i) => i.id === id)) throw new Error('Session not found')
    await renameSession(id, clean)
    void broadcast()
  })
  ipcMain.handle('sessions:delete', async (_e, rawId: unknown) => {
    const id = assertSessionId(rawId)
    const live = runner.list().find((l) => l.sessionId === id)
    if (live && (live.state === 'running' || live.state === 'waiting' || live.state === 'starting'))
      throw new Error('Claude is still working in this session. Stop it first.')
    const item = withLive(store.items()).find((i) => i.id === id)
    if (!item) throw new Error('Session not found')
    if (item.status === 'running') throw new Error('This session is running in a terminal. Stop it there first.')
    if (live) runner.close(id)
    await deleteSessionTraces(id, (sid) => deleteSession(sid))
    store.forget(item.file)
    search.drop(item.file)
    kokpitSessions.remove(id)
    revertable.delete(id)
    planPaths.delete(id)
    void broadcast()
  })

  const mcpCtx = (): McpContext => ({
    executable: claudeExecutable || (bundledClaude && existsSync(bundledClaude) ? bundledClaude : undefined),
    plugin: existsSync(home) ? home : undefined
  })
  ipcMain.handle('mcp:status', () => mcpStatus(mcpCtx()))
  ipcMain.handle('mcp:remove', (_e, name: unknown, scope: unknown, transport: unknown) => mcpRemove(mcpCtx(), name, scope, transport))
  const terminals = new Terminals((e) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('term:event', e)
  })
  ipcMain.handle('term:mcpLogin', (_e, name: unknown, cols: unknown, rows: unknown) => {
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(name)) throw new Error('Invalid server name')
    return terminals.start([mcpCtx().executable || 'claude', 'mcp', 'login', name], cols, rows)
  })
  ipcMain.handle('term:update', (_e, cols: unknown, rows: unknown) => {
    const cmd = updateCommand()
    if (!cmd) throw new Error('Homebrew is not installed, so Kokpit cannot update itself')
    return terminals.start(cmd, cols, rows)
  })
  let updateStatus: UpdateStatus | null = null
  let notifiedVersion = ''
  const refreshUpdate = async () => {
    const status = await checkForUpdate(app.getVersion(), app.isPackaged)
    updateStatus = status
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:status', status)
    if (app.isPackaged && status.hasUpdate && status.latest && status.latest !== notifiedVersion && Notification.isSupported()) {
      notifiedVersion = status.latest
      const note = new Notification({
        title: 'Kokpit update available',
        body: `${status.latest} is out (you have ${status.current}). Click to update.`
      })
      note.on('click', () => {
        const w = opts.mainWindow?.()
        if (w) focusAndNavigate(w, { page: 'about' })
      })
      note.show()
    }
    return status
  }
  const updateFirst = setTimeout(() => void refreshUpdate(), 10_000)
  const updateTick = setInterval(() => void refreshUpdate(), 4 * 3_600_000)
  ipcMain.handle('update:get', () => updateStatus ?? refreshUpdate())
  ipcMain.handle('update:check', () => refreshUpdate())
  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })
  ipcMain.handle('term:write', (_e, id: unknown, data: unknown) => terminals.write(id, data))
  ipcMain.handle('term:resize', (_e, id: unknown, cols: unknown, rows: unknown) => terminals.resize(id, cols, rows))
  ipcMain.handle('term:kill', (_e, id: unknown) => terminals.kill(id))
  ipcMain.handle('mcp:logout', (_e, name: unknown) => mcpLogout(mcpCtx(), name))
  ipcMain.handle('mcp:add', (_e, input: unknown) => mcpAdd(mcpCtx(), input))

  ipcMain.handle('changes:revert', async (_e, id: unknown, path: unknown) => {
    if (typeof id !== 'string' || typeof path !== 'string') throw new Error('invalid revert request')
    const known = revertable.get(id)
    if (!known) throw new Error("This session's changes are not in a git working tree, so Kokpit can't revert them")
    if (!known.paths.has(path)) throw new Error('This file is not among the session changes; reopen the session and try again')
    const result = await revertFile(known.root, path, (abs) => shell.trashItem(abs))
    known.paths.delete(path)
    void broadcast()
    return result
  })

  const library = new Library()
  let repos: LibraryRepo[] = []
  let libraryEntries: LibraryEntry[] = []
  const listLibrary = async () => {
    const listing = await library.list(home, store.usage())
    repos = listing.repos
    libraryEntries = listing.entries
    return listing
  }
  ipcMain.handle('library:list', () => listLibrary())

  const search = new SearchIndex(log)
  void refresh()
    .then(async (items) => {
      await listLibrary()
      await search.sync(items)
    })
    .catch((err: Error) => log(`initial index failed: ${err.message}`))
  ipcMain.handle('search:query', (_e, q: unknown) => {
    if (typeof q !== 'string') throw new Error('query must be a string')
    const items = withLive(store.items())
    void search.sync(items)
    const now = Date.now()
    return search.search(q.slice(0, 200), items, libraryEntries, (iso) => relativeTime(iso, now))
  })
  ipcMain.handle('library:save', (_e, absPath: unknown, body: unknown) => library.save(absPath, body, store.usage()))
  ipcMain.handle('library:delete', (_e, absPath: unknown) => library.remove(absPath))
  ipcMain.handle('library:create', (_e, input: unknown) => library.create(input as never, store.usage()))

  let watcher: FSWatcher | null = null
  try {
    watcher = watch(PROJECTS_DIR, { recursive: true }, (_event, file) => {
      if (!file || !String(file).endsWith('.jsonl')) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void broadcast(), 800)
    })
    watcher.on('error', (err) => log(`session watcher stopped: ${err.message}`))
  } catch (err) {
    log(`cannot watch ${PROJECTS_DIR}: ${(err as Error).message}`)
  }

  const tick = setInterval(() => void broadcast(), 30_000)

  const integrations = new Integrations(new Secrets(join(app.getPath('userData'), 'secrets.json')))
  ipcMain.handle('integrations:status', () => integrations.status())
  ipcMain.handle('integrations:connectJira', (_e, input: unknown) => integrations.connectJira(input))
  ipcMain.handle('integrations:connectGithub', (_e, input: unknown) => integrations.connectGithub(input))
  ipcMain.handle('integrations:disconnect', (_e, id: unknown) => integrations.disconnect(id))
  ipcMain.handle('jira:issues', (_e, force: unknown) => integrations.issues(force === true))
  ipcMain.handle('github:prs', (_e, key: unknown) => integrations.pullRequests(key))
  ipcMain.handle('jira:issue', (_e, key: unknown) => integrations.issue(key))
  ipcMain.handle('jira:comment', (_e, key: unknown, text: unknown) => integrations.addJiraComment(key, text))
  ipcMain.handle('github:mine', async (_e, force: unknown) => integrations.myPullRequests((await settings.get()).includeDraftReviews, force === true ? 0 : 45_000))
  integrations.onPullRequests = watchPrs
  let prPolledAt = 0
  const prPoll = setInterval(() => {
    void settings.get().then((s) => {
      const wanted = s.notifyEnabled && (s.notify.prChecksFailed || s.notify.prChangesRequested || s.notify.prReviewRequested)
      if (!wanted || Date.now() - prPolledAt < s.githubRefreshMinutes * 60_000 - 5_000) return
      prPolledAt = Date.now()
      integrations.myPullRequests(s.includeDraftReviews).catch(() => undefined)
    })
  }, 60_000)
  ipcMain.handle('app:testNotification', () =>
    showNotices([{ event: 'sessionDone', title: 'Kokpit notifications are on', body: 'You will see alerts like this one.', target: { page: 'overview' } }], true)
  )
  ipcMain.handle('github:counts', async () => integrations.myPullRequestCounts((await settings.get()).includeDraftReviews))
  ipcMain.handle('github:prsByUrl', (_e, urls: unknown) => integrations.pullRequestsByUrl(urls))

  ipcMain.handle('settings:get', () => settings.get())
  ipcMain.handle('settings:update', async (_e, patch: unknown) => {
    const next = await settings.update(patch)
    void broadcast()
    claudeExecutable = next.claudeExecutable
    home = assistantHome(next.assistantHome)
    await ensureAssistantHome(home)
    return next
  })
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataDir: app.getPath('userData'),
    projectsDir: PROJECTS_DIR,
    packaged: app.isPackaged,
    bundledClaude,
    assistantHome: home
  }))
  ipcMain.handle('app:openFolder', (_e, which: unknown) => {
    const target = which === 'data' ? app.getPath('userData') : which === 'projects' ? PROJECTS_DIR : which === 'assistant' ? home : null
    if (!target) throw new Error('unknown folder')
    return shell.openPath(target)
  })
  ipcMain.handle('app:doctor', () =>
    runDoctor({
      executable: claudeExecutable || (bundledClaude && existsSync(bundledClaude) ? bundledClaude : undefined),
      home,
      connections: () => integrations.status()
    })
  )
  let plan: { at: number; promise: Promise<PlanUsage> } | null = null
  const readPlan = (maxAgeMs: number): Promise<PlanUsage> => {
    if (plan && Date.now() - plan.at < maxAgeMs) return plan.promise
    const promise = planUsage(claudeExecutable || (bundledClaude && existsSync(bundledClaude) ? bundledClaude : undefined))
    plan = { at: Date.now(), promise }
    promise.then((u) => opts.onPlanUsage?.(u)).catch(() => {
      if (plan?.promise === promise) plan = null
    })
    return promise
  }
  ipcMain.handle('app:planUsage', () => readPlan(60_000))
  const onUnread = (_e: unknown, list: unknown) => {
    if (!Array.isArray(list)) return
    opts.onUnread?.(
      list
        .filter((x): x is { id: string; title: string } => !!x && typeof x.id === 'string' && typeof x.title === 'string')
        .slice(0, 50)
        .map((x) => ({ id: x.id.slice(0, 100), title: x.title.slice(0, 200) }))
    )
  }
  ipcMain.on('tray:unread', onUnread)
  ipcMain.handle('tray:refreshUsage', () => readPlan(0))
  const pollPlan = () =>
    void settings.get().then((s) => {
      if (s.menuBar) readPlan(0).catch(() => undefined)
    })
  const planFirst = setTimeout(pollPlan, 15_000)
  const planTick = setInterval(pollPlan, 10 * 60_000)
  let awakeId: number | null = null
  ipcMain.handle('app:keepAwake', (_e, on: unknown) => {
    if (on === true && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep')
    if (on === false && awakeId !== null) {
      powerSaveBlocker.stop(awakeId)
      awakeId = null
    }
    return awakeId !== null
  })
  ipcMain.handle('sessions:rebuild', async () => {
    await rm(join(app.getPath('userData'), 'session-index.json'), { force: true })
    store.reset()
    const items = await refresh()
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('sessions:changed', items)
    return true
  })
  ipcMain.handle('dialog:pickFiles', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const res = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    return res.canceled ? [] : res.filePaths
  })
  const planPaths = new Map<string, string>()
  ipcMain.handle('plan:save', async (_e, id: unknown, body: unknown) => {
    if (typeof id !== 'string' || typeof body !== 'string') throw new Error('invalid plan save')
    const path = planPaths.get(id)
    if (!path) throw new Error('This plan is not a file Kokpit can save; reopen the session')
    if (Buffer.byteLength(body) > 512 * 1024) throw new Error('Plan is too large')
    await writeFileAsync(path, body.endsWith('\n') ? body : `${body}\n`, 'utf8')
    return (await readFileAsync(path, 'utf8')).length
  })

  ipcMain.handle('runner:list', () => runner.list())
  ipcMain.handle('runner:start', (_e, req: unknown) => runner.start(req as never))
  ipcMain.handle('runner:send', (_e, id: unknown, text: unknown, images: unknown) => runner.send(id, text, images))
  ipcMain.handle('runner:respond', (_e, id: unknown, requestId: unknown, decision: unknown, note: unknown) =>
    runner.respond(id, requestId, decision, note)
  )
  ipcMain.handle('runner:interrupt', (_e, id: unknown) => runner.interrupt(id))
  ipcMain.handle('runner:setMode', (_e, id: unknown, mode: unknown) => runner.setMode(id, mode))

  return () => {
    clearInterval(tick)
    clearTimeout(updateFirst)
    clearInterval(updateTick)
    clearInterval(prPoll)
    clearTimeout(planFirst)
    ipcMain.removeListener('tray:unread', onUnread)
    clearInterval(planTick)
    if (timer) clearTimeout(timer)
    watcher?.close()
    ipcMain.removeHandler('sessions:list')
    ipcMain.removeHandler('sessions:detail')
    for (const ch of ['library:list', 'library:save', 'library:create', 'library:delete', 'search:query', 'runner:list', 'runner:start', 'runner:send', 'runner:respond', 'runner:interrupt', 'runner:setMode', 'integrations:status', 'integrations:connectJira', 'integrations:connectGithub', 'integrations:disconnect', 'jira:issues', 'jira:issue', 'github:prs', 'app:user', 'changes:revert', 'github:prsByUrl', 'settings:get', 'settings:update', 'app:info', 'app:openFolder', 'app:keepAwake', 'app:doctor', 'app:planUsage', 'tray:refreshUsage', 'app:testNotification', 'sessions:rebuild', 'dialog:pickFiles', 'plan:save', 'jira:comment', 'github:mine', 'github:counts', 'sessions:rename', 'sessions:delete', 'sessions:subagent', 'mcp:status', 'mcp:remove', 'mcp:logout', 'mcp:add', 'term:mcpLogin', 'term:update', 'update:get', 'update:check', 'app:relaunch', 'term:write', 'term:resize', 'term:kill'])
      ipcMain.removeHandler(ch)
    if (awakeId !== null) powerSaveBlocker.stop(awakeId)
    runner.dispose()
    terminals.dispose()
  }
}
