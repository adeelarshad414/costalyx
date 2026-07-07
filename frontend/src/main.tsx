import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { UserPreferencesProvider } from './preferences/UserPreferences';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <UserPreferencesProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </UserPreferencesProvider>
  </React.StrictMode>
);
