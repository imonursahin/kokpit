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

const live = (events: CalendarEvent[], nowMs: number) => timed(events).find((e) => Date.parse(e.start) <= nowMs && nowMs < Date.parse(e.end))

export const MENU_BAR_HORIZON_MINUTES = 60

export function menuBarMeeting(events: CalendarEvent[], nowMs: number, reminderMinutes: number): { event: CalendarEvent; minutes: number; live: boolean; alert: boolean } | undefined {
  const soon = meetingSoon(events, nowMs, reminderMinutes)
  if (soon) return { ...soon, live: false, alert: true }
  const current = live(events, nowMs)
  if (current) return { event: current, minutes: 0, live: true, alert: true }
  const next = meetingSoon(events, nowMs, MENU_BAR_HORIZON_MINUTES)
  return next ? { ...next, live: false, alert: false } : undefined
}

export function meetingState(events: CalendarEvent[], nowMs: number, reminderMinutes: number): MeetingState | undefined {
  const current = live(events, nowMs)
  if (current) return { state: 'live', title: `In a meeting · ${current.title}` }
  const soon = meetingSoon(events, nowMs, reminderMinutes)
  return soon ? { state: 'soon', title: `${soon.event.title} starts in ${soon.minutes} min` } : undefined
}
