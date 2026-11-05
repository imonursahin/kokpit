import { expect, test, vi } from 'vitest'

vi.mock('electron', () => ({}))

test('the tray gauge draws a solid dot, a value arc and a faint track on a clear background', async () => {
  const { gaugeBitmap } = await import('./tray')
  const px = 100
  const buf = gaugeBitmap(px)
  const alpha = (x: number, y: number) => buf[(y * px + x) * 4 + 3]
  expect(alpha(50, 50)).toBe(255)
  expect(alpha(2, 2)).toBe(0)
  expect(alpha(50, 13)).toBeGreaterThan(200)
  const track = alpha(87, 50)
  expect(track).toBeGreaterThan(40)
  expect(track).toBeLessThan(140)
})

test('reset times read as days and hours, or hours and minutes', async () => {
  const { resetsIn } = await import('./tray')
  const now = Date.parse('2026-11-05T12:00:00Z')
  expect(resetsIn('2026-11-10T08:00:00Z', now)).toBe('resets in 4d 20h')
  expect(resetsIn('2026-11-05T15:30:00Z', now)).toBe('resets in 3h 30m')
  expect(resetsIn('2026-11-05T12:20:00Z', now)).toBe('resets in 20m')
  expect(resetsIn('2026-11-05T11:00:00Z', now)).toBe('resets now')
})
