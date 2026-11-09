import { useEffect, useState, type ClipboardEvent } from 'react'
import { IMAGE_TYPES, type ImageInput } from '@shared/runner'
import { Icon } from './primitives'

type Pasted = ImageInput & { id: string; url: string }

const MAX_IMAGES = 10

export function withImageMarkers(text: string, count: number): string {
  const markers = Array.from({ length: count }, (_, i) => `[Image #${i + 1}]`).join(' ')
  return [markers, text].filter(Boolean).join(' ')
}

const kept = new Map<string, Pasted[]>()

export function usePastedImages(key?: string) {
  const [images, setImages] = useState<Pasted[]>(() => (key ? (kept.get(key) ?? []) : []))
  useEffect(() => {
    if (!key) return
    if (images.length) kept.set(key, images)
    else kept.delete(key)
  }, [key, images])

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...e.clipboardData.files].filter((f) => (IMAGE_TYPES as readonly string[]).includes(f.type))
    if (!files.length) return
    e.preventDefault()
    for (const file of files) {
      const reader = new FileReader()
      reader.onload = () => {
        const url = String(reader.result)
        const data = url.slice(url.indexOf(',') + 1)
        setImages((cur) =>
          cur.length >= MAX_IMAGES ? cur : [...cur, { id: crypto.randomUUID(), mediaType: file.type as ImageInput['mediaType'], data, url }]
        )
      }
      reader.readAsDataURL(file)
    }
  }

  const payload = (): ImageInput[] => images.map(({ mediaType, data }) => ({ mediaType, data }))

  const tray = images.length ? (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px 0' }}>
      {images.map((img, i) => (
        <span key={img.id} style={{ position: 'relative', display: 'flex' }}>
          <img
            src={img.url}
            alt={`Image #${i + 1}`}
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }}
          />
          <button
            aria-label={`Remove image ${i + 1}`}
            onClick={() => setImages((cur) => cur.filter((x) => x.id !== img.id))}
            style={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 18,
              height: 18,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--tx)',
              cursor: 'pointer'
            }}
          >
            <Icon name="close" size={12} color="var(--panel)" />
          </button>
        </span>
      ))}
    </div>
  ) : null

  return { count: images.length, onPaste, payload, clear: () => setImages([]), restore: setImages, snapshot: () => images, tray }
}
