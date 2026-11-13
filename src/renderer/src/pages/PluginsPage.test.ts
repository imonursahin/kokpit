import { expect, test } from 'vitest'
import { parseDetails } from './PluginsPage'

test('the plugin details from Claude Code read as a description, its parts and its cost', () => {
  const text = `zeus 1.0.5
  Description: Zeus Plugin
  Source: zeus@zeus

Component inventory
  Skills (3)  check-pr, commit, goalie
  Agents (0)
  Hooks (2)  SessionStart, UserPromptSubmit  (harness-only — no model context cost)
  MCP servers (0)
  LSP servers (0)

Projected token cost
  Always-on:   ~2,525 tok   added to every session`
  expect(parseDetails(text)).toEqual({
    description: 'Zeus Plugin',
    parts: [
      { label: 'Skills', items: ['check-pr', 'commit', 'goalie'] },
      { label: 'Hooks', items: ['SessionStart', 'UserPromptSubmit'] }
    ],
    alwaysOn: '~2,525 tokens'
  })
  expect(parseDetails('something we do not know')).toBeNull()
})

test('plugins turned on anywhere come first, the rest below', async () => {
  const { splitActive } = await import('./PluginsPage')
  const p = (id: string, ...enabled: boolean[]) => ({ id, name: id, marketplace: 'm', installs: enabled.map((e) => ({ scope: 'project' as const, enabled: e, projectPath: '/x', version: '', lastUpdated: '' })) })
  const { active, inactive } = splitActive([p('a', false), p('b', true), p('c', false, true), p('d')])
  expect(active.map((x) => x.id)).toEqual(['b', 'c'])
  expect(inactive.map((x) => x.id)).toEqual(['a', 'd'])
})
