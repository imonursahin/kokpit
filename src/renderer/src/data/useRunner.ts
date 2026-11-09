import { useCallback, useEffect, useRef, useState } from 'react'
import { moveSessionState } from './drafts'
import type { AskDecision, ImageInput, LiveSession, RunnerMode, StartSession, TurnSettings } from '@shared/runner'

export type Runner = {
  live: Map<string, LiveSession>
  partial: Map<string, string>
  start: (req: StartSession) => Promise<string>
  send: (sessionId: string, text: string, images?: ImageInput[], settings?: TurnSettings) => Promise<string | undefined>
  respond: (sessionId: string, requestId: string, decision: AskDecision, note?: string, answers?: Record<string, string>) => Promise<void>
  interrupt: (sessionId: string) => Promise<void>
  setMode: (sessionId: string, mode: RunnerMode) => Promise<void>
  sessionIdFor: (tempId: string) => string | undefined
  release: (id: string) => void
}

const EMPTY = new Map<string, LiveSession>()

export function rekeyIds(ids: Map<string, string>, from: string, to: string): Map<string, string> {
  const next = new Map(ids)
  for (const [k, v] of next) if (v === from) next.set(k, to)
  next.set(from, to)
  return next
}

export function useRunner(): Runner {
  const api = window.kokpit?.runner
  const [live, setLive] = useState<Map<string, LiveSession>>(EMPTY)
  const [ids, setIds] = useState<Map<string, string>>(() => new Map())
  const [partial, setPartial] = useState<Map<string, string>>(() => new Map())
  const rekeyed = useRef(new Set<string>())

  useEffect(() => {
    if (!api) return
    let alive = true
    const off = api.onEvent((e) => {
      if (!alive) return
      if (e.type === 'partial') {
        setPartial((prev) => {
          if ((prev.get(e.sessionId) ?? '') === e.text) return prev
          const next = new Map(prev)
          if (e.text) next.set(e.sessionId, e.text)
          else next.delete(e.sessionId)
          return next
        })
      } else if (e.type === 'state') {
        if (rekeyed.current.has(e.session.sessionId)) return
        setLive((prev) => new Map(prev).set(e.session.sessionId, e.session))
      } else if (e.type === 'ended') {
        setLive((prev) => {
          if (!prev.has(e.sessionId) || prev.get(e.sessionId)?.state === 'error') return prev
          const next = new Map(prev)
          next.delete(e.sessionId)
          return next
        })
        setPartial((prev) => {
          if (!prev.has(e.sessionId)) return prev
          const next = new Map(prev)
          next.delete(e.sessionId)
          return next
        })
      } else if (e.type === 'started') {
        if (e.tempId.startsWith('pending-')) moveSessionState(e.tempId, e.sessionId)
        rekeyed.current.add(e.tempId)
        setIds((prev) => rekeyIds(prev, e.tempId, e.sessionId))
        setLive((prev) => {
          const old = prev.get(e.tempId)
          if (!old) return prev
          const next = new Map(prev)
          next.delete(e.tempId)
          if (!next.has(e.sessionId))
            next.set(e.sessionId, {
              ...old,
              sessionId: e.sessionId,
              pending: old.pending.map((p) => ({ ...p, sessionId: e.sessionId }))
            })
          return next
        })
      }
    })
    api
      .list()
      .then((list) => {
        if (!alive) return
        setLive((prev) => {
          const next = new Map(list.filter((s) => !rekeyed.current.has(s.sessionId)).map((s) => [s.sessionId, s]))
          for (const [k, v] of prev) next.set(k, v)
          return next
        })
      })
      .catch((err: unknown) => console.error('runner:list failed', err))
    return () => {
      alive = false
      off()
    }
  }, [api])

  const start = useCallback(
    async (req: StartSession) => {
      if (!api) throw new Error('The Claude runner is not available here.')
      return (await api.start(req)).tempId
    },
    [api]
  )
  const send = useCallback(
    (id: string, text: string, images?: ImageInput[], settings?: TurnSettings) => (api ? api.send(id, text, images, settings) : Promise.resolve(undefined)),
    [api]
  )
  const respond = useCallback(
    (id: string, requestId: string, decision: AskDecision, note?: string, answers?: Record<string, string>) =>
      api ? api.respond(id, requestId, decision, note, answers) : Promise.resolve(),
    [api]
  )
  const interrupt = useCallback((id: string) => (api ? api.interrupt(id) : Promise.resolve()), [api])
  const setMode = useCallback((id: string, mode: RunnerMode) => (api ? api.setMode(id, mode) : Promise.resolve()), [api])
  const sessionIdFor = useCallback(
    (tempId: string) => ids.get(tempId) ?? (tempId.startsWith('pending-') ? undefined : tempId),
    [ids]
  )

  const release = useCallback((id: string) => {
    rekeyed.current.delete(id)
    setIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  return { live, partial, start, send, respond, interrupt, setMode, sessionIdFor, release }
}
