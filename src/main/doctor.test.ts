import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { remoteControl } from './doctor'

test('Doctor says whether Remote Control can be used', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-doctor-'))
  const off = join(dir, 'off.json')
  const on = join(dir, 'on.json')
  writeFileSync(off, JSON.stringify({ disableRemoteControl: true }))
  writeFileSync(on, JSON.stringify({ model: 'opus' }))
  const none = join(dir, 'missing.json')
  const claudeAi = { loggedIn: true, authMethod: 'claude.ai' }
  expect((await remoteControl(claudeAi, { managed: none, user: on })).status).toBe('ok')
  expect((await remoteControl(claudeAi, { managed: off, user: on })).value).toBe('Turned off')
  expect((await remoteControl(claudeAi, { managed: none, user: off })).value).toBe('Turned off')
  expect((await remoteControl({ loggedIn: true, authMethod: 'api_key' }, { managed: none, user: none })).value).toBe('Needs a claude.ai login')
  expect((await remoteControl(null, { managed: none, user: none })).status).toBe('warn')
})
