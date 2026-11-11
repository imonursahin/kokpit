import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron'
import type { SessionIndexItem } from '../shared/sessionIndex'
import type { PlanUsage } from '../shared/settings'
import type { CalendarEvent } from '../shared/integrations'
import type { TraySession, TrayState, TrayTarget } from '../shared/tray'

export type { TrayTarget }

const ARC_START = 135
const ARC_TRACK = 270
const ARC_VALUE = 169

export function gaugeBitmap(px: number, color?: [number, number, number]): Buffer {
  const buf = Buffer.alloc(px * px * 4)
  const ss = 4
  const scale = 100 / px
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      let alpha = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const dx = (x + (sx + 0.5) / ss) * scale - 50
          const dy = (y + (sy + 0.5) / ss) * scale - 50
          const r = Math.hypot(dx, dy)
          let a = 0
          if (r <= 12) a = 1
          else if (r >= 31 && r <= 43) {
            const rel = ((Math.atan2(dy, dx) * 180) / Math.PI - ARC_START + 720) % 360
            if (rel <= ARC_VALUE) a = 1
            else if (rel <= ARC_TRACK) a = 0.35
          }
          alpha += a
        }
      }
      const i = (y * px + x) * 4
      const a = alpha / (ss * ss)
      buf[i + 3] = Math.round(a * 255)
      if (color) {
        buf[i] = Math.round(color[2] * a)
        buf[i + 1] = Math.round(color[1] * a)
        buf[i + 2] = Math.round(color[0] * a)
      }
    }
  }
  return buf
}

export function resetsIn(iso: string, nowMs = Date.now()): string {
  const ms = Date.parse(iso) - nowMs
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return 'resets now'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24 ? `resets in ${Math.floor(h / 24)}d ${h % 24}h` : h ? `resets in ${h}h ${m}m` : `resets in ${m}m`
}

export type TrayOptions = {
  open: (target: TrayTarget) => void
  loadPanel: (win: BrowserWindow) => void
  preload: string
}

const PANEL_WIDTH = 340

type Tone = 'plain' | 'waiting' | 'unread'

const TONES: Record<Exclude<Tone, 'plain'>, [number, number, number]> = { waiting: [245, 158, 11], unread: [59, 130, 246] }

function trayIcon(tone: Tone): Electron.NativeImage {
  const image = nativeImage.createFromBitmap(gaugeBitmap(36, tone === 'plain' ? undefined : TONES[tone]), { width: 36, height: 36, scaleFactor: 2 })
  image.setTemplateImage(tone === 'plain')
  return image
}

export class KokpitTray {
  private tray: Tray | null = null
  private panel: BrowserWindow | null = null
  private title = ''
  private usage: PlanUsage | null = null
  private usageAt = ''
  private meetings: CalendarEvent[] | null = null
  private unread: { id: string; title: string }[] = []
  private last: { items: SessionIndexItem[]; showHeadless: boolean } | null = null
  private hiddenAt = 0
  private tone: Tone = 'plain'
  private tip = ''

