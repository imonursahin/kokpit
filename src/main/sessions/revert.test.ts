import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { revertFile } from './revert'

test('restores tracked files and trashes new ones, refuses paths outside the repo', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kokpit-revert-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root })
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  writeFileSync(join(root, 'a.txt'), 'old\n')
  git('add', 'a.txt')
  git('commit', '-qm', 'init')
  writeFileSync(join(root, 'a.txt'), 'new\n')
  writeFileSync(join(root, 'b.txt'), 'added\n')

  const trashed: string[] = []
  const trash = async (p: string) => {
    trashed.push(p)
  }
  expect(await revertFile(root, 'a.txt', trash)).toBe('restored')
  expect(readFileSync(join(root, 'a.txt'), 'utf8')).toBe('old\n')
  expect(await revertFile(root, 'b.txt', trash)).toBe('trashed')
  expect(trashed).toEqual([join(root, 'b.txt')])
  expect(existsSync(join(root, 'a.txt'))).toBe(true)
  await expect(revertFile(root, '../outside.txt', trash)).rejects.toThrow('outside')
})
