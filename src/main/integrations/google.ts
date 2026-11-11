import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CalendarEvent, GoogleConnectInput } from '../../shared/integrations'
import { fetchJson, HttpError } from './http'

export type GoogleCreds = { clientId: string; clientSecret: string; refreshToken: string; accessToken: string; expiresAt: number; account: string }

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const SIGN_IN_TIMEOUT_MS = 5 * 60_000

type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string }

async function requestToken(body: Record<string, string>): Promise<TokenResponse & { access_token: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000)
  })
  const data = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${res.status}`
    throw new HttpError(data.error === 'invalid_grant' ? 401 : res.status || 400, `Google refused the sign-in: ${reason}`)
  }
  return data as TokenResponse & { access_token: string }
}

export function authUrl(clientId: string, redirect: string, challenge: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    scope: CALENDAR_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${AUTH_URL}?${q.toString()}`
}

const DONE_PAGE = (text: string) =>
  `<!doctype html><meta charset="utf-8"><title>Kokpit</title><body style="font:15px system-ui;padding:48px;color:#222">${text}</body>`

function signIn(clientId: string, open: (url: string) => void): Promise<{ code: string; redirect: string; verifier: string }> {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(24).toString('base64url')
  return new Promise((resolve, reject) => {
    let redirect = ''
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/' || url.searchParams.get('state') !== state) {
        res.writeHead(404).end()
        return
      }
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(DONE_PAGE(code ? 'Google Calendar is connected. You can close this tab and go back to Kokpit.' : 'Sign-in was cancelled. You can close this tab.'))
      finish(code ? null : new Error(error === 'access_denied' ? 'Google sign-in was cancelled' : `Google sign-in failed: ${error ?? 'no code'}`), code ?? '')
    })
    const timer = setTimeout(() => finish(new Error('Google sign-in timed out. Try again.'), ''), SIGN_IN_TIMEOUT_MS)
    const finish = (err: Error | null, code: string) => {
      clearTimeout(timer)
      server.close()
      if (err) reject(err)
      else resolve({ code, redirect, verifier })
    }
    server.on('error', (err) => finish(err, ''))
    server.listen(0, '127.0.0.1', () => {
      redirect = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      open(authUrl(clientId, redirect, challenge, state))
    })
  })
}

export async function connectGoogle(input: GoogleConnectInput, open: (url: string) => void): Promise<GoogleCreds> {
  const clientId = typeof input?.clientId === 'string' ? input.clientId.trim() : ''
  const clientSecret = typeof input?.clientSecret === 'string' ? input.clientSecret.trim() : ''
  if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(clientId)) throw new Error('The client ID should end with .apps.googleusercontent.com')
  if (!clientSecret) throw new Error('Paste the client secret too')
  const { code, redirect, verifier } = await signIn(clientId, open)
  const t = await requestToken({ grant_type: 'authorization_code', code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, code_verifier: verifier })
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Kokpit from your Google account access and try again.')
  const creds: GoogleCreds = { clientId, clientSecret, refreshToken: t.refresh_token, accessToken: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000, account: '' }
  const now = new Date()
  const probe = await fetchEvents(creds, now, new Date(now.getTime() + 60_000))
  return { ...creds, account: probe.calendar }
}

export async function freshCreds(creds: GoogleCreds, nowMs = Date.now()): Promise<GoogleCreds> {
  if (creds.accessToken && creds.expiresAt - 60_000 > nowMs) return creds
  const t = await requestToken({ grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: creds.clientId, client_secret: creds.clientSecret })
  return { ...creds, accessToken: t.access_token, expiresAt: nowMs + (t.expires_in ?? 3600) * 1000, refreshToken: t.refresh_token || creds.refreshToken }
}

type GoogleEvent = {
  id?: string
  status?: string
  eventType?: string
  summary?: string
  htmlLink?: string
  hangoutLink?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] }
}

const https = (u: unknown) => (typeof u === 'string' && /^https:\/\//i.test(u) ? u : '')
const RESPONSES = new Set(['accepted', 'declined', 'tentative', 'needsAction'])

export function toCalendarEvent(e: GoogleEvent): CalendarEvent | null {
  if (!e.id || e.status === 'cancelled' || e.eventType === 'workingLocation') return null
  const start = e.start?.dateTime ?? e.start?.date ?? ''
  const end = e.end?.dateTime ?? e.end?.date ?? start
  if (!start) return null
  const self = e.attendees?.find((a) => a.self)?.responseStatus ?? 'accepted'
  return {
    id: e.id,
    title: e.summary?.trim() || '(No title)',
    start,
    end,
    allDay: !e.start?.dateTime,
    meetUrl: https(e.hangoutLink) || https(e.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri),
    url: https(e.htmlLink),
    location: e.location?.trim() ?? '',
    response: (RESPONSES.has(self) ? self : 'needsAction') as CalendarEvent['response']
  }
}

export async function fetchEvents(creds: GoogleCreds, from: Date, to: Date): Promise<{ calendar: string; events: CalendarEvent[] }> {
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: '250' })
  const data = await fetchJson<{ summary?: string; items?: GoogleEvent[] }>(`${EVENTS_URL}?${q.toString()}`, { headers: { authorization: `Bearer ${creds.accessToken}` } })
  return { calendar: data.summary ?? '', events: (data.items ?? []).map(toCalendarEvent).filter((e): e is CalendarEvent => !!e) }
}
