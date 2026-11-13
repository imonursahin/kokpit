import { useEffect, useMemo, useRef, useState } from 'react'
import type { PluginAction, PluginInfo, PluginInstall, PluginUpdate, PluginUpdates } from '@shared/plugins'
import { relativeTime } from '@shared/time'
import { Icon } from '@/components/primitives'
import { Action, Confirm } from './McpPage'
import { PLUGINS_CHANGED } from '@/data/useCounts'

const MONO = "'Geist Mono',monospace"

const base = (p: string) => p.split('/').filter(Boolean).pop() ?? p

export function placeLabel(i: PluginInstall): string {
  if (i.scope === 'user') return 'Every project'
  if (i.scope === 'managed') return 'Managed'
  return base(i.projectPath)
}

const placePhrase = (i: PluginInstall) => (i.scope === 'user' ? 'every project' : i.scope === 'managed' ? 'the managed install' : `the ${base(i.projectPath)} project`)

export function onSummary(p: PluginInfo): { text: string; tone: 'on' | 'off' | 'some' } {
  const on = p.installs.filter((i) => i.enabled).length
  if (on === 0) return { text: 'Off', tone: 'off' }
  if (on === p.installs.length) return { text: 'On', tone: 'on' }
  return { text: `On in ${on} of ${p.installs.length}`, tone: 'some' }
}

export function splitActive(list: PluginInfo[]): { active: PluginInfo[]; inactive: PluginInfo[] } {
  return { active: list.filter((p) => p.installs.some((i) => i.enabled)), inactive: list.filter((p) => !p.installs.some((i) => i.enabled)) }
}

export type PluginContents = { description: string; parts: { label: string; items: string[] }[]; alwaysOn: string }

