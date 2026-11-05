import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, expect, test } from 'vitest'
import { gitFiles } from './detail'

const dir = mkdtempSync(join(tmpdir(), 'kokpit-gitfiles-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' })
const names = async (root: string, file: string) => (await gitFiles(root, [file])).map((f) => f.path)

test('lists changes until they are pushed', async () => {
  const remote = join(dir, 'remote.git')
  const repo = join(dir, 'repo')
  git(dir, 'init', '-q', '--bare', remote)
  git(dir, 'clone', '-q', remote, repo)
  git(repo, 'config', 'user.email', 'test@example.com')
  git(repo, 'config', 'user.name', 'Test')
  const file = join(repo, 'a.txt')
  writeFileSync(file, 'one\n')
  git(repo, 'add', 'a.txt')
  git(repo, 'commit', '-q', '-m', 'first')
  git(repo, 'push', '-q', '-u', 'origin', 'HEAD')

  writeFileSync(file, 'two\n')
  expect(await names(repo, file)).toEqual(['a.txt'])

  git(repo, 'commit', '-q', '-am', 'second')
  expect(await names(repo, file)).toEqual(['a.txt'])

  git(repo, 'push', '-q')
  expect(await names(repo, file)).toEqual([])
})
