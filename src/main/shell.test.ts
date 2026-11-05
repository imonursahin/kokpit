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
