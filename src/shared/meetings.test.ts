import { expect, test } from 'vitest'
import { meetingSoon } from './meetings'

const ev = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ id, title: id, start, end, allDay: false, meetUrl: '', url: '', location: '', response: 'accepted' as const, ...extra })

test('the menu bar shows the next meeting only inside the reminder time, even during another meeting', () => {
  const now = Date.parse('2026-11-12T13:57:00Z')
  const live = ev('Focus', '2026-11-12T13:00:00Z', '2026-11-12T18:00:00Z')
  const next = ev('Ferdie', '2026-11-12T14:00:00Z', '2026-11-12T14:30:00Z')
  expect(meetingSoon([live, next], now, 3)).toEqual({ event: next, minutes: 3 })
  expect(meetingSoon([live, next], now, 1)).toBeUndefined()
  expect(meetingSoon([ev('No', '2026-11-12T14:00:00Z', '2026-11-12T15:00:00Z', { response: 'declined' })], now, 5)).toBeUndefined()
  expect(meetingSoon([next], Date.parse('2026-11-12T14:00:30Z'), 5)).toBeUndefined()
})
