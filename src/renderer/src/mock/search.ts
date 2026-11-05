import type { LibraryKind } from '@shared/library'
import { MOCK_SESSIONS } from './sessions'

export type SearchResultType = 'session' | 'skill' | 'agent' | 'rule'

export type SearchResult = {
  id: string
  type: SearchResultType
  title: string
  where: string
  text: string
  when: string
  sessionId?: string
  message?: number
  absPath?: string
  libraryKind?: LibraryKind
}

export const SEARCH_TYPES: { type: SearchResultType; label: string; icon: string }[] = [
  { type: 'session', label: 'Sessions', icon: 'forum' },
  { type: 'skill', label: 'Skills', icon: 'bolt' },
  { type: 'agent', label: 'Agents', icon: 'smart_toy' },
  { type: 'rule', label: 'Rules', icon: 'description' }
]

export const SEARCH_INITIAL_QUERY = 'idempotency'

const MESSAGES: [string, 'You' | 'Claude', number, string][] = [
  ['s7', 'Claude', 4, '…the Idempotency-Key header is stored but never compared on retry, so a replayed POST creates a second charge…'],
  ['s1', 'You', 1, '…make sure retries reuse the same idempotency key so merchants can dedupe on their side…'],
  ['s6', 'Claude', 2, '…both accept an idempotency key per request; Checkout sets one automatically for…'],
  ['s7', 'You', 1, 'Review PR #409. Focus on how idempotency keys are stored and checked when a client retries a payment.'],
  ['s7', 'Claude', 6, 'Suggested fix: load the stored response by idempotency key and return it before calling Stripe again.'],
  ['s1', 'Claude', 3, 'I added a webhook_attempts table with a unique index on (endpoint_id, idempotency_key) so a retry never inserts twice.'],
  ['s1', 'Claude', 5, 'Retries now send the original idempotency key in the Idempotency-Key header instead of generating a new one.'],
  ['s3', 'Claude', 2, 'Session keys live under sess:* so they never collide with the idempotency cache under idem:*.'],
  ['s5', 'Claude', 3, 'The replica is read-only, so idempotency lookups in checkout must keep reading from the primary.'],
  ['s2', 'Claude', 2, 'The snapshot differs because CartSummary renders the current date; I will freeze the clock in the test setup.'],
  ['s4', 'You', 1, 'Split useInvoiceFilters into a pure reducer and a hook so the reducer can be tested without React.'],
  ['s8', 'Claude', 3, 'All 12 templates now have a tr locale; dates use the dd.MM.yyyy format.'],
  ['s9', 'Claude', 4, 'Most type errors came from the new async params in route handlers.']
]

const SESSION_RESULTS: SearchResult[] = MESSAGES.flatMap(([sessionId, who, message, text]) => {
  const s = MOCK_SESSIONS.find((x) => x.id === sessionId)
  if (!s) return []
  return [
    {
      id: `${sessionId}-m${message}`,
      type: 'session' as const,
      title: s.title,
      where: `${who} · message ${message}`,
      text,
      when: s.time,
      sessionId,
      message
    }
  ]
})

export const SEARCH_CORPUS: SearchResult[] = [
  ...SESSION_RESULTS,
  {
    id: 'skill-review-pr',
    type: 'skill',
    title: 'review-pr',
    where: 'All projects',
    text: '…flag mutating endpoints that don’t check idempotency before writing…',
    when: 'SKILL.md'
  },
  {
    id: 'skill-api-design',
    type: 'skill',
    title: 'api-design',
    where: 'checkout-service',
    text: 'Every POST endpoint documents its idempotency behaviour and the error it returns on a key reuse.',
    when: 'SKILL.md'
  },
  {
    id: 'skill-write-tests',
    type: 'skill',
    title: 'write-tests',
    where: 'All projects',
    text: 'Write one failing test for the bug before changing code, then make it pass.',
    when: 'SKILL.md'
  },
  {
    id: 'agent-payments-reviewer',
    type: 'agent',
    title: 'payments-reviewer',
    where: 'checkout-service',
    text: 'Specialist reviewer for money movement: idempotency, rounding, currency conversion and refunds.',
    when: 'agent.md'
  },
  {
    id: 'agent-frontend-reviewer',
    type: 'agent',
    title: 'frontend-reviewer',
    where: 'web',
    text: 'Reviews React components for accessibility, render cost and test coverage.',
    when: 'agent.md'
  },
  {
    id: 'rule-checkout-18',
    type: 'rule',
    title: 'checkout-service/CLAUDE.md',
    where: 'checkout-service',
    text: '…all POST handlers under /payments must accept an Idempotency-Key header and…',
    when: 'line 18'
  },
  {
    id: 'rule-notifications-7',
    type: 'rule',
    title: 'notifications/CLAUDE.md',
    where: 'notifications',
    text: 'Email sends are retried, so pass the message id to the provider as the idempotency key.',
    when: 'line 7'
  },
  {
    id: 'rule-web-12',
    type: 'rule',
    title: 'web/CLAUDE.md',
    where: 'web',
    text: 'Use pnpm, never npm. Run pnpm typecheck before opening a PR.',
    when: 'line 12'
  }
]
