import type { SessionStatus } from '@shared/types'
import type { ApprovalRequest } from '@/components/ApprovalCard'
import type { DiffFile } from '@/components/DiffFileHeader'
import type { Step } from '@/components/StepRow'

export type DetailMode = 'code' | 'plan' | 'approval'
export type RightTab = 'changes' | 'plan'
export type Rich = (string | { code: string })[]
export type TextBlock = { kind: 'p'; text: Rich } | { kind: 'pre'; text: string }

export type SessionHeader = {
  title: string
  status: SessionStatus
  elapsed: string
  cost: string
  repo: string
  branch: string
  jira?: { key: string; title: string }
  pr?: { number: string; url?: string; state?: string; checks?: string }
  context?: { used: number; window: number }
}

export type TurnPart = { kind: 'text'; text: string } | { kind: 'thinking'; text: string } | { kind: 'steps'; steps: Step[] }

export type TurnMeta = { model: string; thinking?: string; time: string; cost: string }

export type Turn =
  | { kind: 'earlier'; text: string; more?: boolean }
  | { kind: 'user'; text: Rich; uuid?: string; parentUuid?: string }
  | { kind: 'claude'; name?: boolean; steps: Step[]; text?: Rich; blocks?: TextBlock[]; markdown?: string; output?: string; parts?: TurnPart[]; meta?: TurnMeta }
  | { kind: 'ask'; request: ApprovalRequest }

export type ModeData = {
  header: SessionHeader
  turns: Turn[]
  placeholder: string
  model: string
  thinking: string
  running: boolean
  tab: RightTab
  hasChanges: boolean
  hasPlan: boolean
}

export type DiffComment = { initials: string; author: string; body: Rich }
export type DiffLine = { o: number | ''; n: number | ''; sign: '+' | '-' | ' ' | '@'; t: string; comment?: DiffComment }

export type PlanBlock = { kind: 'h2'; text: string } | { kind: 'p'; text: Rich } | { kind: 'ol' | 'ul'; items: Rich[] }
export type Plan = {
  file: string
  meta: string
  title: string
  subtitle?: string
  blocks: PlanBlock[]
  question?: string
}

export type DetailView = ModeData & {
  activeSince?: string
  files: DiffFile[]
  diff: Record<string, DiffLine[]>
  filesNote?: string
  plan?: Plan
  planMarkdown?: string
  linkPlaceholders: boolean
  selectableFiles: boolean
}

export const MODELS = ['Opus 4.5', 'Sonnet 4.5', 'Haiku 4.5']
export const THINKING = ['Low', 'Medium', 'High']

const webhookHeader = {
  title: 'Retry logic for failed webhook deliveries',
  repo: 'checkout-service',
  branch: 'feat/webhook-retries',
  jira: { key: 'PAY-1284', title: 'Retry failed webhook deliveries with exponential backoff' },
  pr: { number: '#412', state: 'Draft', checks: '3/4 checks' }
}

