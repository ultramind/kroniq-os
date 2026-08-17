import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthGate } from './features/auth/AuthGate'
import { ThemeProvider } from './app/theme'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthGate />
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
