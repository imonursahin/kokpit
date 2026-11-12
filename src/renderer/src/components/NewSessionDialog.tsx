import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { LibraryRepo } from '@shared/library'
import { MODE_LABELS, MODES, type RunnerEffort, type RunnerMode } from '@shared/runner'
import { libraryApi } from '@/data/libraryApi'
import { useRunner } from '@/data/useRunner'
import { useSlashCommands } from './SlashCommands'
import { useModels } from '@/data/useModels'
import { useFileMentions } from './FileMentions'
import { usePastedImages, withImageMarkers } from './PastedImages'
import type { SessionSummary } from '@shared/types'
import { Status } from './Status'
import { Icon, Kbd, PrimaryButton } from './primitives'
import { fileDropProps } from '@/data/dropPaths'

const MONO = "'Geist Mono',monospace"
const OTHER = '__other__'


const EFFORTS: RunnerEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']

type Focus = 'repo' | 'path' | 'title' | 'prompt' | 'model' | 'effort' | 'mode' | null

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function Field({ label, optional, hint, children }: { label: string; optional?: boolean; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>
        {label}
        {optional && <span style={{ fontWeight: 400, color: 'var(--tx3)' }}> · optional</span>}
      </span>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{hint}</span>}
    </div>
  )
}

const JIRA_KEY = /\b[A-Z][A-Z0-9]+-\d+\b/

export function sessionsForTask(sessions: SessionSummary[], text: string): { key: string; list: SessionSummary[] } {
  const key = JIRA_KEY.exec(text)?.[0] ?? ''
  if (!key) return { key, list: [] }
  const list = sessions
    .filter((s) => s.jira === key || s.title.includes(key))
    .sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
    .slice(0, 3)
  return { key, list }
}

