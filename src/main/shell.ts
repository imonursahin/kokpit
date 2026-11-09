import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
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
    const child = spawn('/bin/zsh', ['-c', command], { cwd: dir, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
    const out = new StringDecoder('utf8')
    let text = ''
    let cut = false
    let done = false
    const add = (d: Buffer) => {
      text += out.write(d)
      if (text.length > MAX_OUTPUT * 2) {
        text = text.slice(-MAX_OUTPUT)
        cut = true
      }
    }
    const killGroup = (signal: NodeJS.Signals) => {
      try {
        if (child.pid) process.kill(-child.pid, signal)
      } catch {
        return
      }
    }
    const finish = (code: number | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.stdout.destroy()
      child.stderr.destroy()
      const all = (text + out.end()).replace(/\x1b\[[0-9;]*m/g, '')
      resolve({ command, code, output: all.length > MAX_OUTPUT ? all.slice(-MAX_OUTPUT) : all, truncated: cut || all.length > MAX_OUTPUT })
    }
    const timer = setTimeout(() => {
      killGroup('SIGKILL')
      finish(null)
    }, timeoutMs)
    child.stdout.on('data', add)
    child.stderr.on('data', add)
    child.on('error', (err) => {
      text += `${err.message}\n`
      finish(null)
    })
    child.on('close', (code) => finish(code))
    child.on('exit', (code) => setTimeout(() => finish(code), 300))
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
