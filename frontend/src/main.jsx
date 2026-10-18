import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/material-icons';
import './styles/global.css';
import './styles/global-dark.css';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { UiProvider } from './context/UiContext.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <UiProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </UiProvider>
    </BrowserRouter>
  </React.StrictMode>
);
