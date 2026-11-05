import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { assertSessionId, deleteSessionTraces } from './delete'

const ID = '3b52b9e0-3615-4cfb-9f0c-4b3f785d097d'
const OTHER = '11111111-2222-3333-4444-555555555555'

test('removes side folders and the session prompts, keeps other sessions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kokpit-del-'))
  mkdirSync(join(dir, 'file-history', ID), { recursive: true })
  mkdirSync(join(dir, 'session-env', ID), { recursive: true })
  writeFileSync(
    join(dir, 'history.jsonl'),
    [
      JSON.stringify({ display: 'secret prompt', sessionId: ID }),
      JSON.stringify({ display: 'keep me', sessionId: OTHER }),
      'not json'
    ].join('\n')
  )
  const removed: string[] = []
  await deleteSessionTraces(ID, async (id) => void removed.push(id), dir)
  expect(removed).toEqual([ID])
  expect(existsSync(join(dir, 'file-history', ID))).toBe(false)
  expect(existsSync(join(dir, 'session-env', ID))).toBe(false)
  const history = readFileSync(join(dir, 'history.jsonl'), 'utf8')
  expect(history).not.toContain('secret prompt')
  expect(history).toContain('keep me')
  expect(history).toContain('not json')
})

test('rejects anything that is not a session id', () => {
  expect(() => assertSessionId('../../etc')).toThrow('Invalid session id')
})
