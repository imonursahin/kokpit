import { get } from 'node:http'
import { afterEach, expect, test, vi } from 'vitest'
import { authUrl, connectGoogle, freshCreds, toCalendarEvent } from './google'

afterEach(() => vi.unstubAllGlobals())

test('the sign-in link asks for read-only calendar access with PKCE and an offline token', () => {
  const u = new URL(authUrl('id.apps.googleusercontent.com', 'http://127.0.0.1:5000', 'chal', 'st'))
  expect(u.origin).toBe('https://accounts.google.com')
  expect(Object.fromEntries(u.searchParams)).toMatchObject({
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    code_challenge: 'chal',
    code_challenge_method: 'S256',
    access_type: 'offline',
    redirect_uri: 'http://127.0.0.1:5000',
    state: 'st'
  })
})

test('Google events become calendar rows with a safe Meet link and my answer', () => {
  expect(
    toCalendarEvent({
      id: 'e1',
      summary: 'Daily',
      start: { dateTime: '2026-11-11T10:00:00+03:00' },
      end: { dateTime: '2026-11-11T10:15:00+03:00' },
      hangoutLink: 'https://meet.google.com/abc',
      htmlLink: 'https://calendar.google.com/e1',
      attendees: [{ self: true, responseStatus: 'tentative' }, { responseStatus: 'accepted' }]
    })
  ).toEqual({ id: 'e1', title: 'Daily', start: '2026-11-11T10:00:00+03:00', end: '2026-11-11T10:15:00+03:00', allDay: false, meetUrl: 'https://meet.google.com/abc', url: 'https://calendar.google.com/e1', location: '', response: 'tentative' })
  expect(toCalendarEvent({ id: 'e2', start: { date: '2026-11-11' }, end: { date: '2026-11-12' }, conferenceData: { entryPoints: [{ entryPointType: 'video', uri: 'javascript:alert(1)' }] } })).toMatchObject({ allDay: true, meetUrl: '', title: '(No title)', response: 'accepted' })
  expect(toCalendarEvent({ id: 'e3', status: 'cancelled', start: { dateTime: '2026-11-11T10:00:00Z' } })).toBeNull()
  expect(toCalendarEvent({ id: 'e4', eventType: 'workingLocation', start: { date: '2026-11-11' } })).toBeNull()
})

test('signing in catches the browser redirect, checks the state and keeps the refresh token', async () => {
  const real = fetch
  const calls: string[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push(String(url))
    if (String(url).startsWith('http://127.0.0.1')) return real(url, init)
    if (String(url).includes('oauth2.googleapis.com/token')) {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('code')).toBe('the-code')
      expect(body.get('code_verifier')).toBeTruthy()
      return new Response(JSON.stringify({ access_token: 'at', refresh_token: 'rt', expires_in: 3600 }), { status: 200 })
    }
    return new Response(JSON.stringify({ summary: 'me@example.com', items: [] }), { status: 200 })
  })
  const hit = (url: string) => new Promise<number>((resolve) => get(url, (res) => resolve(res.statusCode ?? 0)).on('error', () => resolve(0)))
  const creds = await connectGoogle({ clientId: 'id.apps.googleusercontent.com', clientSecret: 's' }, (link) => {
    const q = new URL(link).searchParams
    const redirect = q.get('redirect_uri') ?? ''
    void hit(`${redirect}/?state=wrong&code=evil`).then((status) => {
      expect(status).toBe(404)
      return hit(`${redirect}/?state=${q.get('state')}&code=the-code`)
    })
  })
  expect(creds).toMatchObject({ refreshToken: 'rt', accessToken: 'at', account: 'me@example.com' })
  expect(calls.some((c) => c.includes('calendar/v3/calendars/primary/events'))).toBe(true)
})

test('a bad client ID is refused before the browser opens', async () => {
  const open = vi.fn()
  await expect(connectGoogle({ clientId: 'nope', clientSecret: 's' }, open)).rejects.toThrow('apps.googleusercontent.com')
  expect(open).not.toHaveBeenCalled()
})

test('an expired access token is refreshed, a revoked one asks to reconnect', async () => {
  const creds = { clientId: 'c', clientSecret: 's', refreshToken: 'rt', accessToken: 'old', expiresAt: 0, account: 'me' }
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 }), { status: 200 }))
  expect(await freshCreds(creds, 1_000)).toMatchObject({ accessToken: 'new', refreshToken: 'rt', expiresAt: 3_601_000 })
  const live = { ...creds, accessToken: 'ok', expiresAt: 10_000_000 }
  expect(await freshCreds(live, 1_000)).toBe(live)
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), { status: 400 }))
  await expect(freshCreds(creds, 1_000)).rejects.toMatchObject({ status: 401 })
})

test('a meeting link written in the location or description is found too', async () => {
  const { meetingLinkIn } = await import('./google')
  expect(meetingLinkIn('Room 4', 'Join: https://us02web.zoom.us/j/123?pwd=a&amp;b=c<br>')).toBe('https://us02web.zoom.us/j/123?pwd=a&b=c')
  expect(meetingLinkIn('https://teams.microsoft.com/l/meetup-join/19%3a')).toBe('https://teams.microsoft.com/l/meetup-join/19%3a')
  expect(meetingLinkIn(undefined, 'see https://example.com/doc')).toBe('')
  expect(toCalendarEvent({ id: 'z', start: { dateTime: '2026-11-12T14:00:00Z' }, description: 'Link: https://meet.google.com/abc-defg-hij' })?.meetUrl).toBe('https://meet.google.com/abc-defg-hij')
})
