import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react'
import { SEARCH_CORPUS, SEARCH_INITIAL_QUERY, SEARCH_TYPES } from '@/mock/search'
import type { SearchResult, SearchResultType } from '@/mock/search'
import { Icon } from './primitives'

type Tab = 'all' | SearchResultType

const PER_GROUP_IN_ALL = 3

const kbd: CSSProperties = {
  font: "500 10.5px/1 'Geist Mono',monospace",
  border: '1px solid var(--line)',
  borderBottomWidth: 2,
  borderRadius: 4,
  padding: '2px 5px'
}

function snippet(text: string, q: string): ReactNode[] {
  if (!q) return [text]
  const lower = text.toLowerCase()
  const first = lower.indexOf(q)
  let shown = text
  if (first > 44) {
    const cut = text.indexOf(' ', first - 40)
    shown = '…' + text.slice(cut >= 0 && cut < first ? cut + 1 : first - 40)
  }
  const parts: ReactNode[] = []
  const shownLower = shown.toLowerCase()
  let from = 0
  let at = shownLower.indexOf(q)
  while (at >= 0) {
    if (at > from) parts.push(shown.slice(from, at))
    parts.push(
      <span key={at} style={{ background: 'var(--mark)', color: 'var(--tx)', borderRadius: 3, padding: '0 2px' }}>
        {shown.slice(at, at + q.length)}
      </span>
    )
    from = at + q.length
    at = shownLower.indexOf(q, from)
  }
  if (from < shown.length) parts.push(shown.slice(from))
  return parts
}

function KeyLegend({ k, label }: { k: string; label: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ ...kbd, color: 'var(--tx2)', padding: '2px 4px' }}>{k}</span>
      {label}
    </span>
  )
}

export function SearchPalette({
  onClose,
  onOpenResult
}: {
  onClose: () => void
  onOpenResult: (r: SearchResult) => void
}) {
  const api = window.kokpit
  const [query, setQuery] = useState(api ? '' : SEARCH_INITIAL_QUERY)
  const [remote, setRemote] = useState<{ q: string; hits: SearchResult[]; counts: Record<SearchResult['type'], number>; indexing: boolean } | null>(null)
  const [tab, setTab] = useState<Tab>('all')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()

  useEffect(() => {
    if (!api || q.length < 2) {
      setRemote(null)
      return
    }
    let alive = true
    const t = window.setTimeout(() => {
      api
        .search(q)
        .then((r) => {
          if (alive) setRemote({ q, hits: r.hits, counts: r.counts, indexing: r.indexing })
        })
        .catch((err: Error) => console.log(`[kokpit] search failed: ${err.message}`))
    }, 120)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [api, q])

  const matches = useMemo(() => {
    if (api) return remote?.q === q ? remote.hits : []
    return q ? SEARCH_CORPUS.filter((r) => r.text.toLowerCase().includes(q) || r.title.toLowerCase().includes(q)) : []
  }, [api, remote, q])

  const countOf = (type: SearchResult['type']) =>
    api && remote?.q === q ? remote.counts[type] : matches.filter((r) => r.type === type).length

  const groups = useMemo(
    () =>
      SEARCH_TYPES.map((t) => {
        const all = matches.filter((r) => r.type === t.type)
        return { ...t, count: countOf(t.type), items: tab === 'all' ? all.slice(0, PER_GROUP_IN_ALL) : all }
      }).filter((g) => g.items.length > 0 && (tab === 'all' || g.type === tab)),
    [matches, tab]
  )

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: SEARCH_TYPES.reduce((n, t) => n + countOf(t.type), 0) },
    ...SEARCH_TYPES.map((t) => ({ id: t.type, label: t.label, count: countOf(t.type) }))
  ]

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => setSel(0), [q, tab])

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!flat.length) return
      setSel((i) => (e.key === 'ArrowDown' ? Math.min(flat.length - 1, i + 1) : Math.max(0, i - 1)))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = flat[sel]
      if (r) onOpenResult(r)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const i = tabs.findIndex((t) => t.id === tab)
      const next = tabs[(i + (e.shiftKey ? tabs.length - 1 : 1)) % tabs.length]
      if (next) setTab(next.id)
    }
  }

  let row = -1

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'var(--scrim)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: 92,
        boxSizing: 'border-box',
        fontSize: 13,
        color: 'var(--tx)'
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        style={{
          width: 720,
          maxHeight: 'calc(100vh - 184px)',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: 'var(--pop)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            height: 56,
            flexShrink: 0,
            padding: '0 18px',
            borderBottom: '1px solid var(--line)'
          }}
        >
          <Icon name="search" size={20} color="var(--tx3)" style={{ overflow: 'hidden' }} />
          <input
            ref={inputRef}
            className="bare"
            style={{ flex: 1, minWidth: 0, fontSize: 16 }}
            placeholder="Search sessions, skills, agents and rules"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="search-palette-results"
          />
          {q && (
            <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>
              {tabs[0]?.count ?? 0} results{remote?.indexing ? ' · indexing…' : ''}
            </span>
          )}
          <span style={{ ...kbd, color: 'var(--tx3)' }}>esc</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
            padding: '8px 12px',
            borderBottom: '1px solid var(--line-soft)',
            fontSize: 12.5,
            color: 'var(--tx2)'
          }}
        >
          {tabs.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setTab(t.id)}
                style={{
                  height: 26,
                  padding: '0 10px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  ...(on ? { background: 'var(--hover)', color: 'var(--tx)', fontWeight: 500 } : {})
                }}
              >
                {t.label}
                <span style={{ color: 'var(--tx3)', fontWeight: 400 }}>{t.count}</span>
              </button>
            )
          })}
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: 'var(--tx3)', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={kbd}>tab</span>switch type
          </span>
        </div>

        <div
          ref={listRef}
          id="search-palette-results"
          role="listbox"
          style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}
        >
          {q && !flat.length && (
            <div style={{ padding: '18px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>No matches for “{query.trim()}”</div>
          )}
          {groups.map((g) => (
            <div key={g.type} style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 10px 4px',
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: 'var(--tx3)'
                }}
              >
                <span>{g.label}</span>
                <span style={{ fontWeight: 400 }}>{g.count}</span>
              </div>
              {g.items.map((r) => {
                row += 1
                const index = row
                const selected = index === sel
                return (
                  <div
                    key={r.id}
                    role="option"
                    aria-selected={selected}
                    data-sel={selected}
                    onMouseMove={() => setSel(index)}
                    onClick={() => onOpenResult(r)}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '9px 10px',
                      borderRadius: 8,
                      background: selected ? 'var(--sel)' : 'transparent',
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name={g.icon} size={17} color="var(--tx3)" style={{ overflow: 'hidden', marginTop: 1 }} />
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', minWidth: 0 }}>
                        <span style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.title}
                        </span>
                        <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap' }}>{r.where}</span>
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: 'var(--tx2)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {snippet(r.text, q)}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--tx3)', whiteSpace: 'nowrap', marginTop: 1 }}>{r.when}</span>
                    {selected && <span style={{ ...kbd, color: 'var(--tx2)', background: 'var(--panel)' }}>↵</span>}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        <div
          style={{
            height: 38,
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '0 16px',
            fontSize: 12,
            color: 'var(--tx3)',
            background: 'var(--bg)'
          }}
        >
          <KeyLegend k="↑↓" label="Navigate" />
          <KeyLegend k="↵" label="Open at match" />
          <KeyLegend k="⌘↵" label="Open in split" />
          <span style={{ flex: 1 }} />
          <span>Searching sessions, skills, agents and rules</span>
        </div>
      </div>
    </div>
  )
}
