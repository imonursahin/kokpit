import type { ConnectionId, ConnectionInfo, JiraIssue, MyPullRequests, PullRequestInfo } from '../../shared/integrations'
import { connectGithub, myOpenPullRequests, pullRequestsByUrl, pullRequestsFor, refreshCliToken, type GithubCreds } from './github'
import { HttpError } from './http'
import { addComment, connectJira, getIssue, myIssues, type JiraCreds } from './jira'
import type { Secrets } from './secrets'

type Health = { lastSync: string; expired: boolean; error: string }

export class Integrations {
  private health: Record<ConnectionId, Health> = {
    jira: { lastSync: '', expired: false, error: '' },
    github: { lastSync: '', expired: false, error: '' }
  }
  private issuesCache: { at: number; issues: JiraIssue[] } | null = null

  constructor(private readonly secrets: Secrets) {}

  private track<T>(id: ConnectionId, p: Promise<T>): Promise<T> {
    return p.then(
      (v) => {
        this.health[id] = { lastSync: new Date().toISOString(), expired: false, error: '' }
        return v
      },
      (err: unknown) => {
        const expired = err instanceof HttpError && (err.status === 401 || err.status === 403)
        this.health[id] = { ...this.health[id], expired, error: (err as Error).message }
        throw err
      }
    )
  }

  async status(): Promise<ConnectionInfo[]> {
    const jira = await this.secrets.get<JiraCreds>('jira')
    const gh = await this.secrets.get<GithubCreds>('github')
    const info = (id: ConnectionId, creds: { account: string } | null, site: string, projects: string[] = []): ConnectionInfo => {
      const h = this.health[id]
      return {
        id,
        status: !creds ? 'disconnected' : h.expired ? 'expired' : 'connected',
        account: creds?.account ?? '',
        site,
        org: '',
        projects,
        lastSync: h.lastSync,
        warning: creds && h.expired ? `${id === 'jira' ? 'Jira' : 'GitHub'} rejected the saved credentials. Reconnect to keep syncing.` : creds ? h.error : ''
      }
    }
    const projects = [...new Set((this.issuesCache?.issues ?? []).map((i) => i.key.split('-')[0] ?? ''))].filter(Boolean)
    return [info('github', gh, gh ? (gh.source === 'cli' ? 'GitHub CLI login' : 'Personal access token') : ''), info('jira', jira, jira?.site ?? '', projects)]
  }

  async connectJira(input: unknown): Promise<ConnectionInfo[]> {
    const creds = await this.track('jira', connectJira(input as never))
    await this.secrets.set('jira', creds)
    this.issuesCache = null
    return this.status()
  }

  async connectGithub(input: unknown): Promise<ConnectionInfo[]> {
    const creds = await this.track('github', connectGithub((input ?? {}) as never))
    await this.secrets.set('github', creds)
    return this.status()
  }

  async disconnect(id: unknown): Promise<ConnectionInfo[]> {
    if (id !== 'jira' && id !== 'github') throw new Error('unknown connection')
    await this.secrets.set(id, null)
    this.health[id] = { lastSync: '', expired: false, error: '' }
    if (id === 'jira') this.issuesCache = null
    return this.status()
  }

  async issues(force = false): Promise<JiraIssue[]> {
    const creds = await this.secrets.get<JiraCreds>('jira')
    if (!creds) return []
    if (!force && this.issuesCache && Date.now() - this.issuesCache.at < 120_000) return this.issuesCache.issues
    const issues = await this.track('jira', myIssues(creds))
    this.issuesCache = { at: Date.now(), issues }
    return issues
  }

  private issueCache = new Map<string, { at: number; issue: JiraIssue }>()

  async issue(key: unknown): Promise<JiraIssue | null> {
    if (typeof key !== 'string') throw new Error('invalid key')
    const creds = await this.secrets.get<JiraCreds>('jira')
    if (!creds) return null
    const hit = this.issueCache.get(key)
    if (hit && Date.now() - hit.at < 120_000) return hit.issue
    const issue = await this.track('jira', getIssue(creds, key))
    this.issueCache.set(key, { at: Date.now(), issue })
    return issue
  }

  async pullRequests(jiraKey: unknown): Promise<PullRequestInfo[]> {
    if (typeof jiraKey !== 'string') throw new Error('invalid key')
    const stored = await this.secrets.get<GithubCreds>('github')
    if (!stored) return []
    const creds = await refreshCliToken(stored).catch(() => stored)
    return this.track('github', pullRequestsFor(creds, jiraKey))
  }

  async pullRequestsByUrl(urls: unknown): Promise<PullRequestInfo[]> {
    if (!Array.isArray(urls) || urls.some((u) => typeof u !== 'string')) throw new Error('invalid urls')
    const stored = await this.secrets.get<GithubCreds>('github')
    if (!stored) return []
    const creds = await refreshCliToken(stored).catch(() => stored)
    return this.track('github', pullRequestsByUrl(creds, (urls as string[]).slice(0, 60)))
  }

  async addJiraComment(key: unknown, text: unknown): Promise<string> {
    if (typeof key !== 'string' || typeof text !== 'string') throw new Error('invalid comment')
    const creds = await this.secrets.get<JiraCreds>('jira')
    if (!creds) throw new Error('Connect Jira first')
    return this.track('jira', addComment(creds, key, text))
  }

  private async github(): Promise<GithubCreds | null> {
    const stored = await this.secrets.get<GithubCreds>('github')
    if (!stored) return null
    return refreshCliToken(stored).catch(() => stored)
  }

  private mine: { key: string; at: number; data: MyPullRequests } | null = null
  onPullRequests: ((data: MyPullRequests) => void) | null = null
  private mineInFlight: { key: string; promise: Promise<MyPullRequests> } | null = null

  async myPullRequests(includeDraftReviews: boolean, maxAgeMs = 45_000): Promise<MyPullRequests> {
    const creds = await this.github()
    if (!creds) return { mine: [], reviews: [] }
    const key = `${creds.account}:${includeDraftReviews}`
    if (this.mine?.key === key && Date.now() - this.mine.at < maxAgeMs) return this.mine.data
    if (this.mineInFlight?.key === key) return this.mineInFlight.promise
    const promise = this.track('github', myOpenPullRequests(creds, includeDraftReviews))
      .then((data) => {
        const fresh = { ...data, fetchedAt: new Date().toISOString() }
        this.mine = { key, at: Date.now(), data: fresh }
        this.onPullRequests?.(fresh)
        return fresh
      })
      .catch((err: Error) => {
        const last = this.mine?.key === key ? this.mine.data : null
        if (last) return { ...last, staleReason: err.message }
        throw err
      })
      .finally(() => {
        if (this.mineInFlight?.promise === promise) this.mineInFlight = null
      })
    this.mineInFlight = { key, promise }
    return promise
  }

  async myPullRequestCounts(includeDraftReviews: boolean): Promise<{ mine: number; reviews: number }> {
    const data = await this.myPullRequests(includeDraftReviews)
    return { mine: data.mine.length, reviews: data.reviews.length }
  }
}
