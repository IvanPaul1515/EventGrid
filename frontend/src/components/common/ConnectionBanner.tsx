import React, { useState, useEffect } from 'react';
import { WifiOff, ServerCrash, RefreshCw, Sparkles, X } from 'lucide-react';
import { api } from '../../services/api';

export const ConnectionBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSlowServer, setIsSlowServer] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleUpdate = () => setUpdateAvailable(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('eventgrid:pwa-update-available', handleUpdate);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        if (registration?.waiting) setUpdateAvailable(true);
      }).catch(() => {});
    }

    // Monitoreo inicial de latencia del servidor (detecta cold start de Render)
    let isCancelled = false;
    const startTimer = setTimeout(() => {
      if (!isCancelled) setIsSlowServer(true);
    }, 2800);

    api.get('/health')
      .then(() => {
        isCancelled = true;
        clearTimeout(startTimer);
        setIsSlowServer(false);
      })
      .catch(() => {
        isCancelled = true;
        clearTimeout(startTimer);
        setIsSlowServer(false);
        // Si el health falla completamente, no mostrar slow sino offline/error
      });

    return () => {
      isCancelled = true;
      clearTimeout(startTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('eventgrid:pwa-update-available', handleUpdate);
    };
  }, []);

  const handleApplyUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          }, { once: true });
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          return;
        }
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  };

  if (isOffline) {
    return (
      <div className="bg-amber-500/15 border-b border-amber-500/30 px-3 py-2 text-xs text-amber-400 flex items-center justify-center gap-2 font-medium z-30">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>Sin conexión a internet. Algunas funciones no están disponibles.</span>
      </div>
    );
  }

  if (isSlowServer) {
    return (
      <div className="bg-blue-500/15 border-b border-blue-500/30 px-3 py-2 text-xs text-blue-400 flex items-center justify-center gap-2 font-medium z-30 animate-pulse">
        <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
        <span>Conectando con el servidor. Esto puede tardar unos segundos...</span>
      </div>
    );
  }

  if (updateAvailable) {
    return (
      <div className="bg-primary/15 border-b border-primary/30 px-3 py-2 text-xs text-foreground flex items-center justify-between gap-3 font-medium z-30">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary shrink-0" />
          <span>Hay una nueva versión de EventGrid lista para usarse.</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleApplyUpdate}
            className="px-2.5 py-1 bg-primary hover:bg-primary-hover text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
          >
            Actualizar ahora
          </button>
          <button
            onClick={() => setUpdateAvailable(false)}
            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return null;
};