export const SESSION_DETAIL: Record<DetailMode, ModeData> = {
  code: {
    header: { ...webhookHeader, status: 'running', elapsed: '23 min', cost: '$1.84' },
    turns: [
      {
        kind: 'user',
        text: [
          'Webhook deliveries fail silently when a merchant endpoint times out. Add retries with exponential backoff (max 5), persist every attempt, and expose attempts in the admin API. AC are in PAY-1284.'
        ]
      },
      {
        kind: 'claude',
        name: true,
        steps: [
          { kind: 'jira', label: 'Fetched', target: 'PAY-1284', meta: '5 acceptance criteria' },
          { kind: 'read', label: 'Read', target: 'src/webhooks/dispatcher.ts', meta: '142 lines' },
          { kind: 'read', label: 'Read', target: 'prisma/schema.prisma', meta: '318 lines' },
          { kind: 'search', label: 'Searched', target: 'deliverWebhook(', meta: '7 matches in 4 files' }
        ],
        text: [
          'Delivery is a single inline ',
          { code: 'fetch' },
          ' with no persistence, so timeouts are only logged. I’ll add a ',
          { code: 'WebhookAttempt' },
          ' model, move retries onto the existing BullMQ queue with delays of 1s → 4s → 16s → 64s → 256s, and add ',
          { code: 'GET /admin/webhooks/:id/attempts' },
          '.'
        ],
        meta: { model: 'Opus 4.5', time: '48s', cost: '$0.22' }
      },
      {
        kind: 'claude',
        steps: [
          { kind: 'edit', label: 'Edited', target: 'prisma/schema.prisma', add: 18 },
          { kind: 'create', label: 'Created', target: 'src/webhooks/retry-policy.ts', add: 42 },
          { kind: 'edit', label: 'Edited', target: 'src/webhooks/dispatcher.ts', add: 31, del: 12 },
          { kind: 'create', label: 'Created', target: 'src/admin/routes/webhook-attempts.ts', add: 27 },
          {
            kind: 'command',
            label: 'Ran',
            target: 'pnpm tsc --noEmit',
            meta: '0 errors · 6.1s',
            expanded: true,
            output: '$ pnpm tsc --noEmit\nFound 0 errors in 214 files.'
          },
          { kind: 'command', label: 'Running', target: 'pnpm vitest run src/webhooks', meta: '12s', state: 'running' }
        ]
      }
    ],
    placeholder: 'Claude is working — type to queue a message…',
    model: 'Opus 4.5',
    thinking: 'Medium',
    running: true,
    tab: 'changes',
    hasChanges: true,
    hasPlan: false
  },
  plan: {
    header: {
      title: 'Plan: migrate session store to Redis',
      status: 'waiting',
      elapsed: '11 min',
      cost: '$0.38',
      repo: 'checkout-service',
      branch: 'main'
    },
    turns: [
      {
        kind: 'user',
        text: ['The sessions table is hit on every request. Draft a plan to move the session store to Redis — no code changes yet.']
      },
      {
        kind: 'claude',
        name: true,
        steps: [
          { kind: 'read', label: 'Read', target: 'src/auth/session-store.ts', meta: '96 lines' },
          { kind: 'search', label: 'Searched', target: 'sessionStore.', meta: '23 matches in 9 files' },
          { kind: 'read', label: 'Read', target: 'infra/redis.tf', meta: '54 lines' },
          {
            kind: 'command',
            label: 'Ran',
            target: "psql -c \"select count(*) from sessions where updated_at > now() - interval '30 days'\"",
            meta: '410,382 rows'
          },
          { kind: 'fetch', label: 'Researched', target: 'Redis eviction policies for session data', meta: '3 sources' }
        ],
        text: [
          'The plan is on the right — five steps, dual-write first so we can roll back at any point. About 410k active sessions need backfilling, roughly six minutes off-peak. Before I finalise it I need one decision from you.'
        ],
        meta: { model: 'Opus 4.5', thinking: 'high', time: '2m 31s', cost: '$0.38' }
      },
      {
        kind: 'ask',
        request: {
          type: 'question',
          waited: 'Waiting 4m',
          question: 'Redis TTL for sessions: keep 30 days to match the current cookie, or shorten to 14 days as the ticket suggests?',
          options: [
            { key: '1', label: 'Keep 30 days', hint: 'No user-visible change' },
            { key: '2', label: 'Shorten to 14 days', hint: '~45% less memory, more re-logins' }
          ]
        }
      }
    ],
    placeholder: 'Answer the question, or reply in your own words…',
    model: 'Opus 4.5',
    thinking: 'High',
    running: false,
    tab: 'plan',
    hasChanges: false,
    hasPlan: true
  },
  approval: {
    header: { ...webhookHeader, status: 'waiting', elapsed: '31 min', cost: '$2.07' },
    turns: [
      { kind: 'earlier', text: '2 earlier turns · 11 steps · 6 files changed' },
      {
        kind: 'user',
        text: ['Keep both test files. Read max attempts from ', { code: 'WEBHOOK_MAX_ATTEMPTS' }, ', default 5.']
      },
      {
        kind: 'claude',
        name: true,
        steps: [
          { kind: 'edit', label: 'Edited', target: 'src/webhooks/retry-policy.ts', add: 4, del: 2 },
          { kind: 'edit', label: 'Edited', target: 'src/config/env.ts', add: 3 },
          { kind: 'command', label: 'Ran', target: 'pnpm vitest run src/webhooks', meta: '16 passed · 4.2s' }
        ],
        text: [
          'Max attempts now come from ',
          { code: 'WEBHOOK_MAX_ATTEMPTS' },
          ' (default 5) and both test files are in. Last step is the migration for ',
          { code: 'WebhookAttempt' },
          ' — one new table and an index, no changes to existing data.'
        ],
        meta: { model: 'Sonnet 4.5', time: '1m 06s', cost: '$0.23' }
      },
      {
        kind: 'ask',
        request: {
          type: 'command',
          action: '· Run a command',
          reason: 'Generate and apply the migration to your local database (checkout_dev).',
          command: 'pnpm prisma migrate dev --name add_webhook_attempts',
          cwd: '~/code/checkout-service',
          rule: 'pnpm prisma migrate *',
          waited: 'Waiting 1m 12s'
        }
      }
    ],
    placeholder: 'Reply to deny with feedback…',
    model: 'Sonnet 4.5',
    thinking: 'Medium',
    running: false,
    tab: 'changes',
    hasChanges: true,
    hasPlan: false
  }
}

