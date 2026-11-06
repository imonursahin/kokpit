import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { MODES } from '../shared/runner'
import { DEFAULT_SETTINGS, EFFORT_CHOICES, GITHUB_REFRESH_CHOICES, MODEL_CHOICES, NOTIFY_EVENTS, type KokpitSettings } from '../shared/settings'

export function sanitizeSettings(input: unknown, base: KokpitSettings = DEFAULT_SETTINGS): KokpitSettings {
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const out = { ...base, notify: { ...DEFAULT_SETTINGS.notify, ...base.notify } }
  if (typeof o['defaultModel'] === 'string' && (MODEL_CHOICES.some((m) => m.id === o['defaultModel']) || /^claude-[a-z0-9.-]{1,60}$/.test(o['defaultModel'])))
    out.defaultModel = o['defaultModel']
  if (typeof o['defaultEffort'] === 'string' && (EFFORT_CHOICES as string[]).includes(o['defaultEffort']))
    out.defaultEffort = o['defaultEffort'] as KokpitSettings['defaultEffort']
  if (typeof o['defaultMode'] === 'string' && (MODES as string[]).includes(o['defaultMode']))
    out.defaultMode = o['defaultMode'] as KokpitSettings['defaultMode']
  if (typeof o['showHeadless'] === 'boolean') out.showHeadless = o['showHeadless']
  if (typeof o['claudeExecutable'] === 'string') {
    const p = o['claudeExecutable'].trim()
    if (p && (!p.startsWith('/') || !existsSync(p) || !statSync(p).isFile())) throw new Error(`Claude executable not found: ${p}`)
    out.claudeExecutable = p
  }
  if (typeof o['githubRefreshMinutes'] === 'number' && GITHUB_REFRESH_CHOICES.includes(o['githubRefreshMinutes']))
    out.githubRefreshMinutes = o['githubRefreshMinutes']
  if (typeof o['includeDraftReviews'] === 'boolean') out.includeDraftReviews = o['includeDraftReviews']
  if (typeof o['notifyEnabled'] === 'boolean') out.notifyEnabled = o['notifyEnabled']
  if (typeof o['notifyWhenFocused'] === 'boolean') out.notifyWhenFocused = o['notifyWhenFocused']
  if (typeof o['menuBar'] === 'boolean') out.menuBar = o['menuBar']
  const notify = o['notify']
  if (typeof notify === 'object' && notify !== null) {
    for (const e of NOTIFY_EVENTS) {
      const v = (notify as Record<string, unknown>)[e.id]
      if (typeof v === 'boolean') out.notify[e.id] = v
    }
  }
  if (typeof o['assistantHome'] === 'string') {
    const p = o['assistantHome'].trim()
    if (p && !p.startsWith('/')) throw new Error('Assistant folder must be an absolute path')
    out.assistantHome = p
  }
  return out
}

export class SettingsStore {
  private value: KokpitSettings | null = null

  constructor(private readonly path: string) {}

  async get(): Promise<KokpitSettings> {
    if (this.value) return this.value
    try {
      this.value = sanitizeSettings(JSON.parse(await readFile(this.path, 'utf8')))
    } catch {
      this.value = { ...DEFAULT_SETTINGS }
    }
    return this.value
  }

  async update(patch: unknown): Promise<KokpitSettings> {
    const next = sanitizeSettings(patch, await this.get())
    await mkdir(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tmp, JSON.stringify(next, null, 2))
    await rename(tmp, this.path)
    this.value = next
    return next
  }
}
