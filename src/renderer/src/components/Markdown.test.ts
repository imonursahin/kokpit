import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import { inline, Markdown, parse } from './Markdown'

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
  expect(hrefs('no link in `https://inside.code` or `http://plain.example`')).toEqual([])
})

const html = (source: string) => renderToStaticMarkup(createElement(Markdown, { source }))

test('http links are clickable too, other schemes stay plain text', () => {
  expect(hrefs('see http://plain.example/a, and [docs](http://docs.example/x)')).toEqual(['http://plain.example/a', 'http://docs.example/x'])
  expect(hrefs('[x](javascript:alert(1)) [y](data:text/html,hi) [z](ftp://a.b)')).toEqual([])
})

test('GFM tables render as a table with alignment and inline formatting in cells', () => {
  const [table] = parse('| Name | Size | Link |\n|:---|:--:|--:|\n| `a.ts` | **2** | [x](https://x.y) |\n| b \\| c | 3 |')
  expect(table).toMatchObject({
    type: 'table',
    align: ['left', 'center', 'right'],
    head: ['Name', 'Size', 'Link'],
    rows: [
      ['`a.ts`', '**2**', '[x](https://x.y)'],
      ['b | c', '3', '']
    ]
  })
  const out = html('| a | b |\n|---|---|\n| `x` | **y** |')
  expect(out).toContain('<th')
  expect(out).toContain('overflow-x:auto')
  expect(out).toMatch(/<td[^>]*><span[^>]*>x<\/span><\/td>/)
  expect(out).toMatch(/<td[^>]*><strong[^>]*>y<\/strong><\/td>/)
})

test('pipes without a separator row stay a paragraph', () => {
  expect(parse('a | b\nc | d').map((b) => b.type)).toEqual(['p'])
  expect(parse('| a | b |\n|---|').map((b) => b.type)).toEqual(['p'])
})

test('consecutive > lines form one blockquote', () => {
  expect(parse('> one\n> **two**\n\nafter')).toEqual([
    { type: 'quote', text: 'one **two**' },
    { type: 'p', text: 'after' }
  ])
  expect(html('> quoted')).toMatch(/^<div[^>]*><blockquote[^>]*>quoted<\/blockquote><\/div>$/)
})

test('---, *** and ___ render as horizontal rules, front matter still parses', () => {
  expect(parse('a\n\n---\n\nb\n***\n___').map((b) => b.type)).toEqual(['p', 'hr', 'p', 'hr', 'hr'])
  expect(html('a\n\n---\n\nb')).toContain('<hr')
  expect(parse('---\nname: x\n---\n\n---\nbody')).toEqual([
    { type: 'front', fields: [['name', 'x']] },
    { type: 'hr', text: '---' },
    { type: 'p', text: 'body' }
  ])
})

test('items indented under a list item render as a nested list', () => {
  const [list] = parse('- a\n  - a1\n    more\n  - a2\n- b\n1. c')
  expect(list).toMatchObject({ type: 'list', ordered: false, items: ['a', 'a1 more', 'a2', 'b'] })
  expect(html('- a\n  - a1\n- b')).toMatch(/<ul[^>]*><li>a<ul[^>]*><li>a1<\/li><\/ul><\/li><li>b<\/li><\/ul>/)
  expect(html('1. step\n   1. sub')).toMatch(/<ol start="1"[^>]*><li>step<ol start="1"[^>]*><li>sub<\/li><\/ol><\/li><\/ol>/)
  expect(parse('- a\n- b').map((b) => b.type)).toEqual(['list'])
})
