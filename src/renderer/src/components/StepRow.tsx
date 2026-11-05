import { useState } from 'react'
import { Icon, Spinner } from './primitives'

export type StepKind = 'read' | 'edit' | 'create' | 'command' | 'search' | 'fetch' | 'jira'

const ICONS: Record<StepKind, string> = {
  read: 'draft',
  edit: 'edit',
  create: 'note_add',
  command: 'terminal',
  search: 'search',
  fetch: 'public',
  jira: 'task_alt'
}

export type Step = {
  kind: StepKind
  label: string
  target: string
  meta?: string
  add?: number
  del?: number
  state?: 'done' | 'running' | 'error'
  output?: string
  expanded?: boolean
}

export function StepRow({ step }: { step: Step }) {
  const [expanded, setExpanded] = useState(!!step.expanded)
  const err = step.state === 'error'
  const live = step.state === 'running'
  const canExpand = !live

  return (
    <div style={{ display: 'flex', flexDirection: 'column', fontSize: 12.5 }}>
      <div
        role={canExpand ? 'button' : undefined}
        onClick={() => canExpand && setExpanded((v) => !v)}
        className="step-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 28,
          padding: '0 8px',
          margin: '0 -8px',
          borderRadius: 6,
          background: expanded ? 'var(--hover)' : undefined,
          color: 'var(--tx2)'
        }}
      >
        <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {live ? <Spinner size={11} width={1.75} /> : <Icon name={ICONS[step.kind]} size={16} color={err ? 'var(--err)' : 'var(--tx3)'} />}
        </span>
        <span style={{ color: live ? 'var(--run)' : 'var(--tx2)', flexShrink: 0 }}>{step.label}</span>
        <span
          style={{
            font: "12px/1.3 'Geist Mono',monospace",
            color: 'var(--tx)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0
          }}
        >
          {step.target}
        </span>
        {step.add != null && (
          <span style={{ font: "12px/1 'Geist Mono',monospace", color: 'var(--ok)', flexShrink: 0 }}>+{step.add}</span>
        )}
        {!!step.del && <span style={{ font: "12px/1 'Geist Mono',monospace", color: 'var(--err)', flexShrink: 0 }}>−{step.del}</span>}
        <span style={{ flex: 1 }} />
        <span
          style={{
            color: err ? 'var(--err)' : live ? 'var(--run)' : 'var(--tx3)',
            fontSize: 12,
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          {step.meta}
        </span>
        <Icon name={live ? '' : expanded ? 'expand_less' : 'expand_more'} size={16} color="var(--tx3)" />
      </div>
      {expanded && step.output && (
        <pre
          className="selectable"
          style={{
            margin: '4px 0 6px 24px',
            padding: '10px 12px',
            background: 'var(--code)',
            border: '1px solid var(--line-soft)',
            borderRadius: 7,
            font: "12px/1.6 'Geist Mono',monospace",
            color: 'var(--tx2)',
            whiteSpace: 'pre-wrap'
          }}
        >
          {step.output}
        </pre>
      )}
    </div>
  )
}
