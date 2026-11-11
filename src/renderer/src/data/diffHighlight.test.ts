import { expect, test } from 'vitest'
import { diffSegments } from './diffHighlight'

const tokens = (segs: { text: string; cls: string }[] | null | undefined) => (segs ?? []).filter((s) => s.cls).map((s) => `${s.cls}:${s.text}`)

test('diff lines are coloured by language, each side parsed on its own', () => {
  const lines = [
    { sign: '@', t: '@@ -1,2 +1,2 @@' },
    { sign: ' ', t: 'const a = 1' },
    { sign: '-', t: "const b = 'old'" },
    { sign: '+', t: "const b = 'new' // changed" }
  ]
  const segs = diffSegments('src/a.ts', lines)
  expect(segs[0]).toBeNull()
  expect(tokens(segs[1])).toContain('tok-keyword:const')
  expect(tokens(segs[2])).toContain("tok-string:'old'")
  expect(tokens(segs[3])).toEqual(expect.arrayContaining(["tok-string:'new'", 'tok-comment:// changed']))
  expect(segs[3]?.map((s) => s.text).join('')).toBe(lines[3]?.t)
})

test('a string that spans lines keeps its colour on the next line', () => {
  const segs = diffSegments('a.ts', [
    { sign: '+', t: 'const s = `first' },
    { sign: '+', t: 'second`' }
  ])
  expect(tokens(segs[1])).toEqual(['tok-string2:second`'])
})

test('files without a known language stay plain', () => {
  expect(diffSegments('main.go', [{ sign: '+', t: 'func main() {}' }])).toEqual([null])
})
