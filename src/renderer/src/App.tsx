import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Page } from '@shared/types'
import type { LibraryKind } from '@shared/library'
import type { SessionDetailData } from '@shared/sessionDetail'
import { Sidebar } from '@/components/Sidebar'
import { SearchPalette } from '@/components/SearchPalette'
import { SessionsPage } from '@/pages/SessionsPage'
import { JiraPage } from '@/pages/JiraPage'
import { OverviewPage } from '@/pages/OverviewPage'
import { ConnectionsPage } from '@/pages/ConnectionsPage'
import { RealSessionDetailPage, SessionDetailPage } from '@/pages/SessionDetailPage'
import { useSessionDetail } from '@/data/useSessionDetail'
import { LibraryPage } from '@/pages/LibraryPage'
import { PullRequestsPage } from '@/pages/PullRequestsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { McpPage } from '@/pages/McpPage'
import { EFFORT_CHOICES, MODEL_CHOICES, type KokpitSettings } from '@shared/settings'
import { useSessions } from '@/data/useSessions'
import { useTheme } from '@/data/theme'
import { useRunner } from '@/data/useRunner'
import { useConfigCounts } from '@/data/useCounts'
import { NewSessionDialog } from '@/components/NewSessionDialog'
import type { SearchResult } from '@/mock/search'

const PAGE_KEYS: Record<string, Page> = {
  '1': 'sessions',
  '2': 'jira',
  '3': 'prs',
  '4': 'instructions',
  '5': 'skills',
  '6': 'agents',
  '7': 'commands',
  '8': 'hooks',
  '9': 'mcp',
  '0': 'connections',
  ',': 'settings'
}

function Placeholder({ title }: { title: string }) {
  return (
    <main
      className="drag"
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx3)' }}
    >
      {title}
    </main>
  )
}

