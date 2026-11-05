import { expect, test } from 'vitest'
import { versionGreater } from './updates'

test('compares versions part by part', () => {
  expect(versionGreater('0.2.0', '0.1.9')).toBe(true)
  expect(versionGreater('0.10.0', '0.9.3')).toBe(true)
  expect(versionGreater('1.0.0', '1.0.0')).toBe(false)
  expect(versionGreater('0.1.0', '0.1.1')).toBe(false)
  expect(versionGreater('1.2', '1.1.9')).toBe(true)
})
