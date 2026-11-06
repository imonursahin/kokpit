import { isValidElement, type ReactElement } from 'react'
import { expect, test } from 'vitest'
import { inline } from './Markdown'

const hrefs = (text: string) =>
  inline(text)
    .filter((n): n is ReactElement<{ href: string }> => isValidElement(n) && n.type === 'a')
    .map((n) => n.props.href)

test('bare https links in chat text become clickable, without trailing punctuation', () => {
  const nodes = inline('Plugin: https://github.com/useinsider/aio_plugin/tree/HEAD/plugins/aidlc. Done')
  expect(hrefs('Plugin: https://github.com/useinsider/aio_plugin/tree/HEAD/plugins/aidlc. Done')).toEqual([
    'https://github.com/useinsider/aio_plugin/tree/HEAD/plugins/aidlc'
  ])
  expect(nodes.at(-1)).toBe('. Done')
  expect(hrefs('see [the repo](https://github.com/x/y) and https://example.com/a?b=1, ok')).toEqual(['https://github.com/x/y', 'https://example.com/a?b=1'])
  expect(hrefs('no link in `https://inside.code` or http://plain.example')).toEqual([])
})
