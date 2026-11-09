import { expect, test } from 'vitest'
import { movePin } from './SessionsPage'

test('dragging a pinned session drops it where it was released', () => {
  const order = ['a', 'b', 'c', 'd']
  expect(movePin(order, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  expect(movePin(order, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  expect(movePin(order, 'b', 'b')).toEqual(order)
  expect(movePin(order, 'x', 'b')).toEqual(order)
})
