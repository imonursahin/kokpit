import { useEffect, useState } from 'react'
import type { ConnectionInfo } from '@shared/integrations'

export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export function useConnectionStatus(): {
  list: ConnectionInfo[] | null
  setList: (list: ConnectionInfo[]) => void
  error: string
} {
  const api = window.kokpit
  const [list, setList] = useState<ConnectionInfo[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api) return
    let alive = true
    api.integrations
      .status()
      .then((l) => {
        if (alive) setList(l)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorText(e))
      })
    return () => {
      alive = false
    }
  }, [api])

  return { list, setList, error }
}
