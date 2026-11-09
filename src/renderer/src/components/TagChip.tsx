import { useEffect, useRef, useState } from 'react'
import { Icon } from './primitives'
import type { TagColor } from '@shared/settings'

export const TAG_HEX: Record<TagColor, string> = {
  blue: '#3B82F6',
  green: '#22A06B',
  orange: '#F59E0B',
  red: '#E5484D',
  purple: '#8B5CF6',
  gray: '#8A8A85'
}

export function tagHex(color: string): string {
  return TAG_HEX[color as TagColor] ?? TAG_HEX.gray
}

export function TagChip({ name, color }: { name: string; color: string }) {
  const hex = tagHex(color)
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 20,
        padding: '0 7px',
        borderRadius: 10,
        flexShrink: 0,
        fontSize: 11.5,
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: hex,
        background: `${hex}1F`,
        border: `1px solid ${hex}40`
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: hex }} />
      {name}
    </span>
  )
}

export function TagPicker({ tags, tagId, onTag }: { tags: { id: string; name: string; color: string }[]; tagId?: string; onTag: (tagId: string | null) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  const current = tags.find((t) => t.id === tagId)
  const pick = (id: string | null) => {
    setOpen(false)
    onTag(id)
  }
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button aria-haspopup="menu" aria-expanded={open} title="Session tag" onClick={() => setOpen((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
        {current ? (
          <TagChip name={current.name} color={current.color} />
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 10, border: '1px dashed var(--line)', fontSize: 11.5, color: 'var(--tx3)' }}>
            <Icon name="sell" size={13} color="var(--tx3)" />
            Tag
          </span>
        )}
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, minWidth: 200, padding: 4, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--pop)', display: 'flex', flexDirection: 'column' }}>
          {tags.length === 0 && <span style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>No tags yet. Add them in Settings → Sessions.</span>}
          {tags.map((t) => (
            <button key={t.id} role="menuitemradio" aria-checked={t.id === tagId} className="menu-item" onClick={() => pick(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, fontSize: 13, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagHex(t.color) }} />
              <span style={{ flex: 1 }}>{t.name}</span>
              {t.id === tagId && <Icon name="check" size={15} color="var(--tx2)" />}
            </button>
          ))}
          {current && (
            <button role="menuitem" className="menu-item" onClick={() => pick(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, fontSize: 13, color: 'var(--tx2)', textAlign: 'left', cursor: 'pointer', borderTop: '1px solid var(--line-soft)' }}>
              <Icon name="close" size={14} color="var(--tx3)" />
              Remove tag
            </button>
          )}
        </div>
      )}
    </span>
  )
}
