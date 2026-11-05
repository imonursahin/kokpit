import { useState } from 'react'
import type { DoctorCheck } from '@shared/settings'
import { Icon, Spinner } from './primitives'

const STATUS: Record<DoctorCheck['status'], [string, string]> = {
  ok: ['check_circle', 'var(--ok)'],
  warn: ['error', 'var(--wait-tx)'],
  err: ['cancel', 'var(--err)']
}

export function DoctorButton({ checks, onOpen }: { checks: DoctorCheck[] | null; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  const errors = checks?.filter((c) => c.status === 'err').length ?? 0
  const warnings = checks?.filter((c) => c.status === 'warn').length ?? 0
  const issues = errors + warnings
  const [icon, color] = !checks ? ['ecg_heart', 'var(--tx3)'] : errors ? STATUS.err : warnings ? STATUS.warn : ['ecg_heart', 'var(--ok)']
  const label = !checks ? 'Checking…' : issues ? `${issues} issue${issues === 1 ? '' : 's'}` : 'Healthy'

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}
    >
      <span
        tabIndex={0}
        role="status"
        aria-describedby="doctor-popover"
        aria-label={`Doctor: ${label}`}
        className="no-drag"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          height: 32,
          padding: '0 12px 0 10px',
          border: '1px solid var(--line)',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--tx)',
          cursor: 'default'
        }}
      >
        {checks ? <Icon name={icon} size={17} color={color} /> : <Spinner size={12} />}
        {label}
      </span>
      {open && (
        <span id="doctor-popover" role="tooltip" className="no-drag" style={{ display: 'block', position: 'absolute', top: '100%', right: 0, paddingTop: 8, zIndex: 40 }}>
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 340,
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              boxShadow: 'var(--pop)',
              overflow: 'hidden'
            }}
          >
            <span style={{ padding: '11px 14px 9px', fontSize: 12.5, fontWeight: 600, color: 'var(--tx)' }}>
              Doctor
              <span style={{ fontWeight: 400, color: 'var(--tx3)' }}>
                {' '}
                · {!checks ? 'checking this machine' : issues ? `${issues} thing${issues === 1 ? '' : 's'} to look at` : 'everything Kokpit needs is in place'}
              </span>
            </span>
            {(checks ?? []).map((c) => {
              const [ci, cc] = STATUS[c.status]
              return (
                <span
                  key={c.id}
                  style={{ display: 'grid', gridTemplateColumns: '18px 110px minmax(0,1fr)', alignItems: 'center', gap: 8, padding: '6px 14px', borderTop: '1px solid var(--line-soft)', fontSize: 12 }}
                >
                  <Icon name={ci} size={15} color={cc} />
                  <span style={{ color: 'var(--tx2)' }}>{c.label}</span>
                  <span style={{ color: c.status === 'ok' ? 'var(--tx)' : cc, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.value}</span>
                </span>
              )
            })}
            <button
              onClick={onOpen}
              className="menu-item"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '9px 14px', borderTop: '1px solid var(--line)', fontSize: 12.5, fontWeight: 500, color: 'var(--tx)', textAlign: 'left' }}
            >
              Open Doctor in Settings
              <Icon name="chevron_right" size={16} color="var(--tx3)" />
            </button>
          </span>
        </span>
      )}
    </span>
  )
}
