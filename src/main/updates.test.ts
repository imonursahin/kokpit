import { expect, test } from 'vitest'
import { versionGreater } from './updates'

test('compares versions part by part', () => {
  expect(versionGreater('0.2.0', '0.1.9')).toBe(true)
  expect(versionGreater('0.10.0', '0.9.3')).toBe(true)
  expect(versionGreater('1.0.0', '1.0.0')).toBe(false)
  expect(versionGreater('0.1.0', '0.1.1')).toBe(false)
  expect(versionGreater('1.2', '1.1.9')).toBe(true)
})

test('the update never stops to ask and never quits the running app', async () => {
  const { updateCommand } = await import('./updates')
  const cmd = updateCommand()
  if (!cmd) return
  expect(cmd.at(-1)).toContain('HOMEBREW_NO_ASK=1')
  expect(cmd.at(-1)).toContain('HOMEBREW_NO_UPGRADE_QUIT_CASKS=1')
})

test('when several releases were skipped, the notes cover every one of them, newest first', async () => {
  const { newerReleases } = await import('./updates')
  const releases = [
    { tag_name: 'v0.1.13', body: '**Added**\n- Right-click menu' },
    { tag_name: 'v0.1.15', body: '', draft: true },
    { tag_name: 'v0.1.14', body: '**Added**\n- Session tags' },
    { tag_name: 'v0.1.12', body: '**Fixed**\n- Old' }
  ]
  const two = newerReleases(releases, '0.1.12')
  expect(two.latest?.tag_name).toBe('v0.1.14')
  expect(two.versions).toEqual(['0.1.14', '0.1.13'])
  expect(two.notes).toBe('### 0.1.14\n\n**Added**\n- Session tags\n\n### 0.1.13\n\n**Added**\n- Right-click menu')
  expect(newerReleases(releases, '0.1.13').notes).toBe('**Added**\n- Session tags')
  expect(newerReleases(releases, '0.1.14')).toMatchObject({ versions: [], notes: '**Added**\n- Session tags' })
})
