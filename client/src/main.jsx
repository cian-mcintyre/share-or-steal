import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'   // <-- add this line

const root = createRoot(document.getElementById('root'))
root.render(<App />)