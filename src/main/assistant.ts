import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_ASSISTANT_HOME = join(homedir(), 'Kokpit')
const MAX_PROMPT = 200_000
const DEFAULT_CLAUDE_MD = `# Kokpit

Rules Kokpit follows in every session it starts, in any repository. The repository's own CLAUDE.md still applies on top.

## How I work

- Read the code before changing it. Follow the repository's existing patterns.
- Make the smallest change that does the job. Do only what was asked.
- Say what you checked and what you did not.
- Ask before committing, pushing or opening a pull request.
`

export function memoryDir(home: string): string {
  return join(home, 'memory')
}

export function assistantHome(configured: string): string {
  return configured.trim() || DEFAULT_ASSISTANT_HOME
}

export async function ensureAssistantHome(home: string): Promise<void> {
  await mkdir(join(home, '.claude-plugin'), { recursive: true })
  await mkdir(join(home, 'skills'), { recursive: true })
  await mkdir(join(home, 'agents'), { recursive: true })
  const manifest = join(home, '.claude-plugin', 'plugin.json')
  if (!existsSync(manifest)) {
    await writeFile(
      manifest,
      `${JSON.stringify({ name: 'kokpit', version: '1.0.0', description: 'Kokpit assistant skills, agents and hooks.' }, null, 2)}\n`,
      { flag: 'wx' }
    )
  }
  await mkdir(join(home, 'commands'), { recursive: true })
  await mkdir(join(home, 'memory'), { recursive: true })
  const rules = join(home, 'CLAUDE.md')
  if (!existsSync(rules) && !existsSync(join(home, 'ASSISTANT.md'))) await writeFile(rules, DEFAULT_CLAUDE_MD, { flag: 'wx' })
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

export async function assistantPrompt(home: string): Promise<string | undefined> {
  const text = ((await readText(join(home, 'CLAUDE.md'))) || (await readText(join(home, 'ASSISTANT.md')))).trim()
  return text ? text.slice(0, MAX_PROMPT) : undefined
}
