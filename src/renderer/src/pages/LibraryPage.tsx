import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Icon, Kbd, PrimaryButton, SecondaryButton } from '@/components/primitives'
import { Markdown } from '@/components/Markdown'
import { CodeEditor, type CodeLanguage } from '@/components/CodeEditor'
import { libraryApi, type LibraryApi } from '@/data/libraryApi'
import type { LibraryEntry, LibraryFormat, LibraryKind, LibraryListing } from '@shared/library'
import { MOCK_LIBRARY, libraryPath, type LibraryItem, type LibrarySection } from '@/mock/library'

type View = 'edit' | 'preview'
type Item = LibraryItem & { draft: string; absPath?: string; readOnly?: boolean; format: LibraryFormat }
type Section = Omit<LibrarySection, 'items'> & { items: Item[]; view: View }
type Store = Record<LibraryKind, Section>
type Load = { state: 'loading' } | { state: 'error'; error: string } | { state: 'ready'; home: string | null }

const SKELETON: [string, string][] = [
  ['46%', '82%'],
  ['58%', '64%'],
  ['38%', '74%'],
  ['52%', '58%'],
  ['42%', '70%']
]
const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86_400],
  ['week', 604_800],
  ['month', 2_629_800],
  ['year', 31_557_600]
]

const MONO = "'Geist Mono',monospace"

const PLACEHOLDER: Record<LibraryKind, [string, string]> = {
  instructions: ['security', 'Secrets, auth checks and input validation rules for every session.'],
  skills: ['deploy-preview', 'Deploy the current branch to a preview environment and post the URL.'],
  agents: ['migration-reviewer', 'Reviews Prisma migrations for table locks, slow backfills and missing rollback steps.'],
  commands: ['open-pr', 'Open a draft pull request for the current branch.'],
  hooks: ['my-hook.py', ''],
  memory: ['deploy-order', 'Deploy the schema change before the code that reads it.'],
  mcp: ['mcp', '']
}

const NAME_HINT: Record<LibraryKind, string> = {
  instructions: 'Lowercase and hyphens.',
  skills: 'Lowercase and hyphens.',
  agents: 'Lowercase and hyphens.',
  commands: 'Lowercase and hyphens.',
  hooks: 'Lowercase and hyphens, ending in .py, .sh, .js or .mjs.',
  memory: 'Lowercase and hyphens.',
  mcp: ''
}

const DESC_HINT: Record<LibraryKind, string | null> = {
  instructions: 'Written under the title of the new file.',
  skills: 'Claude reads this to decide when to use the skill.',
  agents: 'Claude reads this to decide when to hand work to the agent.',
  commands: 'Shown next to the command when you type /.',
  hooks: null,
  memory: 'One line Claude reads to decide whether this memory is relevant.',
  mcp: null
}

const FORMAT_LABEL: Record<LibraryFormat, string> = { md: 'Markdown', json: 'JSON', script: 'Script' }

const EXT_LANGUAGE: Record<string, CodeLanguage> = {
  py: 'python',
  sh: 'shell',
  js: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  json: 'json',
  md: 'markdown'
}

function languageOf(path: string, format: LibraryFormat): CodeLanguage {
  const ext = /\.(\w+)$/.exec(path)?.[1] ?? ''
  return EXT_LANGUAGE[ext] ?? (format === 'md' ? 'markdown' : format === 'json' ? 'json' : 'text')
}

function initSection(kind: LibraryKind): Section {
  const s = MOCK_LIBRARY[kind]
  return {
    ...s,
    view: kind === 'skills' ? 'edit' : 'preview',
    items: s.items.map((it) => ({ ...it, draft: it.draft ?? it.body, format: 'md' as const }))
  }
}

function savedLabel(iso: string): string {
  const s = (Date.parse(iso) - Date.now()) / 1000
  if (!Number.isFinite(s)) return ''
  if (s > -60) return 'Saved just now'
  let [unit, size]: [Intl.RelativeTimeFormatUnit, number] = ['minute', 60]
  for (const u of UNITS) if (-s >= u[1]) [unit, size] = u
  return `Saved ${RTF.format(Math.round(s / size), unit)}`
}

