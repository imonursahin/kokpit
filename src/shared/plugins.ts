export type PluginScope = 'user' | 'project' | 'local' | 'managed'

export type PluginInstall = { scope: PluginScope; enabled: boolean; projectPath: string; version: string; lastUpdated: string }

export type PluginInfo = { id: string; name: string; marketplace: string; installs: PluginInstall[] }

export type PluginAction = 'enable' | 'disable' | 'update' | 'uninstall'

export type PluginUpdateState = 'current' | 'outdated' | 'unknown'

export type PluginUpdate = { id: string; scope: PluginScope; projectPath: string; state: PluginUpdateState; installed: string; latest: string }

export type PluginUpdates = { checkedAt: string; refreshError: string; items: PluginUpdate[] }
