import { expect, test } from 'vitest'
import { contextTokens, contextWindow } from './pricing'

test('context window by model, bumped when usage is past it', () => {
  expect(contextWindow('claude-opus-5-5', 50_000)).toBe(1_000_000)
  expect(contextWindow('claude-haiku-5-5-20260101', 50_000)).toBe(1_000_000)
  expect(contextWindow('claude-sonnet-4-6', 50_000)).toBe(200_000)
  expect(contextWindow('claude-sonnet-4-6[1m]', 50_000)).toBe(1_000_000)
  expect(contextWindow('claude-sonnet-4-6', 250_000)).toBe(1_000_000)
})

test('context tokens count everything the model read', () => {
  expect(contextTokens({ input_tokens: 10, cache_read_input_tokens: 30_000, cache_creation_input_tokens: 2_000, output_tokens: 900 })).toBe(32_010)
})
