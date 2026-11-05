import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export async function revertFile(root: string, relPath: string, trash: (abs: string) => Promise<void>): Promise<'restored' | 'trashed'> {
  const abs = resolve(root, relPath)
  if (!abs.startsWith(root + sep)) throw new Error('Path is outside the repository')
  const opts = { cwd: root, timeout: 15_000 }
  const inHead = await run('git', ['cat-file', '-e', `HEAD:${relPath}`], opts).then(
    () => true,
    () => false
  )
  if (inHead) {
    await run('git', ['checkout', 'HEAD', '--', relPath], opts)
    return 'restored'
  }
  await run('git', ['rm', '--cached', '--quiet', '--', relPath], opts).catch(() => undefined)
  if (existsSync(join(root, relPath))) await trash(abs)
  return 'trashed'
}
