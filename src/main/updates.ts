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

type Release = { tag_name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean }

const MAX_NOTES = 8000

async function recentReleases(): Promise<Release[]> {
  const path = `repos/${UPDATE_REPO}/releases?per_page=30`
  try {
    return await fetchJson<Release[]>(`https://api.github.com/${path}`, { headers: { Accept: 'application/vnd.github+json' } }, 2)
  } catch (err) {
    const { stdout } = await run('gh', ['api', path], { timeout: 15_000 }).catch(() => {
      throw err
    })
    return JSON.parse(stdout) as Release[]
  }
}

export function newerReleases(releases: Release[], current: string): { latest?: Release; versions: string[]; notes: string } {
  const published = releases
    .filter((r) => !r.draft && !r.prerelease && r.tag_name)
    .map((r) => ({ r, v: (r.tag_name ?? '').replace(/^v/, '') }))
    .sort((a, b) => (versionGreater(a.v, b.v) ? -1 : versionGreater(b.v, a.v) ? 1 : 0))
  const newer = published.filter((x) => versionGreater(x.v, current))
  const shown = newer.length ? newer : published.slice(0, 1)
  const notes =
    shown.length === 1
      ? (shown[0]?.r.body ?? '').trim()
      : shown.map((x) => `### ${x.v}\n\n${(x.r.body ?? '').trim() || 'No notes.'}`).join('\n\n')
  return { latest: published[0]?.r, versions: newer.map((x) => x.v), notes: notes.slice(0, MAX_NOTES) }
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
    const found = newerReleases(await recentReleases(), current)
    const r = found.latest
    const latest = (r?.tag_name ?? '').replace(/^v/, '')
    if (!r || !latest) return { current, checkedAt, hasUpdate: false, canUpdate, error: 'No release found' }
    return {
      current,
      latest,
      url: r.html_url ?? `https://github.com/${UPDATE_REPO}/releases`,
      notes: found.notes,
      newVersions: found.versions,
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
  return brew
    ? ['/bin/zsh', '-lc', `"${brew}" update && HOMEBREW_NO_ASK=1 HOMEBREW_NO_UPGRADE_QUIT_CASKS=1 "${brew}" upgrade --cask ${CASK}`]
    : null
}
