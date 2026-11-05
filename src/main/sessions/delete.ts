import { existsSync } from 'node:fs'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function assertSessionId(id: unknown): string {
  if (typeof id !== 'string' || !UUID.test(id)) throw new Error('Invalid session id')
  return id
}

export async function scrubHistory(historyPath: string, sessionId: string): Promise<number> {
  if (!existsSync(historyPath)) return 0
  const text = await readFile(historyPath, 'utf8')
  const lines = text.split('\n')
  const kept = lines.filter((line) => {
    if (!line.includes(sessionId)) return true
    try {
      const o = JSON.parse(line) as { sessionId?: unknown }
      return o.sessionId !== sessionId
    } catch {
      return true
    }
  })
  const removed = lines.length - kept.length
  if (!removed) return 0
  const tmp = `${historyPath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, kept.join('\n'), { mode: 0o600 })
  await rename(tmp, historyPath)
  return removed
}

export async function deleteSessionTraces(
  sessionId: string,
  removeTranscript: (id: string) => Promise<void>,
  claudeDir = join(homedir(), '.claude')
): Promise<void> {
  const id = assertSessionId(sessionId)
  await removeTranscript(id)
  await rm(join(claudeDir, 'file-history', id), { recursive: true, force: true })
  await rm(join(claudeDir, 'session-env', id), { recursive: true, force: true })
  await scrubHistory(join(claudeDir, 'history.jsonl'), id)
}
