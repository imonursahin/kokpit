import { useEffect, useState } from 'react'
import { Icon } from './primitives'
import { MAX_TAGS_PER_SESSION, type TagColor } from '@shared/settings'

export const TAG_HEX: Record<TagColor, string> = {
  blue: '#3B82F6',
  green: '#22A06B',
  orange: '#F59E0B',
  red: '#E5484D',
  purple: '#8B5CF6',
  teal: '#14B8A6',
  pink: '#EC4899',
  yellow: '#CA8A04',
  indigo: '#6366F1',
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

export function TagPicker({ tags, tagIds, onTags }: { tags: { id: string; name: string; color: string }[]; tagIds: string[]; onTags: (tagIds: string[]) => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onBlur = () => setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onBlur)
    }
  }, [open])
  const current = tags.filter((t) => tagIds.includes(t.id))
  const rest = tags.filter((t) => !tagIds.includes(t.id))
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {current.map((t) => (
        <span key={t.id} className="tag-removable" style={{ position: 'relative', display: 'inline-flex' }}>
          <TagChip name={t.name} color={t.color} />
          <button
            aria-label={`Remove tag ${t.name}`}
            title={`Remove ${t.name}`}
            onClick={() => onTags(tagIds.filter((x) => x !== t.id))}
            style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel)', border: '1px solid var(--line)', cursor: 'pointer' }}
          >
            <Icon name="close" size={10} color="var(--tx2)" />
          </button>
        </span>
      ))}
      {current.length < MAX_TAGS_PER_SESSION && (
        <button aria-haspopup="menu" aria-expanded={open} title="Add a tag" onClick={() => setOpen((v) => !v)} style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 7px', borderRadius: 10, border: '1px dashed var(--line)', fontSize: 11.5, color: 'var(--tx3)' }}>
            <Icon name="sell" size={13} color="var(--tx3)" />
            Tag
          </span>
        </button>
      )}
      {open && (
        <>
          <div className="no-drag" onMouseDown={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 39 }} />
          <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, minWidth: 200, maxHeight: 360, overflow: 'auto', padding: 4, background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--pop)', display: 'flex', flexDirection: 'column' }}>
            {tags.length === 0 && <span style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>No tags yet. Add them in Settings → Sessions.</span>}
            {tags.length > 0 && rest.length === 0 && <span style={{ padding: '8px 10px', fontSize: 12.5, color: 'var(--tx3)' }}>Every tag is already on this session.</span>}
            {rest.map((t) => (
              <button
                key={t.id}
                role="menuitem"
                className="menu-item"
                onClick={() => {
                  setOpen(false)
                  onTags([...tagIds, t.id])
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, fontSize: 13, textAlign: 'left', cursor: 'pointer' }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: tagHex(t.color) }} />
                <span style={{ flex: 1 }}>{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  )
}