export function parseDetails(text: string): PluginContents | null {
  const description = /^\s*Description:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? ''
  const parts: PluginContents['parts'] = []
  for (const m of text.matchAll(/^\s{2}(Skills|Agents|Hooks|MCP servers|LSP servers|Commands) \((\d+)\)(.*)$/gm)) {
    const count = Number(m[2])
    if (!count) continue
    const items = (m[3] ?? '')
      .replace(/\(.*\)\s*$/, '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
    parts.push({ label: m[1] ?? '', items: items.length ? items : [`${count}`] })
  }
  const alwaysOn = /Always-on:\s*(~?[\d,.]+k?\s*tok)/.exec(text)?.[1]?.replace(/\s*tok$/, ' tokens') ?? ''
  return description || parts.length || alwaysOn ? { description, parts, alwaysOn } : null
}

const DOT = { on: 'var(--ok)', off: 'var(--line)', some: 'var(--run)' } as const
const VERB: Record<PluginAction, string> = { enable: 'turned on', disable: 'turned off', update: 'updated', uninstall: 'uninstalled' }

function Contents({ id }: { id: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    setText(null)
    setError('')
    window.kokpit?.plugins
      .details(id)
      .then((t) => alive && setText(t))
      .catch((err: Error) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [id])
  if (error) return <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{error}</div>
  if (text === null) return <div style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Loading what the plugin adds…</div>
  const c = parseDetails(text)
  if (!c)
    return (
      <pre className="selectable" style={{ margin: 0, font: `12px/1.55 ${MONO}`, color: 'var(--tx2)', whiteSpace: 'pre-wrap' }}>
        {text}
      </pre>
    )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {c.description && <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--tx2)' }}>{c.description}</p>}
      {c.parts.map((p) => (
        <div key={p.label} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>
            {p.label} <span style={{ fontWeight: 400, color: 'var(--tx3)' }}>{p.items.length}</span>
          </span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {p.items.map((it) => (
              <span key={it} style={{ height: 24, display: 'inline-flex', alignItems: 'center', padding: '0 9px', borderRadius: 6, background: 'var(--hover)', font: `12px ${MONO}`, color: 'var(--tx)' }}>
                {it}
              </span>
            ))}
          </span>
        </div>
      ))}
      {c.alwaysOn && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>Adds about {c.alwaysOn} to every session.</span>}
    </div>
  )
}

export function PluginsPage() {
  const api = window.kokpit
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [removing, setRemoving] = useState<{ plugin: PluginInfo; install: PluginInstall } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef(0)
  const [updates, setUpdates] = useState<PluginUpdates | null>(null)
  const [checking, setChecking] = useState(false)
  const forceCheck = useRef(false)
  const updateOf = (p: PluginInfo, i: PluginInstall): PluginUpdate | undefined => updates?.items.find((u) => u.id === p.id && u.scope === i.scope && u.projectPath === i.projectPath)

  useEffect(() => {
    if (!api) return
    let alive = true
    const force = forceCheck.current
    forceCheck.current = false
    setChecking(true)
    api.plugins
      .updates(force)
      .then((u) => alive && setUpdates(u))
      .catch((err: Error) => alive && setUpdates({ checkedAt: '', refreshError: err.message, items: [] }))
      .finally(() => alive && setChecking(false))
    return () => {
      alive = false
    }
  }, [api, attempt])

  useEffect(() => {
    if (!api) return
    const mine = ++request.current
    setLoading(true)
    setError(null)
    api.plugins
      .list()
      .then((list) => {
        if (mine !== request.current) return
        setPlugins(list)
        window.dispatchEvent(new CustomEvent(PLUGINS_CHANGED, { detail: splitActive(list).active.length }))
      })
      .catch((err: Error) => mine === request.current && setError(err.message))
      .finally(() => mine === request.current && setLoading(false))
  }, [api, attempt])

  const act = (action: PluginAction, p: PluginInfo, i: PluginInstall) => {
    const key = `${p.id}:${i.scope}:${i.projectPath}`
    setBusy(key)
    setMsg(null)
    api!.plugins
      .act(action, p.id, i.scope, i.projectPath)
      .then(() => {
        setMsg({ tone: 'ok', text: `${p.name} ${VERB[action]}. New sessions pick this up.` })
        setAttempt((a) => a + 1)
      })
      .catch((err: Error) => setMsg({ tone: 'err', text: err.message }))
      .finally(() => setBusy(null))
  }

  const sorted = useMemo(() => [...(plugins ?? [])].sort((a, b) => a.name.localeCompare(b.name) || a.marketplace.localeCompare(b.marketplace)), [plugins])
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return splitActive(q ? sorted.filter((p) => p.id.toLowerCase().includes(q)) : sorted)
  }, [sorted, filter])
  const sel = sorted.find((p) => p.id === selected) ?? shown.active[0] ?? shown.inactive[0]
  const none = !shown.active.length && !shown.inactive.length

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', background: 'var(--panel)' }}>
      <section style={{ width: 360, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <div className="drag" style={{ padding: '22px 16px 10px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Plugins</h1>
          {plugins && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{plugins.length}</span>}
          <span style={{ flex: 1 }} />
          <button
            aria-label="Refresh"
            title="Refresh"
            onClick={() => {
              forceCheck.current = true
              setAttempt((a) => a + 1)
            }}
            disabled={loading || checking}
            style={{ display: 'flex', alignItems: 'center', height: 28, padding: '0 8px', borderRadius: 7, border: '1px solid var(--line)' }}
          >
            <Icon name="refresh" size={17} color={loading ? 'var(--run)' : 'var(--tx2)'} style={loading ? { animation: 'dcspin .9s linear infinite' } : undefined} />
          </button>
        </div>
        <div style={{ padding: '0 20px 8px', fontSize: 12, color: updates?.refreshError ? 'var(--err)' : 'var(--tx3)' }}>
          {checking
            ? 'Checking marketplaces for updates… this can take a minute'
            : updates?.refreshError
              ? `Could not refresh marketplaces: ${updates.refreshError}`
              : updates
                ? `${new Set(updates.items.filter((u) => u.state === 'outdated').map((u) => u.id)).size} with an update · checked ${relativeTime(updates.checkedAt, Date.now())}`
                : ''}
        </div>
        <div style={{ padding: '0 16px 10px 20px' }}>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name"
            aria-label="Filter plugins"
            style={{ width: '100%', boxSizing: 'border-box', height: 30, padding: '0 10px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--panel)', color: 'var(--tx)', fontSize: 12.5 }}
          />
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && (
            <div className="selectable" style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--err)' }}>
              {error}
            </div>
          )}
          {!plugins && !error && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>Reading plugins…</div>}
          {plugins && none && <div style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>{filter ? 'No plugin matches the filter.' : 'No plugins installed.'}</div>}
          {(
            [
              ['Active', shown.active],
              ['Inactive', shown.inactive]
            ] as const
          ).map(([label, list]) =>
            list.length ? (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px 6px', fontSize: 11.5, fontWeight: 600, color: 'var(--tx3)' }}>
                  {label} · {list.length}
                  <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
                </div>
                {list.map((p) => {
                  const s = onSummary(p)
                  const on = p.id === sel?.id
                  return (
                    <button
                      key={p.id}
                      className="menu-item"
                      onClick={() => {
                        if (p.id !== sel?.id) setMsg(null)
                        setSelected(p.id)
                      }}
                      style={{ flexShrink: 0, padding: '9px 12px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', ...(on ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)' } : {}) }}
                    >
                      <span title={s.text} style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[s.tone], flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      {p.installs.some((i) => updateOf(p, i)?.state === 'outdated') && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--run)', background: 'var(--run-bg)', borderRadius: 9, padding: '1px 7px' }}>Update</span>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{s.text}</span>
                    </button>
                  )
                })}
              </div>
            ) : null
          )}
        </div>
      </section>

      <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '26px 32px' }}>
        {msg && (
          <div className="selectable" style={{ marginBottom: 16, fontSize: 12.5, color: msg.tone === 'err' ? 'var(--err)' : 'var(--ok)' }}>
            {msg.text}
          </div>
        )}
        {sel && (
          <div key={sel.id} style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 760 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>{sel.name}</span>
              <span className="selectable" style={{ fontSize: 12.5, color: 'var(--tx3)' }}>
                from {sel.marketplace} · {[...new Set(sel.installs.map((i) => i.version).filter(Boolean))].join(', ') || 'no version'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>Installed in</span>
              <div style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                {sel.installs.map((i, n) => {
                  const key = `${sel.id}:${i.scope}:${i.projectPath}`
                  const u = updateOf(sel, i)
                  return (
                    <div
                      key={key}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: n ? '1px solid var(--line-soft)' : 'none', opacity: busy === key ? 0.55 : 1 }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: i.enabled ? 'var(--ok)' : 'var(--line)', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span title={i.projectPath || undefined} style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {placeLabel(i)}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
                          {[i.enabled ? 'On' : 'Off', i.version, i.lastUpdated && `updated ${relativeTime(i.lastUpdated, Date.now())}`].filter(Boolean).join(' · ')}
                          {u?.state === 'outdated' && <span style={{ color: 'var(--run)', fontWeight: 500 }}> · {u.latest} available</span>}
                        </span>
                      </span>
                      <Action busy={busy === key} onClick={() => act(i.enabled ? 'disable' : 'enable', sel, i)}>
                        {i.enabled ? 'Turn off' : 'Turn on'}
                      </Action>
                      <Action
                        busy={busy === key}
                        disabled={checking || u?.state === 'current'}
                        title={checking ? 'Checking for updates…' : u?.state === 'current' ? 'Already the latest version' : u?.state === 'outdated' ? `Update to ${u.latest}` : 'Could not tell if there is a newer version'}
                        onClick={() => act('update', sel, i)}
                      >
                        Update
                      </Action>
                      <Action danger busy={busy === key} onClick={() => setRemoving({ plugin: sel, install: i })}>
                        Uninstall
                      </Action>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx2)' }}>What it adds</span>
              <Contents id={sel.id} />
            </div>
          </div>
        )}
      </section>

      {removing && (
        <Confirm
          title={`Uninstall ${removing.plugin.name}?`}
          action="Uninstall"
          body={
            <>
              Removes <span style={{ font: `12px ${MONO}`, color: 'var(--tx)' }}>{removing.plugin.id}</span> from {placePhrase(removing.install)}. Its skills, agents,
              hooks and MCP servers stop loading in new sessions there. You can install it again from its marketplace.
            </>
          }
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            const r = removing
            setRemoving(null)
            act('uninstall', r.plugin, r.install)
          }}
        />
      )}
    </main>
  )
}