export function App() {
  const [page, setPage] = useState<Page>('overview')
  const [theme, toggleTheme, setTheme] = useTheme()
  const [settings, setSettings] = useState<KokpitSettings | null>(null)
  useEffect(() => {
    void window.kokpit?.settings.get().then(setSettings)
  }, [])
  const updateSettings = useCallback(async (patch: Partial<KokpitSettings>) => {
    const api = window.kokpit
    if (!api) return
    setSettings(await api.settings.update(patch))
  }, [])
  const config = useConfigCounts(page, settings?.githubRefreshMinutes ?? 1, settings?.includeDraftReviews ?? true)
  const { items, sessions, state, error, footer, retry } = useSessions(settings?.showHeadless ?? false)
  const [archived, setArchived] = useState<Set<string>>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('kokpit.archived') ?? '[]')
      return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [])
    } catch {
      return new Set()
    }
  })
  const [openId, setOpenId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [libSelect, setLibSelect] = useState<{ kind: LibraryKind; path: string } | null>(null)
  const [newSession, setNewSession] = useState<{ jiraKey?: string } | null>(null)
  const runner = useRunner()
  const effectiveId = openId ? (runner.sessionIdFor(openId) ?? openId) : null
  const openItem = items.find((i) => i.id === effectiveId)
  const live = effectiveId ? runner.live.get(effectiveId) : undefined
  const detail = useSessionDetail(
    page === 'session' ? effectiveId : null,
    `${openItem?.lastAt ?? ''}:${openItem?.status ?? ''}:${openItem?.title ?? ''}:${live?.state ?? ''}:${live?.pending.length ?? 0}`
  )


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey) return
      if (e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        setSearchOpen(false)
        setLibSelect(null)
        setPage('memory')
        return
      }
      const target = PAGE_KEYS[e.key]
      if (target) {
        e.preventDefault()
        setSearchOpen(false)
        setLibSelect(null)
        setPage(target)
      } else if (e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      } else if (e.key === 'n') {
        e.preventDefault()
        setNewSession({})
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [seen, setSeen] = useState<Record<string, string> | null>(() => {
    try {
      const raw: unknown = JSON.parse(localStorage.getItem('kokpit.seen') ?? 'null')
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, string>) : null
    } catch {
      return null
    }
  })
  const markSeen = useCallback((updates: Record<string, string>) => {
    setSeen((prev) => {
      const next = { ...(prev ?? {}), ...updates }
      const entries = Object.entries(next)
      const trimmed = entries.length > 3000 ? Object.fromEntries(entries.slice(-3000)) : next
      localStorage.setItem('kokpit.seen', JSON.stringify(trimmed))
      return trimmed
    })
  }, [])
  useEffect(() => {
    if (seen === null && items.length) markSeen(Object.fromEntries(items.map((i) => [i.id, i.lastAt])))
  }, [seen, items, markSeen])
  useEffect(() => {
    if (page === 'session' && openItem && seen && (seen[openItem.id] ?? '') < openItem.lastAt) markSeen({ [openItem.id]: openItem.lastAt })
  }, [page, openItem, seen, markSeen])

  const visible = useMemo(() => {
    const lastAt = new Map(items.map((i) => [i.id, i.lastAt]))
    return sessions
      .filter((s) => !archived.has(s.id))
      .map((s) => {
        const at = lastAt.get(s.id) ?? ''
        return seen && s.status === 'done' && (seen[s.id] ?? '') < at ? { ...s, unread: true } : s
      })
  }, [sessions, archived, items, seen])

  const counts = useMemo(
    () => ({
      ...config,
      waiting: visible.filter((s) => s.status === 'waiting').length,
      prs: config.prs ?? 0
    }),
    [visible, config, items]
  )

  const unreadKey = useMemo(() => JSON.stringify(visible.filter((s) => s.unread).map((s) => ({ id: s.id, title: s.title }))), [visible])
  useEffect(() => window.kokpit?.setUnread(JSON.parse(unreadKey) as { id: string; title: string }[]), [unreadKey])

  const open = useCallback((id: string) => {
    setOpenId(id)
    setPage('session')
  }, [])
  useEffect(
    () =>
      window.kokpit?.onNavigate((t) => {
        if (t.page === 'session' && t.id) open(t.id)
        else if (t.page === 'prs' || t.page === 'overview') setPage(t.page)
      }),
    [open]
  )
  const archive = useCallback(
    (id: string) =>
      setArchived((prev) => {
        const next = new Set(prev).add(id)
        localStorage.setItem('kokpit.archived', JSON.stringify([...next].slice(-2000)))
        return next
      }),
    []
  )
  const noop = useCallback(() => {}, [])

  const openResult = useCallback(
    (r: SearchResult) => {
      setSearchOpen(false)
      if (r.type === 'session') return open(r.sessionId ?? r.id)
      const kind: LibraryKind = r.libraryKind ?? (r.type === 'skill' ? 'skills' : r.type === 'agent' ? 'agents' : 'instructions')
      setLibSelect(r.absPath ? { kind, path: r.absPath } : null)
      setPage(kind)
    },
    [open]
  )

  let main: React.ReactNode
  switch (page) {
    case 'overview':
      main = (
        <OverviewPage
          sessions={visible}
          items={items}
          onOpen={open}
          onAllow={(id) => {
            const ask = runner.live.get(id)?.pending[0]
            if (ask) void runner.respond(id, ask.requestId, 'allow')
            else open(id)
          }}
          onNew={() => setNewSession({})}
          onGo={setPage}
        />
      )
      break
    case 'sessions':
      main = (
        <SessionsPage
          sessions={visible}
          state={state}
          errorDetail={error}
          footer={footer}
          onOpen={open}
          onAllow={(id) => {
            const ask = runner.live.get(id)?.pending[0]
            if (ask) void runner.respond(id, ask.requestId, 'allow')
            else open(id)
          }}
          onArchive={archive}
          onNew={() => setNewSession({})}
          onPickJira={() => setPage('jira')}
          onRetry={retry}
          onViewLogs={noop}
        />
      )
      break
    case 'jira':
      main = <JiraPage onOpenSession={open} onNewSession={(key) => setNewSession({ jiraKey: key })} onConnect={() => setPage('connections')} />
      break
    case 'connections':
      main = <ConnectionsPage />
      break
    case 'settings':
      main = <SettingsPage theme={theme} onTheme={setTheme} settings={settings} onSettings={updateSettings} />
      break
    case 'prs':
      main = window.kokpit ? (
        <PullRequestsPage
          items={items}
          onOpenSession={open}
          onConnect={() => setPage('connections')}
          refreshMinutes={settings?.githubRefreshMinutes ?? 1}
          includeDraftReviews={settings?.includeDraftReviews ?? true}
        />
      ) : (
        <Placeholder title="Pull requests" />
      )
      break
    case 'instructions':
    case 'skills':
    case 'agents':
    case 'commands':
    case 'hooks':
    case 'memory':
      main = <LibraryPage key={page} kind={page} selectPath={libSelect?.kind === page ? libSelect.path : undefined} />
      break
    case 'mcp':
      main = window.kokpit ? (
        <McpPage fileEditor={<LibraryPage key="mcp" kind="mcp" selectPath={libSelect?.kind === 'mcp' ? libSelect.path : undefined} />} />
      ) : (
        <LibraryPage key="mcp" kind="mcp" />
      )
      break
    case 'session': {
      const s = visible.find((x) => x.id === openId)
      const mode = s?.status === 'waiting' ? 'approval' : /^(plan|research)\b/i.test(s?.title ?? '') ? 'plan' : 'code'
      if (!window.kokpit) {
        main = <SessionDetailPage key={`${openId}-${mode}`} mode={mode} onBack={() => setPage('sessions')} />
      } else if ((detail.data || live) && effectiveId) {
        const id = effectiveId
        const data: SessionDetailData = detail.data ?? {
          id,
          header: {
            title: live?.title ?? 'New session',
            status: 'running',
            elapsed: '',
            cost: `$${(live?.costUsd ?? 0).toFixed(2)}`,
            repo: live?.cwd.split('/').pop() ?? '',
            branch: ''
          },
          turns: [],
          earlierCount: 0,
          model: MODEL_CHOICES.find((m) => m.id === live?.model)?.label ?? live?.model ?? '',
          running: false,
          files: [],
          filesSource: 'none',
          filesRoot: null
        }
        main = (
          <RealSessionDetailPage
            key={data.id}
            data={data}
            live={live}
            onBack={() => setPage('sessions')}
            onSend={async (text, opts) => {
              if (runner.live.has(id) || live) await runner.send(live?.sessionId ?? id, text)
              else
                await runner.start({
                  cwd: openItem?.cwd ?? '',
                  prompt: text,
                  resumeId: id,
                  model: opts?.model ?? settings?.defaultModel,
                  effort: (EFFORT_CHOICES as string[]).includes(opts?.effort ?? '')
                    ? (opts?.effort as KokpitSettings['defaultEffort'])
                    : settings?.defaultEffort
                })
            }}
            modelOptions={MODEL_CHOICES}
            effortOptions={EFFORT_CHOICES}
            defaultEffort={settings?.defaultEffort}
            onAttach={() => window.kokpit?.pickFiles() ?? Promise.resolve([])}
            onRename={detail.data ? (title) => window.kokpit?.renameSession(id, title) ?? Promise.resolve() : undefined}
            onDelete={
              detail.data
                ? async () => {
                    await window.kokpit?.deleteSession(id)
                    setOpenId(null)
                    setPage('sessions')
                  }
                : undefined
            }
            onSavePlan={async (body) => {
              await window.kokpit?.savePlan(id, body)
            }}
            onAddToJira={(body) => {
              const key = openItem?.jira
              if (!key) return Promise.reject(new Error('This session has no Jira task'))
              return window.kokpit?.integrations.addJiraComment(key, body) ?? Promise.reject(new Error('Not available'))
            }}
            onStop={() => void runner.interrupt(id)}
            onRespond={(requestId, decision) => void runner.respond(id, requestId, decision)}
            onRevert={(path) => window.kokpit?.revertFile(id, path) ?? Promise.reject(new Error('Not available'))}
          />
        )
      } else {
        const starting = !!openId?.startsWith('pending-') || (live && !openItem)
        main = (
          <Placeholder
            title={starting ? 'Starting session…' : detail.error ? `Could not open this session: ${detail.error}` : 'Loading session…'}
          />
        )
      }
      break
    }
    default:
      main = <Placeholder title={page} />
  }

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--panel)', color: 'var(--tx)', fontSize: 13, position: 'relative' }}>
      <Sidebar
        active={page}
        counts={counts}
        onSelect={(p) => {
          setSearchOpen(false)
          setLibSelect(null)
          setPage(p)
        }}
        onSearch={() => setSearchOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
      {main}
      {newSession && (
        <NewSessionDialog
          jiraKey={newSession.jiraKey}
          defaultModel={settings?.defaultModel}
          defaultEffort={settings?.defaultEffort}
          onClose={() => setNewSession(null)}
          onStarted={(tempId) => {
            setNewSession(null)
            open(tempId)
          }}
        />
      )}
      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} onOpenResult={openResult} />}
    </div>
  )
}
