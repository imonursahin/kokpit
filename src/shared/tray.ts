import type { PlanUsage } from './settings'
import type { SessionStatus } from './types'

export type TraySession = { id: string; title: string; sub: string; status: SessionStatus }

export type TrayState = {
  waiting: TraySession[]
  running: TraySession[]
  unread: TraySession[]
  usage: PlanUsage | null
  usageAt: string
}

export type TrayTarget = { page: 'session'; id: string } | { page: 'overview' } | { page: 'about' }