export function NewSessionDialog({
  jiraKey,
  sessions = [],
  onOpenExisting,
  onClose,
  onStarted,
  defaultModel = 'claude-opus-5-5',
  defaultEffort = 'high',
  defaultMode = 'default'
}: {
  jiraKey?: string
  sessions?: SessionSummary[]
  onOpenExisting?: (id: string) => void
  onClose: () => void
  onStarted: (tempId: string) => void
  defaultModel?: string
  defaultEffort?: RunnerEffort
  defaultMode?: RunnerMode
}) {
  const { start } = useRunner()
  const [repos, setRepos] = useState<LibraryRepo[]>([])
  const [repo, setRepo] = useState(OTHER)
  const [path, setPath] = useState('')
  const [prompt, setPrompt] = useState(jiraKey ? `Work on ${jiraKey}: ` : '')
  const slash = useSlashCommands(prompt, setPrompt, 'below', repo === OTHER ? undefined : repo)
  const mention = useFileMentions(prompt, setPrompt, 'below', repo === OTHER ? undefined : repo)
  const pasted = usePastedImages()
  const models = useModels()
  const [title, setTitle] = useState(jiraKey ? `${jiraKey} ` : '')
  const existing = sessionsForTask(sessions, `${title} ${jiraKey ?? ''}`)
  const [model, setModel] = useState(defaultModel)
  const [effort, setEffort] = useState<RunnerEffort>(defaultEffort)
  const [mode, setMode] = useState<RunnerMode>(defaultMode)
  const [focus, setFocus] = useState<Focus>('prompt')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)
  const pending = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const el = promptRef.current
    if (el) el.setSelectionRange(el.value.length, el.value.length)
    libraryApi()
      ?.list()
      .then((l) => {
        if (!alive.current) return
        setRepos(l.repos)
        const first = l.repos[0]
        if (first) setRepo((r) => (r === OTHER ? first.root : r))
      })
      .catch((err: unknown) => alive.current && setError(errorText(err)))
    return () => {
      alive.current = false
    }
  }, [])

  const cwd = repo === OTHER ? path.trim() : repo

  const submit = () => {
    if (pending.current) return
    if (!cwd) return setError('Pick a repository or enter a folder.')
    if (!/^(\/|[A-Za-z]:[\\/])/.test(cwd)) return setError('Enter an absolute folder path.')
    pending.current = true
    setBusy(true)
    setError(null)
    start({
      cwd,
      prompt: withImageMarkers(prompt.trim(), pasted.count),
      images: pasted.count ? pasted.payload() : undefined,
      title: title.trim() || undefined,
      model,
      effort,
      mode
    })
      .then((tempId) => alive.current && onStarted(tempId))
      .catch((err: unknown) => alive.current && setError(errorText(err)))
      .finally(() => {
        pending.current = false
        if (alive.current) setBusy(false)
      })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab') {
      const nodes = [...(boxRef.current?.querySelectorAll<HTMLElement>('input,textarea,select,button') ?? [])]
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
  }

  const ring = (on: boolean): CSSProperties =>
    on ? { border: '1px solid var(--tx)', boxShadow: '0 0 0 3px var(--hover)' } : { border: '1px solid var(--line)' }
  const box = (on: boolean): CSSProperties => ({
    height: 36,
    padding: '0 10px',
    borderRadius: 8,
    font: 'inherit',
    fontSize: 13,
    color: 'var(--tx)',
    background: 'none',
    outline: 'none',
    minWidth: 0,
    ...ring(on)
  })
  const selected = repos.find((r) => r.root === repo)

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'var(--scrim)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 120
      }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal
        aria-label="New session"
        onKeyDown={onKeyDown}
        style={{
          width: 560,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: 'var(--pop)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '18px 20px 16px'
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600 }}>New session</span>
          {jiraKey && (
            <span
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                height: 24,
                padding: '0 8px',
                border: '1px solid var(--line)',
                borderRadius: 6,
                background: 'var(--panel)'
              }}
            >
              <Icon name="task_alt" size={14} color="var(--run)" />
              <span style={{ font: `500 11.5px/1 ${MONO}`, color: 'var(--tx)' }}>{jiraKey}</span>
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} aria-label="Close" style={{ display: 'flex' }}>
            <Kbd style={{ padding: '2px 5px' }}>esc</Kbd>
          </button>
        </div>
        <div
          style={{
            padding: '0 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}
        >
          {onOpenExisting && existing.list.length > 0 && (
            <div role="note" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10, background: 'var(--hover)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--tx2)' }}>
                {existing.key} already has {existing.list.length === 1 ? 'a session' : `${existing.list.length} sessions`}. Continue there instead of starting over?
              </span>
              {existing.list.map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Status status={s.status} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</span>
                  <span style={{ flexShrink: 0, fontSize: 12, color: 'var(--tx3)' }}>{s.time}</span>
                  <button
                    onClick={() => onOpenExisting(s.id)}
                    style={{ flexShrink: 0, height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--panel)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          )}
          <Field label="Repository" hint={selected && <span style={{ fontFamily: MONO }}>{selected.root}</span>}>
            <select
              aria-label="Repository"
              value={repo}
              onFocus={() => setFocus('repo')}
              onBlur={() => setFocus(null)}
              onChange={(e) => {
                setError(null)
                setRepo(e.target.value)
              }}
              style={box(focus === 'repo')}
            >
              {repos.map((r) => (
                <option key={r.root} value={r.root}>
                  {r.name} — {r.root}
                </option>
              ))}
              <option value={OTHER}>Other folder…</option>
            </select>
            {repo === OTHER && (
              <input
                aria-label="Folder path"
                className="bare"
                spellCheck={false}
                placeholder="/Users/you/code/project"
                value={path}
                onFocus={() => setFocus('path')}
                onBlur={() => setFocus(null)}
                onChange={(e) => {
                  setError(null)
                  setPath(e.target.value)
                }}
                style={{ ...box(focus === 'path'), font: `13px/1 ${MONO}` }}
              />
            )}
          </Field>
          <Field label="Title" optional hint="Shown in bold in the session list. Leave empty and Claude names it.">
            <input
              aria-label="Title"
              value={title}
              maxLength={120}
              placeholder="e.g. Fix webhook retries"
              onFocus={() => setFocus('title')}
              onBlur={() => setFocus(null)}
              onChange={(e) => setTitle(e.target.value)}
              style={box(focus === 'title')}
            />
          </Field>
          <Field
            label="Prompt"
            optional
            hint={
              error ? (
                <span style={{ color: 'var(--err)' }}>{error}</span>
              ) : prompt.trim() || pasted.count ? (
                'Claude starts on this right away.'
              ) : (
                'Leave it empty to open the session and write your first message there.'
              )
            }
          >
            <div style={{ position: 'relative' }}>
              {pasted.tray && <div style={{ marginBottom: 8 }}>{pasted.tray}</div>}
              {slash.menu}
              {mention.menu}
              <textarea
                ref={promptRef}
                autoFocus
                aria-label="Prompt"
                rows={5}
                placeholder="What should Claude do?"
                value={prompt}
                onFocus={() => setFocus('prompt')}
                onBlur={() => setFocus(null)}
                onPaste={pasted.onPaste}
                {...fileDropProps((v) => {
                  setError(null)
                  setPrompt(v)
                })}
                onKeyDown={(e) => {
                  if (!slash.onKeyDown(e)) mention.onKeyDown(e)
                }}
                onChange={(e) => {
                  setError(null)
                  setPrompt(e.target.value)
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                  minHeight: 110,
                  padding: '9px 10px',
                  borderRadius: 8,
                  font: 'inherit',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: 'var(--tx)',
                  background: 'none',
                  outline: 'none',
                  resize: 'none',
                  userSelect: 'text',
                  ...ring(focus === 'prompt')
                }}
              />
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Field label="Model">
              <select
                aria-label="Model"
                value={model}
                onFocus={() => setFocus('model')}
                onBlur={() => setFocus(null)}
                onChange={(e) => setModel(e.target.value)}
                style={box(focus === 'model')}
              >
                {(models.some((m) => m.id === model) ? models : [{ id: model, label: model }, ...models]).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Effort">
              <select
                aria-label="Effort"
                value={effort}
                onFocus={() => setFocus('effort')}
                onBlur={() => setFocus(null)}
                onChange={(e) => setEffort(e.target.value as RunnerEffort)}
                style={box(focus === 'effort')}
              >
                {EFFORTS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select
                aria-label="Mode"
                value={mode}
                onFocus={() => setFocus('mode')}
                onBlur={() => setFocus(null)}
                onChange={(e) => setMode(e.target.value as RunnerMode)}
                style={box(focus === 'mode')}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABELS[m]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: 20,
            marginTop: 4
          }}
        >
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 32,
              padding: '0 12px',
              borderRadius: 7,
              fontSize: 12.5,
              fontWeight: 500,
              color: 'var(--tx2)'
            }}
          >
            Cancel
          </button>
          <PrimaryButton hint="⌘↵" onClick={submit} style={{ borderRadius: 7, fontSize: 12.5, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Starting…' : prompt.trim() || pasted.count ? 'Start session' : 'Open session'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
