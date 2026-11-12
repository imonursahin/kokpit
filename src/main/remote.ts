import type { RemoteSession } from '../shared/remote'
import type { TerminalEvent } from './terminal'

const ANSI = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b[@-_]/g
const LINK = /https:\/\/claude\.ai\/code\/session_[A-Za-z0-9_-]+(?=[^A-Za-z0-9_-])/
const LOG_LIMIT = 256 * 1024

export const remoteLinkIn = (text: string): string => text.replace(ANSI, '').match(LINK)?.[0] ?? ''

type Entry = RemoteSession & { termId: string; log: string }

export class RemoteSessions {
  private byId = new Map<string, Entry>()

  constructor(
    private readonly kill: (termId: string) => void,
    private readonly changed: (list: RemoteSession[]) => void
  ) {}

  list(): RemoteSession[] {
    return [...this.byId.values()].map(({ sessionId, url, startedAt }) => ({ sessionId, url, startedAt }))
  }

  has(sessionId: string): boolean {
    return this.byId.has(sessionId)
  }

  add(sessionId: string, termId: string): { id: string; backlog: string } {
    this.byId.set(sessionId, { sessionId, termId, url: '', startedAt: new Date().toISOString(), log: '' })
    this.changed(this.list())
    return { id: termId, backlog: '' }
  }

  attach(sessionId: string): { id: string; backlog: string } {
    const e = this.byId.get(sessionId)
    if (!e) throw new Error('This session is not on your phone')
    return { id: e.termId, backlog: e.log }
  }

  stop(sessionId: string): void {
    const e = this.byId.get(sessionId)
    if (e) this.kill(e.termId)
  }

  onTerminal(ev: TerminalEvent): void {
    const e = [...this.byId.values()].find((x) => x.termId === ev.id)
    if (!e) return
    if (ev.type === 'exit') {
      this.byId.delete(e.sessionId)
      this.changed(this.list())
      return
    }
    e.log = (e.log + ev.data).slice(-LOG_LIMIT)
    if (e.url) return
    const url = remoteLinkIn(e.log.slice(-8192))
    if (!url) return
    e.url = url
    this.changed(this.list())
  }
}
