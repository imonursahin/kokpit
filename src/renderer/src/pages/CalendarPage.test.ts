import { expect, test } from 'vitest'
import { meetingsLeft } from '@/data/useCounts'
import { groupByDay, whenLabel } from './CalendarPage'

const ev = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ id, title: id, start, end, allDay: false, meetUrl: '', url: '', location: '', response: 'accepted' as const, ...extra })

test('meetings are grouped by day, all-day ones first, then by start time', () => {
  const groups = groupByDay([
    ev('late', '2026-11-11T15:00:00', '2026-11-11T16:00:00'),
    ev('next-day', '2026-11-12T09:00:00', '2026-11-12T09:30:00'),
    ev('early', '2026-11-11T09:00:00', '2026-11-11T09:30:00'),
    ev('holiday', '2026-11-11', '2026-11-12', { allDay: true })
  ])
  expect(groups.map((g) => g.events.map((e) => e.id))).toEqual([['holiday', 'early', 'late'], ['next-day']])
})

test('a meeting says when it starts and which ones are left today', () => {
  const now = Date.parse('2026-11-11T10:00:00Z')
  expect(whenLabel(ev('a', '2026-11-11T10:12:00Z', '2026-11-11T10:30:00Z'), now)).toEqual({ text: 'in 12 min', tone: 'soon' })
  expect(whenLabel(ev('b', '2026-11-11T09:50:00Z', '2026-11-11T10:20:00Z'), now)).toEqual({ text: 'Now', tone: 'now' })
  expect(whenLabel(ev('c', '2026-11-11T09:00:00Z', '2026-11-11T09:30:00Z'), now).tone).toBe('past')
  expect(whenLabel(ev('d', '2026-11-11T13:00:00Z', '2026-11-11T14:00:00Z'), now)).toEqual({ text: '', tone: '' })
  expect(
    meetingsLeft(
      [ev('past', '2026-11-11T09:00:00Z', '2026-11-11T09:30:00Z'), ev('now', '2026-11-11T09:50:00Z', '2026-11-11T10:20:00Z'), ev('no', '2026-11-11T11:00:00Z', '2026-11-11T12:00:00Z', { response: 'declined' }), ev('all', '2026-11-11', '2026-11-12', { allDay: true })],
      now
    )
  ).toBe(1)
})
