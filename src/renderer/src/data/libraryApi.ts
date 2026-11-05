import type { CreateLibraryEntry, LibraryEntry, LibraryListing } from '@shared/library'

export type LibraryApi = {
  list(): Promise<LibraryListing>
  save(absPath: string, body: string): Promise<LibraryEntry>
  create(input: CreateLibraryEntry): Promise<LibraryEntry>
  remove(absPath: string): Promise<void>
}

export function libraryApi(): LibraryApi | null {
  const kokpit = (window as unknown as { kokpit?: { library?: LibraryApi } }).kokpit
  return kokpit?.library ?? null
}
