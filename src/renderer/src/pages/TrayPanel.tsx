import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { PlanWindow } from '@shared/settings'
import type { TraySession, TrayState } from '@shared/tray'
import { relativeTime } from '@shared/time'
import { Icon, Spinner } from '@/components/primitives'
import { Status } from '@/components/Status'
import { applyTheme } from '@/data/theme'

const HOUR = 3_600_000
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

type Glass = { card: string; border: string; track: string; hover: string; muted: string; faint: string }

const GLASS: Record<'dark' | 'light', Glass> = {
  dark: { card: 'rgba(255,255,255,.06)', border: 'rgba(255,255,255,.09)', track: 'rgba(255,255,255,.12)', hover: 'rgba(255,255,255,.08)', muted: 'rgba(255,255,255,.62)', faint: 'rgba(255,255,255,.42)' },
  light: { card: 'rgba(255,255,255,.62)', border: 'rgba(0,0,0,.07)', track: 'rgba(0,0,0,.08)', hover: 'rgba(0,0,0,.06)', muted: 'rgba(0,0,0,.6)', faint: 'rgba(0,0,0,.42)' }
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => darkQuery().matches)
  useEffect(() => {
    const m = darkQuery()
    const on = () => setDark(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  useEffect(() => applyTheme(dark ? 'dark' : 'light'), [dark])
  return dark
}

function windowInfo(w: PlanWindow): { title: string; badge: string; span: number } {
  if (w.id === 'five_hour') return { title: 'Current session', badge: '5 hours', span: 5 * HOUR }
  if (w.id === 'seven_day') return { title: 'All models', badge: 'Weekly', span: 7 * 24 * HOUR }
  return { title: w.label.replace(/^Weekly · /, ''), badge: 'Weekly', span: 7 * 24 * HOUR }
}

const pctColor = (p: number) => (p >= 80 ? 'var(--err)' : p >= 50 ? 'var(--wait-tx)' : 'var(--ok)')

function resetText(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const day =
    new Date().toDateString() === d.toDateString()
      ? 'today'
      : new Date(Date.now() + 24 * HOUR).toDateString() === d.toDateString()
        ? 'tomorrow'
        : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  return `Resets ${day} at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`
}

function LimitCard({ w, g }: { w: PlanWindow; g: Glass }) {
  const info = windowInfo(w)
  const pct = Math.max(0, Math.min(100, Math.round(w.utilization)))
  const color = pctColor(pct)
  const reset = Date.parse(w.resetsAt)
  const pace = Number.isFinite(reset) ? Math.max(0, Math.min(100, 100 - ((reset - Date.now()) / info.span) * 100)) : null
  const ahead = pace !== null && pct > pace + 5
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '12px 14px', borderRadius: 12, background: g.card, border: `1px solid ${g.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{info.title}</span>
        <span style={{ fontSize: 11, color: g.faint }}>{info.badge}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.02em', color, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${info.title}, ${info.badge}`}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ position: 'relative', height: 6, borderRadius: 3, background: g.track }}
      >
        <div style={{ width: `${Math.max(pct, pct ? 2 : 0)}%`, height: '100%', borderRadius: 3, background: color }} />
        {pace !== null && (
          <span
            title={`An even pace would be at ${Math.round(pace)}% by now`}
            style={{ position: 'absolute', left: `calc(${pace}% - 1px)`, top: -3, width: 2, height: 12, borderRadius: 1, background: g.muted }}
          />
        )}
      </div>
      <div style={{ display: 'flex', fontSize: 11.5, color: g.faint }}>
        <span>{resetText(w.resetsAt)}</span>
        <span style={{ flex: 1 }} />
        {pace !== null && <span style={{ color: ahead ? 'var(--wait-tx)' : g.faint }}>{ahead ? 'Ahead of pace' : 'On pace'}</span>}
      </div>
    </div>
  )
}

function SessionRow({ s, g, onOpen }: { s: TraySession; g: Glass; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 8, textAlign: 'left', width: '100%', background: hover ? g.hover : 'transparent' }}
    >
      <span style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
        <Status status={s.status} />
        {s.status === 'done' && (
          <span style={{ position: 'absolute', top: -3, right: -4, width: 7, height: 7, borderRadius: '50%', background: 'var(--run)' }} />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
        {s.sub && <span style={{ fontSize: 11.5, color: g.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sub}</span>}
      </span>
      <Icon name="chevron_right" size={16} color={hover ? g.muted : 'transparent'} />
    </button>
  )
}

function Section({ title, items, g, onOpen }: { title: string; items: TraySession[]; g: Glass; onOpen: (id: string) => void }) {
  if (!items.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: g.faint, padding: '0 8px 4px' }}>
        {title} · {items.length}
      </span>
      {items.slice(0, 5).map((s) => (
        <SessionRow key={s.id} s={s} g={g} onOpen={() => onOpen(s.id)} />
      ))}
      {items.length > 5 && <span style={{ fontSize: 11.5, color: g.faint, padding: '2px 8px' }}>and {items.length - 5} more</span>}
    </div>
  )
}

