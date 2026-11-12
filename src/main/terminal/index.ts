import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import { PTY_BRIDGE } from './bridge'

export type TerminalEvent = { type: 'data'; id: string; data: string } | { type: 'exit'; id: string; code: number | null }

const clamp = (n: unknown, min: number, max: number, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback

export class Terminals {
  private procs = new Map<string, ChildProcessWithoutNullStreams>()

  constructor(private readonly emit: (e: TerminalEvent) => void) {}

  start(command: string[], cols: unknown, rows: unknown, opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
    const id = randomUUID()
    const c = clamp(cols, 20, 400, 100)
    const r = clamp(rows, 5, 200, 30)
    const proc = spawn('python3', ['-u', '-c', PTY_BRIDGE, String(c), String(r), ...command], {
      cwd: opts.cwd ?? homedir(),
      env: { ...(opts.env ?? process.env), TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1' }
    })
    this.procs.set(id, proc)
    const out = new StringDecoder('utf8')
    const err = new StringDecoder('utf8')
    proc.stdout.on('data', (d: Buffer) => this.emit({ type: 'data', id, data: out.write(d) }))
    proc.stderr.on('data', (d: Buffer) => this.emit({ type: 'data', id, data: err.write(d) }))
    proc.stdin.on('error', () => undefined)
    proc.on('error', (err) => {
      this.emit({ type: 'data', id, data: `\r\nCould not start the terminal: ${err.message}\r\n` })
      this.emit({ type: 'exit', id, code: 1 })
      this.procs.delete(id)
    })
    proc.on('exit', (code) => {
      this.emit({ type: 'exit', id, code })
      this.procs.delete(id)
    })
    return id
  }

  write(id: unknown, data: unknown): void {
    if (typeof id !== 'string' || typeof data !== 'string') return
    this.procs.get(id)?.stdin.write(data)
  }

  resize(id: unknown, cols: unknown, rows: unknown): void {
    if (typeof id !== 'string') return
    const proc = this.procs.get(id)
    if (!proc) return
    proc.stdin.write(`\x1b]kokpit-resize;${clamp(cols, 20, 400, 100)};${clamp(rows, 5, 200, 30)}\x07`)
  }

  kill(id: unknown): void {
    if (typeof id !== 'string') return
    this.procs.get(id)?.kill('SIGTERM')
  }

  dispose(): void {
    for (const p of this.procs.values()) p.kill('SIGTERM')
    this.procs.clear()
  }
}
