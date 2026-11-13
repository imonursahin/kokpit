import { homedir, tmpdir } from 'node:os'
import { expect, test } from 'vitest'
import { pluginActionArgs, toPlugins } from './plugins'

test('installs of the same plugin are grouped under one row, user first, then by project', () => {
  const list = toPlugins([
    { id: 'zeus@zeus', version: '1.0.5', scope: 'project', enabled: false, projectPath: '/b' },
    { id: 'zeus@zeus', version: '1.0.5', scope: 'user', enabled: true },
    { id: 'zeus@zeus', version: '1.0.4', scope: 'project', enabled: true, projectPath: '/a' },
    { id: 'ponytail@ponytail', version: '2.0.0', scope: 'managed', enabled: true },
    { id: 'bad id', scope: 'user' },
    { id: 'x@y', scope: 'galaxy' }
  ])
  expect(list.map((p) => p.id)).toEqual(['ponytail@ponytail', 'zeus@zeus'])
  expect(list[1]).toMatchObject({ name: 'zeus', marketplace: 'zeus' })
  expect(list[1]?.installs.map((i) => [i.scope, i.projectPath, i.enabled])).toEqual([
    ['user', '', true],
    ['project', '/a', true],
    ['project', '/b', false]
  ])
})

test('a plugin action runs with its scope, in the project folder for a project install, and rejects bad input', () => {
  expect(pluginActionArgs('disable', 'zeus@zeus', 'user', '')).toEqual({ args: ['disable', 'zeus@zeus', '--scope', 'user'], cwd: homedir() })
  expect(pluginActionArgs('enable', 'zeus@zeus', 'project', tmpdir())).toEqual({ args: ['enable', 'zeus@zeus', '--scope', 'project'], cwd: tmpdir() })
  expect(pluginActionArgs('update', 'p@m', 'managed', '')).toEqual({ args: ['update', 'p@m', '--scope', 'managed'], cwd: homedir() })
  expect(() => pluginActionArgs('install', 'zeus@zeus', 'user', '')).toThrow('Invalid plugin action')
  expect(() => pluginActionArgs('enable', 'zeus@zeus', 'galaxy', '')).toThrow('Invalid plugin scope')
  expect(() => pluginActionArgs('enable', '--all', 'user', '')).toThrow('Invalid plugin id')
  expect(() => pluginActionArgs('enable', 'zeus@zeus', 'project', 'relative/path')).toThrow('Project folder not found')
})

test('an install is up to date when its version or pinned commit matches what the marketplace now offers', async () => {
  const { computeUpdates, updateState } = await import('./plugins')
  const entry = (e: Partial<{ version: string; sha: string; pluginJsonVersion: string }>) => ({ version: '', sha: '', pluginJsonVersion: '', ...e })
  expect(updateState({ version: '1.1.1', gitCommitSha: 'x' }, entry({ pluginJsonVersion: '1.1.1' }), 'abc')).toEqual({ state: 'current', latest: '1.1.1' })
  expect(updateState({ version: '1.0.0', gitCommitSha: 'x' }, entry({ pluginJsonVersion: '1.1.1' }), 'abc')).toEqual({ state: 'outdated', latest: '1.1.1' })
  expect(updateState({ version: 'dceb15d50832', gitCommitSha: 'x' }, entry({}), 'f75f5b25ae94f433')).toEqual({ state: 'outdated', latest: 'f75f5b25ae94' })
  expect(updateState({ version: '7.0.0', gitCommitSha: 'aaa' }, entry({ sha: 'aaa' }), 'm')).toMatchObject({ state: 'current' })
  expect(updateState({ version: '7.0.0', gitCommitSha: 'aaa' }, entry({ sha: 'bbb' }), 'm')).toMatchObject({ state: 'outdated' })
  expect(updateState({ version: '1.0.0', gitCommitSha: '' }, undefined, 'm')).toEqual({ state: 'unknown', latest: '' })
  const installed = { plugins: { 'a@m': [{ scope: 'user', version: '1.0.0' }, { scope: 'project', projectPath: '/p', version: '0.9.0' }], 'b@gone': [{ scope: 'user', version: '1' }], bad: [] } }
  const known = { m: { installLocation: '/markets/m' } }
  const items = computeUpdates(installed, known, () => ({ commit: 'c', entries: new Map([['a', entry({ pluginJsonVersion: '1.0.0' })]]) }))
  expect(items.map((i) => [i.id, i.scope, i.state, i.latest])).toEqual([
    ['a@m', 'user', 'current', '1.0.0'],
    ['a@m', 'project', 'outdated', '1.0.0'],
    ['b@gone', 'user', 'unknown', '']
  ])
})
