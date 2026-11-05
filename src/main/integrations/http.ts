export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504])

export async function fetchJson<T>(url: string, init: RequestInit, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) })
      if (res.ok) return (await res.json()) as T
      if (!TRANSIENT.has(res.status) || i === attempts - 1) {
        const detail = await res
          .json()
          .then((b: unknown) => (b && typeof b === 'object' && typeof (b as { message?: unknown }).message === 'string' ? (b as { message: string }).message : ''))
          .catch(() => '')
        throw new HttpError(res.status, `${new URL(url).host} answered ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`)
      }
      const retryAfter = Number(res.headers.get('retry-after'))
      await new Promise((r) => setTimeout(r, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** i))
    } catch (err) {
      if (err instanceof HttpError) throw err
      lastErr = err
      if (i === attempts - 1) break
      await new Promise((r) => setTimeout(r, 500 * 2 ** i))
    }
  }
  throw new Error(`Request to ${new URL(url).host} failed: ${(lastErr as Error)?.message ?? 'unknown error'}`)
}
