import { expect, test } from 'vitest'
import { movePin } from './SessionsPage'

test('dragging a pinned session drops it where it was released', () => {
  const order = ['a', 'b', 'c', 'd']
  expect(movePin(order, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  expect(movePin(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  expect(movePin(order, 'b', 'b')).toEqual(order)
  expect(movePin(order, 'x', 'b')).toEqual(order)
})

test('the tag filter shows only when some session has a tag', async () => {
  const { createElement } = await import('react')
  const { renderToStaticMarkup } = await import('react-dom/server')
  const { SessionsPage } = await import('./SessionsPage')
  const base = { id: 'a', title: 'Fix login', status: 'done', sub: '', repo: 'kokpit', branch: 'main', jira: '', pr: '', time: 'now', cost: '$0.10', lastAt: new Date().toISOString() }
  const noop = () => {}
  const render = (sessions: unknown[]) =>
    renderToStaticMarkup(
      createElement(SessionsPage, { sessions: sessions as never, state: 'ready' as never, onOpen: noop, onAllow: noop, onArchive: noop, onPin: noop, onNew: noop, onPickJira: noop, onRetry: noop, onViewLogs: noop })
    )
  expect(render([base])).not.toContain('>Tag<')
  expect(render([base, { ...base, id: 'b', tags: [{ name: 'Waiting test', color: 'amber' }, { name: 'Review', color: 'blue' }] }])).toContain('>Tag<')
})
