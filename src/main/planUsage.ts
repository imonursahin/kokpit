import { query } from '@anthropic-ai/claude-agent-sdk'
import type { PlanUsage, PlanWindow } from '../shared/settings'
import { idleInput } from './mcp'
import { quietDir } from './quietDir'

type Window = { utilization?: number | null; resets_at?: string | null } | null | undefined

const FIXED: [string, string][] = [
  ['five_hour', 'Current session (5 hours)'],
  ['seven_day', 'Weekly · all models'],
  ['seven_day_opus', 'Weekly · Opus'],
  ['seven_day_sonnet', 'Weekly · Sonnet']
]

export function toWindows(limits: Record<string, unknown> | null): PlanWindow[] {
  if (!limits) return []
  const out: PlanWindow[] = []
  const push = (id: string, label: string, w: Window) => {
    if (w && typeof w.utilization === 'number') out.push({ id, label, utilization: w.utilization, resetsAt: w.resets_at ?? '' })
  }
  for (const [id, label] of FIXED) push(id, label, limits[id] as Window)
  const scoped = Array.isArray(limits['model_scoped']) ? (limits['model_scoped'] as ({ display_name?: string } & Window)[]) : []
  for (const m of scoped) if (m?.display_name) push(`model:${m.display_name}`, `Weekly · ${m.display_name}`, m)
  return out
}

export async function planUsage(executable: string | undefined, timeoutMs = 20_000): Promise<PlanUsage> {
  const abort = new AbortController()
  const q = query({ prompt: idleInput(), options: { cwd: quietDir(), abortController: abort, pathToClaudeCodeExecutable: executable } })
  const timer = setTimeout(() => abort.abort(), timeoutMs)
  try {
    const u = await q.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({ skipBehaviors: true })
    return {
      available: u.rate_limits_available,
      plan: u.subscription_type,
      windows: toWindows(u.rate_limits as Record<string, unknown> | null)
    }
  } finally {
    clearTimeout(timer)
    abort.abort()
    q.close()
  }
}
