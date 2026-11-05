import { expect, test } from 'vitest'
import { adfToText, normalizeSite } from './jira'

test('normalizeSite accepts urls and rejects junk', () => {
  expect(normalizeSite('https://northwind.atlassian.net/browse/SHOP-1')).toBe('northwind.atlassian.net')
  expect(() => normalizeSite('not a site')).toThrow()
})

test('adfToText flattens paragraphs and lists', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] }] }
    ]
  }
  expect(adfToText(doc).trim()).toBe('Hello\n\n• one')
})

test('textToAdf keeps paragraphs and line breaks', async () => {
  const { textToAdf } = await import('./jira')
  const doc = textToAdf('one\ntwo\n\nthree') as { content: { content: { type: string; text?: string }[] }[] }
  expect(doc.content).toHaveLength(2)
  expect(doc.content[0]?.content.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text'])
})
