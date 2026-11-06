import { expect, test } from 'vitest'
import { rekeyIds } from './useRunner'

test('every earlier id of a session follows it when /clear gives it a new id', () => {
  let ids = new Map<string, string>()
  ids = rekeyIds(ids, 'pending-1', 'session-a')
  ids = rekeyIds(ids, 'session-a', 'session-b')
  expect(ids.get('pending-1')).toBe('session-b')
  expect(ids.get('session-a')).toBe('session-b')
  ids = rekeyIds(ids, 'session-b', 'session-c')
  expect([...ids.values()]).toEqual(['session-c', 'session-c', 'session-c'])
})
