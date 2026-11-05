import { safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

type Stored = Record<string, string>

export class Secrets {
  private cache: Stored | null = null

  constructor(private readonly path: string) {}

  private async load(): Promise<Stored> {
    if (this.cache) return this.cache
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      this.cache = typeof parsed === 'object' && parsed !== null ? (parsed as Stored) : {}
    } catch {
      this.cache = {}
    }
    return this.cache
  }

  async get<T>(key: string): Promise<T | null> {
    const stored = (await this.load())[key]
    if (!stored || !(await safeStorage.isAsyncEncryptionAvailable())) return null
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(Buffer.from(stored, 'base64'))
      const value = JSON.parse(result) as T
      if (shouldReEncrypt) await this.set(key, value)
      return value
    } catch {
      return null
    }
  }

  async set(key: string, value: unknown | null): Promise<void> {
    if (value !== null && !(await safeStorage.isAsyncEncryptionAvailable())) throw new Error('Keychain encryption is not available')
    const all = { ...(await this.load()) }
    if (value === null) delete all[key]
    else all[key] = (await safeStorage.encryptStringAsync(JSON.stringify(value))).toString('base64')
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(all), { mode: 0o600 })
    await rename(tmp, this.path)
    this.cache = all
  }
}
