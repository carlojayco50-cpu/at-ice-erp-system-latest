import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './a11y.css'
import './glow.css'
import App from './App.jsx'
import { installSessionExpiryHandler } from './lib/sessionExpiry'
import { installPressFeedback } from './lib/pressFeedback'
import { startLiveFeed } from './lib/live'
import { installAutoCapitalize } from './lib/autoCapitalize'
import { installAutoGrow } from './lib/autoGrow'
import { installEffects } from './lib/fx'
import { installModalGlow } from './lib/modalGlow'

installSessionExpiryHandler()
installAutoCapitalize()
installAutoGrow()
installPressFeedback()
startLiveFeed()
// Optional motion layer (src/ui-effects/, switch in effectsConfig.js)
installEffects()
installModalGlow()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
