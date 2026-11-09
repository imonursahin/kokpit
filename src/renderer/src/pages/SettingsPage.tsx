import { useEffect, useState, type ReactNode } from 'react'
import {
  DEFAULT_SETTINGS,
  EFFORT_CHOICES,
  GITHUB_REFRESH_CHOICES,
  MAX_SESSION_TAGS,
  NOTIFY_EVENTS,
  TAG_COLORS,
  type AppInfo,
  type SessionTag,
  type DoctorCheck,
  type KokpitSettings,
  type NotifyEvent
} from '@shared/settings'
import type { ThemePref } from '@/data/theme'
import { MODE_LABELS, MODES } from '@shared/runner'
import { Icon, Spinner } from '@/components/primitives'
import { Markdown } from '@/components/Markdown'
import { TerminalModal } from '@/components/TerminalModal'
import { useUpdate } from '@/data/useUpdate'
import { useModels } from '@/data/useModels'
import { TAG_HEX } from '@/components/TagChip'

const MONO = "'Geist Mono',monospace"

type SectionId = 'general' | 'claude' | 'notifications' | 'github' | 'sessions' | 'doctor' | 'about'

const SECTIONS: { id: SectionId; icon: string; label: string; sub: string }[] = [
  { id: 'general', icon: 'contrast', label: 'General', sub: 'How Kokpit looks' },
  { id: 'claude', icon: 'bolt', label: 'Claude', sub: 'Defaults for new sessions and which Claude Code runs them' },
  { id: 'notifications', icon: 'notifications', label: 'Notifications', sub: 'macOS alerts for sessions and pull requests' },
  { id: 'github', icon: 'merge', label: 'GitHub', sub: 'The pull requests page and the count in the sidebar' },
  { id: 'sessions', icon: 'forum', label: 'Sessions', sub: 'Where Kokpit reads your Claude Code sessions' },
  { id: 'doctor', icon: 'stethoscope', label: 'Doctor', sub: 'What Kokpit needs on this machine, and whether it is there' },
  { id: 'about', icon: 'info', label: 'About', sub: 'Version and where Kokpit keeps its data' }
]

const SESSION_EVENTS: NotifyEvent[] = ['sessionWaiting', 'sessionDone', 'sessionError']
const PR_EVENTS: NotifyEvent[] = ['prChecksFailed', 'prChangesRequested', 'prReviewRequested']

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {title && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--tx3)', padding: '0 4px' }}>{title}</span>}
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '0 18px', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </section>
  )
}

function Row({ label, hint, children, dim }: { label: string; hint?: string; children: ReactNode; dim?: boolean }) {
  return (
    <div
      className="settings-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        padding: '13px 0',
        minHeight: 52,
        opacity: dim ? 0.45 : 1,
        transition: 'opacity .12s'
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 13, color: 'var(--tx)' }}>{label}</span>
        {hint && <span style={{ fontSize: 11.5, lineHeight: 1.4, color: 'var(--tx3)' }}>{hint}</span>}
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0, flexShrink: 0, maxWidth: '62%' }}
      >
        {children}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange
}: {
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, background: 'var(--hover)', borderRadius: 8, fontSize: 12.5, color: 'var(--tx2)' }}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              ...(on ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)', fontWeight: 500, color: 'var(--tx)' } : {})
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ display: 'flex' }}>
      <span
        style={{
          width: 32,
          height: 18,
          borderRadius: 9,
          background: on ? 'var(--pri)' : 'var(--line)',
          position: 'relative',
          display: 'inline-block'
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: on ? 16 : 2,
            top: 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'var(--panel)',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
            transition: 'left .12s'
          }}
        />
      </span>
    </button>
  )
}

