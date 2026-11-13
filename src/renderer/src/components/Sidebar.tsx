import { useEffect, useState } from 'react'
import type { Page } from '@shared/types'
import type { LibraryKind } from '@shared/library'
import { Icon, Kbd } from './primitives'

type NavItem = {
  id: Page
  icon: string
  label: string
  keyHint: string
  wait?: number
  count?: string
  warn?: boolean
  iconColor?: string
  title?: string
}

export type SidebarCounts = Record<LibraryKind, number> & {
  waiting: number
  jira: number
  prs: number
  connectionWarning: boolean
  jiraConnected?: boolean
  githubConnected?: boolean
  calendar?: boolean
  meetings?: number
  meeting?: { state: 'live' | 'soon'; title: string }
}

function Row({ item, active, onSelect }: { item: NavItem; active: boolean; onSelect: (p: Page) => void }) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      title={item.title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 30,
        padding: '0 8px',
        borderRadius: 7,
        background: active ? 'var(--panel)' : 'transparent',
        boxShadow: active ? '0 0 0 1px var(--line)' : 'none',
        color: active ? 'var(--tx)' : 'var(--tx2)',
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
        width: '100%'
      }}
    >
      <Icon name={item.icon} color={item.iconColor ?? (active ? 'var(--tx)' : 'var(--tx3)')} />
      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
      {!!item.wait && (
        <span
          style={{
            minWidth: 18,
            height: 18,
            padding: '0 5px',
            boxSizing: 'border-box',
            borderRadius: 9,
            background: 'var(--wait)',
            color: '#1C1B19',
            fontSize: 11,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {item.wait}
        </span>
      )}
      {item.count && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{item.count}</span>}
      {item.warn && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--wait)' }} />}
      <span style={{ font: "400 10.5px/1 'Geist Mono',monospace", color: 'var(--tx3)', width: 18, textAlign: 'right' }}>
        {item.keyHint}
      </span>
    </button>
  )
}

function KeepAwake() {
  const api = window.kokpit
  const [on, setOn] = useState(false)
  const [tip, setTip] = useState(false)
  useEffect(() => {
    void api?.keepAwake().then(setOn)
  }, [api])
  if (!api) return null
  return (
    <span style={{ position: 'relative', display: 'flex' }} onMouseEnter={() => setTip(true)} onMouseLeave={() => setTip(false)}>
      <button
        role="switch"
        aria-checked={on}
        aria-label="Keep awake"
        aria-describedby="keep-awake-tip"
        onClick={() => void api.keepAwake(!on).then(setOn)}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        className={on ? undefined : 'menu-item'}
        style={{ display: 'flex', borderRadius: 6, padding: 2, background: on ? 'var(--wait-bg)' : undefined }}
      >
        <Icon name="coffee" size={17} color={on ? 'var(--wait-tx)' : 'var(--tx3)'} />
      </button>
      <span
        id="keep-awake-tip"
        role="tooltip"
        style={{
          display: tip ? 'flex' : 'none',
          flexDirection: 'column',
          gap: 4,
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: -8,
          width: 230,
          padding: '9px 11px',
          borderRadius: 8,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--pop)',
          fontSize: 12,
          lineHeight: 1.45,
          color: 'var(--tx2)',
          zIndex: 50,
          pointerEvents: 'none'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, color: 'var(--tx)' }}>
          Keep awake
          <span style={{ fontWeight: 500, color: on ? 'var(--wait-tx)' : 'var(--tx3)' }}>{on ? 'On' : 'Off'}</span>
        </span>
        <span>Keeps your {api.platform === 'darwin' ? 'Mac' : 'computer'} awake while Kokpit is open. The screen stays on and the computer won’t sleep, so long sessions keep running.</span>
        <span style={{ color: 'var(--tx3)' }}>Click to turn {on ? 'off' : 'on'}. It turns off when you quit Kokpit.</span>
      </span>
    </span>
  )
}

