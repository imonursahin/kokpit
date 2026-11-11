import { expect, test } from 'vitest'
import { calendarRange } from './integrations'
import { meetingNotices } from './notifier'

const ev = (id: string, start: string, extra: Record<string, unknown> = {}) => ({ id, title: `Meeting ${id}`, start, end: start, allDay: false, meetUrl: 'https://meet.google.com/x', url: '', location: '', response: 'accepted' as const, ...extra })

test('the meeting reminder fires once, at the time the user picked', () => {
  const start = Date.parse('2026-11-11T10:00:00Z')
  const events = [ev('a', '2026-11-11T10:00:00Z'), ev('d', '2026-11-11T10:00:00Z', { response: 'declined' }), ev('all', '2026-11-11', { allDay: true })]
  const run = (minutes: number) => {
    const sent = new Set<string>()
    return [10, 9.5, 5, 4.5, 3, 2.5, 1, 0.5, 0.2].flatMap((left) => meetingNotices(events, start - left * 60_000, sent, minutes).map((n) => `${left}:${n.title}`))
  }
  expect(run(3)).toEqual(['3:Meeting in 3 min · Meeting a'])
  expect(run(10)).toEqual(['10:Meeting in 10 min · Meeting a'])
  expect(run(1)).toEqual(['1:Meeting in 1 min · Meeting a'])
  expect(run(5)).toEqual(['5:Meeting in 5 min · Meeting a'])
  expect(meetingNotices(events, start - 5 * 60_000, new Set(), 5)[0]?.url).toBe('https://meet.google.com/x')
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
