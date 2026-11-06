import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { Library } from './library'

test('delete removes a skill folder and a file, and refuses unknown paths', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kokpit-lib-'))
  mkdirSync(join(home, 'skills', 'demo', 'assets'), { recursive: true })
  writeFileSync(join(home, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
  writeFileSync(join(home, 'skills', 'demo', 'assets', 'x.txt'), 'x')
  mkdirSync(join(home, 'agents'))
  writeFileSync(join(home, 'agents', 'helper.md'), '---\nname: helper\n---\n')
  const lib = new Library()
  const { entries } = await lib.list(home, {})
  expect(entries.map((e) => e.kind).sort()).toEqual(['agents', 'skills'])
  await lib.remove(join(home, 'skills', 'demo', 'SKILL.md'))
  expect(existsSync(join(home, 'skills', 'demo'))).toBe(false)
  await lib.remove(join(home, 'agents', 'helper.md'))
  expect(existsSync(join(home, 'agents', 'helper.md'))).toBe(false)
  await expect(lib.remove(join(home, '..', 'elsewhere.md'))).rejects.toThrow('not in the library')
})

test('memory create adds an index line and delete removes it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kokpit-mem-'))
  mkdirSync(join(home, 'memory'))
  writeFileSync(join(home, 'memory', 'MEMORY.md'), '- [Keep](keep.md) — stays\n')
  writeFileSync(join(home, 'memory', 'keep.md'), '---\nname: keep\ndescription: stays\n---\n')
  const lib = new Library()
  await lib.list(home, {})
  const created = await lib.create({ kind: 'memory', name: 'deploy-order', desc: 'schema first', repoRoot: null }, {})
  expect(created.kind).toBe('memory')
  const index = () => readFileSync(join(home, 'memory', 'MEMORY.md'), 'utf8')
  expect(index()).toBe('- [Keep](keep.md) — stays\n- [Deploy order](deploy-order.md) — schema first\n')
  await lib.list(home, {})
  await lib.remove(join(home, 'memory', 'deploy-order.md'))
  expect(existsSync(join(home, 'memory', 'deploy-order.md'))).toBe(false)
  expect(index()).toBe('- [Keep](keep.md) — stays\n')
})

test('a new command with arguments gets argument-hint and $ARGUMENTS', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kokpit-cmd-'))
  const lib = new Library()
  await lib.list(home, {})
  const entry = await lib.create({ kind: 'commands', name: 'review', desc: 'Review a PR', repoRoot: null, args: '<pr-url>' }, {})
  expect(entry.body).toBe('---\ndescription: Review a PR\nargument-hint: <pr-url>\n---\n\n$ARGUMENTS\n')
  const plain = await lib.create({ kind: 'commands', name: 'plain', desc: 'No args', repoRoot: null }, {})
  expect(plain.body).toBe('---\ndescription: No args\n---\n\n')
})

test('several arguments become numbered placeholders starting at $0', async () => {
  const { argumentLines } = await import('./library')
  expect(argumentLines('<pr-url> <focus>')).toBe('<pr-url>: $0\n<focus>: $1\n')
  expect(argumentLines('<pr-url>')).toBe('$ARGUMENTS\n')
  expect(argumentLines('  ')).toBe('')
})

test('uploading md files adds new skills, agents and commands and skips the ones that exist', async () => {
  const home = mkdtempSync(join(tmpdir(), 'kokpit-up-'))
  mkdirSync(join(home, 'agents'))
  writeFileSync(join(home, 'agents', 'helper.md'), '---\nname: helper\n---\nold\n')
  const lib = new Library()
  await lib.list(home, {})

  const skills = await lib.import(
    'skills',
    [
      { fileName: 'SKILL.md', body: '---\nname: review\ndescription: d\n---\nbody' },
      { fileName: 'Deploy.md', body: '# no frontmatter' },
      { fileName: 'SKILL.md', body: 'no name here' },
      { fileName: 'notes.txt', body: 'x' }
    ],
    {}
  )
  expect(skills.added.map((e) => e.name)).toEqual(['review', 'deploy'])
  expect(readFileSync(join(home, 'skills', 'review', 'SKILL.md'), 'utf8')).toBe('---\nname: review\ndescription: d\n---\nbody\n')
  expect(skills.failed.map((f) => f.file)).toEqual(['SKILL.md', 'notes.txt'])

  const agents = await lib.import('agents', [{ fileName: 'helper.md', body: 'new' }, { fileName: '../../evil.md', body: '---\nname: ../x\n---\n' }], {})
  expect(agents.skipped).toEqual(['helper.md'])
  expect(agents.failed).toHaveLength(1)
  expect(readFileSync(join(home, 'agents', 'helper.md'), 'utf8')).toContain('old')

  const commands = await lib.import('commands', [{ fileName: 'ship.md', body: 'run it' }, { fileName: 'ship.md', body: 'again' }], {})
  expect(commands.added).toHaveLength(1)
  expect(commands.skipped).toEqual(['ship.md'])

  await expect(lib.import('hooks', [{ fileName: 'x.md', body: '' }], {})).rejects.toThrow('Only skills')
})
