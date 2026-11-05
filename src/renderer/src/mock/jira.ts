import type { JiraIssue } from '@shared/integrations'
import type { SessionSummary } from '@shared/types'
import { MOCK_SESSIONS } from './sessions'

export type JiraStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done'

export type JiraPr = {
  num: string
  title: string
  branch: string
  checks: string
  checksTone: 'ok' | 'neutral' | 'err'
  state: 'Draft' | 'Open' | 'Merged' | 'Closed'
  url?: string
}

export type JiraTask = {
  key: string
  title: string
  status: string
  statusCategory: JiraIssue['statusCategory']
  priority: string
  sprint: string
  reporter: string
  points: number | null
  updated: string
  description: string
  url: string
  sessions: SessionSummary[]
  prs: JiraPr[]
}

type MockTask = Omit<JiraTask, 'status' | 'statusCategory' | 'url'> & { status: JiraStatus }

const CATEGORY: Record<JiraStatus, JiraTask['statusCategory']> = {
  'To Do': 'new',
  'In Progress': 'indeterminate',
  'In Review': 'indeterminate',
  Done: 'done'
}

export const JIRA_SITE = 'parcel.atlassian.net'

const pick = (...ids: string[]) => MOCK_SESSIONS.filter((s) => ids.includes(s.id))

const PAY_1284_SESSIONS: SessionSummary[] = [
  ...pick('s1'),
  { id: 'j1', status: 'done', title: 'Spike: queue options for retries (BullMQ vs SQS)', sub: 'Recommended BullMQ — already in the stack, delayed jobs built in', repo: 'checkout-service', branch: 'main', jira: 'PAY-1284', pr: '', time: 'Mon', cost: '$0.54' },
  { id: 'j2', status: 'done', title: 'Extract fetchWithTimeout helper', sub: 'Small refactor, merged as #405', repo: 'checkout-service', branch: 'chore/fetch-timeout', jira: 'PAY-1284', pr: '#405', time: 'Mon', cost: '$0.31' }
]

const TASKS: MockTask[] = [
  {
    key: 'PAY-1284',
    title: 'Retry failed webhook deliveries with exponential backoff',
    status: 'In Progress',
    priority: 'High',
    sprint: 'Payments 24',
    reporter: 'Selin Yılmaz',
    points: 5,
    updated: 'today, 10:42',
    description:
      'Merchants miss order events when their endpoint is briefly down. We currently try once and log the failure. Retry with backoff, persist every attempt, and make attempts visible to support through the admin API.',
    sessions: PAY_1284_SESSIONS,
    prs: [
      { num: '#412', title: 'feat(webhooks): retry deliveries with backoff', branch: 'feat/webhook-retries → main', checks: '3/4 checks · e2e running', checksTone: 'neutral', state: 'Draft' },
      { num: '#405', title: 'chore: extract fetchWithTimeout helper', branch: 'chore/fetch-timeout → main', checks: 'All checks passed', checksTone: 'ok', state: 'Merged' }
    ]
  },
  {
    key: 'PAY-1301',
    title: 'Move session storage from Postgres to Redis',
    status: 'To Do',
    priority: 'Medium',
    sprint: 'Payments 24',
    reporter: 'Selin Yılmaz',
    points: 8,
    updated: 'today, 09:15',
    description:
      'Session reads are a large share of Postgres load at peak. Move the session store to Redis, keep the current TTL behaviour and migrate active sessions without logging anyone out.',
    sessions: pick('s3'),
    prs: []
  },
  {
    key: 'WEB-877',
    title: 'CartSummary snapshot tests fail intermittently on CI',
    status: 'In Progress',
    priority: 'Medium',
    sprint: 'Web 31',
    reporter: 'Mert Kaya',
    points: 2,
    updated: 'today, 11:03',
    description:
      'The CartSummary snapshots fail on roughly one CI run in five. The diff shows a formatted date and a currency symbol, so the tests likely depend on the runner’s locale and clock.',
    sessions: pick('s2'),
    prs: []
  },
  {
    key: 'WEB-902',
    title: 'Invoice filters reset when switching tabs',
    status: 'In Review',
    priority: 'High',
    sprint: 'Web 31',
    reporter: 'Ece Demir',
    points: 3,
    updated: 'today, 10:58',
    description:
      'Filters on the invoices page clear when the user switches between Paid and Unpaid. Keep the filter state per tab and restore it from the URL on reload.',
    sessions: pick('s4'),
    prs: [
      { num: '#1187', title: 'refactor(invoices): keep filters across tabs', branch: 'refactor/invoice-filters → main', checks: '5/5 checks passed', checksTone: 'ok', state: 'Open' }
    ]
  },
  {
    key: 'OPS-233',
    title: 'Add a read replica for the orders database',
    status: 'In Progress',
    priority: 'High',
    sprint: 'Ops 12',
    reporter: 'Burak Şahin',
    points: 5,
    updated: 'today, 10:14',
    description:
      'Reporting queries slow down order writes during business hours. Add a read replica in the same region and point the reporting service at it.',
    sessions: pick('s5'),
    prs: []
  },
  {
    key: 'WEB-910',
    title: 'Evaluate Stripe Payment Element for checkout',
    status: 'To Do',
    priority: 'Low',
    sprint: 'Web 31',
    reporter: 'Ece Demir',
    points: 2,
    updated: 'today, 09:40',
    description:
      'Compare Stripe Payment Element with hosted Checkout for our flow: supported payment methods, UI control, effort to migrate and impact on conversion.',
    sessions: pick('s6'),
    prs: []
  },
  {
    key: 'PAY-1279',
    title: 'Enforce idempotency keys on payment POST endpoints',
    status: 'Done',
    priority: 'Highest',
    sprint: 'Payments 24',
    reporter: 'Selin Yılmaz',
    points: 3,
    updated: 'today, 08:52',
    description:
      'A retried POST to the payments API can create a second charge. Require an Idempotency-Key header on every payment POST and return the stored response for a repeated key.',
    sessions: pick('s7'),
    prs: [
      { num: '#409', title: 'feat(payments): require idempotency keys', branch: 'feat/idempotency-keys → main', checks: 'All checks passed', checksTone: 'ok', state: 'Merged' }
    ]
  },
  {
    key: 'NOT-58',
    title: 'Turkish translations for transactional emails',
    status: 'Done',
    priority: 'Medium',
    sprint: 'Web 31',
    reporter: 'Mert Kaya',
    points: 3,
    updated: 'yesterday, 17:20',
    description:
      'Add a Turkish locale to every transactional email template and pick the locale from the customer’s profile, falling back to English.',
    sessions: pick('s8'),
    prs: [
      { num: '#88', title: 'feat(emails): add Turkish locale to templates', branch: 'feat/tr-locale → main', checks: 'All checks passed', checksTone: 'ok', state: 'Merged' }
    ]
  }
]

export const MOCK_JIRA_TASKS: JiraTask[] = TASKS.map((t) => ({
  ...t,
  statusCategory: CATEGORY[t.status],
  url: `https://${JIRA_SITE}/browse/${t.key}`
}))
