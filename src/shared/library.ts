export type LibraryKind = 'instructions' | 'skills' | 'agents' | 'commands' | 'hooks' | 'mcp' | 'memory'

export const LIBRARY_KINDS: LibraryKind[] = ['instructions', 'skills', 'agents', 'commands', 'hooks', 'mcp', 'memory']

export type LibraryFormat = 'md' | 'json' | 'script'

export type LibraryEntry = {
  id: string
  kind: LibraryKind
  name: string
  desc: string
  repo: string | null
  repoRoot: string | null
  displayPath: string
  absPath: string
  body: string
  savedAt: string
  uses: number
  readOnly: boolean
  format: LibraryFormat
}

export type LibraryRepo = { name: string; root: string; assistant?: boolean }

export type LibraryListing = { entries: LibraryEntry[]; repos: LibraryRepo[]; home: string }

export type CreateLibraryEntry = {
  kind: LibraryKind
  name: string
  desc: string
  repoRoot: string | null
  args?: string
}

export type ImportFile = { fileName: string; body: string }

export type ImportResult = { added: LibraryEntry[]; skipped: string[]; failed: { file: string; reason: string }[] }
