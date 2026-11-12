import type { CalendarEvent } from './integrations'

export type MeetingState = { state: 'live' | 'soon'; title: string }

const timed = (events: CalendarEvent[]) => events.filter((e) => !e.allDay && e.response !== 'declined')

export function meetingSoon(events: CalendarEvent[], nowMs: number, reminderMinutes: number): { event: CalendarEvent; minutes: number } | undefined {
  const next = timed(events)
    .map((event) => ({ event, left: Date.parse(event.start) - nowMs }))
    .filter((x) => x.left > 0 && x.left <= reminderMinutes * 60_000)
    .sort((a, b) => a.left - b.left)[0]
  return next ? { event: next.event, minutes: Math.ceil(next.left / 60_000) } : undefined
}

export function meetingState(events: CalendarEvent[], nowMs: number, reminderMinutes: number): MeetingState | undefined {
  const live = timed(events).find((e) => Date.parse(e.start) <= nowMs && nowMs < Date.parse(e.end))
  if (live) return { state: 'live', title: `In a meeting · ${live.title}` }
  const soon = meetingSoon(events, nowMs, reminderMinutes)
  return soon ? { state: 'soon', title: `${soon.event.title} starts in ${soon.minutes} min` } : undefined
}
