import { expect, test } from 'vitest'
import { insertPaths } from './dropPaths'

test('dropped file paths go in at the cursor with spacing, and paths with spaces are quoted', () => {
  expect(insertPaths('', 0, 0, ['/a/b.ts'])).toEqual({ value: '/a/b.ts ', caret: 8 })
  expect(insertPaths('look at', 7, 7, ['/a/b.ts', '/My Docs/c.md'])).toEqual({ value: 'look at /a/b.ts "/My Docs/c.md" ', caret: 32 })
  expect(insertPaths('fix  please', 4, 4, ['/x'])).toEqual({ value: 'fix /x please', caret: 6 })
  expect(insertPaths('see OLD now', 4, 7, ['/y'])).toEqual({ value: 'see /y now', caret: 6 })
})
