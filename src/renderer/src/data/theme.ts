import { useEffect, useState } from 'react'

export type ThemePref = 'light' | 'dark' | 'system'

const KEY = 'kokpit.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function readThemePref(): ThemePref {
  const v = localStorage.getItem(KEY)
  return v === 'dark' || v === 'system' ? v : 'light'
}

export function applyTheme(pref: ThemePref): void {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
}

export function useTheme(): [ThemePref, () => void, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(readThemePref)

  useEffect(() => {
    applyTheme(pref)
    localStorage.setItem(KEY, pref)
    if (pref !== 'system') return
    const m = media()
    const onChange = () => applyTheme('system')
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [pref])

  const cycle = () => setPref((p) => (p === 'light' ? 'dark' : p === 'dark' ? 'system' : 'light'))
  return [pref, cycle, setPref]
}
