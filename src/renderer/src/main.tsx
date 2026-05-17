import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StatusHud } from './components/StatusHud'
import './styles/globals.css'

const hudMode = new URLSearchParams(window.location.search).get('hud') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {hudMode ? <StatusHud /> : <App />}
  </React.StrictMode>
)
