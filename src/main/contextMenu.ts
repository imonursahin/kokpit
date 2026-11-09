import type { MenuItemConstructorOptions } from 'electron'

export type ContextParams = { isEditable: boolean; selectionText: string; linkURL: string; editFlags: { canCut: boolean; canCopy: boolean; canPaste: boolean; canSelectAll: boolean } }

export function contextMenuTemplate(p: ContextParams, actions: { openLink: (url: string) => void; copyText: (text: string) => void }): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (p.linkURL.startsWith('https://')) {
    items.push({ label: 'Open Link', click: () => actions.openLink(p.linkURL) }, { label: 'Copy Link', click: () => actions.copyText(p.linkURL) }, { type: 'separator' })
  }
  if (p.isEditable) {
    items.push(
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut', enabled: p.editFlags.canCut },
      { role: 'copy', enabled: p.editFlags.canCopy },
      { role: 'paste', enabled: p.editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: p.editFlags.canSelectAll }
    )
  } else if (p.selectionText.trim()) {
    items.push({ role: 'copy' }, { type: 'separator' }, { role: 'selectAll' })
  } else {
    items.push({ role: 'selectAll' })
  }
  while (items[items.length - 1]?.type === 'separator') items.pop()
  return items
}
