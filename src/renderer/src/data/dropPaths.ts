import type { DragEvent } from 'react'

const quote = (p: string) => (/\s/.test(p) ? `"${p}"` : p)

export function insertPaths(value: string, start: number, end: number, paths: string[]): { value: string; caret: number } {
  const before = value.slice(0, start)
  const after = value.slice(end)
  const text = `${before && !/\s$/.test(before) ? ' ' : ''}${paths.map(quote).join(' ')}${/^\s/.test(after) ? '' : ' '}`
  return { value: before + text + after, caret: before.length + text.length }
}

export function fileDropProps(setValue: (v: string) => void) {
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  return {
    onDragOver: (e: DragEvent<HTMLTextAreaElement>) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    },
    onDrop: (e: DragEvent<HTMLTextAreaElement>) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const paths = Array.from(e.dataTransfer.files)
        .map((f) => window.kokpit?.pathForFile(f) ?? '')
        .filter(Boolean)
      if (!paths.length) return
      const el = e.currentTarget
      const next = insertPaths(el.value, el.selectionStart, el.selectionEnd, paths)
      setValue(next.value)
      el.focus()
      requestAnimationFrame(() => el.setSelectionRange(next.caret, next.caret))
    }
  }
}
