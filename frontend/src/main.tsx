import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/righteous/latin-400.css' // the jukebox's display font, bundled so it works offline
import './index.css'
import './jukebox.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Offline support (production only, so it never caches the dev server).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'))
}
