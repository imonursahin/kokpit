export function relativeTime(iso: string, nowMs: number): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.round((nowMs - t) / 1000))
  if (s < 10) return 'now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  const startOfToday = new Date(nowMs).setHours(0, 0, 0, 0)
  if (t >= startOfToday) return `${h}h ago`
  if (t >= startOfToday - 86_400_000) return 'Yesterday'
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
