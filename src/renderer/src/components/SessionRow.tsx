import type { SessionSummary } from '@shared/types'
import { Dash, Icon, PrimaryButton, SecondaryButton } from './primitives'
import { Status } from './Status'
import { JiraChip, PrChip } from './LinkChips'

const SUB_COLOR = { running: 'var(--run)', waiting: 'var(--wait-tx)', error: 'var(--err)', done: 'var(--tx3)' } as const

export const SESSION_COLS = '18px minmax(0,1fr) 80px 56px 72px 54px'
export const SESSION_COLS_COMPACT = '18px minmax(0,1fr) 170px 56px 72px 54px'

export function SessionRow({
  s,
  selected,
  compact,
  onOpen,
  onAllow
}: {
  s: SessionSummary
  selected?: boolean
  compact?: boolean
  onOpen?: () => void
  onAllow?: () => void
}) {
  const waiting = s.status === 'waiting'
  const subIcon =
    s.status === 'running' ? 'arrow_right' : waiting ? (s.askType === 'question' ? 'help' : 'shield') : s.status === 'error' ? 'error' : ''

  return (
    <div
      role="button"
      tabIndex={0}
      data-session-id={s.id}
      className="menu-item"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen?.()
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? SESSION_COLS_COMPACT : SESSION_COLS,
        columnGap: 16,
        alignItems: 'center',
        padding: '10px 28px',
        minHeight: 60,
        background: waiting ? 'var(--wait-bg)' : selected ? 'var(--sel)' : undefined,
        borderBottom: '1px solid var(--line-soft)',
        fontSize: 13,
        color: 'var(--tx)',
        cursor: 'pointer'
      }}
    >
      <span style={{ position: 'relative', display: 'flex' }}>
        <Status status={s.status} />
        {s.unread && (
          <span
            aria-label="Not opened since it finished"
            title="Not opened since it finished"
            style={{
              position: 'absolute',
              top: -3,
              right: -4,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--run)',
              boxShadow: '0 0 0 2px var(--panel)'
            }}
          />
        )}
      </span>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {s.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 12, color: SUB_COLOR[s.status] }}>
          {subIcon && <Icon name={subIcon} size={15} />}
          <span
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontFamily: s.status === 'running' ? "'Geist Mono',monospace" : 'inherit',
              minWidth: 0
            }}
          >
            {s.sub}
          </span>
          {waiting && (
            <>
              <span style={{ flex: 1 }} />
              <span style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <PrimaryButton small hint="Y" onClick={onAllow}>
                  {s.askType === 'question' ? 'Answer' : 'Allow'}
                </PrimaryButton>
                <SecondaryButton small hint="↵" onClick={onOpen}>
                  Open
                </SecondaryButton>
              </span>
            </>
          )}
        </div>
      </div>
      {compact && (
        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4, font: "12px/1.2 'Geist Mono',monospace" }}>
          <span style={{ color: 'var(--tx2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.repo}</span>
          <span style={{ color: 'var(--tx3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.branch}</span>
        </div>
      )}
      {!compact && <div>{s.jira ? <JiraChip jiraKey={s.jira} /> : <Dash />}</div>}
      <div>
        {s.pr ? (
          <PrChip label={s.pr} url={s.prUrl ?? ''} jiraKey={s.jira} />
        ) : (
          <Dash />
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--tx2)', whiteSpace: 'nowrap' }}>{s.time}</div>
      <div style={{ textAlign: 'right', font: "12px/1 'Geist Mono',monospace", color: 'var(--tx2)' }}>{s.cost}</div>
    </div>
  )
}
