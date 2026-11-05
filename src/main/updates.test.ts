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
