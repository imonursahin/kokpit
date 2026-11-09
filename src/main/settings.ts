import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { MODES } from '../shared/runner'
import { DEFAULT_SETTINGS, EFFORT_CHOICES, GITHUB_REFRESH_CHOICES, MAX_SESSION_TAGS, MODEL_CHOICES, NOTIFY_EVENTS, TAG_COLORS, type KokpitSettings, type SessionTag } from '../shared/settings'

export function sanitizeSettings(input: unknown, base: KokpitSettings = DEFAULT_SETTINGS, strict = true): KokpitSettings {
  const reject = (message: string): false => {
    if (strict) throw new Error(message)
    return false
  }
  const o = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const out = { ...base, sessionTags: base.sessionTags ?? [], sessionTagOf: base.sessionTagOf ?? {}, notify: { ...DEFAULT_SETTINGS.notify, ...base.notify } }
  if (typeof o['defaultModel'] === 'string' && (MODEL_CHOICES.some((m) => m.id === o['defaultModel']) || /^claude-[a-z0-9.-]{1,60}$/.test(o['defaultModel'])))
    out.defaultModel = o['defaultModel']
  if (typeof o['defaultEffort'] === 'string' && (EFFORT_CHOICES as string[]).includes(o['defaultEffort']))
    out.defaultEffort = o['defaultEffort'] as KokpitSettings['defaultEffort']
  if (typeof o['defaultMode'] === 'string' && (MODES as string[]).includes(o['defaultMode']))
    out.defaultMode = o['defaultMode'] as KokpitSettings['defaultMode']
  if (typeof o['showHeadless'] === 'boolean') out.showHeadless = o['showHeadless']
  if (typeof o['claudeExecutable'] === 'string') {
    const p = o['claudeExecutable'].trim()
    if (!p || (p.startsWith('/') && existsSync(p) && statSync(p).isFile()) || reject(`Claude executable not found: ${p}`)) out.claudeExecutable = p
    else out.claudeExecutable = ''
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
  if (Array.isArray(o['sessionTags'])) {
    const tags: SessionTag[] = []
    for (const raw of o['sessionTags']) {
      const t = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
      const id = typeof t['id'] === 'string' ? t['id'] : ''
      const name = typeof t['name'] === 'string' ? t['name'].trim().slice(0, 24) : ''
      const color = (TAG_COLORS as readonly string[]).includes(String(t['color'])) ? (t['color'] as SessionTag['color']) : 'gray'
      if (!/^[a-z0-9-]{1,40}$/.test(id) || !name || tags.some((x) => x.id === id)) continue
      tags.push({ id, name, color })
    }
    if (tags.length > MAX_SESSION_TAGS) reject(`You can have up to ${MAX_SESSION_TAGS} session tags`)
    out.sessionTags = tags.slice(0, MAX_SESSION_TAGS)
  }
  if (typeof o['sessionTagOf'] === 'object' && o['sessionTagOf'] !== null && !Array.isArray(o['sessionTagOf'])) {
    out.sessionTagOf = {}
    for (const [sid, tid] of Object.entries(o['sessionTagOf'] as Record<string, unknown>).slice(0, 5000)) {
      if (/^[0-9a-f-]{36}$/i.test(sid) && typeof tid === 'string') out.sessionTagOf[sid] = tid
    }
  }
  const tagIds = new Set(out.sessionTags.map((t) => t.id))
  out.sessionTagOf = Object.fromEntries(Object.entries(out.sessionTagOf ?? {}).filter(([, tid]) => tagIds.has(tid)))
  if (typeof o['assistantHome'] === 'string') {
    const p = o['assistantHome'].trim()
    if (!p) out.assistantHome = ''
    else if (p.startsWith('/')) out.assistantHome = resolve(p)
    else if (reject('Assistant folder must be an absolute path') === false) out.assistantHome = ''
  }
  return out
}

export class SettingsStore {
  private value: KokpitSettings | null = null

  constructor(private readonly path: string) {}

  async get(): Promise<KokpitSettings> {
    if (this.value) return this.value
    try {
      this.value = sanitizeSettings(JSON.parse(await readFile(this.path, 'utf8')), DEFAULT_SETTINGS, false)
    } catch {
      this.value = { ...DEFAULT_SETTINGS }
    }
    return this.value
  }

  private writes: Promise<unknown> = Promise.resolve()

  update(patch: unknown, check?: (next: KokpitSettings) => Promise<void>): Promise<KokpitSettings> {
    const run = this.writes.then(async () => {
      const next = sanitizeSettings(patch, await this.get())
      if (check) await check(next)
      await mkdir(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.${randomUUID()}.tmp`
      await writeFile(tmp, JSON.stringify(next, null, 2))
      await rename(tmp, this.path)
      this.value = next
      return next
    })
    this.writes = run.catch(() => undefined)
    return run
  }
}
