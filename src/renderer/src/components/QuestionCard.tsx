import { useState } from 'react'
import { Icon } from './primitives'

type Option = { label: string; description?: string }
type Question = { question: string; header?: string; options: Option[]; multiSelect?: boolean }

const OTHER = '__other__'

export function parseQuestions(input: Record<string, unknown>): Question[] {
  const raw = Array.isArray(input['questions']) ? (input['questions'] as unknown[]) : []
  return raw.flatMap((q) => {
    if (typeof q !== 'object' || q === null) return []
    const o = q as Record<string, unknown>
    if (typeof o['question'] !== 'string') return []
    const options = (Array.isArray(o['options']) ? (o['options'] as unknown[]) : []).flatMap((x) => {
      const opt = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
      return typeof opt['label'] === 'string' ? [{ label: opt['label'], description: typeof opt['description'] === 'string' ? opt['description'] : undefined }] : []
    })
    return [{ question: o['question'], header: typeof o['header'] === 'string' ? o['header'] : undefined, options, multiSelect: o['multiSelect'] === true }]
  })
}

export function QuestionCard({
  input,
  onSubmit,
  onDismiss
}: {
  input: Record<string, unknown>
  onSubmit: (answers: Record<string, string>) => void
  onDismiss: () => void
}) {
  const questions = parseQuestions(input)
  const [picked, setPicked] = useState<Record<number, string[]>>({})
  const [other, setOther] = useState<Record<number, string>>({})

  const toggle = (qi: number, key: string, multi: boolean) =>
    setPicked((cur) => {
      const now = cur[qi] ?? []
      const next = multi ? (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]) : [key]
      return { ...cur, [qi]: next }
    })

  const answerFor = (qi: number): string => {
    const keys = picked[qi] ?? []
    return keys
      .map((k) => (k === OTHER ? (other[qi] ?? '').trim() : k))
      .filter(Boolean)
      .join(', ')
  }
  const ready = questions.length > 0 && questions.every((_, qi) => answerFor(qi))

  const submit = () => {
    if (!ready) return
    onSubmit(Object.fromEntries(questions.map((q, qi) => [q.question, answerFor(qi)])))
  }

  return (
    <div style={{ border: '1px solid var(--wait-line, var(--line))', borderRadius: 12, background: 'var(--panel)', overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--wait-bg)', fontSize: 13 }}>
        <Icon name="help" size={18} color="var(--wait-tx)" />
        <span style={{ fontWeight: 600, color: 'var(--wait-tx)' }}>Claude has a question</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '14px 16px' }}>
        {questions.map((q, qi) => (
          <div key={qi} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {q.header && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: 'var(--hover)', color: 'var(--tx2)' }}>{q.header}</span>
              )}
              {q.multiSelect && <span style={{ fontSize: 11.5, color: 'var(--tx3)' }}>Pick one or more</span>}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{q.question}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[...q.options, { label: OTHER, description: undefined }].map((o) => {
                const on = (picked[qi] ?? []).includes(o.label)
                return (
                  <button
                    key={o.label}
                    onClick={() => toggle(qi, o.label, !!q.multiSelect)}
                    aria-pressed={on}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: `1px solid ${on ? 'var(--tx)' : 'var(--line)'}`,
                      background: on ? 'var(--hover)' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer'
                    }}
                  >
                    <Icon name={q.multiSelect ? (on ? 'check_box' : 'check_box_outline_blank') : on ? 'radio_button_checked' : 'radio_button_unchecked'} size={17} color="var(--tx2)" />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{o.label === OTHER ? 'Other' : o.label}</span>
                      {o.description && <span style={{ fontSize: 12, color: 'var(--tx3)', lineHeight: 1.45 }}>{o.description}</span>}
                      {o.label === OTHER && on && (
                        <input
                          autoFocus
                          aria-label="Your answer"
                          value={other[qi] ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') submit()
                          }}
                          onChange={(e) => setOther((cur) => ({ ...cur, [qi]: e.target.value }))}
                          placeholder="Type your answer"
                          style={{ marginTop: 6, height: 30, padding: '0 8px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--tx)', font: 'inherit', fontSize: 13 }}
                        />
                      )}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--line-soft)' }}>
        <button
          onClick={submit}
          disabled={!ready}
          style={{ height: 30, padding: '0 14px', borderRadius: 7, background: 'var(--tx)', color: 'var(--panel)', fontSize: 12.5, fontWeight: 500, opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'default' }}
        >
          Send answer
        </button>
        <span style={{ flex: 1 }} />
        <button onClick={onDismiss} style={{ fontSize: 12.5, color: 'var(--tx2)', padding: '0 6px', cursor: 'pointer' }}>
          Skip
        </button>
      </div>
    </div>
  )
}
