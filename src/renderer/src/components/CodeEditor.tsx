import { useEffect, useLayoutEffect, useRef } from 'react'
import { Annotation, Compartment, EditorSelection, EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import {
  EditorView,
  GutterMarker,
  crosshairCursor,
  drawSelection,
  dropCursor,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view'
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting
} from '@codemirror/language'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { python } from '@codemirror/lang-python'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { tags as t } from '@lezer/highlight'

export type CodeLanguage = 'markdown' | 'python' | 'javascript' | 'typescript' | 'json' | 'shell' | 'text'

type Props = {
  value: string
  onChange: (text: string) => void
  language: CodeLanguage
  readOnly?: boolean
  onCursor?: (line: number, col: number) => void
  changedLines?: Set<number>
  autoFocus?: boolean
}

const NO_LINES = new Set<number>()
const languagePart = new Compartment()
const readOnlyPart = new Compartment()
const External = Annotation.define<boolean>()
const setChanged = StateEffect.define<Set<number>>()
const changedField = StateField.define<Set<number>>({
  create: () => NO_LINES,
  update: (lines, tr) => tr.effects.reduce((acc, e) => (e.is(setChanged) ? e.value : acc), lines)
})

class ChangedMarker extends GutterMarker {
  elementClass = 'cm-changed'
}
const changedMarker = new ChangedMarker()

const changeGutter = [
  changedField,
  gutter({
    class: 'cm-changeGutter',
    lineMarker: (view, line) =>
      view.state.field(changedField).has(view.state.doc.lineAt(line.from).number) ? changedMarker : null,
    lineMarkerChange: (u) => u.startState.field(changedField) !== u.state.field(changedField)
  })
]

function languageExtension(lang: CodeLanguage): Extension {
  switch (lang) {
    case 'markdown':
      return [markdown({ base: markdownLanguage, extensions: { remove: ['SetextHeading'] } }), EditorView.lineWrapping]
    case 'python':
      return python()
    case 'javascript':
      return javascript()
    case 'typescript':
      return javascript({ typescript: true })
    case 'json':
      return json()
    case 'shell':
      return StreamLanguage.define(shell)
    case 'text':
      return []
  }
}

const MONO = "'Geist Mono',monospace"

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--panel)', color: 'var(--tx2)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: MONO, fontSize: '12.5px', lineHeight: '22px' },
  '.cm-content': { padding: '14px 0' },
  '.cm-line': { padding: '0 24px 0 6px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--tx)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--sel)'
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--hover) 55%, transparent)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--line-soft)' },
  '.cm-searchMatch': { backgroundColor: 'var(--mark)', outline: 'none' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--mark)', outline: '1px solid var(--wait-tx)' },
  '&.cm-focused .cm-matchingBracket': { backgroundColor: 'transparent', outline: '1px solid var(--line)' },
  '&.cm-focused .cm-nonmatchingBracket': { backgroundColor: 'transparent', color: 'var(--err)' },
  '.cm-gutters': { backgroundColor: 'var(--panel)', color: 'var(--tx3)', border: 'none' },
  '.cm-gutters.cm-gutters-before': { borderRightWidth: '0' },
  '.cm-activeLineGutter': { backgroundColor: 'color-mix(in srgb, var(--hover) 55%, transparent)', color: 'var(--tx2)' },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '40px', padding: '0 10px 0 8px' },
  '.cm-changeGutter': { width: '3px' },
  '.cm-changeGutter .cm-changed': { backgroundColor: 'var(--wait-tx)' },
  '.cm-foldGutter .cm-gutterElement': { width: '14px', textAlign: 'center', color: 'var(--tx3)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--hover)',
    border: '1px solid var(--line)',
    color: 'var(--tx3)',
    padding: '0 4px'
  },
  '.cm-panels': { backgroundColor: 'var(--panel)', color: 'var(--tx)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--line)' },
  '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--line)' },
  '.cm-textfield': {
    backgroundColor: 'var(--code)',
    border: '1px solid var(--line)',
    borderRadius: '5px',
    color: 'var(--tx)',
    fontFamily: MONO
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--hover)',
    border: '1px solid var(--line)',
    borderRadius: '5px',
    color: 'var(--tx)'
  },
  '.cm-search label': { color: 'var(--tx2)' },
  '.cm-panel.cm-search [name=close]': { color: 'var(--tx3)' }
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.self], color: 'var(--rev)' },
  { tag: [t.string, t.regexp], color: 'var(--ok)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--wait-tx)' },
  { tag: t.comment, color: 'var(--tx3)', fontStyle: 'italic' },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.function(t.definition(t.variableName)),
      t.definition(t.variableName),
      t.macroName
    ],
    color: 'var(--run)'
  },
  { tag: t.propertyName, color: 'var(--tx)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--wait-tx)' },
  { tag: t.heading, color: 'var(--tx)', fontWeight: '600' },
  { tag: [t.link, t.url], color: 'var(--run)' },
  { tag: t.monospace, color: 'var(--err)' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.contentSeparator, color: 'var(--tx3)' },
  { tag: t.invalid, color: 'var(--err)' }
])

const setup: Extension = [
  lineNumbers(),
  changeGutter,
  foldGutter(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  EditorState.tabSize.of(2),
  indentOnInput(),
  syntaxHighlighting(highlight),
  bracketMatching(),
  closeBrackets(),
  rectangularSelection(),
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  search({ top: true }),
  keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
  theme
]

export function CodeEditor({ value, onChange, language, readOnly = false, onCursor, changedLines, autoFocus }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const callbacks = useRef({ onChange, onCursor })
  const initial = useRef({ value, language, readOnly, changedLines, autoFocus })
  const applied = useRef(language)

  useLayoutEffect(() => {
    callbacks.current = { onChange, onCursor }
  })

  useLayoutEffect(() => {
    const parent = host.current
    if (!parent) return
    const { value: doc, language: lang, readOnly: ro, changedLines: lines, autoFocus: focus } = initial.current
    const report = (state: EditorState) => {
      const head = state.selection.main.head
      const line = state.doc.lineAt(head)
      callbacks.current.onCursor?.(line.number, head - line.from + 1)
    }
    const v = new EditorView({
      parent,
      state: EditorState.create({
        doc,
        selection: focus ? EditorSelection.cursor(doc.length) : undefined,
        extensions: [
          setup,
          languagePart.of(languageExtension(lang)),
          readOnlyPart.of(EditorState.readOnly.of(ro)),
          changedField.init(() => lines ?? NO_LINES),
          EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !u.transactions.some((tr) => tr.annotation(External)))
              callbacks.current.onChange(u.state.doc.toString())
            if (u.docChanged || u.selectionSet) report(u.state)
          })
        ]
      })
    })
    view.current = v
    report(v.state)
    if (focus) v.focus()
    return () => {
      view.current = null
      v.destroy()
    }
  }, [])

  useEffect(() => {
    const v = view.current
    if (!v || v.state.doc.toString() === value) return
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value }, annotations: External.of(true) })
  }, [value])

  useEffect(() => {
    if (!view.current || applied.current === language) return
    applied.current = language
    view.current.dispatch({ effects: languagePart.reconfigure(languageExtension(language)) })
  }, [language])

  useEffect(() => {
    view.current?.dispatch({ effects: readOnlyPart.reconfigure(EditorState.readOnly.of(readOnly)) })
  }, [readOnly])

  useEffect(() => {
    view.current?.dispatch({ effects: setChanged.of(changedLines ?? NO_LINES) })
  }, [changedLines])

  return <div ref={host} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
}
