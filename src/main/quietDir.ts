import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function quietDir(): string {
  const dir = join(tmpdir(), 'kokpit-background')
  mkdirSync(dir, { recursive: true })
  return dir
}
