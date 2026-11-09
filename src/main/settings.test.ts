import { expect, test } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { sanitizeSettings } from './settings'

test('keeps known values, drops unknown ones, rejects a missing executable', () => {
  const s = sanitizeSettings({ defaultModel: 'claude-sonnet-5-5', defaultEffort: 'nope', showHeadless: true, extra: 1 })
  expect(s).toEqual({ ...DEFAULT_SETTINGS, defaultModel: 'claude-sonnet-5-5', showHeadless: true })
  expect(() => sanitizeSettings({ claudeExecutable: '/no/such/claude' })).toThrow('not found')
  expect(sanitizeSettings({ claudeExecutable: '' }).claudeExecutable).toBe('')
})

test('notification settings merge per event and ignore junk', () => {
  const s = sanitizeSettings({ notifyEnabled: false, notify: { sessionDone: true, bogus: true, prChecksFailed: 'yes' } })
  expect(s.notifyEnabled).toBe(false)
  expect(s.notify.sessionDone).toBe(true)
  expect(s.notify.prChecksFailed).toBe(false)
  expect('bogus' in s.notify).toBe(false)
})

test('keeps a known permission mode and ignores an unknown one', () => {
  expect(sanitizeSettings({ defaultMode: 'auto' }).defaultMode).toBe('auto')
  expect(sanitizeSettings({ defaultMode: 'yolo' }).defaultMode).toBe(DEFAULT_SETTINGS.defaultMode)
})

test('session tags keep up to ten named, coloured tags and drop assignments to deleted tags', async () => {
  const { sanitizeSettings } = await import('./settings')
  const sid = '8a4cae0f-947f-4aee-bad7-8e4a27ebc714'
  const s = sanitizeSettings({
    sessionTags: [
      { id: 'deploy', name: '  Waiting for deploy  ', color: 'blue' },
      { id: 'deploy', name: 'duplicate', color: 'red' },
      { id: 'Bad Id', name: 'x', color: 'red' },
      { id: 'review', name: 'Review', color: 'magenta' }
    ],
    sessionTagOf: { [sid]: 'deploy', 'not-a-session': 'deploy', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': 'gone' }
  })
  expect(s.sessionTags).toEqual([
    { id: 'deploy', name: 'Waiting for deploy', color: 'blue' },
    { id: 'review', name: 'Review', color: 'gray' }
  ])
  expect(s.sessionTagOf).toEqual({ [sid]: 'deploy' })
  expect(sanitizeSettings({ sessionTags: [] }, s).sessionTagOf).toEqual({})
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, color: 'blue' }))
  expect(sanitizeSettings({ sessionTags: ten }).sessionTags).toHaveLength(10)
  expect(() => sanitizeSettings({ sessionTags: [...ten, { id: 't10', name: 'T10', color: 'red' }] })).toThrow('up to 10')
})
