import { expect, test } from 'vitest'
import type { PullRequestInfo } from '../shared/integrations'
import type { SessionIndexItem } from '../shared/sessionIndex'
import { prNotices, sessionNotices } from './notifier'

const item = (id: string, status: SessionIndexItem['status'], headless = false) =>
  ({ id, status, headless, title: `t-${id}`, sub: '' }) as SessionIndexItem

test('session notices fire only on status changes that matter', () => {
  const prev = new Map([
    ['a', 'running'],
    ['b', 'running'],
    ['c', 'done'],
    ['d', 'waiting'],
    ['e', 'done']
  ] as const)
  const events = sessionNotices(
    new Map(prev),
    [item('a', 'done'), item('b', 'waiting'), item('c', 'done'), item('d', 'waiting'), item('e', 'error'), item('f', 'done', true)],
    false
  ).map((n) => `${n.event}:${n.target.page === 'session' ? n.target.id : ''}`)
  expect(events).toEqual(['sessionDone:a', 'sessionWaiting:b', 'sessionError:e'])
})

const pr = (n: number, failed: number, changes = 0) =>
  ({
    number: n,
    repo: 'org/repo',
    title: `PR ${n}`,
    url: `u${n}`,
    author: 'ayse',
    checks: { total: 3, passed: 3 - failed, failed, pending: 0, failedNames: failed ? ['Unit Tests'] : [] },
    reviews: { approved: 0, changesRequested: changes }
  }) as PullRequestInfo

test('pull request notices: new CI failure, new change request, new review request', () => {
  const events = prNotices({ mine: [pr(1, 0), pr(2, 1), pr(3, 0, 1)], reviews: [pr(9, 0)] }, {
    mine: [pr(1, 2), pr(2, 1), pr(3, 0, 2)],
    reviews: [pr(9, 0), pr(10, 0)]
  }).map((n) => `${n.event}:${n.title}`)
  expect(events).toEqual([
    'prChecksFailed:CI failed · repo #1',
    'prChangesRequested:Changes requested · repo #3',
    'prReviewRequested:Review requested · repo #10'
  ])
})
