// Registro del Service Worker para PWA
export function registerServiceWorker() {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      const swUrl = '/sw.js';
      navigator.serviceWorker
        .register(swUrl, { updateViaCache: 'none' })
        .then((registration) => {
          if (registration.waiting) {
            window.dispatchEvent(new CustomEvent('eventgrid:pwa-update-available'));
          }
          // Escuchar si hay una nueva versión disponible
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker == null) return;

            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // Contenido nuevo disponible
                  console.info('[PWA] Nueva versión de EventGrid disponible.');
                  window.dispatchEvent(new CustomEvent('eventgrid:pwa-update-available'));
                } else {
                  console.info('[PWA] Interfaz disponible sin conexión. Las operaciones requieren conexión al servidor.');
                }
              }
            };
          };
        })
        .catch((error) => {
          console.warn('[PWA] Error registrando Service Worker:', error);
        });
    });
  }
}
