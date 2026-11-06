import { useEffect, useState } from 'react'
import type { ModelOption } from '@shared/runner'
import { MODEL_CHOICES } from '@shared/settings'

const FALLBACK: ModelOption[] = MODEL_CHOICES.map((m) => ({ id: m.id, label: m.label }))
let cached: ModelOption[] | null = null

export function useModels(): ModelOption[] {
  const [models, setModels] = useState<ModelOption[]>(cached ?? FALLBACK)
  useEffect(() => {
    if (cached) return
    let alive = true
    void window.kokpit?.runner
      .models()
      .then((list) => {
        if (!list.length) return
        cached = list
        if (alive) setModels(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return models
}
