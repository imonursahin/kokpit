import { readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { CliStatus } from '../../shared/sessionIndex'
import { claudeStillWorking, type BackgroundTask, type LiveState } from '../../shared/runner'

const LIVE_DIR = join(homedir(), '.claude', 'sessions')

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

export function readCliStatuses(dir = LIVE_DIR, alive = processAlive): Map<string, CliStatus> {
  const out = new Map<string, CliStatus>()
  let names: string[]
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'))
  } catch {
    return out
  }
  for (const name of names) {
    try {
      const d = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>
      const id = typeof d['sessionId'] === 'string' ? d['sessionId'] : ''
      const status = d['status'] === 'busy' || d['status'] === 'idle' ? d['status'] : null
      const pid = Number(d['pid'])
      if (!id || !status || !Number.isInteger(pid) || pid <= 0 || !alive(pid)) continue
      if (out.get(id) !== 'busy') out.set(id, status)
    } catch {
      continue
    }
  }
  return out
}

export function liveListStatus(state: LiveState, background: BackgroundTask[] = []): 'waiting' | 'error' | 'done' | 'running' {
  if (state === 'waiting') return 'waiting'
  if (state === 'error') return 'error'
  if (state !== 'idle') return 'running'
  return claudeStillWorking(background) ? 'running' : 'done'
}
