import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import WhatTheFudgeTrivia from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <WhatTheFudgeTrivia />
  </StrictMode>
)
