import { useEffect, type ReactNode } from 'react'
import { Icon } from './primitives'
import { Status } from './Status'

export type ApprovalOption = { key: string; label: string; hint: string }

export type ApprovalRequest =
  | { type: 'command'; action?: string; reason?: string; command: string; cwd: string; rule: string; waited: string }
  | { type: 'edit'; action?: string; reason?: string; file: string; add: number; del: number; rule: string; waited: string }
  | { type: 'question'; question: string; options: ApprovalOption[]; waited: string }

const ACTION = { command: '· Run a command', edit: '· Edit a file', question: '' } as const

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

function CardButton({
  primary,
  hint,
  onClick,
  children
}: {
  primary?: boolean
  hint: string
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 30,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        padding: '0 9px 0 12px',
        borderRadius: 7,
        fontSize: 12.5,
        fontWeight: 500,
        ...(primary ? { background: 'var(--pri)', color: 'var(--inv)' } : {})
      }}
    >
      {children}
      <span style={{ font: "400 11px/1 'Geist Mono',monospace", ...(primary ? { opacity: 0.6 } : { color: 'var(--tx3)' }) }}>
        {hint}
      </span>
    </button>
  )
}

export function ApprovalCard({
  request,
  onAllow,
  onAlwaysAllow,
  onDeny,
  onAnswer,
  onViewDiff,
  shortcuts = true
}: {
  request: ApprovalRequest
  onAllow?: () => void
  onAlwaysAllow?: () => void
  onDeny?: () => void
  onAnswer?: (key: string) => void
  onViewDiff?: () => void
  shortcuts?: boolean
}) {
  useEffect(() => {
    if (!shortcuts) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (request.type === 'question') {
        const opt = request.options.find((o) => o.key === e.key)
        if (opt) onAnswer?.(opt.key)
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'y') onAllow?.()
      else if (k === 'a') onAlwaysAllow?.()
      else if (k === 'n') onDeny?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [request, onAllow, onAlwaysAllow, onDeny, onAnswer, shortcuts])

  const isQuestion = request.type === 'question'
  const reason = request.type === 'question' ? '' : request.reason
  const first = isQuestion ? request.options[0]?.key : undefined
  const last = isQuestion ? request.options[request.options.length - 1]?.key : undefined

  return (
    <div
      style={{
        border: '1px solid var(--wait-line)',
        borderRadius: 10,
        background: 'var(--panel)',
        boxShadow: '0 0 0 3px var(--wait-bg)',
        overflow: 'hidden',
        fontSize: 13,
        color: 'var(--tx)',
        flexShrink: 0
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 14px',
          background: 'var(--wait-bg)',
          borderBottom: '1px solid var(--wait-line)'
        }}
      >
        <Status status="waiting" />
        <span style={{ fontWeight: 600, color: 'var(--wait-tx)' }}>
          {isQuestion ? 'Claude has a question' : 'Claude needs your permission'}
        </span>
        <span style={{ color: 'var(--tx2)' }}>{request.type === 'question' ? '' : (request.action ?? ACTION[request.type])}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{request.waited}</span>
      </div>
      <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reason && <div style={{ color: 'var(--tx2)', lineHeight: 1.55, textWrap: 'pretty' }}>{reason}</div>}
        {request.type === 'command' && (
          <div
            className="selectable"
            style={{
              background: 'var(--code)',
              border: '1px solid var(--line)',
              borderRadius: 7,
              padding: '10px 12px',
              font: "12.5px/1.5 'Geist Mono',monospace",
              display: 'flex',
              flexDirection: 'column',
              gap: 3
            }}
          >
            <div>
              <span style={{ color: 'var(--tx3)' }}>$ </span>
              <span>{request.command}</span>
            </div>
            <div style={{ color: 'var(--tx3)', fontSize: 11.5 }}>in {request.cwd}</div>
          </div>
        )}
        {request.type === 'edit' && (
          <div
            style={{
              border: '1px solid var(--line)',
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '9px 12px',
              font: "12.5px/1 'Geist Mono',monospace"
            }}
          >
            <Icon name="edit" size={16} color="var(--tx3)" />
            <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{request.file}</span>
            <span style={{ color: 'var(--ok)' }}>+{request.add}</span>
            <span style={{ color: 'var(--err)' }}>−{request.del}</span>
            <span style={{ flex: 1 }} />
            <button
              onClick={onViewDiff}
              style={{
                fontFamily: 'Geist,sans-serif',
                fontSize: 12,
                color: 'var(--tx2)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                textDecorationColor: 'var(--line)'
              }}
            >
              View diff
            </button>
          </div>
        )}
        {request.type === 'question' && (
          <>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, textWrap: 'pretty' }}>{request.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {request.options.map((o) => (
                <button
                  key={o.key}
                  className="menu-item"
                  onClick={() => onAnswer?.(o.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    border: '1px solid var(--line)',
                    borderRadius: 7,
                    textAlign: 'left'
                  }}
                >
                  <span
                    style={{
                      font: "500 10.5px/1 'Geist Mono',monospace",
                      color: 'var(--tx2)',
                      border: '1px solid var(--line)',
                      borderBottomWidth: 2,
                      borderRadius: 4,
                      padding: '2px 5px'
                    }}
                  >
                    {o.key}
                  </span>
                  <span style={{ fontWeight: 500 }}>{o.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{o.hint}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {request.type !== 'question' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 14px', flexWrap: 'wrap' }}>
          <CardButton primary hint="Y" onClick={onAllow}>
            Allow once
          </CardButton>
          {onAlwaysAllow && (
            <button
              onClick={onAlwaysAllow}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 30,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                padding: '0 9px 0 12px',
                borderRadius: 7,
                border: '1px solid var(--line)',
                background: 'var(--panel)',
                fontSize: 12.5,
                fontWeight: 500
              }}
            >
              Always allow
              <span
                style={{
                  font: "400 11.5px/1 'Geist Mono',monospace",
                  color: 'var(--tx2)',
                  background: 'var(--hover)',
                  padding: '3px 5px',
                  borderRadius: 4
                }}
              >
                {request.rule}
              </span>
              <span style={{ font: "400 11px/1 'Geist Mono',monospace", color: 'var(--tx3)' }}>A</span>
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span style={{ color: 'var(--tx2)', display: 'inline-flex' }}>
            <CardButton hint="N" onClick={onDeny}>
              Deny
            </CardButton>
          </span>
        </div>
      )}
      {isQuestion && (
        <div style={{ padding: '0 14px 12px', fontSize: 12, color: 'var(--tx3)' }}>
          Press {first === last ? first : `${first}–${last}`} to answer, or reply below in your own words.
        </div>
      )}
    </div>
  )
}
