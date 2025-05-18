import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Register service worker from Vite PWA plugin
if ("serviceWorker" in navigator) {
  // This function is provided by the vite-plugin-pwa
  const updateSW = registerSW({
    onNeedRefresh() {
      if (window.confirm('New app version available! Reload to update?')) {
        updateSW(true);
      }
    },
    onOfflineReady() {
      console.log('App ready to work offline');
      // You could show a notification here
    },
    onRegistered(registration) {
      console.log('Service Worker registered with scope:', registration.scope);
      
      // Set up background sync when back online
      if (registration.sync && navigator.onLine) {
        registration.sync.register('sync-readings')
          .catch(err => console.error('Background sync registration failed:', err));
      }
    },
    onRegisterError(error) {
      console.error('Service Worker registration failed:', error);
    }
  });
}

// Add offline/online event listeners for app-level state
window.addEventListener('online', () => {
  console.log('App is online');
  
  // Attempt to register background sync when coming back online
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready
      .then(reg => {
        if (reg.sync) {
          reg.sync.register('sync-readings')
            .catch(err => console.error('Background sync registration failed:', err));
        }
      })
      .catch(err => console.error('Failed to register sync:', err));
  }
});

window.addEventListener('offline', () => {
  console.log('App is offline');
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
