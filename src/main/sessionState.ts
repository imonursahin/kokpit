import { rename, writeFile } from 'node:fs/promises'
import type { SessionIndexItem } from '../shared/sessionIndex'

const MAX_SESSIONS = 100

export type SessionStateFile = {
  updatedAt: string
  sessions: { name: string; id: string; status: string; unread: boolean; onPhone: boolean; summary: string; repo: string; branch: string; jira: string; lastAt: string }[]
}

export function sessionState(items: SessionIndexItem[], unread: Set<string>, now = new Date()): SessionStateFile {
  return {
    updatedAt: now.toISOString(),
    sessions: items
      .filter((i) => !i.headless)
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
      .slice(0, MAX_SESSIONS)
      .map((i) => ({
        name: i.title,
        id: i.id,
        status: i.status,
        unread: unread.has(i.id),
        onPhone: !!i.onPhone,
        summary: i.sub,
        repo: i.repo,
        branch: i.branch,
        jira: i.jira,
        lastAt: i.lastAt
      }))
  }
}

export function sessionStateNote(file: string): string {
  return `Kokpit keeps the live list of the user's sessions in ${file}: each session's name, status (waiting, running, done, error), whether the user has not read it yet (unread), and its last summary. Read that file when the user asks about their other sessions, and use a session's name there when messaging it with SendMessage.`
}

export async function writeSessionState(file: string, state: SessionStateFile): Promise<void> {
  const tmp = `${file}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`)
  await rename(tmp, file)
}
