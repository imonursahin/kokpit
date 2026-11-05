import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const rootCache = new Map<string, string | null>()

export function gitRoot(dir: string): string | null {
  if (rootCache.has(dir)) return rootCache.get(dir) ?? null
  let cur = dir
  let found: string | null = null
  while (cur && cur !== '/') {
    if (existsSync(join(cur, '.git'))) {
      found = cur
      break
    }
    cur = dirname(cur)
  }
  rootCache.set(dir, found)
  return found
}

export function currentBranch(root: string): string {
  try {
    let gitDir = join(root, '.git')
    const pointer = readFileSync(gitDir, 'utf8')
    const m = /^gitdir: (.+)$/m.exec(pointer)
    if (m?.[1]) gitDir = m[1].trim()
    return headBranch(gitDir)
  } catch {
    return headBranch(join(root, '.git'))
  }
}

function headBranch(gitDir: string): string {
  try {
    const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim()
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : ''
  } catch {
    return ''
  }
}

export function workRepo(
  cwd: string,
  cwdBranch: string,
  editedDirs: Record<string, number>
): { repo: string; branch: string; root: string } {
  const byRoot = new Map<string, number>()
  for (const [dir, count] of Object.entries(editedDirs)) {
    const root = gitRoot(dir)
    if (root) byRoot.set(root, (byRoot.get(root) ?? 0) + count)
  }
  const top = [...byRoot.entries()].sort((a, b) => b[1] - a[1])[0]
  const cwdRoot = cwd ? gitRoot(cwd) : null
  if (top && top[0] !== cwdRoot) {
    return { repo: basename(top[0]), branch: currentBranch(top[0]), root: top[0] }
  }
  return { repo: basename(cwdRoot ?? cwd), branch: cwdBranch, root: cwdRoot ?? cwd }
}
