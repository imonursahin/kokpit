import { spawn } from 'node:child_process'

// -d keeps the screen on, -i blocks idle sleep on battery and AC (also while the screen is locked),
// -s blocks system sleep on AC (macOS ignores it on battery). -w ends caffeinate when Kokpit exits, even on a crash.
export function caffeinate(onLost: () => void, pid = process.pid): () => void {
  let stopped = false
  const child = spawn('/usr/bin/caffeinate', ['-d', '-i', '-s', '-w', String(pid)], { stdio: 'ignore' })
  const lost = (): void => {
    if (stopped) return
    stopped = true
    onLost()
  }
  child.on('exit', lost)
  child.on('error', lost)
  return () => {
    if (stopped) return
    stopped = true
    child.kill()
  }
}
