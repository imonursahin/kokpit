export type McpStatus = 'connected' | 'failed' | 'needs-auth' | 'pending' | 'disabled'

export type McpServerInfo = {
  name: string
  status: McpStatus
  scope: string
  source: string
  error: string
  target: string
  transport: string
  tools: number
  version: string
  removable: boolean
  canLogin: boolean
}

export type McpAddInput = {
  name: string
  transport: 'http' | 'sse' | 'stdio'
  target: string
  scope: 'user' | 'local' | 'project'
}
