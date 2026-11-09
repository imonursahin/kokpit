import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { libraryApi } from '@/data/libraryApi'

export type SlashCommand = { name: string; desc: string; hint: string }

const MONO = "'Geist Mono',monospace"

function frontmatterValue(body: string, key: string): string {
  const fm = /^---\n([\s\S]*?)\n---/.exec(body)?.[1] ?? ''
  const m = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(fm)
  return (m?.[1] ?? '').replace(/^["']|["']$/g, '').trim()
}

export function useSlashCommands(
  text: string,
  setText: (t: string) => void,
  placement: 'above' | 'below',
  cwd?: string
): { menu: ReactNode; onKeyDown: (e: KeyboardEvent) => boolean } {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const fromLibrary = () =>
      libraryApi()
        ?.list()
        .then((l) =>
          l.entries
            .filter((e) => e.kind === 'commands')
            .map((e) => ({ name: `kokpit:${e.name}`, desc: frontmatterValue(e.body, 'description'), hint: frontmatterValue(e.body, 'argument-hint') }))
        ) ?? Promise.resolve([])
    const fromClaude = cwd ? window.kokpit?.runner.commands(cwd) : undefined
    void (fromClaude ?? Promise.resolve([]))
      .then((list) => (list.length ? list.map((c) => ({ name: c.name, desc: c.description, hint: c.argumentHint })) : fromLibrary()))
      .catch(() => fromLibrary())
      .then((list) => alive && setCommands(list))
      .catch(() => alive && setCommands([]))
    return () => {
      alive = false
    }
  }, [cwd])

  const typed = /^\/([\w:.-]*)$/.exec(text)?.[1]
  const query = typed === undefined ? null : typed.toLowerCase()
  const matches =
    query === null || dismissed === text
      ? []
      : commands
          .filter((c) => c.name.toLowerCase().includes(query))
          .sort((a, b) => Number(!b.name.toLowerCase().startsWith(query)) - Number(!a.name.toLowerCase().startsWith(query)))
          .slice(0, 50)
  const active = Math.min(index, Math.max(0, matches.length - 1))

  useEffect(() => setIndex(0), [query])

  const pick = (c: SlashCommand) => setText(`/${c.name} `)

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
      const c = matches[active]
      if (c) pick(c)
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
      aria-label="Commands"
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
      {matches.map((c, i) => (
        <div
          key={c.name}
          role="option"
          aria-selected={i === active}
          ref={i === active ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
          onMouseDown={(e) => {
            e.preventDefault()
            pick(c)
          }}
          onMouseEnter={() => setIndex(i)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '7px 10px',
            borderRadius: 7,
            cursor: 'pointer',
            background: i === active ? 'var(--hover)' : 'transparent'
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
            <span style={{ font: `500 12.5px ${MONO}`, color: 'var(--tx)' }}>/{c.name}</span>
            {c.hint && <span style={{ font: `12px ${MONO}`, color: 'var(--tx3)' }}>{c.hint}</span>}
          </span>
          {c.desc && (
            <span style={{ fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.desc}</span>
          )}
        </div>
      ))}
    </div>
  ) : null

  return { menu, onKeyDown }
}
