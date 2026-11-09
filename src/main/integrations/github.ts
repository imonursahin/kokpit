import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { MyPullRequests, PullRequestInfo } from '../../shared/integrations'
import { fetchJson, HttpError } from './http'

const run = promisify(execFile)

export type GithubCreds = { token: string; account: string; source: 'cli' | 'token' }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

const API = 'https://api.github.com'

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

async function cliToken(): Promise<string> {
  for (const bin of ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', 'gh']) {
    try {
      const { stdout } = await run(bin, ['auth', 'token'], { timeout: 10_000 })
      if (stdout.trim()) return stdout.trim()
    } catch {
      continue
    }
  }
  throw new Error('GitHub CLI is not logged in. Run `gh auth login` or paste a token.')
}

export async function connectGithub(input: { token?: unknown; useCli?: unknown }): Promise<GithubCreds> {
  const useCli = input?.useCli === true
  const token = useCli ? await cliToken() : typeof input?.token === 'string' ? input.token.trim() : ''
  if (!token) throw new Error('Paste a GitHub token or use the GitHub CLI login')
  try {
    const me = await fetchJson<Obj>(`${API}/user`, { headers: headers(token) })
    return { token, account: str(me['login']), source: useCli ? 'cli' : 'token' }
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) throw new Error('GitHub rejected this token')
    throw err
  }
}

export async function refreshCliToken(c: GithubCreds): Promise<GithubCreds> {
  return c.source === 'cli' ? { ...c, token: await cliToken() } : c
}

const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale'])

export function summarizeChecks(runs: unknown[]): PullRequestInfo['checks'] {
  const latest = new Map<string, Obj>()
  for (const r of runs) {
    if (!isObj(r)) continue
    const name = str(r['name'])
    const prev = latest.get(name)
    if (!prev || Number(r['id']) > Number(prev['id'])) latest.set(name, r)
  }
  const checks = { total: latest.size, passed: 0, failed: 0, pending: 0, failedNames: [] as string[] }
  for (const [name, r] of latest) {
    if (r['status'] !== 'completed') checks.pending += 1
    else if (FAILED.has(str(r['conclusion']))) {
      checks.failed += 1
      checks.failedNames.push(name)
    } else checks.passed += 1
  }
  return checks
}

async function checksFor(token: string, repo: string, sha: string): Promise<PullRequestInfo['checks']> {
  const res = await fetchJson<Obj>(`${API}/repos/${repo}/commits/${sha}/check-runs?per_page=100`, { headers: headers(token) })
  return summarizeChecks(Array.isArray(res['check_runs']) ? res['check_runs'] : [])
}

export function summarizeReviews(list: unknown[]): PullRequestInfo['reviews'] {
  const latest = new Map<string, string>()
  for (const r of list) {
    if (!isObj(r) || !isObj(r['user'])) continue
    if (r['user']['type'] === 'Bot' || str(r['user']['login']).endsWith('[bot]')) continue
    const state = str(r['state'])
    if (state === 'APPROVED' || state === 'CHANGES_REQUESTED' || state === 'DISMISSED') latest.set(str(r['user']['login']), state)
  }
  const states = [...latest.values()]
  return { approved: states.filter((s) => s === 'APPROVED').length, changesRequested: states.filter((s) => s === 'CHANGES_REQUESTED').length }
}

async function reviewsFor(token: string, repo: string, number: number): Promise<PullRequestInfo['reviews']> {
  const res = await fetchJson<unknown>(`${API}/repos/${repo}/pulls/${number}/reviews?per_page=100`, { headers: headers(token) })
  return summarizeReviews(Array.isArray(res) ? res : [])
}

const lastKnown = new Map<string, PullRequestInfo>()

