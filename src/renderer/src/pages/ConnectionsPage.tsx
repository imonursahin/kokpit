import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
import type { ConnectionId, ConnectionInfo, GithubConnectInput, GoogleConnectInput, JiraConnectInput } from '@shared/integrations'
import { relativeTime } from '@shared/time'
import { Status } from '@/components/Status'
import { PrimaryButton, SecondaryButton } from '@/components/primitives'
import { errorText, useConnectionStatus } from '@/data/useIntegrations'
import { MOCK_CONNECTIONS, type Connection, type ConnectionDetail, type ConnectionStatus } from '@/mock/connections'

const ACTION = { height: 32, borderRadius: 7, fontSize: 12.5 } as const

const API_TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'
const GOOGLE_CLIENTS_URL = 'https://console.cloud.google.com/apis/credentials'

type Actions = {
  connectJira: (input: JiraConnectInput) => Promise<void>
  connectGithub: (input: GithubConnectInput) => Promise<void>
  connectGoogle: (input: GoogleConnectInput) => Promise<void>
  disconnect: () => Promise<void>
}

type Run = (fn: () => Promise<void>) => void

function toConnection(i: ConnectionInfo, nowMs: number): Connection {
  const base = MOCK_CONNECTIONS.find((m) => m.id === i.id)
  const details: ConnectionDetail[] =
    i.id === 'google'
      ? [
          { label: 'Calendar', value: i.account, mono: true },
          { label: 'Access', value: i.site }
        ]
      : i.id === 'github'
      ? [
          { label: 'Account', value: i.account ? `@${i.account}` : '', mono: true },
          { label: 'Auth', value: i.site }
        ]
      : [
          { label: 'Account', value: i.account, mono: true },
          { label: 'Site', value: i.site, mono: true },
          ...(i.projects.length ? [{ label: 'Projects', chips: i.projects }] : [])
        ]
  return {
    id: i.id,
    name: base?.name ?? i.id,
    icon: base?.icon ?? 'link',
    description: base?.description ?? '',
    status: i.status,
    warning: i.warning,
    details,
    lastSync: (i.lastSync && relativeTime(i.lastSync, nowMs)) || 'never'
  }
}

function Input({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  const [focus, setFocus] = useState(false)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          height: 36,
          padding: '0 10px',
          borderRadius: 8,
          font: "13px/1 'Geist Mono',monospace",
          ...(focus ? { border: '1px solid var(--tx)', boxShadow: '0 0 0 3px var(--hover)' } : { border: '1px solid var(--line)' })
        }}
      >
        <input
          className="bare"
          style={{ flex: 1, minWidth: 0 }}
          spellCheck={false}
          autoComplete="off"
          {...props}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
        />
      </span>
    </label>
  )
}

function JiraForm({ name, busy, run, connect }: { name: string; busy: boolean; run: Run; connect: Actions['connectJira'] }) {
  const [site, setSite] = useState('')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          if (!site.trim() || !email.trim() || !token.trim()) throw new Error('Fill in site, email and API token.')
          await connect({ site: site.trim(), email: email.trim(), token: token.trim() })
        })
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Input autoFocus label="Site" placeholder="your-team.atlassian.net" value={site} onChange={(e) => setSite(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="API token" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href={API_TOKEN_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--tx2)' }}>
          Create an API token
        </a>
        <span style={{ flex: 1 }} />
        <PrimaryButton style={ACTION}>{busy ? 'Connecting…' : `Connect ${name}`}</PrimaryButton>
      </div>
    </form>
  )
}

function GithubForm({ busy, run, connect }: { busy: boolean; run: Run; connect: Actions['connectGithub'] }) {
  const [paste, setPaste] = useState(false)
  const [token, setToken] = useState('')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <PrimaryButton onClick={() => run(() => connect({ useCli: true }))} style={ACTION}>
          {busy ? 'Connecting…' : 'Use GitHub CLI login'}
        </PrimaryButton>
        {!paste && (
          <button onClick={() => setPaste(true)} style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
            or paste a token
          </button>
        )}
      </div>
      {paste && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            run(async () => {
              if (!token.trim()) throw new Error('Paste a GitHub token.')
              await connect({ token: token.trim() })
            })
          }}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Input autoFocus label="Personal access token" type="password" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <SecondaryButton style={{ ...ACTION, height: 36 }}>Connect</SecondaryButton>
        </form>
      )}
    </div>
  )
}

