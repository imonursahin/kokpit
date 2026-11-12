import { expect, test } from 'vitest'
import { RemoteSessions, remoteLinkIn } from './remote'

const LINE = '\x1b[2m/remote-control\x1b[22m\x1b[1Cis\x1b[1Cactive\x1b[1C·\x1b[1CContinue\x1b[1Chere, or at \x1b]8;;https://claude.ai/code/session_01Rw\x07https://claude.ai/code/session_01RwJXr_G-9\x1b]8;;\x07\r\n'

test('the Remote Control link is read from the CLI output, colors and hyperlinks stripped', () => {
  expect(remoteLinkIn(LINE)).toBe('https://claude.ai/code/session_01RwJXr_G-9')
  expect(remoteLinkIn('Welcome back\r\n')).toBe('')
  expect(remoteLinkIn('or at https://claude.ai/code/session_01Rw')).toBe('')
})

test('a phone session picks up its link across chunks and goes away when the CLI exits', () => {
  const lists: number[] = []
  const killed: string[] = []
  const r = new RemoteSessions((id) => killed.push(id), (l) => lists.push(l.length))
  r.add('s1', 't1')
  r.onTerminal({ type: 'data', id: 't1', data: 'or at https://claude.ai/code/sess' })
  r.onTerminal({ type: 'data', id: 'other', data: 'https://claude.ai/code/session_zzz ' })
  expect(r.list()[0]?.url).toBe('')
  r.onTerminal({ type: 'data', id: 't1', data: 'ion_abc123 \r\n' })
  expect(r.list()[0]?.url).toBe('https://claude.ai/code/session_abc123')
  expect(r.attach('s1').backlog).toContain('session_abc123')
  r.stop('s1')
  expect(killed).toEqual(['t1'])
  r.onTerminal({ type: 'exit', id: 't1', code: 0 })
  expect(r.has('s1')).toBe(false)
  expect(lists).toEqual([1, 1, 0])
  expect(() => r.attach('s1')).toThrow()
})
