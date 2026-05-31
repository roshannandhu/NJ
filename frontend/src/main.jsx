import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// ── Offline PDF libraries ──────────────────────────────────────────────
// Bundled locally (was loaded from a CDN). Exposed on window so existing code
// that reads `window.jspdf.jsPDF` and `window.html2canvas` keeps working.
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
window.jspdf = { jsPDF }
window.html2canvas = html2canvas

// ── Offline fonts ──────────────────────────────────────────────────────
// Bundled locally (was loaded from Google Fonts) so the app renders correctly
// with no internet connection.
import '@fontsource/inter/300.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/fraunces/300.css'
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/playfair-display/400.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import '@fontsource/playfair-display/800.css'
import '@fontsource/playfair-display/900.css'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
