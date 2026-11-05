import type { JiraConnectInput, JiraIssue } from '../../shared/integrations'
import { fetchJson, HttpError } from './http'

export type JiraCreds = { site: string; email: string; token: string; account: string }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')

export function normalizeSite(site: string): string {
  const host = site
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) throw new Error('Site must look like your-team.atlassian.net')
  return host
}

function headers(c: Pick<JiraCreds, 'email' | 'token'>): Record<string, string> {
  return {
    Authorization: `Basic ${Buffer.from(`${c.email}:${c.token}`).toString('base64')}`,
    Accept: 'application/json'
  }
}

export function adfToText(node: unknown): string {
  if (!isObj(node)) return ''
  if (node['type'] === 'text') return str(node['text'])
  if (node['type'] === 'hardBreak') return '\n'
  const content = Array.isArray(node['content']) ? node['content'] : []
  const inner = content.map(adfToText).join('')
  switch (node['type']) {
    case 'paragraph':
    case 'heading':
      return `${inner}\n\n`
    case 'listItem':
      return `• ${inner.trim()}\n`
    case 'bulletList':
    case 'orderedList':
      return `${inner}\n`
    case 'codeBlock':
      return `${inner}\n\n`
    default:
      return inner
  }
}

export async function connectJira(input: JiraConnectInput): Promise<JiraCreds> {
  if (!input || typeof input.email !== 'string' || typeof input.token !== 'string' || typeof input.site !== 'string')
    throw new Error('Site, email and API token are required')
  const site = normalizeSite(input.site)
  const creds = { site, email: input.email.trim(), token: input.token.trim() }
  try {
    const me = await fetchJson<Obj>(`https://${site}/rest/api/3/myself`, { headers: headers(creds) })
    return { ...creds, account: str(me['emailAddress']) || str(me['displayName']) || creds.email }
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) throw new Error('Jira rejected the email or API token')
    throw err
  }
}

const FIELDS = 'summary,status,priority,reporter,updated,description,customfield_10020,customfield_10016'

export async function myIssues(c: JiraCreds): Promise<JiraIssue[]> {
  const jql = 'assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC'
  const url = `https://${c.site}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=${FIELDS}&maxResults=50`
  const res = await fetchJson<Obj>(url, { headers: headers(c) })
  const issues = Array.isArray(res['issues']) ? res['issues'].filter(isObj) : []
  return issues.map((i) => toIssue(c, i))
}

export async function getIssue(c: JiraCreds, key: string): Promise<JiraIssue> {
  if (!/^[A-Z][A-Z0-9]{1,9}-\d{1,7}$/.test(key)) throw new Error('invalid issue key')
  return toIssue(c, await fetchJson<Obj>(`https://${c.site}/rest/api/3/issue/${key}?fields=${FIELDS}`, { headers: headers(c) }))
}

function toIssue(c: JiraCreds, i: Obj): JiraIssue {
  const f = isObj(i['fields']) ? i['fields'] : {}
  const status = isObj(f['status']) ? f['status'] : {}
  const cat = isObj(status['statusCategory']) ? str(status['statusCategory']['key']) : ''
  const sprints = Array.isArray(f['customfield_10020']) ? f['customfield_10020'].filter(isObj) : []
  const activeSprint = sprints.find((s) => s['state'] === 'active') ?? sprints.at(-1)
  const points = f['customfield_10016']
  const key = str(i['key'])
  return {
    key,
    title: str(f['summary']),
    status: str(status['name']),
    statusCategory: cat === 'done' ? 'done' : cat === 'indeterminate' ? 'indeterminate' : 'new',
    priority: isObj(f['priority']) ? str(f['priority']['name']) : '',
    sprint: activeSprint ? str(activeSprint['name']) : '',
    reporter: isObj(f['reporter']) ? str(f['reporter']['displayName']) : '',
    points: typeof points === 'number' ? points : null,
    updated: str(f['updated']),
    description: adfToText(f['description']).trim(),
    url: `https://${c.site}/browse/${key}`
  }
}

export function textToAdf(text: string): Record<string, unknown> {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: p.split('\n').flatMap((line, i) => [...(i ? [{ type: 'hardBreak' }] : []), ...(line ? [{ type: 'text', text: line }] : [])])
    }))
  }
}

export async function addComment(c: JiraCreds, key: string, text: string): Promise<string> {
  if (!/^[A-Z][A-Z0-9]+-\d+$/.test(key)) throw new Error('invalid issue key')
  if (!text.trim()) throw new Error('Comment is empty')
  const res = await fetchJson<Obj>(
    `https://${c.site}/rest/api/3/issue/${key}/comment`,
    {
      method: 'POST',
      headers: { ...headers(c), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: textToAdf(text.slice(0, 30_000)) })
    },
    1
  )
  return `https://${c.site}/browse/${key}?focusedCommentId=${str(res['id'])}`
}
