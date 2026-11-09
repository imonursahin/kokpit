import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'

const MONO = "'Geist Mono',monospace"
const TOKEN = /(^|\s)@([^\s@]*)$/

export function useFileMentions(
  text: string,
  setText: (t: string) => void,
  placement: 'above' | 'below',
  cwd?: string
): { menu: ReactNode; onKeyDown: (e: KeyboardEvent) => boolean } {
  const [files, setFiles] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const query = cwd ? TOKEN.exec(text)?.[2] : undefined
  const open = query !== undefined && dismissed !== text

  useEffect(() => {
    if (!open || !cwd) return
    let alive = true
    const t = setTimeout(() => {
      void window.kokpit
        ?.mentionFiles(cwd, query ?? '')
        .then((list) => alive && setFiles(list))
        .catch(() => alive && setFiles([]))
    }, 60)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [open, cwd, query])

  useEffect(() => setIndex(0), [query])

  const matches = open ? files : []
  const active = Math.min(index, Math.max(0, matches.length - 1))
  const pick = (path: string) => setText(text.replace(TOKEN, (_m, lead: string) => `${lead}@${path} `))

  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (!matches.length) return false
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((active + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length)
      return true
    }
    if ((e.key === 'Enter' && !e.shiftKey && !e.metaKey) || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      const f = matches[active]
      if (f) pick(f)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setDismissed(text)
      return true
    }
    return false
  }

  const menu = matches.length ? (
    <div
      role="listbox"
      aria-label="Files"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        ...(placement === 'above' ? { bottom: 'calc(100% + 6px)' } : { top: 'calc(100% + 6px)' }),
        maxHeight: 260,
        overflow: 'auto',
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        boxShadow: 'var(--pop)',
        padding: 4,
        zIndex: 30
      }}
    >
      {matches.map((f, i) => {
        const cut = f.lastIndexOf('/') + 1
        return (
          <div
            key={f}
            role="option"
            aria-selected={i === active}
            ref={i === active ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
            onMouseDown={(e) => {
              e.preventDefault()
              pick(f)
            }}
            onMouseEnter={() => setIndex(i)}
            style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', background: i === active ? 'var(--hover)' : 'transparent', minWidth: 0 }}
          >
            <span style={{ font: `500 12.5px ${MONO}`, color: 'var(--tx)', flexShrink: 0 }}>{f.slice(cut)}</span>
            <span style={{ font: `12px ${MONO}`, color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.slice(0, cut)}</span>
          </div>
        )
      })}
    </div>
  ) : null

  return { menu, onKeyDown }
}
