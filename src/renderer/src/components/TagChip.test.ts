import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { TagPicker } from './TagChip'

test('the tag picker shows the chosen tags and an add button until a session has three', () => {
  const tags = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `Tag ${id}`, color: 'blue' }))
  const render = (tagIds: string[]) => renderToStaticMarkup(createElement(TagPicker, { tags, tagIds, onTags: () => {} }))
  const one = render(['b'])
  expect(one).toContain('Tag b')
  expect(one).toContain('title="Add a tag"')
  expect(one).toContain('title="Change or remove this tag"')
  expect(render(['a', 'b', 'c'])).not.toContain('title="Add a tag"')
})

test('picking from a tag swaps it in place, picking the same tag removes it, and the add button appends', async () => {
  const { nextTags } = await import('./TagChip')
  expect(nextTags(['a', 'b'], 'add', 'c')).toEqual(['a', 'b', 'c'])
  expect(nextTags(['a', 'b'], 'a', 'c')).toEqual(['c', 'b'])
  expect(nextTags(['a', 'b'], 'b', 'b')).toEqual(['a'])
})
