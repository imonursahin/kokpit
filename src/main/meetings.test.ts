import { expect, test } from 'vitest'
import { calendarRange } from './integrations'
import { meetingNotices } from './notifier'

const ev = (id: string, start: string, extra: Record<string, unknown> = {}) => ({ id, title: `Meeting ${id}`, start, end: start, allDay: false, meetUrl: 'https://meet.google.com/x', url: '', location: '', response: 'accepted' as const, ...extra })

test('a meeting reminder fires once at 10, 5, 3 and 1 minutes before the start', () => {
  const start = Date.parse('2026-11-11T10:00:00Z')
  const sent = new Set<string>()
  const events = [ev('a', '2026-11-11T10:00:00Z'), ev('d', '2026-11-11T10:00:00Z', { response: 'declined' }), ev('all', '2026-11-11', { allDay: true })]
  const at = (minLeft: number) => meetingNotices(events, start - minLeft * 60_000, sent).map((n) => n.title)
  expect(at(10)).toEqual(['Meeting in 10 min · Meeting a'])
  expect(at(9.8)).toEqual([])
  expect(at(7)).toEqual([])
  expect(at(4.5)).toEqual(['Meeting in 5 min · Meeting a'])
  expect(at(2.2)).toEqual(['Meeting in 3 min · Meeting a'])
  expect(at(0.5)).toEqual(['Meeting in 1 min · Meeting a'])
  expect(at(0.2)).toEqual([])
  expect(at(-1)).toEqual([])
  expect(meetingNotices(events, start - 5 * 60_000, new Set())[0]?.url).toBe('https://meet.google.com/x')
})

test('the week view starts on Monday and the day view covers today', () => {
  const wed = new Date(2026, 10, 11, 15, 30)
  const week = calendarRange('week', wed)
  expect([week.from.getDay(), week.from.getDate(), week.to.getDate()]).toEqual([1, 9, 16])
  const day = calendarRange('day', wed)
  expect([day.from.getDate(), day.from.getHours(), day.to.getDate()]).toEqual([11, 0, 12])
  const sunday = calendarRange('week', new Date(2026, 10, 15, 9))
  expect(sunday.from.getDate()).toBe(9)
})
