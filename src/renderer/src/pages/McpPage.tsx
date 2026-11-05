import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { McpAddInput, McpServerInfo, McpStatus } from '@shared/mcp'
import { Icon, PrimaryButton } from '@/components/primitives'
import { TerminalModal } from '@/components/TerminalModal'

const MONO = "'Geist Mono',monospace"
const COLS = 'minmax(0,1fr) 128px 96px 320px'

const STATUS: Record<McpStatus, { label: string; color: string; bg: string; icon: string }> = {
  connected: { label: 'Connected', color: 'var(--ok)', bg: 'var(--ok-bg)', icon: 'check_circle' },
  'needs-auth': { label: 'Needs login', color: 'var(--wait-tx)', bg: 'var(--wait-bg)', icon: 'key' },
  failed: { label: 'Failed', color: 'var(--err)', bg: 'var(--err-bg)', icon: 'error' },
  pending: { label: 'Connecting', color: 'var(--run)', bg: 'var(--run-bg)', icon: 'progress_activity' },
  disabled: { label: 'Disabled', color: 'var(--tx3)', bg: 'var(--hover)', icon: 'block' }
}

const SOURCE_LABEL: Record<string, string> = {
  user: 'User',
  local: 'Local',
  project: 'Project',
  claudeai: 'claude.ai',
  plugin: 'Plugin',
  managed: 'Managed',
  enterprise: 'Managed',
  dynamic: 'Plugin'
}

function Chip({ status }: { status: McpStatus }) {
  const s = STATUS[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        padding: '0 9px 0 7px',
        borderRadius: 11,
        background: s.bg,
        color: s.color,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap'
      }}
    >
      <Icon name={s.icon} size={14} color={s.color} />
      {s.label}
    </span>
  )
}

function Action({ children, onClick, danger, busy }: { children: ReactNode; onClick: () => void; danger?: boolean; busy?: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={busy}
      style={{
        height: 28,
        padding: '0 10px',
        borderRadius: 7,
        border: '1px solid var(--line)',
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: danger ? 'var(--err)' : 'var(--tx)',
        opacity: busy ? 0.5 : 1
      }}
    >
      {children}
    </button>
  )
}

