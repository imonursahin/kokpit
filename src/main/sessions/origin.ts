import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export class KokpitSessions {
  private ids = new Set<string>()
  private saving: Promise<void> = Promise.resolve()

  constructor(private readonly path: string) {}

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (Array.isArray(parsed)) for (const id of parsed) if (typeof id === 'string') this.ids.add(id)
    } catch {
      this.ids = new Set(this.ids)
    }
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  remove(id: string): void {
    if (this.ids.delete(id)) this.persistAll()
  }

  private persistAll(): void {
    this.saving = this.saving
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`
        await writeFile(tmp, JSON.stringify([...this.ids]))
        await rename(tmp, this.path)
      })
      .catch(() => undefined)
  }

  add(id: string): void {
    if (!id || id.startsWith('pending-') || this.ids.has(id)) return
    this.ids.add(id)
    this.saving = this.saving
      .then(async () => {
        await mkdir(dirname(this.path), { recursive: true })
        const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`
        await writeFile(tmp, JSON.stringify([...this.ids]))
        await rename(tmp, this.path)
      })
      .catch(() => undefined)
  }
}
