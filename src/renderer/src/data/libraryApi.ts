import type { CreateLibraryEntry, ImportFile, ImportResult, LibraryEntry, LibraryListing } from '@shared/library'

export type LibraryApi = {
  list(): Promise<LibraryListing>
  save(absPath: string, body: string): Promise<LibraryEntry>
  create(input: CreateLibraryEntry): Promise<LibraryEntry>
  createFile(skill: string, rel: string): Promise<LibraryEntry>
  remove(absPath: string): Promise<void>
  import(kind: 'skills' | 'agents' | 'commands', files: ImportFile[]): Promise<ImportResult>
}

export function libraryApi(): LibraryApi | null {
  const kokpit = (window as unknown as { kokpit?: { library?: LibraryApi } }).kokpit
  return kokpit?.library ?? null
}
