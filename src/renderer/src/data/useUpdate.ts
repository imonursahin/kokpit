import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/settings'

export function useUpdate(): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    const api = window.kokpit
    if (!api) return
    let alive = true
    void api.updates
      .get()
      .then((s) => alive && setStatus(s))
      .catch(() => undefined)
    const off = api.updates.onStatus((s) => alive && setStatus(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  return status
}

export function openAboutSettings(go: (page: 'settings') => void) {
  localStorage.setItem('kokpit.settingsSection', 'about')
  go('settings')
}
