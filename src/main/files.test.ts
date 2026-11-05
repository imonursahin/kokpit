import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { listFiles, rankFiles } from './files'

test('file mentions rank file name matches before path matches', () => {
  const files = ['src/main/runner.ts', 'src/renderer/src/App.tsx', 'docs/runner-notes.md', 'src/shared/runner.ts', 'README.md']
  expect(rankFiles(files, 'runner')).toEqual(['src/main/runner.ts', 'docs/runner-notes.md', 'src/shared/runner.ts'])
  expect(rankFiles(files, 'app')).toEqual(['src/renderer/src/App.tsx'])
  expect(rankFiles(files, 'nothing-like-this')).toEqual([])
  expect(rankFiles(files, '', 2)).toEqual(['src/main/runner.ts', 'src/renderer/src/App.tsx'])
})

test('lists files of a plain folder and skips dependency folders', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-files-'))
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'node_modules', 'x'), { recursive: true })
  writeFileSync(join(dir, 'src', 'a.ts'), '')
  writeFileSync(join(dir, 'node_modules', 'x', 'b.js'), '')
  expect(await listFiles(dir)).toEqual(['src/a.ts'])
  expect(await listFiles('relative/path')).toEqual([])
})
