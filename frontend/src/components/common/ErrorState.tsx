import React from 'react';
import { AlertTriangle, WifiOff, ServerCrash, ShieldAlert, RefreshCw } from 'lucide-react';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
  type?: 'connection' | 'server' | 'auth' | 'general';
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title,
  message,
  onRetry,
  retrying = false,
  type = 'general',
  className = '',
}) => {
  const getIcon = () => {
    switch (type) {
      case 'connection':
        return <WifiOff className="w-6 h-6 text-amber-500" />;
      case 'server':
        return <ServerCrash className="w-6 h-6 text-rose-500" />;
      case 'auth':
        return <ShieldAlert className="w-6 h-6 text-rose-500" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-primary" />;
    }
  };

  const defaultTitle =
    title ||
    (type === 'connection'
      ? 'Problema de conexión con el servidor'
      : type === 'server'
      ? 'Error al procesar la solicitud'
      : type === 'auth'
      ? 'Sesión expirada o no autorizada'
      : 'Ocurrió un error al cargar la información');

  const defaultMessage =
    message ||
    (type === 'connection'
      ? 'No fue posible comunicar con el backend de EventGrid. Verifique que el servicio esté en línea.'
      : 'El sistema no pudo completar la operación solicitada. Puede intentar nuevamente.');

  return (
    <div
      className={`p-6 sm:p-10 text-center rounded-2xl bg-destructive/10 border border-destructive/25 flex flex-col items-center justify-center max-w-lg mx-auto ${className}`}
      role="alert"
    >
      <div className="w-14 h-14 rounded-2xl bg-destructive/15 border border-destructive/30 flex items-center justify-center mb-4">
        {getIcon()}
      </div>

      <h3 className="text-base sm:text-lg font-display font-bold text-foreground">
        {defaultTitle}
      </h3>

      <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
        {defaultMessage}
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="mt-5 px-4 py-2 rounded-xl bg-card hover:bg-muted border border-border text-foreground text-xs font-semibold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          <span>{retrying ? 'Reintentando...' : 'Reintentar'}</span>
        </button>
      )}
    </div>
  );
};
