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
  expect(one).toContain('aria-label="Remove tag Tag b"')
  expect(render(['a', 'b', 'c'])).not.toContain('title="Add a tag"')
})