function TagEditor({ tags, onChange }: { tags: SessionTag[]; onChange: (tags: SessionTag[]) => void }) {
  const update = (id: string, patch: Partial<SessionTag>) => onChange(tags.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  const add = () => {
    const color = TAG_COLORS.find((c) => !tags.some((t) => t.color === c)) ?? 'gray'
    onChange([...tags, { id: `tag-${Date.now().toString(36)}`, name: 'New tag', color }])
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0' }}>
      {tags.length === 0 && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>No tags yet. Add one, for example “Waiting for deploy”.</span>}
      {tags.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span role="radiogroup" aria-label={`Colour of ${t.name}`} style={{ display: 'flex', gap: 5 }}>
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={t.color === c}
                aria-label={c}
                title={c}
                onClick={() => update(t.id, { color: c })}
                style={{ width: 18, height: 18, borderRadius: '50%', background: TAG_HEX[c], cursor: 'pointer', boxShadow: t.color === c ? '0 0 0 2px var(--panel), 0 0 0 4px var(--tx2)' : 'none' }}
              />
            ))}
          </span>
          <input
            key={`${t.id}-${t.name}`}
            aria-label="Tag name"
            defaultValue={t.name}
            maxLength={24}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== t.name) update(t.id, { name })
              else e.target.value = t.name
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            style={{ flex: 1, minWidth: 0, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--tx)', font: 'inherit', fontSize: 13 }}
          />
          <button aria-label={`Delete ${t.name}`} title="Delete tag" onClick={() => onChange(tags.filter((x) => x.id !== t.id))} style={{ display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer' }}>
            <Icon name="delete" size={17} color="var(--tx3)" />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Action onClick={add} disabled={tags.length >= MAX_SESSION_TAGS}>
          <Icon name="add" size={16} /> Add tag
        </Action>
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>
          {tags.length}/{MAX_SESSION_TAGS} · Deleting a tag removes it from its sessions
        </span>
      </div>
    </div>
  )
}

function Action({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="menu-item"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 30,
        padding: '0 12px',
        border: '1px solid var(--line)',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        cursor: disabled ? 'default' : 'pointer'
      }}
    >
      {children}
    </button>
  )
}

const pathStyle = {
  font: `12px ${MONO}`,
  color: 'var(--tx2)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0
} as const

const DOCTOR_ICON: Record<DoctorCheck['status'], [string, string]> = {
  ok: ['check_circle', 'var(--ok)'],
  warn: ['error', 'var(--wait-tx)'],
  err: ['cancel', 'var(--err)']
}

