import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.tsx'
import {
  applyThemeToDocument,
  finishThemeBoot,
  loadLocalPreferences,
} from './lib/preferencesStorage.ts'

async function bootstrap() {
  const prefs = await loadLocalPreferences()
  applyThemeToDocument(prefs.theme)

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialPrefs={prefs} />
    </StrictMode>,
  )

  requestAnimationFrame(() => {
    requestAnimationFrame(() => finishThemeBoot())
  })
}

void bootstrap()
