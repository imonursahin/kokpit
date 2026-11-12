import { expect, test } from 'vitest'
import { meetingSoon, menuBarMeeting } from './meetings'

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

test('the menu bar shows the reminder meeting first, then the live one, then the next within an hour', () => {
  const now = Date.parse('2026-11-12T12:02:00Z')
  const lunch = ev('Lunch', '2026-11-12T12:00:00Z', '2026-11-12T13:00:00Z')
  const focus = ev('Focus', '2026-11-12T13:00:00Z', '2026-11-12T15:00:00Z')
  expect(menuBarMeeting([lunch, focus], now, 5)).toEqual({ event: lunch, minutes: 0, live: true, alert: true })
  expect(menuBarMeeting([focus], now, 5)).toEqual({ event: focus, minutes: 58, live: false, alert: false })
  expect(menuBarMeeting([lunch, focus], Date.parse('2026-11-12T12:57:00Z'), 5)).toEqual({ event: focus, minutes: 3, live: false, alert: true })
  expect(menuBarMeeting([focus], Date.parse('2026-11-12T11:30:00Z'), 5)).toBeUndefined()
})