function Doctor() {
  const api = window.kokpit
  const [checks, setChecks] = useState<DoctorCheck[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = () => {
    if (!api) return
    setBusy(true)
    setError('')
    api
      .doctor()
      .then(setChecks)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false))
  }
  useEffect(load, [api])
  const problems = checks?.filter((c) => c.status !== 'ok').length ?? 0
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, fontSize: 13, color: problems ? 'var(--wait-tx)' : 'var(--tx2)' }}>
          {busy
            ? 'Checking…'
            : checks
              ? problems
                ? `${problems} thing${problems === 1 ? '' : 's'} to look at`
                : 'Everything Kokpit needs is in place'
              : ''}
        </span>
        <Action disabled={busy} onClick={load}>
          {busy ? <Spinner size={12} /> : <Icon name="refresh" size={16} color="var(--tx2)" />}
          Check again
        </Action>
      </div>
      {error && <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{error}</div>}
      {checks && (
        <Group>
          {checks.map((c) => {
            const [icon, color] = DOCTOR_ICON[c.status]
            return (
              <div
                key={c.id}
                className="settings-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 150px minmax(0,1fr)',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 0'
                }}
              >
                <Icon name={icon} size={18} color={color} />
                <span style={{ fontSize: 13 }}>{c.label}</span>
                <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span className="selectable" style={{ ...pathStyle, color: c.status === 'ok' ? 'var(--tx)' : color }}>
                    {c.value}
                  </span>
                  {c.detail && (
                    <span
                      className="selectable"
                      style={{ fontSize: 11.5, color: 'var(--tx3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {c.detail}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </Group>
      )}
    </>
  )
}

function Updates({ version, packaged }: { version: string; packaged: boolean }) {
  const api = window.kokpit
  const status = useUpdate()
  const [checking, setChecking] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [finished, setFinished] = useState(false)
  const check = () => {
    if (!api) return
    setChecking(true)
    void api.updates.check().finally(() => setChecking(false))
  }
  const line = !status
    ? 'Checking for updates…'
    : status.error
      ? `Could not check: ${status.error}`
      : status.hasUpdate
        ? `Kokpit ${status.latest} is available`
        : `You have the latest version`
  return (
    <>
      <Group title="Updates">
        <Row label={`Kokpit ${version}`} hint={line + (packaged ? '' : ' · development build')}>
          <Action disabled={checking} onClick={check}>
            {checking ? <Spinner size={12} /> : <Icon name="refresh" size={16} color="var(--tx2)" />}
            Check for updates
          </Action>
          {status?.hasUpdate &&
            (finished ? (
              <button
                onClick={() => void api?.relaunch()}
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 7,
                  background: 'var(--pri)',
                  color: 'var(--panel)',
                  fontSize: 12.5,
                  fontWeight: 500
                }}
              >
                Restart Kokpit
              </button>
            ) : status.canUpdate ? (
              <button
                onClick={() => setUpdating(true)}
                style={{
                  height: 30,
                  padding: '0 12px',
                  borderRadius: 7,
                  background: 'var(--pri)',
                  color: 'var(--panel)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  whiteSpace: 'nowrap'
                }}
              >
                Update to {status.latest}
              </button>
            ) : null)}
        </Row>
        {status?.hasUpdate && !status.canUpdate && (
          <Row label="How to update" hint="This copy was not installed with Homebrew, so Kokpit cannot update itself">
            <span style={{ font: `12px ${MONO}`, color: 'var(--tx2)' }} className="selectable">
              brew install --cask imonursahin/tap/kokpit
            </span>
          </Row>
        )}
      </Group>
      {status?.hasUpdate && status.notes && (
        <Group title={(status.newVersions?.length ?? 0) > 1 ? `What’s new since ${status.current} · ${status.newVersions?.length} releases` : `What’s new in ${status.latest}`}>
          <div style={{ padding: '14px 0' }}>
            <Markdown source={status.notes} size={13} />
          </div>
        </Group>
      )}
      {updating && api && (
        <TerminalModal
          title={`Updating Kokpit to ${status?.latest ?? ''}`}
          start={(cols, rows) => api.terminal.update(cols, rows)}
          hint="Homebrew downloads the new version and replaces Kokpit.app. Restart Kokpit when it finishes."
          onClose={(code) => {
            setUpdating(false)
            if (code === 0) setFinished(true)
          }}
        />
      )}
    </>
  )
}

function initialSection(): SectionId {
  const saved = localStorage.getItem('kokpit.settingsSection')
  return SECTIONS.some((s) => s.id === saved) ? (saved as SectionId) : 'general'
}

export function SettingsPage({
  theme,
  onTheme,
  settings,
  onSettings
}: {
  theme: ThemePref
  onTheme: (t: ThemePref) => void
  settings: KokpitSettings | null
  onSettings: (patch: Partial<KokpitSettings>) => Promise<void>
}) {
  const models = useModels()
  const api = window.kokpit
  const [section, setSection] = useState<SectionId>(initialSection)
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [exe, setExe] = useState(settings?.claudeExecutable ?? '')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [rebuild, setRebuild] = useState<'idle' | 'busy' | 'done'>('idle')

  useEffect(() => {
    void api?.info().then(setInfo)
  }, [api])
  useEffect(() => setExe(settings?.claudeExecutable ?? ''), [settings?.claudeExecutable])
  useEffect(() => {
    if (rebuild !== 'done') return
    const id = setTimeout(() => setRebuild('idle'), 5000)
    return () => clearTimeout(id)
  }, [rebuild])

  const pick = (id: SectionId) => {
    setSection(id)
    setMsg(null)
    localStorage.setItem('kokpit.settingsSection', id)
  }

  const runRebuild = () => {
    if (!api) return
    setRebuild('busy')
    setMsg(null)
    api
      .rebuildIndex()
      .then(() => setRebuild('done'))
      .catch((err: Error) => {
        setRebuild('idle')
        setMsg({ tone: 'err', text: err.message })
      })
  }

  const save = (patch: Partial<KokpitSettings>, ok?: string) =>
    onSettings(patch)
      .then(() => ok && setMsg({ tone: 'ok', text: ok }))
      .catch((err: Error) => setMsg({ tone: 'err', text: err.message }))

  const notifyOn = settings?.notifyEnabled ?? true
  const eventRow = (id: NotifyEvent) => {
    const e = NOTIFY_EVENTS.find((x) => x.id === id)
    if (!e) return null
    return (
      <Row key={id} label={e.label} hint={e.hint || undefined} dim={!notifyOn}>
        <Toggle
          label={e.label}
          on={notifyOn && (settings?.notify[id] ?? false)}
          onChange={(v) => void save({ notify: { ...(settings?.notify ?? DEFAULT_SETTINGS.notify), [id]: v } })}
        />
      </Row>
    )
  }

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0]!

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)', overflow: 'hidden' }}>
      <div className="drag" style={{ padding: '22px 28px 18px', flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Settings</h1>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', borderTop: '1px solid var(--line)' }}>
        <nav
          aria-label="Settings sections"
          style={{
            width: 210,
            flexShrink: 0,
            padding: '14px 10px',
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          {SECTIONS.map((s) => {
            const on = s.id === section
            return (
              <button
                key={s.id}
                onClick={() => pick(s.id)}
                aria-current={on ? 'page' : undefined}
                className={on ? undefined : 'menu-item'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 7,
                  textAlign: 'left',
                  fontSize: 13,
                  fontWeight: on ? 500 : 400,
                  color: on ? 'var(--tx)' : 'var(--tx2)',
                  background: on ? 'var(--sel)' : undefined
                }}
              >
                <Icon name={s.icon} size={17} color={on ? 'var(--tx)' : 'var(--tx3)'} />
                {s.label}
              </button>
            )
          })}
        </nav>

        <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          <div style={{ maxWidth: 760, padding: '24px 32px 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600, letterSpacing: '-.01em' }}>{current.label}</h2>
              <span style={{ fontSize: 13, color: 'var(--tx2)' }}>{current.sub}</span>
            </div>

            {section === 'general' && (
              <Group>
                <Row label="Theme" hint="Light, dark, or follow macOS">
                  <Segmented
                    value={theme}
                    onChange={onTheme}
                    options={[
                      { id: 'light', label: 'Light' },
                      { id: 'dark', label: 'Dark' },
                      { id: 'system', label: 'System' }
                    ]}
                  />
                </Row>
                <Row label="Show in menu bar" hint="A Kokpit icon in the macOS menu bar with running sessions and the ones waiting for you">
                  <Toggle label="Show in menu bar" on={settings?.menuBar ?? true} onChange={(v) => void save({ menuBar: v })} />
                </Row>
              </Group>
            )}

            {section === 'claude' && (
              <>
                <Group title="New sessions">
                  <Row label="Model" hint="Used by the new session dialog and when you continue a session">
                    <select
                      aria-label="Default model"
                      value={settings?.defaultModel ?? 'claude-opus-5-5'}
                      onChange={(e) => void save({ defaultModel: e.target.value })}
                      style={{ height: 32, padding: '0 8px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--tx)', font: 'inherit', fontSize: 13 }}
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </Row>
                  <Row label="Effort" hint="Higher effort thinks longer and costs more">
                    <Segmented
                      value={settings?.defaultEffort ?? 'high'}
                      onChange={(v) => void save({ defaultEffort: v })}
                      options={EFFORT_CHOICES.map((e) => ({ id: e, label: e[0]?.toUpperCase() + e.slice(1) }))}
                    />
                  </Row>
                  <Row label="Permission mode" hint="Ask stops for every command. Auto runs safe actions without asking. Bypass never asks.">
                    <Segmented
                      value={settings?.defaultMode ?? 'default'}
                      onChange={(v) => void save({ defaultMode: v })}
                      options={MODES.map((m) => ({ id: m, label: MODE_LABELS[m] }))}
                    />
                  </Row>
                </Group>
                <Group title="Claude Code">
                  <Row label="Claude executable" hint="Empty uses the one bundled with Kokpit">
                    <input
                      className="bare"
                      value={exe}
                      placeholder={info?.bundledClaude || 'Bundled Claude Code'}
                      onChange={(e) => setExe(e.target.value)}
                      onBlur={() => exe !== (settings?.claudeExecutable ?? '') && void save({ claudeExecutable: exe }, 'Saved')}
                      style={{
                        width: 320,
                        height: 32,
                        padding: '0 10px',
                        border: '1px solid var(--line)',
                        borderRadius: 7,
                        font: `12.5px ${MONO}`
                      }}
                    />
                  </Row>
                </Group>
              </>
            )}

            {section === 'notifications' && (
              <>
                <Group>
                  <Row label="Notifications" hint="Turn every Kokpit alert on or off">
                    <Action onClick={() => void api?.testNotification()}>Send a test</Action>
                    <Toggle label="Notifications" on={notifyOn} onChange={(v) => void save({ notifyEnabled: v })} />
                  </Row>
                  <Row label="Also when Kokpit is in front" hint="Off: alerts only while you work in another app" dim={!notifyOn}>
                    <Toggle
                      label="Also when Kokpit is in front"
                      on={!!settings?.notifyWhenFocused}
                      onChange={(v) => void save({ notifyWhenFocused: v })}
                    />
                  </Row>
                </Group>
                <Group title="Sessions">{SESSION_EVENTS.map(eventRow)}</Group>
                <Group title="Pull requests">{PR_EVENTS.map(eventRow)}</Group>
              </>
            )}

            {section === 'github' && (
              <Group>
                <Row label="Check every" hint="How often Kokpit asks GitHub for new pull requests">
                  <Segmented
                    value={String(settings?.githubRefreshMinutes ?? 1)}
                    onChange={(v) => void save({ githubRefreshMinutes: Number(v) })}
                    options={GITHUB_REFRESH_CHOICES.map((m) => ({ id: String(m), label: `${m} min` }))}
                  />
                </Row>
                <Row label="Include draft PRs" hint="Only affects “Waiting for your review”. Your own drafts always show.">
                  <Toggle
                    label="Include draft PRs waiting for your review"
                    on={settings?.includeDraftReviews ?? true}
                    onChange={(v) => void save({ includeDraftReviews: v })}
                  />
                </Row>
              </Group>
            )}

            {section === 'sessions' && (
              <Group title="Session tags">
                <TagEditor tags={settings?.sessionTags ?? []} onChange={(sessionTags) => void save({ sessionTags })} />
              </Group>
            )}

            {section === 'sessions' && (
              <Group>
                <Row label="Show automated sessions" hint="Plugin and pipeline runs started without a terminal">
                  <Toggle label="Show automated sessions" on={!!settings?.showHeadless} onChange={(v) => void save({ showHeadless: v })} />
                </Row>
                <Row label="Session folder" hint="Claude Code writes every session here, from the terminal or from Kokpit">
                  <span style={pathStyle}>{info?.projectsDir ?? '~/.claude/projects'}</span>
                  <Action onClick={() => void api?.openFolder('projects')}>Open</Action>
                </Row>
                <Row label="Session index" hint="Rebuild if counts or costs look wrong">
                  <Action disabled={rebuild === 'busy'} onClick={runRebuild}>
                    {rebuild === 'busy' ? (
                      <>
                        <Spinner size={12} /> Rebuilding…
                      </>
                    ) : rebuild === 'done' ? (
                      <>
                        <Icon name="check" size={16} color="var(--ok)" /> Done
                      </>
                    ) : (
                      'Rebuild index'
                    )}
                  </Action>
                </Row>
              </Group>
            )}

            {section === 'doctor' && <Doctor />}

            {section === 'about' && (
              <>
                <Updates version={info?.version ?? ''} packaged={!!info?.packaged} />
                <Group title="Folders">
                  <Row label="Data folder" hint="Index, settings and encrypted tokens">
                    <span style={pathStyle}>{info?.dataDir ?? ''}</span>
                    <Action onClick={() => void api?.openFolder('data')}>Open</Action>
                  </Row>
                  <Row label="Kokpit folder" hint="CLAUDE.md, skills, agents, commands, hooks and memory">
                    <span style={pathStyle}>{info?.assistantHome ?? '~/Kokpit'}</span>
                    <Action onClick={() => void api?.openFolder('assistant')}>Open</Action>
                  </Row>
                </Group>
              </>
            )}

            {msg && <div style={{ fontSize: 12.5, color: msg.tone === 'err' ? 'var(--err)' : 'var(--ok)' }}>{msg.text}</div>}
          </div>
        </div>
      </div>
    </main>
  )
}
