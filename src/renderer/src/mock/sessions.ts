import type { SessionSummary } from '@shared/types'

export const MOCK_SESSIONS: SessionSummary[] = [
  { id: 's1', status: 'waiting', askType: 'permission', title: 'Retry logic for failed webhook deliveries', sub: 'Wants to run pnpm prisma migrate dev --name add_webhook_attempts', repo: 'checkout-service', branch: 'feat/webhook-retries', jira: 'PAY-1284', pr: '#412', time: '1m ago', cost: '$2.07' },
  { id: 's2', status: 'running', title: 'Fix flaky CartSummary snapshot tests', sub: 'Running vitest on 14 test files…', repo: 'web', branch: 'fix/cart-snapshot', jira: 'WEB-877', pr: '', time: 'now', cost: '$0.62' },
  { id: 's3', status: 'waiting', askType: 'question', title: 'Plan: migrate session store to Redis', sub: 'Asked: keep the 30-day TTL or shorten it to 14 days?', repo: 'checkout-service', branch: 'main', jira: '', pr: '', time: '6m ago', cost: '$0.38' },
  { id: 's4', status: 'running', title: 'Refactor useInvoiceFilters hook', sub: 'Editing src/hooks/useInvoiceFilters.ts', repo: 'web', branch: 'refactor/invoice-filters', jira: 'WEB-902', pr: '#1187', time: '12s ago', cost: '$0.95' },
  { id: 's5', status: 'error', title: 'Terraform: add read replica for orders DB', sub: 'terraform plan exited with code 1 — AWS credentials expired', repo: 'infra', branch: 'feat/orders-replica', jira: 'OPS-233', pr: '', time: '48m ago', cost: '$0.71' },
  { id: 's6', status: 'done', title: 'Research: Stripe Payment Element vs Checkout', sub: 'Wrote a one-page comparison with a recommendation', repo: 'web', branch: 'main', jira: 'WEB-910', pr: '', time: '1h ago', cost: '$0.47' },
  { id: 's7', status: 'done', title: 'Review PR #409 — idempotency keys', sub: 'Requested changes: a replayed POST can create a second charge', repo: 'checkout-service', branch: 'review/409', jira: 'PAY-1279', pr: '#409', time: '2h ago', cost: '$0.29' },
  { id: 's8', status: 'done', title: 'Add Turkish locale to email templates', sub: '12 templates translated, PR opened', repo: 'notifications', branch: 'feat/tr-locale', jira: 'NOT-58', pr: '#88', time: 'Yesterday', cost: '$1.12' },
  { id: 's9', status: 'done', title: 'Bump Next.js to 15.2 and fix type errors', sub: 'Upgraded, 23 type errors fixed, CI green', repo: 'web', branch: 'chore/next-15-2', jira: 'WEB-899', pr: '#1179', time: 'Yesterday', cost: '$2.40' }
]
