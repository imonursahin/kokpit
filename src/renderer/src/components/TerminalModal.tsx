import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { Icon } from './primitives'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function TerminalModal({
  title,
  start,
  onClose,
  hint = 'Your browser opens for the sign-in. If it asks you to paste a URL, paste it here and press Enter.'
}: {
  title: string
  start: (cols: number, rows: number) => Promise<string | { id: string; backlog: string }>
  onClose: (exitCode: number | null) => void
  hint?: ReactNode
}) {
  const host = useRef<HTMLDivElement>(null)
  const idRef = useRef<string | null>(null)
  const startRef = useRef(start)
  startRef.current = start
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined)
  const [attached, setAttached] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = window.kokpit
    const el = host.current
    if (!api || !el) return
    idRef.current = null
    const term = new Terminal({
      fontFamily: "'Geist Mono', monospace",
      fontSize: 12.5,
      lineHeight: 1.35,
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: cssVar('--code'),
        foreground: cssVar('--tx'),
        cursor: cssVar('--tx'),
        selectionBackground: cssVar('--sel')
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    term.focus()

    const buffered: string[] = []
    let alive = true
    const off = api.terminal.onEvent((e) => {
      if (!alive) return
      if (!idRef.current) {
        if (e.type === 'data') buffered.push(e.data)
        return
      }
      if (e.id !== idRef.current) return
      if (e.type === 'data') term.write(e.data)
      else setExitCode(e.code)
    })
    const input = term.onData((d) => {
      if (idRef.current) void api.terminal.write(idRef.current, d)
    })
    let keep = false
    startRef.current(term.cols, term.rows)
      .then((started) => {
        keep = typeof started !== 'string'
        const id = typeof started === 'string' ? started : started.id
        if (!alive) {
          if (!keep) void api.terminal.kill(id)
          return
        }
        idRef.current = id
        if (typeof started === 'string') {
          for (const chunk of buffered.splice(0)) term.write(chunk)
        } else {
          buffered.length = 0
          setAttached(true)
          term.write(started.backlog)
          void api.terminal.resize(id, term.cols, term.rows)
        }
      })
      .catch((err: Error) => setError(err.message))

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (idRef.current) void api.terminal.resize(idRef.current, term.cols, term.rows)
    })
    observer.observe(el)

    return () => {
      alive = false
      observer.disconnect()
      input.dispose()
      off()
      if (idRef.current && !keep) void api.terminal.kill(idRef.current)
      term.dispose()
    }
  }, [])

  const running = exitCode === undefined && !error
  const close = () => onClose(exitCode ?? null)

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 90vw)', height: 'min(520px, 80vh)', background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--pop)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="terminal" size={18} color="var(--tx2)" />
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
          <span style={{ fontSize: 12, color: error || (exitCode !== undefined && exitCode !== 0) ? 'var(--err)' : running ? 'var(--run)' : 'var(--ok)' }}>
            {error ? 'Could not start' : running ? 'Running…' : exitCode === 0 ? 'Finished' : `Exited with code ${exitCode ?? '?'}`}
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={close}
            style={{ height: 28, padding: '0 12px', borderRadius: 7, border: '1px solid var(--line)', fontSize: 12.5, fontWeight: 500 }}
          >
            {running ? (attached ? 'Hide' : 'Cancel') : 'Close'}
          </button>
        </div>
        {error && <div style={{ padding: '10px 16px', fontSize: 12.5, color: 'var(--err)' }}>{error}</div>}
        <div style={{ flex: 1, minHeight: 0, padding: 10, background: 'var(--code)' }}>
          <div ref={host} style={{ width: '100%', height: '100%' }} />
        </div>
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--tx3)', borderTop: '1px solid var(--line)' }}>
          {hint}
        </div>
      </div>
    </div>
  )
}
