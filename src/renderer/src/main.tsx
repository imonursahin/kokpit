import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { TrayPanel } from './pages/TrayPanel'
import './styles/global.css'
import { applyTheme, readThemePref } from './data/theme'

applyTheme(readThemePref())

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root is missing')

createRoot(root).render(
  <StrictMode>
    {location.hash === '#tray' ? <TrayPanel /> : <App />}
  </StrictMode>
)
