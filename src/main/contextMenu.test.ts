import { expect, test, vi } from 'vitest'
import { contextMenuTemplate } from './contextMenu'

const flags = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }
const actions = { openLink: vi.fn(), copyText: vi.fn() }

test('right click offers copy on selected chat text, editing in text boxes and link actions on links', () => {
  const roles = (p: Parameters<typeof contextMenuTemplate>[0]) => contextMenuTemplate(p, actions).map((i) => i.role ?? i.label ?? i.type)
  expect(roles({ isEditable: false, selectionText: 'hello', linkURL: '', editFlags: flags })).toEqual(['copy', 'separator', 'selectAll'])
  expect(roles({ isEditable: true, selectionText: '', linkURL: '', editFlags: flags })).toEqual(['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'separator', 'selectAll'])
  expect(roles({ isEditable: false, selectionText: '', linkURL: 'https://github.com/x', editFlags: flags })).toEqual(['Open Link', 'Copy Link', 'separator', 'selectAll'])
  expect(roles({ isEditable: false, selectionText: '', linkURL: 'file:///etc/passwd', editFlags: flags })).toEqual(['selectAll'])
  contextMenuTemplate({ isEditable: false, selectionText: '', linkURL: 'https://github.com/x', editFlags: flags }, actions)[1]?.click?.({} as never, undefined, {} as never)
  expect(actions.copyText).toHaveBeenCalledWith('https://github.com/x')
})
