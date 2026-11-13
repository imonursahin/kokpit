import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
import type { CreateLibraryEntry, ImportFile, ImportResult, LibraryEntry, LibraryListing } from '../shared/library'
import type { CalendarEvent, CalendarRange, ConnectionId, ConnectionInfo, GithubConnectInput, GoogleConnectInput, JiraConnectInput, JiraIssue, MyPullRequests, PullRequestInfo } from '../shared/integrations'
import type { AskDecision, ImageInput, LiveSession, RunnerEvent, RunnerMode, ModelOption, RewindResult, SlashCommandInfo, StartSession, TurnSettings } from '../shared/runner'
import type { SearchResponse } from '../shared/search'
import type { AppInfo, DoctorCheck, KokpitSettings, PlanUsage, UpdateStatus } from '../shared/settings'
import type { TrayState, TrayTarget } from '../shared/tray'
import type { RemoteSession } from '../shared/remote'
import type { PluginAction, PluginInfo, PluginScope, PluginUpdates } from '../shared/plugins'
import type { McpAddInput, McpServerInfo } from '../shared/mcp'
import type { SessionDetailData, SubagentDetail, WorkflowRun } from '../shared/sessionDetail'
import type { SessionIndexItem } from '../shared/sessionIndex'

const api = {
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  platform: process.platform,
  user: (): Promise<{ name: string; email: string }> => ipcRenderer.invoke('app:user'),
  info: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),
  openFolder: (which: 'data' | 'projects' | 'assistant'): Promise<string> => ipcRenderer.invoke('app:openFolder', which),
  keepAwake: (on?: boolean): Promise<boolean> => ipcRenderer.invoke('app:keepAwake', on),
  doctor: (): Promise<DoctorCheck[]> => ipcRenderer.invoke('app:doctor'),
  planUsage: (): Promise<PlanUsage> => ipcRenderer.invoke('app:planUsage'),
  testNotification: (): Promise<void> => ipcRenderer.invoke('app:testNotification'),
  relaunch: (): Promise<void> => ipcRenderer.invoke('app:relaunch'),
  setUnread: (list: { id: string; title: string }[]): void => ipcRenderer.send('tray:unread', list),
  tray: {
    getState: (): Promise<TrayState> => ipcRenderer.invoke('tray:getState'),
    onState: (cb: (s: TrayState) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, s: TrayState) => cb(s)
      ipcRenderer.on('tray:state', handler)
      return () => ipcRenderer.removeListener('tray:state', handler)
    },
    open: (target: TrayTarget): Promise<void> => ipcRenderer.invoke('tray:open', target),
    refreshUsage: (): Promise<unknown> => ipcRenderer.invoke('tray:refreshUsage'),
    quit: (): Promise<void> => ipcRenderer.invoke('tray:quit'),
    join: (url: string): Promise<void> => ipcRenderer.invoke('tray:join', url),
    setHeight: (h: number): void => ipcRenderer.send('tray:height', h)
  },
  updates: {
    get: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:get'),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke('update:check'),
    onStatus: (cb: (s: UpdateStatus) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, s: UpdateStatus) => cb(s)
      ipcRenderer.on('update:status', handler)
      return () => ipcRenderer.removeListener('update:status', handler)
    }
  },
  onNavigate: (cb: (target: { page: string; id?: string }) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, target: { page: string; id?: string }) => cb(target)
    ipcRenderer.on('app:navigate', handler)
    return () => ipcRenderer.removeListener('app:navigate', handler)
  },
  settings: {
    get: (): Promise<KokpitSettings> => ipcRenderer.invoke('settings:get'),
    update: (patch: Partial<KokpitSettings>): Promise<KokpitSettings> => ipcRenderer.invoke('settings:update', patch)
  },
  rebuildIndex: (): Promise<boolean> => ipcRenderer.invoke('sessions:rebuild'),
  pickFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pickFiles'),
  savePlan: (sessionId: string, body: string): Promise<number> => ipcRenderer.invoke('plan:save', sessionId, body),
  listSessions: (): Promise<SessionIndexItem[]> => ipcRenderer.invoke('sessions:list'),
  sessionDetail: (id: string, maxTurns?: number): Promise<SessionDetailData> => ipcRenderer.invoke('sessions:detail', id, maxTurns),
  subagentDetail: (id: string, agentId: string): Promise<SubagentDetail> => ipcRenderer.invoke('sessions:subagent', id, agentId),
  workflowRun: (id: string, runId: string): Promise<WorkflowRun> => ipcRenderer.invoke('sessions:workflow', id, runId),
  taskOutput: (id: string, taskId: string): Promise<{ text: string; truncated: boolean; missing: boolean; source?: string }> => ipcRenderer.invoke('sessions:taskOutput', id, taskId),
  renameSession: (sessionId: string, title: string): Promise<void> => ipcRenderer.invoke('sessions:rename', sessionId, title),
  deleteSession: (sessionId: string): Promise<void> => ipcRenderer.invoke('sessions:delete', sessionId),
  terminal: {
    mcpLogin: (name: string, cols: number, rows: number): Promise<string> => ipcRenderer.invoke('term:mcpLogin', name, cols, rows),
    update: (cols: number, rows: number): Promise<string> => ipcRenderer.invoke('term:update', cols, rows),
    write: (id: string, data: string): Promise<void> => ipcRenderer.invoke('term:write', id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> => ipcRenderer.invoke('term:resize', id, cols, rows),
    kill: (id: string): Promise<void> => ipcRenderer.invoke('term:kill', id),
    onEvent: (cb: (e: { type: 'data'; id: string; data: string } | { type: 'exit'; id: string; code: number | null }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, ev: Parameters<typeof cb>[0]) => cb(ev)
      ipcRenderer.on('term:event', handler)
      return () => ipcRenderer.removeListener('term:event', handler)
    }
  },
  remote: {
    list: (): Promise<RemoteSession[]> => ipcRenderer.invoke('remote:list'),
    start: (sessionId: string, cols: number, rows: number): Promise<{ id: string; backlog: string }> => ipcRenderer.invoke('remote:start', sessionId, cols, rows),
    attach: (sessionId: string): Promise<{ id: string; backlog: string }> => ipcRenderer.invoke('remote:attach', sessionId),
    stop: (sessionId: string): Promise<void> => ipcRenderer.invoke('remote:stop', sessionId),
    onChanged: (cb: (list: RemoteSession[]) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, list: RemoteSession[]) => cb(list)
      ipcRenderer.on('remote:changed', handler)
      return () => ipcRenderer.removeListener('remote:changed', handler)
    }
  },
  mcp: {
    status: (): Promise<McpServerInfo[]> => ipcRenderer.invoke('mcp:status'),
    remove: (name: string, scope: string, transport?: string): Promise<string> => ipcRenderer.invoke('mcp:remove', name, scope, transport),
    logout: (name: string): Promise<string> => ipcRenderer.invoke('mcp:logout', name),
    add: (input: McpAddInput): Promise<string> => ipcRenderer.invoke('mcp:add', input)
  },
  plugins: {
    list: (): Promise<PluginInfo[]> => ipcRenderer.invoke('plugins:list'),
    details: (id: string): Promise<string> => ipcRenderer.invoke('plugins:details', id),
    updates: (force?: boolean): Promise<PluginUpdates> => ipcRenderer.invoke('plugins:updates', force === true),
    act: (action: PluginAction, id: string, scope: PluginScope, projectPath: string): Promise<string> => ipcRenderer.invoke('plugins:act', action, id, scope, projectPath)
  },
  revertFile: (sessionId: string, path: string): Promise<'restored' | 'trashed'> => ipcRenderer.invoke('changes:revert', sessionId, path),
  search: (query: string): Promise<SearchResponse> => ipcRenderer.invoke('search:query', query),
  mentionFiles: (cwd: string, query: string): Promise<string[]> => ipcRenderer.invoke('files:mention', cwd, query),
  runShell: (cwd: string, command: string): Promise<{ command: string; code: number | null; output: string; truncated: boolean }> =>
    ipcRenderer.invoke('shell:run', cwd, command),
  appendMemory: (target: 'project' | 'user', cwd: string, note: string): Promise<string> => ipcRenderer.invoke('memory:append', target, cwd, note),
  runner: {
    list: (): Promise<LiveSession[]> => ipcRenderer.invoke('runner:list'),
    start: (req: StartSession): Promise<{ tempId: string }> => ipcRenderer.invoke('runner:start', req),
    send: (sessionId: string, text: string, images?: ImageInput[], settings?: TurnSettings): Promise<string> =>
      ipcRenderer.invoke('runner:send', sessionId, text, images, settings),
    respond: (sessionId: string, requestId: string, decision: AskDecision, note?: string, answers?: Record<string, string>): Promise<void> =>
      ipcRenderer.invoke('runner:respond', sessionId, requestId, decision, note, answers),
    interrupt: (sessionId: string): Promise<{ cancelled: string[] }> => ipcRenderer.invoke('runner:interrupt', sessionId),
    stopTask: (sessionId: string, taskId: string): Promise<void> => ipcRenderer.invoke('runner:stopTask', sessionId, taskId),
    commands: (cwd: string): Promise<SlashCommandInfo[]> => ipcRenderer.invoke('runner:commands', cwd),
    models: (): Promise<ModelOption[]> => ipcRenderer.invoke('runner:models'),
    cancelQueued: (sessionId: string, uuid: string): Promise<boolean> => ipcRenderer.invoke('runner:cancelQueued', sessionId, uuid),
    rewindFiles: (sessionId: string, cwd: string, uuid: string, dryRun: boolean): Promise<RewindResult> =>
      ipcRenderer.invoke('runner:rewindFiles', sessionId, cwd, uuid, dryRun),
    setMode: (sessionId: string, mode: RunnerMode): Promise<void> => ipcRenderer.invoke('runner:setMode', sessionId, mode),
    onEvent: (cb: (e: RunnerEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, ev: RunnerEvent) => cb(ev)
      ipcRenderer.on('runner:event', handler)
      return () => ipcRenderer.removeListener('runner:event', handler)
    }
  },
  integrations: {
    status: (): Promise<ConnectionInfo[]> => ipcRenderer.invoke('integrations:status'),
    connectJira: (input: JiraConnectInput): Promise<ConnectionInfo[]> => ipcRenderer.invoke('integrations:connectJira', input),
    connectGithub: (input: GithubConnectInput): Promise<ConnectionInfo[]> => ipcRenderer.invoke('integrations:connectGithub', input),
    connectGoogle: (input: GoogleConnectInput): Promise<ConnectionInfo[]> => ipcRenderer.invoke('integrations:connectGoogle', input),
    calendarEvents: (range: CalendarRange): Promise<CalendarEvent[]> => ipcRenderer.invoke('calendar:events', range),
    disconnect: (id: ConnectionId): Promise<ConnectionInfo[]> => ipcRenderer.invoke('integrations:disconnect', id),
    jiraIssues: (force?: boolean): Promise<JiraIssue[]> => ipcRenderer.invoke('jira:issues', force === true),
    jiraIssue: (key: string): Promise<JiraIssue | null> => ipcRenderer.invoke('jira:issue', key),
    pullRequests: (jiraKey: string): Promise<PullRequestInfo[]> => ipcRenderer.invoke('github:prs', jiraKey),
    myPullRequests: (force?: boolean): Promise<MyPullRequests> => ipcRenderer.invoke('github:mine', force === true),
    myPullRequestCounts: (): Promise<{ mine: number; reviews: number }> => ipcRenderer.invoke('github:counts'),
    addJiraComment: (key: string, text: string): Promise<string> => ipcRenderer.invoke('jira:comment', key, text),
    pullRequestsByUrl: (urls: string[]): Promise<PullRequestInfo[]> => ipcRenderer.invoke('github:prsByUrl', urls)
  },
  library: {
    list: (): Promise<LibraryListing> => ipcRenderer.invoke('library:list'),
    save: (absPath: string, body: string): Promise<LibraryEntry> => ipcRenderer.invoke('library:save', absPath, body),
    create: (input: CreateLibraryEntry): Promise<LibraryEntry> => ipcRenderer.invoke('library:create', input),
    createFile: (skill: string, rel: string): Promise<LibraryEntry> => ipcRenderer.invoke('library:createFile', skill, rel),
    remove: (absPath: string): Promise<void> => ipcRenderer.invoke('library:delete', absPath),
    import: (kind: 'skills' | 'agents' | 'commands', files: ImportFile[]): Promise<ImportResult> => ipcRenderer.invoke('library:import', kind, files)
  },
  onSessionsChanged: (cb: (items: SessionIndexItem[]) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, items: SessionIndexItem[]) => cb(items)
    ipcRenderer.on('sessions:changed', handler)
    return () => ipcRenderer.removeListener('sessions:changed', handler)
  }
}

contextBridge.exposeInMainWorld('kokpit', api)

export type KokpitApi = typeof api
