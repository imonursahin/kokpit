import { exec } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { appendFile, mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const MAX_OUTPUT = 20_000

export type ShellResult = { command: string; code: number | null; output: string; truncated: boolean }

function assertDir(cwd: unknown): string {
  if (typeof cwd !== 'string' || !cwd.startsWith('/') || !existsSync(cwd) || !statSync(cwd).isDirectory()) throw new Error('Folder not found')
  return cwd
}

export function runShell(cwd: unknown, command: unknown, timeoutMs = 120_000): Promise<ShellResult> {
  const dir = assertDir(cwd)
  if (typeof command !== 'string' || !command.trim() || command.length > 4000) throw new Error('invalid command')
  return new Promise((resolve) => {
    exec(command, { cwd: dir, shell: '/bin/zsh', timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: process.env }, (err, stdout, stderr) => {
      const all = `${stdout}${stderr ? (stdout ? '\n' : '') + stderr : ''}`.replace(/\x1b\[[0-9;]*m/g, '')
      const code = err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as { code: number }).code) : null) : 0
      resolve({ command, code, output: all.length > MAX_OUTPUT ? all.slice(-MAX_OUTPUT) : all, truncated: all.length > MAX_OUTPUT })
    })
  })
}

export function memoryFile(target: unknown, cwd: unknown): string {
  if (target === 'user') return join(homedir(), '.claude', 'CLAUDE.md')
  if (target === 'project') return join(assertDir(cwd), 'CLAUDE.md')
  throw new Error('invalid memory target')
}

export async function appendMemory(target: unknown, cwd: unknown, note: unknown): Promise<string> {
  if (typeof note !== 'string' || !note.trim() || note.length > 2000) throw new Error('invalid note')
  const file = memoryFile(target, cwd)
  await mkdir(dirname(file), { recursive: true })
  const current = await readFile(file, 'utf8').catch(() => '')
  const line = `- ${note.trim().replace(/\s*\n\s*/g, ' ')}\n`
  await appendFile(file, current && !current.endsWith('\n') ? `\n${line}` : line, 'utf8')
  return file
}