export const DIFF_FILES: DiffFile[] = [
  { path: 'prisma/schema.prisma', change: 'M', add: 18, del: 0, included: true },
  { path: 'src/webhooks/retry-policy.ts', change: 'A', add: 42, del: 0, included: true },
  { path: 'src/webhooks/dispatcher.ts', change: 'M', add: 31, del: 12, included: true, active: true, comments: 1 },
  { path: 'src/admin/routes/webhook-attempts.ts', change: 'A', add: 27, del: 0, included: true },
  { path: 'src/webhooks/__tests__/retry-policy.test.ts', change: 'A', add: 38, del: 0, included: false, test: true },
  { path: 'src/webhooks/__tests__/dispatcher.test.ts', change: 'M', add: 12, del: 15, included: false, test: true }
]

export const DIFF_LINES: DiffLine[] = [
  { o: '', n: '', sign: '@', t: '@@ -10,9 +10,28 @@ export async function deliverWebhook' },
  { o: 10, n: 10, sign: ' ', t: "import { queue } from '../jobs/queue'" },
  { o: '', n: 11, sign: '+', t: "import { nextRetryDelay } from './retry-policy'" },
  { o: 11, n: 12, sign: ' ', t: '' },
  { o: 12, n: 13, sign: ' ', t: 'export async function deliverWebhook(event: WebhookEvent) {' },
  { o: 13, n: '', sign: '-', t: '  const res = await fetch(event.endpointUrl, {' },
  { o: 14, n: '', sign: '-', t: "    method: 'POST'," },
  { o: 15, n: '', sign: '-', t: '    body: JSON.stringify(event.payload),' },
  { o: 16, n: '', sign: '-', t: '  })' },
  { o: 17, n: '', sign: '-', t: "  if (!res.ok) logger.warn('webhook failed', { id: event.id })" },
  { o: '', n: 14, sign: '+', t: '  const attempt = await prisma.webhookAttempt.create({' },
  { o: '', n: 15, sign: '+', t: '    data: { eventId: event.id, number: event.attempt ?? 1 },' },
  { o: '', n: 16, sign: '+', t: '  })' },
  { o: '', n: 17, sign: '+', t: '  try {' },
  { o: '', n: 18, sign: '+', t: '    const res = await fetchWithTimeout(event.endpointUrl, {' },
  { o: '', n: 19, sign: '+', t: "      method: 'POST'," },
  { o: '', n: 20, sign: '+', t: '      body: JSON.stringify(event.payload),' },
  { o: '', n: 21, sign: '+', t: '      timeoutMs: 10_000,' },
  { o: '', n: 22, sign: '+', t: '    })' },
  { o: '', n: 23, sign: '+', t: '    await markAttempt(attempt.id, res.status)' },
  { o: '', n: 24, sign: '+', t: '    if (!res.ok) throw new DeliveryError(res.status)' },
  { o: '', n: 25, sign: '+', t: '  } catch (err) {' },
  {
    o: '',
    n: 26,
    sign: '+',
    t: '    const delay = nextRetryDelay(attempt.number, { max: 5 })',
    comment: {
      initials: 'DA',
      author: 'Deniz',
      body: ['Don’t hardcode 5 — read it from ', { code: 'WEBHOOK_MAX_ATTEMPTS' }, ' with 5 as the default.']
    }
  },
  { o: '', n: 27, sign: '+', t: "    if (delay) await queue.add('webhook', event, { delay })" },
  { o: '', n: 28, sign: '+', t: '  }' },
  { o: 18, n: 29, sign: ' ', t: '}' }
]

export const PLAN: Plan = {
  file: 'plan.md',
  meta: 'v2 · updated 4 min ago · 640 words',
  title: 'Migrate session store from Postgres to Redis',
  subtitle: 'Plan · checkout-service · no code changes',
  blocks: [
    { kind: 'h2', text: 'Context' },
    {
      kind: 'p',
      text: [
        'Sessions live in the ',
        { code: 'sessions' },
        ' table (~2.4M rows). Every authenticated request reads a row and writes ',
        { code: 'updated_at' },
        '; p95 for ',
        { code: '/api/*' },
        ' spends 18 ms on it.'
      ]
    },
    { kind: 'h2', text: 'Approach' },
    {
      kind: 'ol',
      items: [
        ['Add ', { code: 'RedisSessionStore' }, ' implementing the existing ', { code: 'SessionStore' }, ' interface.'],
        ['Dual-write behind ', { code: 'SESSION_STORE=dual' }, ': write both, read Postgres.'],
        ['Backfill sessions active in the last 30 days (~410k keys) off-peak.'],
        ['Flip reads to Redis; keep Postgres writes for one week as fallback.'],
        ['Remove the Postgres store and drop the table in a follow-up PR.']
      ]
    },
    { kind: 'h2', text: 'Risks' },
    {
      kind: 'ul',
      items: [
        ['Eviction must be ', { code: 'volatile-ttl' }, ', not ', { code: 'allkeys-lru' }, ', or users get logged out under memory pressure.'],
        ['Backfill at 1k writes/s takes about 6 minutes; run outside 09:00–21:00.']
      ]
    }
  ],
  question: 'TTL: match the current 30-day cookie, or shorten to 14 days?'
}