export function Sidebar({
  active,
  counts,
  onSelect,
  onSearch,
  theme,
  onToggleTheme
}: {
  active: Page
  counts: SidebarCounts
  onSelect: (p: Page) => void
  onSearch: () => void
  theme: 'light' | 'dark' | 'system'
  onToggleTheme: () => void
}) {
  const work: NavItem[] = [
    { id: 'overview', icon: 'space_dashboard', label: 'Overview', keyHint: '' },
    { id: 'sessions', icon: 'forum', label: 'Sessions', keyHint: '⌘1', wait: counts.waiting },
    ...(counts.jiraConnected ? [{ id: 'jira' as const, icon: 'task_alt', label: 'Jira tasks', keyHint: '⌘2', count: String(counts.jira) }] : []),
    ...(counts.githubConnected ? [{ id: 'prs' as const, icon: 'merge', label: 'Pull requests', keyHint: '⌘3', count: String(counts.prs) }] : []),
    ...(counts.calendar
      ? [
          {
            id: 'calendar' as const,
            icon: counts.meeting?.state === 'live' ? 'videocam' : counts.meeting?.state === 'soon' ? 'notifications_active' : 'calendar_month',
            iconColor: counts.meeting?.state === 'live' ? 'var(--ok)' : counts.meeting?.state === 'soon' ? 'var(--wait)' : undefined,
            title: counts.meeting?.title,
            label: 'Calendar',
            keyHint: '',
            count: String(counts.meetings ?? 0)
          }
        ]
      : [])
  ]
  const config: NavItem[] = [
    { id: 'instructions', icon: 'description', label: 'CLAUDE.md', keyHint: '⌘4', count: String(counts.instructions) },
    { id: 'skills', icon: 'bolt', label: 'Skills', keyHint: '⌘5', count: String(counts.skills) },
    { id: 'agents', icon: 'smart_toy', label: 'Agents', keyHint: '⌘6', count: String(counts.agents) },
    { id: 'commands', icon: 'terminal', label: 'Commands', keyHint: '⌘7', count: String(counts.commands) },
    { id: 'hooks', icon: 'webhook', label: 'Hooks', keyHint: '⌘8', count: String(counts.hooks) },
    { id: 'memory', icon: 'psychology', label: 'Memory', keyHint: '⇧⌘M', count: String(counts.memory) },
    { id: 'mcp', icon: 'dns', label: 'MCP servers', keyHint: '⌘9', count: String(counts.mcp) }
  ]
  const current: Page = active === 'session' ? 'sessions' : active

  return (
    <aside
      style={{
        width: 212,
        flexShrink: 0,
        height: '100%',
        background: 'var(--side)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 10px 12px',
        fontSize: 13,
        color: 'var(--tx)'
      }}
    >
      <div
        className="drag"
        style={{ height: 54, flexShrink: 0 }}
      />
      <button
        onClick={onSearch}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 32,
          padding: '0 8px',
          border: '1px solid var(--line)',
          borderRadius: 8,
          background: 'var(--panel)',
          color: 'var(--tx3)',
          marginBottom: 16,
          textAlign: 'left'
        }}
      >
        <Icon name="search" size={17} />
        <span style={{ flex: 1 }}>Search</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {work.map((it) => (
          <Row key={it.id} item={it} active={current === it.id} onSelect={onSelect} />
        ))}
      </div>
      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--tx3)', padding: '18px 8px 6px' }}>Configure</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {config.map((it) => (
          <Row key={it.id} item={it} active={current === it.id} onSelect={onSelect} />
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <Row
        item={{ id: 'connections', icon: 'cable', label: 'Connections', keyHint: '⌘0', warn: counts.connectionWarning }}
        active={current === 'connections'}
        onSelect={onSelect}
      />
      <Row
        item={{ id: 'settings', icon: 'settings', label: 'Settings', keyHint: '⌘,' }}
        active={current === 'settings'}
        onSelect={onSelect}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '10px 8px 0',
          marginTop: 8,
          borderTop: '1px solid var(--line)'
        }}
      >
        <svg width="24" height="24" viewBox="100 100 824 824" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
          <defs>
            <linearGradient id="kokpit-logo-bg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2A2A28" />
              <stop offset="1" stopColor="#151514" />
            </linearGradient>
          </defs>
          <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#kokpit-logo-bg)" />
          <rect x="100.5" y="100.5" width="823" height="823" rx="185" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth="3" />
          <g transform="translate(228.75 228.75) scale(5.665)">
            <circle cx="50" cy="50" r="38" fill="none" stroke="#3A3A37" strokeWidth="9" strokeLinecap="round" strokeDasharray="179 239" transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r="38" fill="none" stroke="#ECEBE7" strokeWidth="9" strokeLinecap="round" strokeDasharray="112 239" transform="rotate(135 50 50)" />
            <circle cx="50" cy="50" r="9" fill="#E9B257" />
          </g>
        </svg>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, letterSpacing: '-.01em' }}>Kokpit</span>
        <KeepAwake />
        <button
          onClick={onToggleTheme}
          title={`Theme: ${theme} · click to switch`}
          aria-label={`Theme: ${theme}. Switch theme`}
          style={{ display: 'flex', borderRadius: 6, padding: 2 }}
          className="menu-item"
        >
          <Icon name={theme === 'light' ? 'light_mode' : theme === 'dark' ? 'dark_mode' : 'contrast'} size={17} color="var(--tx3)" />
        </button>
      </div>
    </aside>
  )
}
