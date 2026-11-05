import type { CSSProperties, ReactNode } from 'react'

type Block =
  | { type: 'front'; fields: [string, string][] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'p'; text: string }
  | { type: 'list'; ordered: boolean; start: number; items: string[] }
  | { type: 'code'; text: string }

const HEADING = /^(#{1,6})\s+(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const FENCE = /^\s*```/
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|((?<!\w)_[^_\s][^_]*_(?!\w))/g

export function parse(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0

  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, n) => n > 0 && l.trim() === '---')
    if (end > 0) {
      const fields = lines.slice(1, end).flatMap((l): [string, string][] => {
        const at = l.indexOf(':')
        return at > 0 ? [[l.slice(0, at).trim(), l.slice(at + 1).trim()]] : []
      })
      blocks.push({ type: 'front', fields })
      i = end + 1
    }
  }

  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (!line.trim()) {
      i++
      continue
    }
    if (FENCE.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) body.push(lines[i++] ?? '')
      i++
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      blocks.push({ type: 'heading', level: h[1]?.length ?? 1, text: h[2] ?? '' })
      i++
      continue
    }
    const first = NUMBERED.exec(line)
    if (first || BULLET.test(line)) {
      const ordered = !!first
      const marker = ordered ? NUMBERED : BULLET
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i] ?? ''
        const m = marker.exec(l)
        if (m) items.push(m[m.length - 1] ?? '')
        else if (l.trim() && /^\s+/.test(l) && items.length) items[items.length - 1] += ` ${l.trim()}`
        else break
        i++
      }
      blocks.push({ type: 'list', ordered, start: Number(first?.[1] ?? 1), items })
      continue
    }
    const text: string[] = []
    while (i < lines.length) {
      const l = lines[i] ?? ''
      if (!l.trim() || FENCE.test(l) || HEADING.test(l) || BULLET.test(l) || NUMBERED.test(l)) break
      text.push(l.trim())
      i++
    }
    blocks.push({ type: 'p', text: text.join(' ') })
  }
  return blocks
}

const codeStyle: CSSProperties = {
  font: "13px 'Geist Mono',monospace",
  background: 'var(--hover)',
  padding: '1px 5px',
  borderRadius: 4,
  color: 'var(--tx)'
}

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index
    if (at > last) out.push(text.slice(last, at))
    const [tok] = m
    const key = out.length
    if (m[1]) out.push(<span key={key} style={codeStyle}>{tok.slice(1, -1)}</span>)
    else if (m[2]) out.push(<strong key={key} style={{ fontWeight: 600, color: 'var(--tx)' }}>{inline(tok.slice(2, -2))}</strong>)
    else if (m[3]) {
      const close = tok.indexOf('](')
      const label = inline(tok.slice(1, close))
      const href = tok.slice(close + 2, -1)
      out.push(
        href.startsWith('https://') ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{ color: 'var(--tx)', textDecoration: 'underline', textDecorationColor: 'var(--tx3)', textUnderlineOffset: 2 }}
          >
            {label}
          </a>
        ) : (
          <span key={key}>{label}</span>
        )
      )
    } else out.push(<em key={key}>{inline(tok.slice(1, -1))}</em>)
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function margin(blocks: Block[], i: number): number {
  const b = blocks[i]
  const prev = blocks[i - 1]
  if (!b || i === blocks.length - 1) return 0
  if (b.type === 'heading') return 6
  if (b.type === 'front') return 20
  if (b.type === 'p') return prev?.type === 'heading' && prev.level === 1 ? 20 : 14
  return 18
}

function render(b: Block, mb: number, key: number): ReactNode {
  if (b.type === 'front')
    return (
      <div
        key={key}
        style={{
          margin: `0 0 ${mb}px`,
          padding: '10px 14px',
          background: 'var(--code)',
          border: '1px solid var(--line-soft)',
          borderRadius: 8,
          display: 'grid',
          gridTemplateColumns: 'max-content minmax(0,1fr)',
          columnGap: 14,
          font: "12.5px/1.6 'Geist Mono',monospace"
        }}
      >
        {b.fields.map(([k, v], n) => [
          <span key={`k${n}`} style={{ color: 'var(--tx3)' }}>
            {k}
          </span>,
          <span key={`v${n}`} style={{ color: 'var(--tx2)' }}>
            {v}
          </span>
        ])}
      </div>
    )
  if (b.type === 'heading') {
    const style: CSSProperties = { margin: `0 0 ${mb}px`, fontWeight: 600 }
    if (b.level === 1) return <h1 key={key} style={{ ...style, fontSize: 22, letterSpacing: '-.01em' }}>{inline(b.text)}</h1>
    if (b.level === 2) return <h2 key={key} style={{ ...style, fontSize: 15 }}>{inline(b.text)}</h2>
    return <h3 key={key} style={{ ...style, fontSize: 14 }}>{inline(b.text)}</h3>
  }
  if (b.type === 'p')
    return (
      <p key={key} style={{ margin: `0 0 ${mb}px`, color: 'var(--tx2)' }}>
        {inline(b.text)}
      </p>
    )
  if (b.type === 'code')
    return (
      <pre
        key={key}
        style={{
          margin: `0 0 ${mb}px`,
          padding: '12px 14px',
          background: 'var(--code)',
          border: '1px solid var(--line-soft)',
          borderRadius: 8,
          font: "12.5px/1.6 'Geist Mono',monospace",
          color: 'var(--tx2)',
          overflowX: 'auto'
        }}
      >
        {b.text}
      </pre>
    )
  const style: CSSProperties = {
    margin: `0 0 ${mb}px`,
    paddingLeft: 20,
    color: 'var(--tx2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  }
  const items = b.items.map((t, n) => <li key={n}>{inline(t)}</li>)
  return b.ordered ? (
    <ol key={key} start={b.start} style={style}>
      {items}
    </ol>
  ) : (
    <ul key={key} style={style}>
      {items}
    </ul>
  )
}

export function Markdown({ source, size = 14, muted }: { source: string; size?: number; muted?: boolean }) {
  const blocks = parse(source)
  return (
    <div className="selectable" style={{ fontSize: size, lineHeight: 1.65, color: muted ? 'var(--tx2)' : 'var(--tx)', textWrap: 'pretty', overflowWrap: 'anywhere', minWidth: 0 }}>
      {blocks.map((b, i) => render(b, margin(blocks, i), i))}
    </div>
  )
}
