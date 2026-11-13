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

test('session tags keep up to twenty named, coloured tags, a session can have up to three, and deleted tags drop off', async () => {
  const { sanitizeSettings } = await import('./settings')
  const sid = '8a4cae0f-947f-4aee-bad7-8e4a27ebc714'
  const s = sanitizeSettings({
    sessionTags: [
      { id: 'deploy', name: '  Waiting for deploy  ', color: 'blue' },
      { id: 'deploy', name: 'duplicate', color: 'red' },
      { id: 'Bad Id', name: 'x', color: 'red' },
      { id: 'review', name: 'Review', color: 'magenta' }
    ],
    sessionTagOf: { [sid]: ['deploy', 'review', 'gone', 'deploy'], 'not-a-session': ['deploy'], 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee': ['gone'] }
  })
  expect(s.sessionTags).toEqual([
    { id: 'deploy', name: 'Waiting for deploy', color: 'blue' },
    { id: 'review', name: 'Review', color: 'gray' }
  ])
  expect(s.sessionTagOf).toEqual({ [sid]: ['deploy', 'review'] })
  expect(sanitizeSettings({ sessionTags: [{ id: 'review', name: 'Review', color: 'gray' }] }, s).sessionTagOf).toEqual({ [sid]: ['review'] })
  expect(sanitizeSettings({ sessionTags: [] }, s).sessionTagOf).toEqual({})
  expect(sanitizeSettings({ sessionTags: [{ id: 'deploy', name: 'Deploy', color: 'blue' }], sessionTagOf: { [sid]: 'deploy' } }).sessionTagOf).toEqual({ [sid]: ['deploy'] })
  const four = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, color: 'blue' }))
  expect(sanitizeSettings({ sessionTags: four, sessionTagOf: { [sid]: ['a', 'b', 'c', 'd'] } }).sessionTagOf).toEqual({ [sid]: ['a', 'b', 'c'] })
  const twenty = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `T${i}`, color: 'blue' }))
  expect(sanitizeSettings({ sessionTags: twenty }).sessionTags).toHaveLength(20)
  expect(() => sanitizeSettings({ sessionTags: [...twenty, { id: 't20', name: 'T20', color: 'red' }] })).toThrow('up to 20')
})

test('loading saved settings with a Claude path that no longer exists keeps everything else', () => {
  const saved = { claudeExecutable: '/nope/claude', defaultEffort: 'low', sessionTags: [{ id: 'd', name: 'Deploy', color: 'blue' }], assistantHome: '/Users/x/Kokpit/' }
  expect(() => sanitizeSettings(saved)).toThrow('not found')
  const loaded = sanitizeSettings(saved, DEFAULT_SETTINGS, false)
  expect(loaded).toMatchObject({ claudeExecutable: '', defaultEffort: 'low', sessionTags: [{ id: 'd' }], assistantHome: '/Users/x/Kokpit' })
})
