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