function Confirm({ title, body, action, onCancel, onConfirm }: { title: string; body: ReactNode; action: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140, zIndex: 50 }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        style={{ width: 460, background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--pop)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)' }}>{body}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
          <button autoFocus onClick={onCancel} style={{ height: 32, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, background: 'var(--err)', color: '#fff' }}>
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDialog({ onCancel, onAdd }: { onCancel: () => void; onAdd: (input: McpAddInput) => Promise<void> }) {
  const [input, setInput] = useState<McpAddInput>({ name: '', transport: 'http', target: '', scope: 'user' })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const field = { height: 34, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--panel)', color: 'var(--tx)', font: `13px ${MONO}` } as const
  const submit = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    onAdd(input)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  return (
    <div
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 110, zIndex: 50 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel()
          if (e.key === 'Enter' && e.metaKey) submit()
        }}
        style={{ width: 520, background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--pop)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>Add MCP server</div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500 }}>
          Name
          <input autoFocus value={input.name} placeholder="sentry" onChange={(e) => setInput({ ...input, name: e.target.value })} style={field} />
        </label>
        <div style={{ display: 'flex', gap: 10 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, flex: 1 }}>
            Type
            <select value={input.transport} onChange={(e) => setInput({ ...input, transport: e.target.value as McpAddInput['transport'] })} style={field}>
              <option value="http">HTTP</option>
              <option value="sse">SSE</option>
              <option value="stdio">Command (stdio)</option>
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500, flex: 1 }}>
            Scope
            <select value={input.scope} onChange={(e) => setInput({ ...input, scope: e.target.value as McpAddInput['scope'] })} style={field}>
              <option value="user">User · every project</option>
              <option value="local">Local · home folder only</option>
            </select>
          </label>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, fontWeight: 500 }}>
          {input.transport === 'stdio' ? 'Command' : 'URL'}
          <input
            value={input.target}
            placeholder={input.transport === 'stdio' ? 'npx -y @modelcontextprotocol/server-github' : 'https://mcp.example.com/mcp'}
            onChange={(e) => setInput({ ...input, target: e.target.value })}
            style={field}
          />
        </label>
        {error && <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ height: 32, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}>
            Cancel
          </button>
          <PrimaryButton hint="⌘↵" onClick={submit} style={{ borderRadius: 7, fontSize: 12.5 }}>
            {busy ? 'Adding…' : 'Add server'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

export function McpPage({ fileEditor }: { fileEditor: ReactNode }) {
  const api = window.kokpit
  const [tab, setTab] = useState<'servers' | 'file'>('servers')
  const [servers, setServers] = useState<McpServerInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [removing, setRemoving] = useState<McpServerInfo | null>(null)
  const [adding, setAdding] = useState(false)
  const [loginFor, setLoginFor] = useState<string | null>(null)
  const startLogin = useCallback(
    (cols: number, rows: number) => (loginFor && api ? api.terminal.mcpLogin(loginFor, cols, rows) : Promise.reject(new Error('Not available'))),
    [api, loginFor]
  )
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)

  useEffect(() => {
    if (!api) return
    const mine = ++request.current
    setLoading(true)
    setError(null)
    api.mcp
      .status()
      .then((list) => mine === request.current && setServers(list))
      .catch((err: Error) => mine === request.current && setError(err.message))
      .finally(() => mine === request.current && setLoading(false))
  }, [api, attempt])

  const act = (name: string, run: () => Promise<string>, ok: string, refresh = true) => {
    setBusy(name)
    setMsg(null)
    run()
      .then(() => {
        setMsg({ tone: 'ok', text: ok })
        if (refresh) setAttempt((a) => a + 1)
      })
      .catch((err: Error) => setMsg({ tone: 'err', text: err.message }))
      .finally(() => setBusy(null))
  }

  const connected = servers?.filter((s) => s.status === 'connected').length ?? 0

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
      <div className="drag" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '22px 28px 4px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>MCP servers</h1>
        <span style={{ flex: 1 }} />
        {tab === 'servers' && (
          <>
            <button
              onClick={() => setAttempt((a) => a + 1)}
              disabled={loading}
              aria-busy={loading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px 0 8px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5, color: loading ? 'var(--tx3)' : 'var(--tx2)' }}
            >
              <Icon name="refresh" size={17} color={loading ? 'var(--run)' : 'var(--tx2)'} style={loading ? { animation: 'dcspin .9s linear infinite' } : undefined} />
              {loading ? 'Checking…' : 'Refresh'}
            </button>
            <PrimaryButton icon="add" onClick={() => setAdding(true)}>
              Add server
            </PrimaryButton>
          </>
        )}
      </div>
      <div style={{ padding: '0 28px 12px', fontSize: 12.5, color: 'var(--tx3)' }}>
        The servers every Kokpit session connects to{servers ? ` · ${connected} of ${servers.length} connected` : ''}
      </div>
      <div style={{ display: 'flex', gap: 2, padding: 2, margin: '0 28px 12px', alignSelf: 'flex-start', background: 'var(--hover)', borderRadius: 8, fontSize: 12.5, color: 'var(--tx2)' }}>
        {(
          [
            ['servers', 'Connected servers'],
            ['file', 'Kokpit .mcp.json']
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              ...(tab === id ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)', fontWeight: 500, color: 'var(--tx)' } : {})
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'file' ? (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', borderTop: '1px solid var(--line)' }}>{fileEditor}</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', borderTop: '1px solid var(--line)' }}>
          <div style={{ height: 2, background: loading ? 'var(--run-bg)' : 'transparent', position: 'relative', overflow: 'hidden' }}>
            {loading && <div className="kokpit-progress" />}
          </div>
          {msg && <div style={{ padding: '10px 28px', fontSize: 12.5, color: msg.tone === 'err' ? 'var(--err)' : 'var(--ok)' }}>{msg.text}</div>}
          {error && <div style={{ padding: '14px 28px', fontSize: 12.5, color: 'var(--err)' }}>{error}</div>}
          {!servers && !error && <div style={{ padding: '14px 28px', fontSize: 12.5, color: 'var(--tx3)' }}>Checking servers… this starts Claude briefly and takes a few seconds.</div>}
          {servers && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: COLS,
                columnGap: 16,
                padding: '8px 28px',
                fontSize: 11.5,
                color: 'var(--tx3)',
                borderBottom: '1px solid var(--line)'
              }}
            >
              <span>Server</span>
              <span>Status</span>
              <span>Source</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>
          )}
          {servers?.map((s) => (
            <div
              key={`${s.source}:${s.name}`}
              style={{
                display: 'grid',
                gridTemplateColumns: COLS,
                columnGap: 16,
                alignItems: 'center',
                padding: '12px 28px',
                borderBottom: '1px solid var(--line-soft)',
                opacity: busy === s.name ? 0.6 : 1
              }}
            >
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontWeight: 500, fontSize: 13.5 }}>{s.name}</span>
                <span className="selectable" style={{ font: `11.5px ${MONO}`, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[s.transport, s.target, s.status === 'connected' ? `${s.tools} tools` : ''].filter(Boolean).join(' · ')}
                </span>
                {s.error && <span style={{ fontSize: 12, color: 'var(--err)' }}>{s.error}</span>}
              </div>
              <div>
                <Chip status={s.status} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--tx2)' }}>{SOURCE_LABEL[s.source] ?? SOURCE_LABEL[s.scope] ?? s.source}</span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', minWidth: 0 }}>
                {s.canLogin && (
                  <Action
                    busy={busy === s.name}
                    onClick={() => {
                      setMsg(null)
                      setLoginFor(s.name)
                    }}
                  >
                    {s.status === 'needs-auth' ? 'Log in' : 'Re-authenticate'}
                  </Action>
                )}
                {s.canLogin && s.status === 'connected' && (
                  <Action busy={busy === s.name} onClick={() => act(s.name, () => api!.mcp.logout(s.name), `${s.name}: logged out`)}>
                    Log out
                  </Action>
                )}
                {s.removable ? (
                  <Action danger busy={busy === s.name} onClick={() => setRemoving(s)}>
                    Remove
                  </Action>
                ) : (
                  <span
                    title={s.source === 'claudeai' ? 'Connect and disconnect it on claude.ai' : 'Managed by a plugin or your organisation'}
                    style={{ fontSize: 12, color: 'var(--tx3)', alignSelf: 'center', whiteSpace: 'nowrap' }}
                  >
                    {s.source === 'claudeai' ? 'Managed on claude.ai' : 'Managed by plugin'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {removing && (
        <Confirm
          title={`Remove ${removing.name}?`}
          action="Remove server"
          body={
            <>
              Removes <span style={{ font: `12px ${MONO}`, color: 'var(--tx)' }}>{removing.name}</span> from every Claude Code scope it is in (user, local,
              project){removing.transport === 'http' || removing.transport === 'sse' ? ' and deletes its saved login' : ''}. Every session, in Kokpit and in the
              terminal, stops connecting to it.
            </>
          }
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const s = removing
            setRemoving(null)
            act(s.name, () => api!.mcp.remove(s.name, s.source === 'user' || s.source === 'local' || s.source === 'project' ? s.source : s.scope, s.transport), `${s.name} removed`)
          }}
        />
      )}
      {loginFor && (
        <TerminalModal
          title={`Sign in to ${loginFor}`}
          start={startLogin}
          onClose={(code) => {
            const name = loginFor
            setLoginFor(null)
            if (code === 0) setMsg({ tone: 'ok', text: `${name}: signed in` })
            setAttempt((a) => a + 1)
          }}
        />
      )}
      {adding && (
        <AddDialog
          onCancel={() => setAdding(false)}
          onAdd={async (input) => {
            await api!.mcp.add(input)
            setAdding(false)
            setMsg({ tone: 'ok', text: `${input.name} added` })
            setAttempt((a) => a + 1)
          }}
        />
      )}
    </main>
  )
}