function toItem(e: LibraryEntry): Item {
  return {
    id: e.id,
    name: e.name,
    desc: e.desc,
    repo: e.repo,
    path: e.displayPath,
    body: e.body,
    draft: e.body,
    saved: savedLabel(e.savedAt),
    uses: e.uses,
    absPath: e.absPath,
    readOnly: e.readOnly,
    format: e.format
  }
}

function liveSection(kind: LibraryKind, listing: LibraryListing | null, selectPath?: string): Section {
  const entries = (listing?.entries ?? []).filter((e) => e.kind === kind)
  if (kind === 'instructions') entries.sort((a, b) => Number(b.name === 'CLAUDE.md') - Number(a.name === 'CLAUDE.md'))
  const items = entries.map(toItem)
  const pick = items.find((it) => it.absPath === selectPath) ?? items[0]
  return { ...initSection(kind), items, selected: pick?.id ?? '' }
}

function storeOf(make: (kind: LibraryKind) => Section): Store {
  return {
    instructions: make('instructions'),
    skills: make('skills'),
    agents: make('agents'),
    commands: make('commands'),
    hooks: make('hooks'),
    memory: make('memory'),
    mcp: make('mcp')
  }
}

function useAlive() {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function fileName(kind: LibraryKind, n: string): string {
  return kind === 'instructions' ? `${n}.md` : kind === 'mcp' ? '.mcp.json' : n
}

function diffLines(a: string[], b: string[]): { marks: boolean[]; edited: number } {
  const w = b.length + 1
  const dp = new Array<number>((a.length + 1) * w).fill(0)
  const at = (i: number, j: number) => dp[i * w + j] ?? 0
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i * w + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1))
  const marks = b.map(() => false)
  let i = 0
  let j = 0
  let removed = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++
      j++
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      removed++
      i++
    } else {
      marks[j++] = true
    }
  }
  removed += a.length - i
  for (; j < b.length; j++) marks[j] = true
  return { marks, edited: Math.max(removed, marks.filter(Boolean).length) }
}

function newBody(kind: LibraryKind, name: string, desc: string, args = ''): string {
  const words = name.replace(/\.md$/, '').replace(/-/g, ' ')
  const title = words.charAt(0).toUpperCase() + words.slice(1)
  if (kind === 'instructions') return [`# ${title}`, '', ...(desc ? [desc, ''] : []), ''].join('\n')
  if (kind === 'commands') {
    const names = args.match(/<[^>]+>|\S+/g) ?? []
    const lines = names.length > 1 ? names.map((n, i) => `${n}: $${i}`) : names.length ? ['$ARGUMENTS'] : []
    return ['---', `description: ${desc}`, ...(args ? [`argument-hint: ${args}`] : []), '---', '', ...lines, ''].join('\n')
  }
  if (kind === 'memory') return ['---', `name: ${name}`, `description: ${desc}`, 'metadata:', '  type: project', '---', '', ''].join('\n')
  if (kind === 'hooks') return name.endsWith('.py') ? '#!/usr/bin/env python3\n' : name.endsWith('.sh') ? '#!/bin/sh\n' : ''
  if (kind === 'mcp') return '{\n  "mcpServers": {}\n}\n'
  return [
    '---',
    `name: ${name}`,
    `description: ${desc}`,
    '---',
    '',
    `# ${title}`,
    '',
    ''
  ].join('\n')
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  style,
  small
}: {
  value: T
  options: { id: T; label: string; icon?: string }[]
  onChange: (v: T) => void
  style?: CSSProperties
  small?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: small ? 0 : 2,
        padding: 2,
        background: 'var(--hover)',
        borderRadius: small ? 7 : 8,
        fontSize: small ? 12 : 12.5,
        color: 'var(--tx2)',
        ...style
      }}
    >
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              height: small ? 24 : 26,
              padding: '0 10px',
              borderRadius: small ? 5 : 6,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              ...(small ? { fontWeight: 500, color: 'var(--tx3)' } : {}),
              ...(on
                ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)', fontWeight: 500, color: 'var(--tx)' }
                : {})
            }}
          >
            {o.icon && <Icon name={o.icon} size={14} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
      {children}
      <span style={{ fontSize: 12, color: 'var(--tx3)' }}>{hint}</span>
    </div>
  )
}