function IconAction({ icon, label, onClick, g, busy }: { icon: string; label: string; onClick: () => void; g: Glass; busy?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: hover ? g.hover : 'transparent' }}
    >
      {busy ? <Spinner size={13} /> : <Icon name={icon} size={17} color={g.muted} />}
    </button>
  )
}

function TextAction({ children, onClick, g, dim }: { children: string; onClick: () => void; g: Glass; dim?: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ padding: '6px 10px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: dim ? g.muted : 'var(--tx)', background: hover ? g.hover : 'transparent' }}
    >
      {children}
    </button>
  )
}

const FOCUS_CSS = 'button{outline:none;cursor:pointer}button:focus-visible{outline:2px solid var(--run);outline-offset:1px}'

export function TrayPanel() {
  const api = window.kokpit
  const dark = useSystemDark()
  const g = GLASS[dark ? 'dark' : 'light']
  const [state, setState] = useState<TrayState | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [, tick] = useState(0)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.documentElement.style.background = 'transparent'
    document.body.style.background = 'transparent'
    if (!api) return
    void api.tray.getState().then(setState)
    const off = api.tray.onState(setState)
    const t = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => {
      off()
      window.clearInterval(t)
    }
  }, [api])

  useLayoutEffect(() => {
    const el = root.current
    if (!el || !api) return
    const report = () => api.tray.setHeight(el.getBoundingClientRect().height)
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => ro.disconnect()
  }, [api])

  const open = (id: string) => void api?.tray.open({ page: 'session', id })
  const refresh = () => {
    if (!api || refreshing) return
    setRefreshing(true)
    void api.tray.refreshUsage().finally(() => setRefreshing(false))
  }
  const windows = state?.usage?.available ? state.usage.windows : []
  const plan = state?.usage?.plan
  const idle = !!state && !state.waiting.length && !state.running.length && !state.unread.length
  const divider: CSSProperties = { height: 1, background: g.border, margin: '0 -2px' }

  return (
    <div ref={root} style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 12px 10px', color: 'var(--tx)', fontSize: 13, userSelect: 'none' }}>
      <style>{FOCUS_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 2px' }}>
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-.01em' }}>Plan usage</span>
        {plan && (
          <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 6, background: g.card, border: `1px solid ${g.border}`, color: g.muted }}>
            Claude {plan[0]?.toUpperCase()}
            {plan.slice(1)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <IconAction icon="refresh" label="Refresh usage" onClick={refresh} g={g} busy={refreshing} />
        <IconAction icon="open_in_new" label="Open Kokpit" onClick={() => void api?.tray.open({ page: 'overview' })} g={g} />
      </div>

      {windows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {windows.map((w) => (
            <LimitCard key={w.id} w={w} g={g} />
          ))}
          {state?.usageAt && <span style={{ fontSize: 11, color: g.faint, padding: '0 4px' }}>Updated {relativeTime(state.usageAt, Date.now())}</span>}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px', borderRadius: 12, background: g.card, border: `1px solid ${g.border}`, fontSize: 12.5, color: g.muted }}>
          {state?.usage ? (
            'Plan limits are not available for this login.'
          ) : (
            <>
              <Spinner size={12} /> Loading plan limits…
            </>
          )}
        </div>
      )}

      {state && (
        <>
          <div style={divider} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Section title="Waiting for you" items={state.waiting} g={g} onOpen={open} />
            <Section title="Running" items={state.running} g={g} onOpen={open} />
            <Section title="Finished, not opened" items={state.unread} g={g} onOpen={open} />
            {idle && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: g.muted, padding: '4px 8px' }}>
                <Icon name="check_circle" size={16} color={g.faint} />
                Nothing running, nothing waiting for you.
              </span>
            )}
          </div>
        </>
      )}

      <div style={divider} />
      <div style={{ display: 'flex', alignItems: 'center', margin: '-4px -2px 0' }}>
        <TextAction onClick={() => void api?.tray.open({ page: 'overview' })} g={g}>
          Open Kokpit
        </TextAction>
        <span style={{ flex: 1 }} />
        <TextAction onClick={() => void api?.tray.quit()} g={g} dim>
          Quit
        </TextAction>
      </div>
    </div>
  )
}
