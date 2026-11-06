type Contents = {
  on(event: 'will-navigate', listener: (e: { preventDefault(): void }) => void): unknown
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
}

export function lockNavigation(contents: Contents, openExternal: (url: string) => unknown): void {
  contents.on('will-navigate', (e) => e.preventDefault())
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void openExternal(url)
    return { action: 'deny' }
  })
}
