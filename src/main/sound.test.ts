import { expect, test } from 'vitest'
import { doneChime } from './sound'

test('the done chime is a short, valid 16-bit mono WAV that is not silent', () => {
  const wav = doneChime()
  expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
  expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
  expect(wav.readUInt32LE(4)).toBe(wav.length - 8)
  const seconds = wav.readUInt32LE(40) / 2 / wav.readUInt32LE(24)
  expect(seconds).toBeGreaterThan(0.5)
  expect(seconds).toBeLessThan(1.5)
  let peak = 0
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)))
  expect(peak).toBeGreaterThan(5000)
  expect(peak).toBeLessThan(32_767)
})