  constructor(private readonly opts: TrayOptions) {
    ipcMain.handle('tray:getState', () => this.state())
    ipcMain.handle('tray:open', (_e, target: unknown) => {
      const t = target as TrayTarget | null
      if (t && (t.page === 'overview' || t.page === 'calendar' || (t.page === 'session' && typeof t.id === 'string'))) {
        this.panel?.hide()
        this.opts.open(t)
      }
    })
    ipcMain.handle('tray:join', (_e, url: unknown) => {
      if (typeof url !== 'string' || !/^https:\/\//i.test(url) || !this.meetings?.some((m) => m.meetUrl === url)) return
      this.panel?.hide()
      void shell.openExternal(url)
    })
    ipcMain.handle('tray:quit', () => app.quit())
    ipcMain.on('tray:height', (_e, h: unknown) => {
      if (this.panel && typeof h === 'number' && Number.isFinite(h)) this.panel.setSize(PANEL_WIDTH, Math.max(120, Math.min(720, Math.ceil(h))))
    })
  }

  setUnread(list: { id: string; title: string }[]): void {
    this.unread = list
    this.refresh()
  }

  setMeetings(list: CalendarEvent[] | null): void {
    if (JSON.stringify(list) === JSON.stringify(this.meetings)) return
    this.meetings = list
    this.refresh()
  }

  setUsage(usage: PlanUsage): void {
    this.usage = usage
    this.usageAt = new Date().toISOString()
    this.refresh()
  }

  update(items: SessionIndexItem[], showHeadless: boolean, enabled: boolean): void {
    if (process.platform !== 'darwin') return
    this.last = { items, showHeadless }
    if (!enabled) {
      this.dispose()
      return
    }
    if (!this.tray) {
      this.tone = 'plain'
      this.tip = ''
      this.tray = new Tray(trayIcon('plain'))
      this.title = ''
      this.tray.on('click', () => this.toggle())
      this.tray.on('right-click', () =>
        this.tray?.popUpContextMenu(
          Menu.buildFromTemplate([
            { label: 'Open Kokpit', click: () => this.opts.open({ page: 'overview' }) },
            { label: 'Quit Kokpit', role: 'quit' }
          ])
        )
      )
    }
    this.refresh()
  }

  state(): TrayState {
    const { items = [], showHeadless = false } = this.last ?? {}
    const shown = items.filter((i) => showHeadless || !i.headless)
    const pick = (i: SessionIndexItem): TraySession => ({ id: i.id, title: i.title || 'Session', sub: i.sub, status: i.status })
    const waiting = shown.filter((i) => i.status === 'waiting').map(pick)
    const running = shown.filter((i) => i.status === 'running').map(pick)
    const busy = new Set([...waiting, ...running].map((i) => i.id))
    const unread = this.unread
      .filter((u) => !busy.has(u.id))
      .map((u) => ({ id: u.id, title: u.title || 'Session', sub: shown.find((i) => i.id === u.id)?.sub ?? '', status: 'done' as const }))
    return { waiting, running, unread, usage: this.usage, usageAt: this.usageAt, meetings: this.meetings }
  }

  private refresh(): void {
    if (!this.tray) return
    const s = this.state()
    const weekly = s.usage?.available ? s.usage.windows.find((w) => w.id === 'seven_day') : undefined
    const activity = s.waiting.length
      ? `${s.waiting.length} waiting`
      : s.running.length
        ? `${s.running.length} running`
        : s.unread.length
          ? `${s.unread.length} finished`
          : ''
    const title = [weekly ? `${Math.round(weekly.utilization)}%` : '', activity].filter(Boolean).join(' · ')
    const tone: Tone = s.waiting.length ? 'waiting' : s.unread.length ? 'unread' : 'plain'
    if (tone !== this.tone) {
      this.tone = tone
      this.tray.setImage(trayIcon(tone))
    }
    if (title !== this.title) {
      this.title = title
      this.tray.setTitle(title ? ` ${title}` : '')
    }
    const tip = `Kokpit · ${s.running.length} running · ${s.waiting.length} waiting for you · ${s.unread.length} finished, not opened`
    if (tip !== this.tip) {
      this.tip = tip
      this.tray.setToolTip(tip)
    }
    if (this.panel && !this.panel.isDestroyed()) this.panel.webContents.send('tray:state', s)
  }

  private toggle(): void {
    if (this.panel?.isVisible()) {
      this.panel.hide()
      return
    }
    if (Date.now() - this.hiddenAt < 250) return
    const panel = this.ensurePanel()
    const b = this.tray?.getBounds()
    if (b) {
      const area = screen.getDisplayNearestPoint({ x: b.x, y: b.y }).workArea
      const x = Math.min(Math.max(Math.round(b.x + b.width / 2 - PANEL_WIDTH / 2), area.x + 8), area.x + area.width - PANEL_WIDTH - 8)
      panel.setPosition(x, Math.round(b.y + b.height + 4))
    }
    panel.webContents.send('tray:state', this.state())
    panel.show()
    panel.focus()
  }

  private ensurePanel(): BrowserWindow {
    if (this.panel && !this.panel.isDestroyed()) return this.panel
    const panel = new BrowserWindow({
      width: PANEL_WIDTH,
      height: 420,
      show: false,
      type: 'panel',
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      transparent: true,
      vibrancy: 'popover',
      visualEffectState: 'active',
      roundedCorners: true,
      hasShadow: true,
      acceptFirstMouse: true,
      webPreferences: { preload: this.opts.preload, contextIsolation: true, sandbox: true, nodeIntegration: false }
    })
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    panel.on('blur', () => {
      this.hiddenAt = Date.now()
      panel.hide()
    })
    this.opts.loadPanel(panel)
    this.panel = panel
    return panel
  }

  dispose(): void {
    this.panel?.destroy()
    this.panel = null
    this.tray?.destroy()
    this.tray = null
  }
}

export function focusAndNavigate(win: BrowserWindow, target: TrayTarget): void {
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  const send = () => win.webContents.send('app:navigate', target)
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send)
  else send()
}
