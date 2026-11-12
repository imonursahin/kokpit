import { useEffect, useState } from 'react'
import type { RemoteSession } from '@shared/remote'

export function useRemoteSessions(): RemoteSession[] {
  const [list, setList] = useState<RemoteSession[]>([])
  useEffect(() => {
    const api = window.kokpit
    if (!api) return
    let alive = true
    void api.remote.list().then((l) => alive && setList(l))
    const off = api.remote.onChanged(setList)
    return () => {
      alive = false
      off()
    }
  }, [])
  return list
}
