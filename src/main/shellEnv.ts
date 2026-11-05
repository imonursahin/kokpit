import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const MARK = '__KOKPIT_PATH__'

export async function loadLoginPath(): Promise<void> {
  if (process.platform !== 'darwin') return
  const shell = process.env['SHELL'] || '/bin/zsh'
  try {
    const { stdout } = await promisify(execFile)(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 8000 })
    const m = new RegExp(`${MARK}(.*?)${MARK}`).exec(stdout)
    if (m?.[1]) process.env['PATH'] = m[1]
  } catch {
    const extra = ['/opt/homebrew/bin', '/usr/local/bin', `${process.env['HOME']}/.local/bin`]
    process.env['PATH'] = [...extra, process.env['PATH'] ?? ''].filter(Boolean).join(':')
  }
}
