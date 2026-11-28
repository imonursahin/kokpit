import { execFileSync, spawn } from 'node:child_process'
import { expect, test } from 'vitest'
import { caffeinate } from './keepAwake'

const mac = process.platform === 'darwin'
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
const caffeinatePid = (owner: number): number | null => {
  try {
    return Number(execFileSync('pgrep', ['-f', `caffeinate -d -i -s -w ${owner}$`], { encoding: 'utf8' }).trim())
  } catch {
    return null
  }
}

test.skipIf(!mac)('keep awake holds idle and system sleep assertions until stopped', async () => {
  const owner = spawn('sleep', ['30'])
  let lost = false
  const stop = caffeinate(() => (lost = true), owner.pid)
  await wait(300)
  const pid = caffeinatePid(owner.pid!)
  expect(pid).not.toBeNull()
  const held = execFileSync('pmset', ['-g', 'assertions'], { encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.includes(`pid ${pid}(caffeinate)`))
    .join('\n')
  expect(held).toContain('PreventUserIdleSystemSleep')
  expect(held).toContain('PreventUserIdleDisplaySleep')
  expect(held).toContain('PreventSystemSleep')
  stop()
  await wait(300)
  expect(caffeinatePid(owner.pid!)).toBeNull()
  expect(lost).toBe(false)
  owner.kill()
})

test.skipIf(!mac)('keep awake ends and reports it when the owning process dies', async () => {
  const owner = spawn('sleep', ['30'])
  let lost = false
  caffeinate(() => (lost = true), owner.pid)
  await wait(300)
  owner.kill()
  await wait(1500)
  expect(caffeinatePid(owner.pid!)).toBeNull()
  expect(lost).toBe(true)
})
