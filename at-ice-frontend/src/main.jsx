import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './a11y.css'
import App from './App.jsx'
import { installSessionExpiryHandler } from './lib/sessionExpiry'
import { installPressFeedback } from './lib/pressFeedback'
import { startLiveFeed } from './lib/live'
import { installAutoCapitalize } from './lib/autoCapitalize'
import { installAutoGrow } from './lib/autoGrow'

installSessionExpiryHandler()
installAutoCapitalize()
installAutoGrow()
installPressFeedback()
startLiveFeed()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
