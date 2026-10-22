import React from 'react';

export interface AppLoadingScreenProps {
  message?: string;
  submessage?: string;
  fullScreen?: boolean;
  compact?: boolean;
}

export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({
  message = 'Cargando plataforma...',
  submessage = 'BarCamp República Dominicana 2026',
  fullScreen = true,
  compact = false,
}) => {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
        <div className="relative">
          <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin motion-reduce:animate-none" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="w-2 h-2 rounded-full bg-primary" />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground font-display">{message}</p>
          {submessage && <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{submessage}</p>}
        </div>
      </div>
    );
  }

  const containerClasses = fullScreen
    ? 'fixed inset-0 z-50 flex flex-col items-center justify-center bg-background text-foreground p-4 overflow-hidden select-none'
    : 'min-h-[400px] w-full flex flex-col items-center justify-center bg-background/50 rounded-2xl p-6 text-foreground';

  return (
    <div className={containerClasses} role="status" aria-live="polite">
      {/* Halo ambiental BarCamp */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[480px] h-[320px] sm:h-[480px] bg-primary/10 rounded-full blur-[90px] sm:blur-[120px] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center max-w-sm text-center">
        {/* Logo oficial BarCamp RD 2026 adaptado a tema oscuro y claro */}
        <div className="relative mb-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-card border border-border/70 flex items-center justify-center p-3 shadow-xl ring-1 ring-primary/20 motion-safe:animate-pulse motion-reduce:animate-none">
            <img
              src="/barcamp-logo-white.svg"
              alt="BarCamp 2026"
              className="w-full h-full object-contain on-dark-only drop-shadow-[0_2px_12px_rgba(237,41,23,0.35)]"
            />
            <img
              src="/barcamp-logo-black.svg"
              alt="BarCamp 2026"
              className="w-full h-full object-contain on-light-only"
            />
          </div>
        </div>

        {/* Marca y Plataforma */}
        <h2 className="text-lg sm:text-xl font-display font-extrabold tracking-tight text-foreground flex items-center gap-1.5">
          <span>EVENTGRID</span>
          <span className="text-primary font-mono text-sm px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            2026
          </span>
        </h2>

        {/* Mensaje contextual */}
        <p className="text-xs sm:text-sm font-medium text-foreground/90 mt-2 font-display">
          {message}
        </p>
        {submessage && (
          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono tracking-wider uppercase">
            {submessage}
          </p>
        )}

        {/* Indicador de progreso estilizado */}
        <div className="w-48 sm:w-56 h-1 bg-muted/60 rounded-full overflow-hidden mt-6 relative border border-border/40">
          <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-[#BA1513] rounded-full w-2/5 animate-[loading-bar_1.5s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
};
