import { expect, test, vi } from 'vitest'
import { lockNavigation } from './navigation'

test('windows never navigate away and only https links open, in the browser', () => {
  let navigate: ((e: { preventDefault(): void }) => void) | undefined
  let open: ((d: { url: string }) => { action: 'deny' }) | undefined
  const openExternal = vi.fn()
  lockNavigation({ on: (_ev, l) => (navigate = l), setWindowOpenHandler: (h) => (open = h) }, openExternal)

  const preventDefault = vi.fn()
  navigate?.({ preventDefault })
  expect(preventDefault).toHaveBeenCalled()

  expect(open?.({ url: 'https://github.com/x' })).toEqual({ action: 'deny' })
  expect(open?.({ url: 'file:///tmp/evil.html' })).toEqual({ action: 'deny' })
  expect(open?.({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
  expect(openExternal).toHaveBeenCalledTimes(1)
  expect(openExternal).toHaveBeenCalledWith('https://github.com/x')
})