function GoogleForm({ busy, run, connect }: { busy: boolean; run: Run; connect: Actions['connectGoogle'] }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        run(async () => {
          if (!clientId.trim() || !clientSecret.trim()) throw new Error('Paste the client ID and the client secret.')
          await connect({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })
        })
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.55 }}>
        In Google Cloud, turn on the Google Calendar API and create an OAuth client of type Desktop app. Paste its ID and secret here, then sign in with
        Google in your browser. Kokpit only asks to read your events.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
        <Input autoFocus label="Client ID" placeholder="…apps.googleusercontent.com" value={clientId} onChange={(e) => setClientId(e.target.value)} />
        <Input label="Client secret" type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href={GOOGLE_CLIENTS_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--tx2)' }}>
          Open Google Cloud credentials
        </a>
        <span style={{ flex: 1 }} />
        <PrimaryButton style={ACTION}>{busy ? 'Waiting for Google…' : 'Sign in with Google'}</PrimaryButton>
      </div>
    </form>
  )
}

function Pill({ label, color, tint }: { label: string; color: string; tint: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 22,
        padding: '0 9px 0 7px',
        borderRadius: 11,
        background: tint,
        color,
        fontSize: 12,
        fontWeight: 500
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {label}
    </span>
  )
}

function ConnectionCard({ c, onSet, actions }: { c: Connection; onSet?: (status: ConnectionStatus) => void; actions?: Actions }) {
  const expired = c.status === 'expired'
  const connected = c.status === 'connected'
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const run: Run = (fn) => {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    fn()
      .then(() => setOpen(false))
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => {
        lock.current = false
        setBusy(false)
      })
  }
  const showForm = !connected || open
  return (
    <div style={{ border: `1px solid ${expired ? 'var(--wait-line)' : 'var(--line)'}`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px' }}>
        <span
          className="ms"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: "400 22px/1 'Material Symbols Rounded'",
            color: 'var(--tx)'
          }}
        >
          {c.icon}
        </span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</span>
            {expired && <Status status="waiting" label />}
            {connected && <Pill label="Connected" color="var(--ok)" tint="var(--ok-bg)" />}
            {c.status === 'disconnected' && <Pill label="Not connected" color="var(--tx3)" tint="var(--hover)" />}
          </div>
          <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{c.description}</span>
        </div>
        {expired && !actions && (
          <PrimaryButton hint="↵" onClick={() => onSet?.('connected')} style={ACTION}>
            Reconnect {c.name}
          </PrimaryButton>
        )}
        {c.status === 'disconnected' && !actions && (
          <PrimaryButton onClick={() => onSet?.('connected')} style={ACTION}>
            Connect {c.name}
          </PrimaryButton>
        )}
        {connected && (
          <button
            onClick={() => (actions ? setOpen((o) => !o) : onSet?.('connected'))}
            style={{ ...ACTION, display: 'inline-flex', alignItems: 'center', padding: '0 12px', border: '1px solid var(--line)', fontWeight: 500 }}
          >
            Reconnect
          </button>
        )}
        {(connected || (expired && actions)) && (
          <button
            onClick={() => (actions ? run(actions.disconnect) : onSet?.('disconnected'))}
            style={{ ...ACTION, display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontWeight: 500, color: 'var(--err)' }}
          >
            Disconnect
          </button>
        )}
      </div>
      {expired && c.warning && (
        <div
          style={{
            margin: '0 18px 14px',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--wait-bg)',
            fontSize: 12.5,
            color: 'var(--tx)',
            lineHeight: 1.5
          }}
        >
          {c.warning}
        </div>
      )}
      {actions && showForm && (
        <div style={{ padding: '14px 18px 16px', borderTop: '1px solid var(--line-soft)' }}>
          {c.id === 'jira' ? (
            <JiraForm name={c.name} busy={busy} run={run} connect={actions.connectJira} />
          ) : c.id === 'google' ? (
            <GoogleForm busy={busy} run={run} connect={actions.connectGoogle} />
          ) : (
            <GithubForm busy={busy} run={run} connect={actions.connectGithub} />
          )}
        </div>
      )}
      {error && (
        <div className="selectable" style={{ margin: '0 18px 14px', fontSize: 12.5, lineHeight: 1.5, color: 'var(--err)' }}>
          {error}
        </div>
      )}
      {c.status !== 'disconnected' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            rowGap: 10,
            padding: '14px 18px 16px',
            borderTop: '1px solid var(--line-soft)',
            fontSize: 12.5
          }}
        >
          {c.details.map((d) => [
            <span key={`${d.label}-l`} style={{ color: 'var(--tx3)' }}>
              {d.label}
            </span>,
            'chips' in d ? (
              <span key={`${d.label}-v`} style={{ display: 'flex', gap: 6 }}>
                {d.chips.map((chip) => (
                  <span
                    key={chip}
                    style={{ font: "500 11.5px/1 'Geist Mono',monospace", background: 'var(--hover)', padding: '4px 6px', borderRadius: 5 }}
                  >
                    {chip}
                  </span>
                ))}
              </span>
            ) : (
              <span
                key={`${d.label}-v`}
                className="selectable"
                style={{
                  ...(d.mono ? { fontFamily: "'Geist Mono',monospace" } : {}),
                  ...(d.muted ? { color: 'var(--tx2)' } : {})
                }}
              >
                {d.value}
              </span>
            )
          ])}
          <span style={{ color: 'var(--tx3)' }}>Last sync</span>
          <span style={expired ? { color: 'var(--wait-tx)' } : undefined}>{c.lastSync}</span>
        </div>
      )}
    </div>
  )
}

