import { useEffect, useRef, useState } from 'react'
import { Icon } from './primitives'

export function SelectChip({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const current = options.find((o) => o.value === value)?.label ?? value

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 30,
          padding: '0 6px 0 10px',
          border: '1px solid var(--line)',
          borderRadius: 7,
          fontSize: 12.5,
          color: 'var(--tx3)'
        }}
      >
        {label}
        <span style={{ color: 'var(--tx)' }}>{current}</span>
        <Icon name="expand_more" size={16} />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 34,
            left: 0,
            minWidth: 180,
            maxHeight: 320,
            overflow: 'auto',
            background: 'var(--panel)',
            borderRadius: 9,
            boxShadow: 'var(--pop)',
            border: '1px solid var(--line)',
            padding: 4,
            zIndex: 20
          }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              className="menu-item"
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                height: 28,
                padding: '0 8px',
                borderRadius: 6,
                fontSize: 12.5,
                textAlign: 'left',
                color: 'var(--tx)'
              }}
            >
              <span style={{ flex: 1, fontFamily: o.value === '' ? 'inherit' : "'Geist Mono',monospace" }}>{o.label}</span>
              {o.value === value && <Icon name="check" size={15} color="var(--tx2)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
