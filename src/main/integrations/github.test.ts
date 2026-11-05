import { expect, test } from 'vitest'
import { summarizeReviews } from './github'

const r = (login: string, state: string) => ({ user: { login }, state })

test('counts each reviewer by their latest decision', () => {
  expect(
    summarizeReviews([
      r('ayse', 'CHANGES_REQUESTED'),
      r('ayse', 'COMMENTED'),
      r('ayse', 'APPROVED'),
      r('mehmet', 'APPROVED'),
      r('can', 'CHANGES_REQUESTED'),
      r('deniz', 'APPROVED'),
      r('deniz', 'DISMISSED'),
      r('ece', 'COMMENTED'),
      r('release-actions[bot]', 'APPROVED'),
      { user: { login: 'ci-helper', type: 'Bot' }, state: 'APPROVED' }
    ])
  ).toEqual({ approved: 2, changesRequested: 1 })
  expect(summarizeReviews([])).toEqual({ approved: 0, changesRequested: 0 })
})

test('a check that was re-run counts only its latest run', async () => {
  const { summarizeChecks } = await import('./github')
  const run = (id: number, name: string, conclusion: string, status = 'completed') => ({ id, name, status, conclusion })
  expect(
    summarizeChecks([
      run(1, 'Unit Tests', 'cancelled'),
      run(5, 'Unit Tests', 'success'),
      run(2, 'Code Linter', 'success'),
      run(6, 'Code Linter', 'failure'),
      run(3, 'build', 'success'),
      run(7, 'report', 'neutral'),
      run(8, 'e2e', '', 'in_progress')
    ])
  ).toEqual({ total: 5, passed: 3, failed: 1, pending: 1, failedNames: ['Code Linter'] })
})
