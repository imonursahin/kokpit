import { app, BrowserWindow, clipboard, Menu, shell } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { focusAndNavigate, KokpitTray } from './tray'
import { loadLoginPath } from './shellEnv'
import { lockNavigation } from './navigation'
import { contextMenuTemplate } from './contextMenu'

let main: BrowserWindow | null = null

function mainWindow(): BrowserWindow {
  return main && !main.isDestroyed() ? main : createWindow()
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    title: 'Kokpit',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    backgroundColor: '#F4F3F0',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })

  const snapshot = process.env['KOKPIT_SNAPSHOT']
  if (snapshot && !app.isPackaged) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        const js = process.env['KOKPIT_SNAPSHOT_JS']
        void (js ? win.webContents.executeJavaScript(js) : Promise.resolve())
          .then(() => new Promise((r) => setTimeout(r, 2500)))
          .then(() => win.webContents.capturePage())
          .then((img) => writeFile(snapshot, img.toPNG()))
      }, Number(process.env['KOKPIT_SNAPSHOT_DELAY'] ?? 15000))
    })
  }

  loadRenderer(win)
  main = win
  return win
}

const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${hash ? `#${hash}` : ''}`)
  } else {
    void win.loadFile(join(import.meta.dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

app.on('web-contents-created', (_e, contents) => {
  lockNavigation(contents, (url) => shell.openExternal(url))
  contents.on('context-menu', (_ev, params) => {
    const template = contextMenuTemplate(params, { openLink: (url) => void shell.openExternal(url), copyText: (text) => clipboard.writeText(text) })
    if (template.length) Menu.buildFromTemplate(template).popup()
  })
})

void app.whenReady().then(async () => {
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(join(app.getAppPath(), 'build', 'icon.png'))
  await loadLoginPath()
  const tray = new KokpitTray({
    open: (target) => focusAndNavigate(mainWindow(), target),
    loadPanel: (win) => loadRenderer(win, 'tray'),
    preload: PRELOAD
  })
  const disposeIpc = registerIpc({
    onSessions: (items, showHeadless, menuBar) => tray.update(items, showHeadless, menuBar),
    onPlanUsage: (usage) => tray.setUsage(usage),
    onUnread: (list) => tray.setUnread(list),
    onMeetings: (list) => tray.setMeetings(list),
    mainWindow: () => (main && !main.isDestroyed() ? main : null)
  })
  app.on('will-quit', () => {
    tray.dispose()
    disposeIpc()
  })
  createWindow()
  app.on('activate', () => {
    if (!main || main.isDestroyed()) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
