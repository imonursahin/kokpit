import { expect, test } from 'vitest'
import { toWindows } from './planUsage'

test('keeps windows with a utilization, in a fixed order, plus per-model ones', () => {
  expect(
    toWindows({
      five_hour: null,
      seven_day: { utilization: 23, resets_at: '2026-11-10T14:00:00Z' },
      seven_day_opus: { utilization: null, resets_at: null },
      model_scoped: [{ display_name: 'Fable', utilization: 40, resets_at: '2026-11-10T14:00:00Z' }]
    })
  ).toEqual([
    { id: 'seven_day', label: 'Weekly · all models', utilization: 23, resetsAt: '2026-11-10T14:00:00Z' },
    { id: 'model:Fable', label: 'Weekly · Fable', utilization: 40, resetsAt: '2026-11-10T14:00:00Z' }
  ])
  expect(toWindows(null)).toEqual([])
})