export function ConnectionsPage() {
  const api = window.kokpit
  const live = useConnectionStatus()
  const [connections, setConnections] = useState(MOCK_CONNECTIONS)
  const nowMs = Date.now()

  const actionsFor = (id: ConnectionId): Actions | undefined =>
    api && {
      connectJira: (input) => api.integrations.connectJira(input).then(live.setList),
      connectGithub: (input) => api.integrations.connectGithub(input).then(live.setList),
      connectGoogle: (input) => api.integrations.connectGoogle(input).then(live.setList),
      disconnect: () => api.integrations.disconnect(id).then(live.setList)
    }

  const setStatus = (id: string, status: ConnectionStatus) =>
    setConnections((list) =>
      list.map((c) => (c.id === id ? { ...c, status, ...(status === 'connected' ? { lastSync: 'just now' } : {}) } : c))
    )

  const firstExpired = api ? undefined : connections.find((c) => c.status === 'expired')?.id

  useEffect(() => {
    if (!firstExpired) return
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey || target.tagName === 'INPUT' || target.tagName === 'BUTTON') return
      setStatus(firstExpired, 'connected')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [firstExpired])

  return (
    <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'auto', background: 'var(--panel)' }}>
      <div className="drag" style={{ padding: '22px 28px 18px' }}>
        <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>Connections</h1>
          <div style={{ fontSize: 13, color: 'var(--tx2)' }}>
            Claude uses these to read your tasks, open pull requests and post updates.
          </div>
        </div>
      </div>
      <div style={{ padding: '0 28px 22px' }}>
        <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {api
            ? live.list?.map((i) => <ConnectionCard key={i.id} c={toConnection(i, nowMs)} actions={actionsFor(i.id)} />)
            : connections.map((c) => <ConnectionCard key={c.id} c={c} onSet={(status) => setStatus(c.id, status)} />)}
          {live.error && <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{live.error}</div>}
          <div style={{ fontSize: 12, color: 'var(--tx3)' }}>Tokens are stored in the macOS Keychain and never leave this machine.</div>
        </div>
      </div>
    </main>
  )
}
