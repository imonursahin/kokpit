import { useEffect, useRef, useState } from 'react'
import type { SessionDetailData } from '@shared/sessionDetail'

export function useSessionDetail(id: string | null, version: string): { data: SessionDetailData | null; error: string | null } {
  const [data, setData] = useState<SessionDetailData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const owner = useRef<string | null>(null)

  useEffect(() => {
    const api = window.kokpit
    if (!api || !id) return
    owner.current = id
    if (data?.id !== id) setData(null)
    setError(null)
    api
      .sessionDetail(id)
      .then((d) => {
        if (owner.current === id) setData(d)
      })
      .catch((err: Error) => {
        if (owner.current === id) setError(err.message)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, version])

  return { data: data?.id === id ? data : null, error }
}
