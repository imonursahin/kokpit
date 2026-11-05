import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { UpdateStatus } from '../shared/settings'
import { fetchJson } from './integrations/http'

const run = promisify(execFile)
export const UPDATE_REPO = 'imonursahin/kokpit'
export const CASK = 'kokpit'

export function versionGreater(a: string, b: string): boolean {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

type Release = { tag_name?: string; html_url?: string; body?: string; published_at?: string }

async function latestRelease(): Promise<Release> {
  try {
    return await fetchJson<Release>(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } }, 2)
  } catch (err) {
    const { stdout } = await run('gh', ['api', `repos/${UPDATE_REPO}/releases/latest`], { timeout: 15_000 }).catch(() => {
      throw err
    })
    return JSON.parse(stdout) as Release
  }
}

export function brewBin(): string | null {
  return ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'].find((p) => existsSync(p)) ?? null
}

async function installedByBrew(): Promise<boolean> {
  const brew = brewBin()
  if (!brew) return false
  return run(brew, ['list', '--cask', CASK], { timeout: 15_000 }).then(
    () => true,
    () => false
  )
}

export async function checkForUpdate(current: string, packaged: boolean): Promise<UpdateStatus> {
  const checkedAt = new Date().toISOString()
  const canUpdate = packaged && (await installedByBrew())
  try {
    const r = await latestRelease()
    const latest = (r.tag_name ?? '').replace(/^v/, '')
    if (!latest) return { current, checkedAt, hasUpdate: false, canUpdate, error: 'No release found' }
    return {
      current,
      latest,
      url: r.html_url ?? `https://github.com/${UPDATE_REPO}/releases`,
      notes: (r.body ?? '').slice(0, 4000),
      publishedAt: r.published_at ?? '',
      checkedAt,
      hasUpdate: versionGreater(latest, current),
      canUpdate
    }
  } catch (err) {
    return { current, checkedAt, hasUpdate: false, canUpdate, error: (err as Error).message.slice(0, 200) }
  }
}

export function updateCommand(): string[] | null {
  const brew = brewBin()
  return brew ? ['/bin/zsh', '-lc', `"${brew}" update && "${brew}" upgrade --cask ${CASK}`] : null
}
