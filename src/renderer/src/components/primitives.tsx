import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function Icon({
  name,
  size = 18,
  weight = 400,
  color,
  style
}: {
  name: string
  size?: number
  weight?: number
  color?: string
  style?: CSSProperties
}) {
  return (
    <span
      className="ms"
      aria-hidden
      style={{ font: `${weight} ${size}px/1 'Material Symbols Rounded'`, width: size, flexShrink: 0, color, ...style }}
    >
      {name}
    </span>
  )
}

export function Spinner({ size = 12, width = 2 }: { size?: number; width?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: `${width}px solid var(--run)`,
        borderRightColor: 'transparent',
        boxSizing: 'border-box',
        display: 'block',
        animation: 'dcspin .9s linear infinite'
      }}
    />
  )
}

export function Kbd({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      style={{
        font: "500 10.5px/1 'Geist Mono',monospace",
        color: 'var(--tx3)',
        border: '1px solid var(--line)',
        borderBottomWidth: 2,
        borderRadius: 4,
        padding: '2px 4px',
        ...style
      }}
    >
      {children}
    </span>
  )
}

export function KeyHint({ children, inverted }: { children: ReactNode; inverted?: boolean }) {
  return (
    <span
      style={{
        font: "400 11px/1 'Geist Mono',monospace",
        ...(inverted ? { opacity: 0.6 } : { color: 'var(--tx3)' })
      }}
    >
      {children}
    </span>
  )
}

type ButtonProps = {
  children: ReactNode
  hint?: ReactNode
  icon?: string
  onClick?: () => void
  style?: CSSProperties
  small?: boolean
}

export function PrimaryButton({ children, hint, icon, onClick, style, small }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? 7 : 8,
        height: small ? 24 : 32,
        padding: small ? '0 7px 0 9px' : `0 10px 0 ${icon ? 10 : 12}px`,
        borderRadius: small ? 6 : 8,
        background: 'var(--pri)',
        color: 'var(--inv)',
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {icon && <Icon name={icon} size={17} />}
      {children}
      {hint && (
        <span style={{ font: `400 ${small ? 10.5 : 11}px/1 'Geist Mono',monospace`, opacity: 0.6 }}>{hint}</span>
      )}
    </button>
  )
}

export function SecondaryButton({ children, hint, icon, onClick, style, small }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: small ? 7 : 8,
        height: small ? 24 : 32,
        padding: small ? '0 7px 0 9px' : `0 ${hint ? 10 : 12}px 0 ${icon ? 10 : 12}px`,
        borderRadius: small ? 6 : 8,
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        color: 'var(--tx)',
        fontSize: small ? 12 : 13,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {icon && <Icon name={icon} size={17} color="var(--tx2)" />}
      {children}
      {hint && <span style={{ font: `400 ${small ? 10.5 : 11}px/1 'Geist Mono',monospace`, color: 'var(--tx3)' }}>{hint}</span>}
    </button>
  )
}

export function JiraKey({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        font: "500 11.5px/1 'Geist Mono',monospace",
        color: 'var(--tx2)',
        background: 'var(--hover)',
        padding: '4px 6px',
        borderRadius: 5
      }}
    >
      {children}
    </span>
  )
}

export function Dash() {
  return <span style={{ color: 'var(--tx3)' }}>—</span>
}

export function OpenButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open on GitHub"
      style={{
        justifySelf: 'end',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 28,
        padding: '0 10px',
        border: '1px solid var(--line)',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        color: 'var(--tx)',
        background: 'var(--panel)',
        textDecoration: 'none',
        whiteSpace: 'nowrap'
      }}
    >
      GitHub
      <Icon name="open_in_new" size={15} color="var(--tx2)" />
    </a>
  )
}

export function Tip({ label, side = 'top', children }: { label: string; side?: 'top' | 'bottom'; children: ReactNode }) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const [left, setLeft] = useState<number | null>(null)
  const tip = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = tip.current
    if (!at || !el) return setLeft(null)
    const w = el.offsetWidth
    setLeft(Math.min(Math.max(8, at.x - w / 2), window.innerWidth - w - 8))
  }, [at, label])
  return (
    <span
      aria-label={label}
      style={{ display: 'inline-flex', flexShrink: 0 }}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setAt({ x: r.left + r.width / 2, y: side === 'top' ? r.top - 6 : r.bottom + 6 })
      }}
      onMouseLeave={() => setAt(null)}
    >
      {children}
      {at &&
        createPortal(
          <span
            ref={tip}
            role="tooltip"
            style={{
              position: 'fixed',
              left: left ?? at.x,
              top: at.y,
              transform: side === 'top' ? 'translateY(-100%)' : undefined,
              visibility: left === null ? 'hidden' : 'visible',
              padding: '5px 8px',
              borderRadius: 6,
              background: 'var(--tx)',
              color: 'var(--panel)',
              fontSize: 12,
              fontWeight: 500,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              zIndex: 100
            }}
          >
            {label}
          </span>,
          document.body
        )}
    </span>
  )
}
