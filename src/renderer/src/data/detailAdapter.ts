import type { DetailTurn, SessionDetailData } from '@shared/sessionDetail'
import { parse } from '@/components/Markdown'
import { relativeTime } from '@/data/useSessions'
import type { DetailView, Plan, PlanBlock, Rich, TextBlock, Turn } from '@/mock/sessionDetail'

const MAX_TURNS = 60

export function toRich(text: string): Rich {
  return text
    .split(/`([^`\n]+)`/)
    .map((p, i) => (i % 2 ? { code: p } : p))
    .filter((p) => p !== '')
}

export function toBlocks(text: string): TextBlock[] {
  const out: TextBlock[] = []
  text
    .replace(/\r\n?/g, '\n')
    .split(/^[ \t]*```[^\n]*$/m)
    .forEach((part, i) => {
      if (i % 2) out.push({ kind: 'pre', text: part.replace(/^\n/, '').replace(/\n$/, '') })
      else for (const p of part.split(/\n[ \t]*\n/)) if (p.trim()) out.push({ kind: 'p', text: toRich(p.trim()) })
    })
  return out
}

export function toTurns(turns: DetailTurn[], earlierCount: number): Turn[] {
  const shown = turns.slice(-MAX_TURNS)
  const earlier = earlierCount + turns.length - shown.length
  const out: Turn[] = earlier > 0 ? [{ kind: 'earlier', text: `${earlier} earlier turn${earlier === 1 ? '' : 's'}` }] : []
  shown.forEach((t, i) => {
    if (t.kind === 'user') out.push({ kind: 'user', text: toRich(t.text) })
    else
      out.push({
        kind: 'claude',
        name: shown[i - 1]?.kind !== 'claude',
        steps: t.steps,
        markdown: t.text || undefined,
        output: t.output || undefined,
        parts: t.parts,
        meta: t.meta
      })
  })
  return out
}

export function toPlan(plan: NonNullable<SessionDetailData['plan']>, nowMs: number): Plan {
  let title = ''
  const blocks: PlanBlock[] = []
  for (const b of parse(plan.markdown)) {
    if (b.type === 'heading' && b.level === 1 && !title) title = b.text
    else if (b.type === 'heading' && b.level === 2) blocks.push({ kind: 'h2', text: b.text })
    else if (b.type === 'list') blocks.push({ kind: b.ordered ? 'ol' : 'ul', items: b.items.map(toRich) })
    else if (b.type === 'front') blocks.push({ kind: 'p', text: [b.fields.map(([k, v]) => `${k}: ${v}`).join(' · ')] })
    else blocks.push({ kind: 'p', text: toRich(b.text) })
  }
  const updated = relativeTime(plan.updatedAt, nowMs)
  return {
    file: plan.file.split('/').pop() || plan.file,
    meta: updated ? `updated ${updated}` : '',
    title,
    blocks
  }
}

export function toDetailView(data: SessionDetailData, nowMs: number): DetailView {
  const h = data.header
  const hasChanges = data.files.length > 0
  const plan = data.plan && toPlan(data.plan, nowMs)
  return {
    header: {
      title: h.title,
      status: h.status,
      elapsed: h.elapsed,
      cost: h.cost,
      repo: h.repo,
      branch: h.branch,
      jira: h.jira,
      pr: h.pr && { number: h.pr.number },
      context: h.context
    },
    turns: toTurns(data.turns, data.earlierCount),
    placeholder: data.running ? 'Claude is working — type to queue a message…' : 'Reply to Claude…',
    model: data.model,
    thinking: 'Medium',
    running: data.running,
    activeSince: data.activeSince,
    tab: hasChanges ? 'changes' : plan ? 'plan' : 'changes',
    hasChanges,
    hasPlan: !!plan,
    files: data.files.map((f, i) => ({
      path: f.path,
      change: f.change,
      add: f.add,
      del: f.del,
      test: f.test,
      included: !f.test,
      active: i === 0
    })),
    diff: Object.fromEntries(data.files.map((f) => [f.path, f.lines])),
    filesNote:
      data.filesSource === 'git' ? 'not pushed yet' : data.filesSource === 'transcript' ? "from the session's edits" : undefined,
    plan,
    planMarkdown: data.plan?.markdown,
    linkPlaceholders: false,
    selectableFiles: true
  }
}
