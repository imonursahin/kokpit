import { jsonLanguage } from '@codemirror/lang-json'
import { javascriptLanguage, jsxLanguage, tsxLanguage, typescriptLanguage } from '@codemirror/lang-javascript'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { pythonLanguage } from '@codemirror/lang-python'
import type { Parser } from '@lezer/common'
import { classHighlighter, highlightTree } from '@lezer/highlight'

export type Segment = { text: string; cls: string }
type Line = { sign: string; t: string }

const MAX_LINES = 5000

const PARSERS: Record<string, Parser> = {
  js: javascriptLanguage.parser,
  mjs: javascriptLanguage.parser,
  cjs: javascriptLanguage.parser,
  jsx: jsxLanguage.parser,
  ts: typescriptLanguage.parser,
  mts: typescriptLanguage.parser,
  cts: typescriptLanguage.parser,
  tsx: tsxLanguage.parser,
  vue: typescriptLanguage.parser,
  py: pythonLanguage.parser,
  json: jsonLanguage.parser,
  md: markdownLanguage.parser
}

export function parserFor(path: string): Parser | null {
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? ''
  return PARSERS[ext] ?? null
}

export function highlightLines(parser: Parser, lines: string[]): Segment[][] {
  const text = lines.join('\n')
  const ranges: [number, number, string][] = []
  highlightTree(parser.parse(text), classHighlighter, (from, to, cls) => {
    ranges.push([from, to, cls])
  })
  const out: Segment[][] = []
  let pos = 0
  let r = 0
  for (const line of lines) {
    const end = pos + line.length
    const segs: Segment[] = []
    let at = pos
    while (r < ranges.length && (ranges[r]?.[1] ?? 0) <= pos) r++
    for (let k = r; k < ranges.length; k++) {
      const [from, to, cls] = ranges[k] as [number, number, string]
      if (from >= end) break
      const s = Math.max(from, at)
      const e = Math.min(to, end)
      if (s > at) segs.push({ text: text.slice(at, s), cls: '' })
      if (e > s) segs.push({ text: text.slice(s, e), cls })
      at = Math.max(at, e)
    }
    if (at < end) segs.push({ text: text.slice(at, end), cls: '' })
    out.push(segs)
    pos = end + 1
  }
  return out
}

export function diffSegments(path: string, lines: Line[]): (Segment[] | null)[] {
  const parser = parserFor(path)
  const out: (Segment[] | null)[] = lines.map(() => null)
  if (!parser || lines.length > MAX_LINES) return out
  let start = 0
  const hunk = (from: number, to: number) => {
    for (const side of [' +', ' -']) {
      const idx: number[] = []
      for (let i = from; i < to; i++) if (side.includes(lines[i]?.sign ?? '@')) idx.push(i)
      if (!idx.length) continue
      const segs = highlightLines(parser, idx.map((i) => lines[i]?.t ?? ''))
      idx.forEach((i, j) => {
        if (lines[i]?.sign !== ' ' || side === ' +') out[i] = segs[j] ?? null
      })
    }
  }
  for (let i = 0; i <= lines.length; i++) {
    if (i === lines.length || lines[i]?.sign === '@') {
      if (i > start) hunk(start, i)
      start = i + 1
    }
  }
  return out
}
