import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { appendMemory, runShell } from './shell'

test('runs a command in the session folder and keeps its output and exit code', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-shell-'))
  writeFileSync(join(dir, 'a.txt'), 'hello\n')
  expect(await runShell(dir, 'cat a.txt')).toMatchObject({ code: 0, output: 'hello\n', truncated: false })
  expect((await runShell(dir, 'exit 3')).code).toBe(3)
  expect(() => runShell('relative', 'ls')).toThrow('Folder not found')
})

test('a # note is appended as a bullet to the project CLAUDE.md', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-mem-'))
  writeFileSync(join(dir, 'CLAUDE.md'), '# Rules')
  const file = await appendMemory('project', dir, 'Use pnpm,\nnot npm')
  expect(file).toBe(join(dir, 'CLAUDE.md'))
  expect(readFileSync(file, 'utf8')).toBe('# Rules\n- Use pnpm, not npm\n')
  await expect(appendMemory('team', dir, 'x')).rejects.toThrow('invalid memory target')
})

test('a command that leaves a background child behind still returns, and the timeout kills the whole group', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-shell-'))
  const t0 = Date.now()
  const r = await runShell(dir, 'sleep 30 & echo started')
  expect(r.output).toContain('started')
  expect(Date.now() - t0).toBeLessThan(5000)
  const slow = await runShell(dir, 'echo before; sleep 30', 800)
  expect(slow.code).toBeNull()
  expect(slow.output).toContain('before')
})

test('@ file list keeps non-ASCII file names intact', async () => {
  const { execFileSync } = await import('node:child_process')
  const { listFiles } = await import('./files')
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-files-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, 'ü.txt'), 'x')
  expect(await listFiles(dir)).toContain('ü.txt')
})