async function pullInfo(c: GithubCreds, repo: string, number: number): Promise<PullRequestInfo> {
  const key = `${repo}#${number}`
  const known = lastKnown.get(key)
  const pr = await fetchJson<Obj>(`${API}/repos/${repo}/pulls/${number}`, { headers: headers(c.token) }).catch((err: unknown) => {
    if (known) return null
    throw err
  })
  if (!pr && known) return known
  if (!pr) throw new Error(`Could not read ${key}`)
  const head = isObj(pr['head']) ? pr['head'] : {}
  const base = isObj(pr['base']) ? pr['base'] : {}
  const merged = !!pr['merged_at']
  const state = merged ? 'Merged' : pr['state'] === 'closed' ? 'Closed' : pr['draft'] === true ? 'Draft' : 'Open'
  const [checks, reviews] = await Promise.all([
    checksFor(c.token, repo, str(head['sha'])).catch(() => known?.checks ?? { total: 0, passed: 0, failed: 0, pending: 0, failedNames: [] }),
    reviewsFor(c.token, repo, number).catch(() => known?.reviews ?? { approved: 0, changesRequested: 0 })
  ])
  const info: PullRequestInfo = {
    number: Number(pr['number']),
    repo,
    title: str(pr['title']),
    url: str(pr['html_url']),
    branch: str(head['ref']),
    base: str(base['ref']),
    state,
    checks,
    reviews,
    author: isObj(pr['user']) ? str(pr['user']['login']) : '',
    updatedAt: str(pr['updated_at'])
  }
  lastKnown.set(key, info)
  return info
}

const PR_URL = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?$/

export async function pullRequestsByUrl(c: GithubCreds, urls: string[]): Promise<PullRequestInfo[]> {
  const targets = [...new Set(urls)].flatMap((u) => {
    const m = PR_URL.exec(u)
    return m?.[1] && m[2] ? [{ repo: m[1], number: Number(m[2]) }] : []
  })
  const out: PullRequestInfo[] = []
  for (let i = 0; i < targets.length; i += 4) {
    const batch = await Promise.allSettled(targets.slice(i, i + 4).map((t) => pullInfo(c, t.repo, t.number)))
    for (const r of batch) if (r.status === 'fulfilled') out.push(r.value)
  }
  return out
}

export async function pullRequestsFor(c: GithubCreds, jiraKey: string): Promise<PullRequestInfo[]> {
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(jiraKey)) return []
  const q = encodeURIComponent(`${jiraKey} is:pr involves:${c.account}`)
  const res = await fetchJson<Obj>(`${API}/search/issues?q=${q}&per_page=20`, { headers: headers(c.token) })
  const items = Array.isArray(res['items']) ? res['items'].filter(isObj) : []
  const out = await Promise.allSettled(
    items.map((it) => pullInfo(c, str(it['repository_url']).replace(`${API}/repos/`, ''), Number(it['number'])))
  )
  return out.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
}

async function searchOpen(c: GithubCreds, qualifier: string): Promise<{ repo: string; number: number }[]> {
  const q = encodeURIComponent(`is:pr is:open archived:false ${qualifier}`)
  const res = await fetchJson<Obj>(`${API}/search/issues?q=${q}&sort=updated&order=desc&per_page=30`, { headers: headers(c.token) })
  const items = Array.isArray(res['items']) ? res['items'].filter(isObj) : []
  return items.map((it) => ({ repo: str(it['repository_url']).replace(`${API}/repos/`, ''), number: Number(it['number']) }))
}

async function details(c: GithubCreds, targets: { repo: string; number: number }[]): Promise<PullRequestInfo[]> {
  const out: PullRequestInfo[] = []
  for (let i = 0; i < targets.length; i += 4) {
    const batch = await Promise.allSettled(targets.slice(i, i + 4).map((t) => pullInfo(c, t.repo, t.number)))
    for (const r of batch) if (r.status === 'fulfilled' && (r.value.state === 'Open' || r.value.state === 'Draft')) out.push(r.value)
  }
  return out
}

export async function myOpenPullRequests(c: GithubCreds, includeDraftReviews = true): Promise<MyPullRequests> {
  const [mine, reviews] = await Promise.all([
    searchOpen(c, `author:${c.account}`),
    searchOpen(c, `review-requested:${c.account}${includeDraftReviews ? '' : ' draft:false'}`)
  ])
  const [mineInfo, reviewInfo] = await Promise.all([details(c, mine), details(c, reviews)])
  return { mine: mineInfo, reviews: reviewInfo }
}
