import { expect, test } from 'vitest'
import { meetingsLeftToday } from './TrayPanel'

const ev = (id: string, start: string, end: string, extra: Record<string, unknown> = {}) => ({ id, title: id, start, end, allDay: false, meetUrl: '', url: '', location: '', response: 'accepted' as const, ...extra })

test('the menu bar lists only the meetings still ahead today, in start order', () => {
  const now = Date.parse('2026-11-11T10:00:00Z')
  const list = meetingsLeftToday(
    [
      ev('later', '2026-11-11T15:00:00Z', '2026-11-11T16:00:00Z'),
      ev('done', '2026-11-11T08:00:00Z', '2026-11-11T09:00:00Z'),
      ev('now', '2026-11-11T09:45:00Z', '2026-11-11T10:15:00Z'),
      ev('declined', '2026-11-11T11:00:00Z', '2026-11-11T12:00:00Z', { response: 'declined' }),
      ev('holiday', '2026-11-11', '2026-11-12', { allDay: true })
    ],
    now
  )
  expect(list.map((e) => e.id)).toEqual(['now', 'later'])
})
