import type { DetailDiffLine } from '../../shared/sessionDetail'

export type ParsedDiff = { path: string; change: 'M' | 'A' | 'D'; add: number; del: number; lines: DetailDiffLine[] }

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/

export function parseUnifiedDiff(text: string): ParsedDiff[] {
  const out: ParsedDiff[] = []
  let cur: ParsedDiff | null = null
  let o = 0
  let n = 0
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = / b\/(.+)$/.exec(raw)
      cur = { path: m?.[1] ?? '', change: 'M', add: 0, del: 0, lines: [] }
      out.push(cur)
      continue
    }
    if (!cur) continue
    if (raw.startsWith('new file mode')) cur.change = 'A'
    else if (raw.startsWith('deleted file mode')) cur.change = 'D'
    else if (raw.startsWith('--- ') || raw.startsWith('+++ ') || raw.startsWith('index ') || raw.startsWith('similarity ')) continue
    else if (raw.startsWith('@@')) {
      const m = HUNK.exec(raw)
      if (!m) continue
      o = Number(m[1])
      n = Number(m[2])
      cur.lines.push({ o: '', n: '', sign: '@', t: raw })
    } else if (raw.startsWith('+')) {
      cur.add += 1
      cur.lines.push({ o: '', n: n++, sign: '+', t: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      cur.del += 1
      cur.lines.push({ o: o++, n: '', sign: '-', t: raw.slice(1) })
    } else if (raw.startsWith(' ')) {
      cur.lines.push({ o: o++, n: n++, sign: ' ', t: raw.slice(1) })
    }
  }
  return out.filter((d) => d.path)
}

export function editAsDiff(oldText: string, newText: string): DetailDiffLine[] {
  const lines: DetailDiffLine[] = [{ o: '', n: '', sign: '@', t: '@@ edit @@' }]
  if (oldText) for (const t of oldText.split('\n')) lines.push({ o: '', n: '', sign: '-', t })
  if (newText) for (const t of newText.split('\n')) lines.push({ o: '', n: '', sign: '+', t })
  return lines
}

export function lineCount(text: string): number {
  return text ? text.split('\n').length : 0
}

const TEST_PATH = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[a-z0-9]+$|_test\.[a-z0-9]+$/i

export function isTestPath(path: string): boolean {
  return TEST_PATH.test(path)
}
