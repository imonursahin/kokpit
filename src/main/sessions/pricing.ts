type Price = { input: number; output: number; cacheRead: number }

const PRICES: [prefix: string, price: Price][] = [
  ['claude-fable-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-mythos-5-1', { input: 10, output: 50, cacheRead: 0.25 }],
  ['claude-fable-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-mythos-5', { input: 10, output: 50, cacheRead: 1 }],
  ['claude-opus-5-5', { input: 4, output: 20, cacheRead: 0.2 }],
  ['claude-opus-5', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-8', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-7', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-opus-4-6', { input: 5, output: 25, cacheRead: 0.5 }],
  ['claude-sonnet-5-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-5', { input: 2, output: 10, cacheRead: 0.2 }],
  ['claude-sonnet-4-6', { input: 3, output: 15, cacheRead: 0.3 }],
  ['claude-haiku-5-5', { input: 0.1, output: 0.5, cacheRead: 0.01 }],
  ['claude-haiku-4-5', { input: 1, output: 5, cacheRead: 0.1 }]
]

export type Usage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number }
}

export function contextWindow(model: string, used: number): number {
  const big = model.includes('[1m]') || /^claude-[a-z]+-5(-|$)/.test(model)
  const window = big ? 1_000_000 : 200_000
  return used > window ? 1_000_000 : window
}

export function contextTokens(usage: Usage): number {
  return n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens)
}

function priceFor(model: string): Price | null {
  for (const [prefix, price] of PRICES) {
    if (model === prefix || model.startsWith(`${prefix}-`) || model.startsWith(`${prefix}[`)) return price
  }
  return null
}

function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function costOf(model: string, usage: Usage): { usd: number; known: boolean } {
  const price = priceFor(model)
  if (!price) return { usd: 0, known: false }
  const write1h = n(usage.cache_creation?.ephemeral_1h_input_tokens)
  const write5m = usage.cache_creation
    ? n(usage.cache_creation.ephemeral_5m_input_tokens)
    : n(usage.cache_creation_input_tokens)
  const usd =
    (n(usage.input_tokens) * price.input +
      n(usage.output_tokens) * price.output +
      n(usage.cache_read_input_tokens) * price.cacheRead +
      write5m * price.input * 1.25 +
      write1h * price.input * 2) /
    1_000_000
  return { usd, known: true }
}