function CreateDialog({
  kind,
  noun,
  exists,
  onCancel,
  onCreate
}: {
  kind: LibraryKind
  noun: string
  exists: (name: string) => boolean
  onCancel: () => void
  onCreate: (slug: string, desc: string, args: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [args, setArgs] = useState('')
  const [focus, setFocus] = useState<'name' | 'desc' | 'args' | null>('name')
  const [error, setError] = useState<string | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const pending = useRef(false)
  const alive = useAlive()

  const [phName, phDesc] = PLACEHOLDER[kind]
  const descHint = DESC_HINT[kind]
  const slug = name.replace(/^-+|-+$/g, '')

  const submit = () => {
    if (pending.current) return
    if (!slug) return setError('Enter a name.')
    if (exists(slug)) return setError(`A ${noun} named ${fileName(kind, slug)} already exists.`)
    pending.current = true
    onCreate(slug, descHint === null ? '' : desc.trim(), kind === 'commands' ? args.trim() : '')
      .catch((err: unknown) => alive.current && setError(errorText(err)))
      .finally(() => {
        pending.current = false
      })
  }

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'BUTTON') {
      e.preventDefault()
      submit()
    } else if (e.key === 'Tab') {
      const nodes = [
        ...(boxRef.current?.querySelectorAll<HTMLElement>('input,textarea,select,button,[tabindex="0"]') ?? [])
      ]
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

  return (
    <div
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
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
        aria-label={`New ${noun}`}
        onKeyDown={onKeyDown}
        style={{
          width: 520,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          boxShadow: 'var(--pop)',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 4px' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>New {noun}</span>
          <span style={{ flex: 1 }} />
          <button onClick={onCancel} aria-label="Close" style={{ display: 'flex' }}>
            <Kbd style={{ padding: '2px 5px' }}>esc</Kbd>
          </button>
        </div>
        <div style={{ padding: '0 20px 16px', fontSize: 12.5, color: 'var(--tx3)' }}>
          You’ll write the instructions in the editor next.
        </div>
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field
            label="Name"
            hint={
              error ? (
                <span style={{ color: 'var(--err)' }}>{error}</span>
              ) : (
                <>
                  {NAME_HINT[kind]} Saved as{' '}
                  <span style={{ fontFamily: MONO }}>{libraryPath(kind, slug || phName)}</span>
                </>
              )
            }
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 36,
                padding: '0 10px',
                borderRadius: 8,
                font: `13px/1 ${MONO}`,
                ...ring(focus === 'name')
              }}
            >
              <input
                autoFocus
                className="bare"
                style={{ flex: 1 }}
                spellCheck={false}
                placeholder={phName}
                value={name}
                onFocus={() => setFocus('name')}
                onBlur={() => setFocus(null)}
                onChange={(e) => {
                  setError(null)
                  setName(e.target.value.toLowerCase().replace(kind === 'hooks' ? /[^a-z0-9.-]+/g : /[^a-z0-9-]+/g, '-'))
                }}
              />
            </label>
          </Field>
          {descHint !== null && (
            <Field label="Description" hint={descHint}>
              <textarea
                rows={2}
                placeholder={phDesc}
                value={desc}
                onFocus={() => setFocus('desc')}
                onBlur={() => setFocus(null)}
                onChange={(e) => setDesc(e.target.value)}
                style={{
                  display: 'block',
                  minHeight: 58,
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
                  ...ring(focus === 'desc')
                }}
              />
            </Field>
          )}
          {kind === 'commands' && (
            <Field label="Arguments" hint="What you type after the command, like <pr-url>, or several like <pr-url> <focus>. Leave empty if the command takes none. Wrap a value with spaces in quotes when you run it.">
              <input
                className="bare"
                placeholder="<pr-url>"
                value={args}
                onFocus={() => setFocus('args')}
                onBlur={() => setFocus(null)}
                onChange={(e) => setArgs(e.target.value)}
                style={{ height: 36, padding: '0 10px', borderRadius: 8, font: "13px 'Geist Mono',monospace", color: 'var(--tx)', background: 'none', outline: 'none', ...ring(focus === 'args') }}
              />
            </Field>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, marginTop: 4 }}>
          <span style={{ fontSize: 12, color: 'var(--tx3)' }}>Step 1 of 2</span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onCancel}
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
          <PrimaryButton hint="↵" onClick={submit} style={{ borderRadius: 7, fontSize: 12.5 }}>
            Create and open editor
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}

function Library({
  kind,
  section,
  update,
  api,
  load,
  onRetry
}: {
  kind: LibraryKind
  section: Section
  update: (fn: (s: Section) => Section) => void
  api: LibraryApi | null
  load: Load
  onRetry: () => void
}) {
  const sel = section.items.find((it) => it.id === section.selected) ?? section.items[0]
  const [creating, setCreating] = useState(false)
  const [cursor, setCursor] = useState<[number, number]>([1, 1])
  const [focusId, setFocusId] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<{ id: string; message: string } | null>(null)
  const [mcpError, setMcpError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deleting = useRef(false)
  const mcpPending = useRef(false)
  const alive = useAlive()

  const home = load.state === 'ready' ? load.home : null
  const body = sel?.body ?? ''
  const draft = sel?.draft ?? ''
  const diff = useMemo(() => diffLines(body.split('\n'), draft.split('\n')), [body, draft])
  const changedLines = useMemo(() => new Set(diff.marks.flatMap((m, n) => (m ? [n + 1] : []))), [diff])
  const lineCount = draft.split('\n').length
  const dirty = draft !== body
  const format = sel?.format ?? 'md'
  const isEdit = format !== 'md' || section.view === 'edit'
  const readOnly = sel?.readOnly === true
  const mcpMissing = kind === 'mcp' && load.state === 'ready' && section.items.length === 0

  const save = useCallback(() => {
    if (!api)
      return update((s) => ({
        ...s,
        items: s.items.map((it) =>
          it.id === s.selected && it.draft !== it.body ? { ...it, body: it.draft, saved: 'Saved just now' } : it
        )
      }))
    if (!sel?.absPath || sel.readOnly || sel.draft === sel.body) return
    const { id, absPath, draft: sent } = sel
    setSaveError(null)
    api.save(absPath, sent).then(
      (entry) => {
        if (!alive.current) return
        update((s) => ({
          ...s,
          selected: s.selected === id ? entry.id : s.selected,
          items: s.items.map((it) =>
            it.id === id ? { ...toItem(entry), draft: it.draft === sent ? entry.body : it.draft } : it
          )
        }))
      },
      (err: unknown) => alive.current && setSaveError({ id, message: errorText(err) })
    )
  }, [api, sel, update, alive])
  const removeSelected = () => {
    if (!sel || deleting.current) return
    const id = sel.id
    const drop = () =>
      update((s) => {
        const items = s.items.filter((it) => it.id !== id)
        return { ...s, items, selected: s.selected === id ? (items[0]?.id ?? '') : s.selected }
      })
    if (!api || !sel.absPath) {
      drop()
      setConfirmDelete(false)
      return
    }
    deleting.current = true
    setDeleteError(null)
    api.remove(sel.absPath).then(
      () => {
        deleting.current = false
        if (!alive.current) return
        drop()
        setConfirmDelete(false)
      },
      (err: unknown) => {
        deleting.current = false
        if (alive.current) setDeleteError(errorText(err))
      }
    )
  }
  const toggle = useCallback(() => update((s) => ({ ...s, view: s.view === 'edit' ? 'preview' : 'edit' })), [update])

  const select = (it: Item) => {
    update((s) => ({ ...s, selected: it.id }))
    setFocusId(null)
  }
  const create = async (slug: string, desc: string, args: string) => {
    let it: Item
    if (api) {
      const entry = await api.create({ kind, name: slug, desc, repoRoot: home, args })
      if (!alive.current) return
      it = toItem(entry)
    } else {
      const name = fileName(kind, slug)
      const path = libraryPath(kind, slug)
      const text = newBody(kind, name, desc, args)
      const fmt: LibraryFormat = kind === 'mcp' ? 'json' : kind === 'hooks' ? 'script' : 'md'
      it = { id: path, name, desc, repo: null, path, body: text, draft: text, saved: 'Saved just now', uses: 0, format: fmt }
    }
    update((s) => ({ ...s, items: [it, ...s.items], selected: it.id, view: 'edit' }))
    setFocusId(it.id)
    setCreating(false)
  }
  const createMcp = () => {
    if (mcpPending.current) return
    mcpPending.current = true
    setMcpError(null)
    create('mcp', '', '')
      .catch((err: unknown) => alive.current && setMcpError(errorText(err)))
      .finally(() => {
        mcpPending.current = false
      })
  }
  const startNew = kind === 'instructions' ? null : kind === 'mcp' ? (mcpMissing ? createMcp : null) : () => setCreating(true)
  const exists = (slug: string) => section.items.some((it) => it.name === slug || it.name === fileName(kind, slug))

  useEffect(() => {
    if (creating) return
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      const k = e.key.toLowerCase()
      if (k === 's') save()
      else if (k === 'e' && format === 'md') toggle()
      else if (k === 'n' && startNew) startNew()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [creating, save, toggle, startNew, format])

  const list = (
    <section
      style={{
        width: 360,
        flexShrink: 0,
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)'
      }}
    >
      <div className="drag" style={{ padding: '22px 16px 14px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-.01em' }}>{section.title}</h1>
        {load.state === 'ready' && <span style={{ fontSize: 12.5, color: 'var(--tx3)' }}>{section.items.length}</span>}
        <span style={{ flex: 1 }} />
        {startNew && (
          <button
            onClick={startNew}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 30,
              padding: '0 8px',
              borderRadius: 7,
              border: '1px solid var(--line)',
              background: 'var(--panel)',
              fontSize: 12.5,
              fontWeight: 500
            }}
          >
            <Icon name="add" size={16} />
            New
            <span style={{ font: `400 10.5px/1 ${MONO}`, color: 'var(--tx3)' }}>⌘N</span>
          </button>
        )}
      </div>
      <div style={{ padding: '0 20px 12px', fontSize: 12.5, color: 'var(--tx3)', lineHeight: 1.5 }}>{section.blurb}</div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '1px 10px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}
      >
        {load.state === 'loading' &&
          SKELETON.map(([w, w2], i) => (
            <div
              key={i}
              style={{
                flexShrink: 0,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                opacity: 1 - i * 0.15
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ height: 10, width: w, borderRadius: 4, background: 'var(--hover)' }} />
                <span style={{ flex: 1 }} />
                <span style={{ height: 8, width: 70, borderRadius: 4, background: 'var(--hover)' }} />
              </div>
              <span style={{ height: 8, width: w2, borderRadius: 4, background: 'var(--hover)' }} />
            </div>
          ))}
        {load.state === 'error' && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <span className="selectable" style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--err)' }}>
              {load.error}
            </span>
            <SecondaryButton onClick={onRetry}>Retry</SecondaryButton>
          </div>
        )}
        {mcpMissing && (
          <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
            <SecondaryButton onClick={createMcp}>Create .mcp.json</SecondaryButton>
            {mcpError && (
              <span className="selectable" style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--err)' }}>
                {mcpError}
              </span>
            )}
          </div>
        )}
        {section.items.map((it) => {
          const on = it.id === sel?.id
          return (
            <button
              key={it.id}
              className="menu-item"
              onClick={() => select(it)}
              style={{
                flexShrink: 0,
                padding: '10px 12px',
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                textAlign: 'left',
                ...(on ? { background: 'var(--panel)', boxShadow: '0 0 0 1px var(--line)' } : {})
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, width: '100%' }}>
                <span
                  style={{
                    font: `500 13px/1.2 ${MONO}`,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {it.name}
                </span>
                {it.draft !== it.body && (
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--wait)', flexShrink: 0 }} />
                )}
              </div>
              {it.desc && (
                <div style={{ fontSize: 12.5, color: 'var(--tx2)', lineHeight: 1.45, textWrap: 'pretty' }}>{it.desc}</div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )

  const dialog = creating && (
    <CreateDialog
      kind={kind}
      noun={section.noun}
      exists={exists}
      onCancel={() => setCreating(false)}
      onCreate={create}
    />
  )

  if (!sel)
    return (
      <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
        {list}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
          <div className="drag" style={{ height: 52, flexShrink: 0, borderBottom: '1px solid var(--line)' }} />
        </main>
        {dialog}
      </div>
    )

  const edit = (text: string) =>
    update((s) => ({ ...s, items: s.items.map((it) => (it.id === s.selected ? { ...it, draft: text } : it)) }))
  const discard = () => edit(body)
  const [ln, col] = cursor
  const words = draft.split(/\s+/).filter(Boolean).length
  const usage =
    sel.uses > 0 ? `Used in ${sel.uses} session${sel.uses === 1 ? '' : 's'} this week` : 'Not used this week'

  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
      {list}
      {confirmDelete && (
        <div
          role="presentation"
          onMouseDown={(e) => e.target === e.currentTarget && setConfirmDelete(false)}
          style={{ position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 140, zIndex: 50 }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="kokpit-delete-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setConfirmDelete(false)
            }}
            style={{ width: 460, background: 'var(--panel)', borderRadius: 12, boxShadow: 'var(--pop)', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <div id="kokpit-delete-title" style={{ fontSize: 15, fontWeight: 600 }}>
              Delete {sel.name}?
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--tx2)' }}>
              This permanently deletes{' '}
              <span className="selectable" style={{ font: `12px ${MONO}`, color: 'var(--tx)' }}>
                {kind === 'skills' ? sel.path.replace(/\/SKILL\.md$/, '/') : sel.path}
              </span>{' '}
              from disk{kind === 'skills' ? ', with everything in the skill folder' : ''}. New sessions stop loading it. This can’t be undone.
            </div>
            {deleteError && <div style={{ fontSize: 12.5, color: 'var(--err)' }}>{deleteError}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                autoFocus
                onClick={() => setConfirmDelete(false)}
                style={{ height: 32, padding: '0 12px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--tx2)' }}
              >
                Cancel
              </button>
              <button
                onClick={removeSelected}
                style={{ height: 32, padding: '0 14px', borderRadius: 7, fontSize: 12.5, fontWeight: 500, background: 'var(--err)', color: '#fff' }}
              >
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
        <div
          className="drag"
          style={{
            height: 52,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 20px',
            borderBottom: '1px solid var(--line)'
          }}
        >
          <span style={{ font: `500 14px/1 ${MONO}`, whiteSpace: 'nowrap' }}>{sel.name}</span>
          <span
            className="selectable"
            style={{
              font: `12px/1 ${MONO}`,
              color: 'var(--tx3)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0
            }}
          >
            {sel.path}
          </span>
          <span style={{ flex: 1 }} />
          {format === 'md' && (
            <>
              <Segmented
                small
                value={section.view}
                options={[
                  { id: 'edit', label: 'Edit' },
                  { id: 'preview', label: 'Preview' }
                ]}
                onChange={(v) => update((s) => ({ ...s, view: v }))}
              />
              <span style={{ font: `400 10.5px/1 ${MONO}`, color: 'var(--tx3)' }}>⌘E</span>
            </>
          )}
          {!readOnly && (
            <>
              {format === 'md' && <span style={{ width: 1, height: 18, background: 'var(--line)' }} />}
              {kind !== 'instructions' && (
              <button
                onClick={() => {
                  setDeleteError(null)
                  setConfirmDelete(true)
                }}
                title={`Delete ${sel.name}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 30,
                  padding: '0 10px 0 8px',
                  borderRadius: 7,
                  border: '1px solid var(--line)',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'var(--err)'
                }}
              >
                <Icon name="delete" size={16} color="var(--err)" />
                Delete
              </button>
              )}
              <PrimaryButton
                hint="⌘S"
                onClick={save}
                style={{
                  height: 30,
                  padding: '0 9px 0 12px',
                  borderRadius: 7,
                  fontSize: 12.5,
                  ...(dirty ? {} : { background: 'var(--hover)', color: 'var(--tx3)' })
                }}
              >
                Save
              </PrimaryButton>
            </>
          )}
        </div>

        {dirty && (
          <div
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 20px',
              background: 'var(--wait-bg)',
              borderBottom: '1px solid var(--wait-line)',
              fontSize: 12.5
            }}
          >
            <Icon name="edit_note" size={16} color="var(--wait-tx)" />
            <span style={{ color: 'var(--wait-tx)', fontWeight: 500 }}>Unsaved changes</span>
            <span style={{ color: 'var(--tx2)' }}>
              {diff.edited} line{diff.edited === 1 ? '' : 's'} edited · applies to new sessions after you save
            </span>
            <span style={{ flex: 1 }} />
            <button onClick={discard} style={{ color: 'var(--tx2)', fontWeight: 500 }}>
              Discard
            </button>
          </div>
        )}

        {isEdit ? (
          <CodeEditor
            key={sel.id}
            value={draft}
            onChange={edit}
            language={languageOf(sel.path, format)}
            readOnly={readOnly}
            onCursor={(l, c) => setCursor([l, c])}
            changedLines={changedLines}
            autoFocus={focusId === sel.id}
          />
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <div style={{ padding: '30px 44px' }}>
              <Markdown source={draft} />
            </div>
          </div>
        )}

        <div
          style={{
            height: 34,
            flexShrink: 0,
            borderTop: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '0 20px',
            fontSize: 12,
            color: 'var(--tx3)'
          }}
        >
          <span>
            {isEdit
              ? `Ln ${ln}, Col ${col}`
              : kind === 'instructions'
                ? `Read by Claude in every session · ${words} words`
                : usage}
          </span>
          {saveError?.id === sel.id && (
            <span
              className="selectable"
              style={{ color: 'var(--err)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}
            >
              {saveError.message}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <span>{FORMAT_LABEL[format]}</span>
          <span>UTF-8</span>
          <span>{readOnly ? 'Read only' : isEdit ? `${lineCount} lines` : sel.saved}</span>
        </div>
      </main>

      {dialog}
    </div>
  )
}

export function LibraryPage({ kind, selectPath }: { kind: LibraryKind; selectPath?: string }) {
  const [api] = useState(libraryApi)
  const [store, setStore] = useState<Store>(() => storeOf(api ? (k) => liveSection(k, null) : initSection))
  const [load, setLoad] = useState<Load>(api ? { state: 'loading' } : { state: 'ready', home: null })
  const request = useRef(0)
  const selectRef = useRef(selectPath)

  const refresh = useCallback(() => {
    if (!api) return
    const id = ++request.current
    setLoad({ state: 'loading' })
    api.list().then(
      (listing) => {
        if (request.current !== id) return
        setStore(storeOf((k) => liveSection(k, listing, k === kind ? selectRef.current : undefined)))
        setLoad({ state: 'ready', home: listing.home })
      },
      (err: unknown) => request.current === id && setLoad({ state: 'error', error: errorText(err) })
    )
  }, [api, kind])

  useEffect(() => {
    refresh()
    return () => {
      request.current++
    }
  }, [refresh])

  useEffect(() => {
    if (!selectPath || selectRef.current === selectPath) return
    selectRef.current = selectPath
    setStore((prev) => {
      const it = prev[kind].items.find((i) => i.absPath === selectPath)
      return it ? { ...prev, [kind]: { ...prev[kind], selected: it.id } } : prev
    })
  }, [kind, selectPath])

  const update = useCallback(
    (fn: (s: Section) => Section) => setStore((prev) => ({ ...prev, [kind]: fn(prev[kind]) })),
    [kind]
  )
  return (
    <Library key={kind} kind={kind} section={store[kind]} update={update} api={api} load={load} onRetry={refresh} />
  )
}
