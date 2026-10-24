import React, { useEffect, useState } from 'react';
import { Layers } from 'lucide-react';
import { useEdition } from '../../context/EditionContext';
import { ErrorPanel } from './ErrorPanel';
export interface AppLoadingScreenProps { message?: string; submessage?: string; fullScreen?: boolean; compact?: boolean; }
export const AppLoadingScreen: React.FC<AppLoadingScreenProps> = ({ message = 'Cargando plataforma...', submessage, fullScreen = true, compact = false }) => {
  const { currentEvent } = useEdition();
  const [slow, setSlow] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    const deadline = setTimeout(() => setTimedOut(true), 35000);
    return () => { clearTimeout(slowTimer); clearTimeout(deadline); };
  }, []);
  if (timedOut) return <ErrorPanel kind={navigator.onLine ? 'timeout' : 'offline'} fullScreen={fullScreen && !compact} onRetry={() => window.location.reload()} />;
  if (compact) return <div role="status" aria-live="polite" className="flex flex-col items-center justify-center p-8 gap-3 text-center">
    <div aria-hidden="true" className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin motion-reduce:animate-none" />
    <p className="text-xs font-semibold text-foreground">{message}</p>
    {(slow || submessage) && <p className="text-xs text-muted-foreground">{slow ? 'La conexión está tardando más de lo habitual.' : submessage}</p>}
  </div>;
  return <div role="status" aria-live="polite" className={`${fullScreen ? 'fixed inset-0 z-50' : 'min-h-[400px] w-full rounded-2xl'} flex flex-col items-center justify-center bg-background text-foreground p-5 overflow-hidden`}>
    <div className="relative flex flex-col items-center max-w-sm text-center">
      <div className="w-16 h-16 mb-6 rounded-2xl bg-card border border-border flex items-center justify-center text-primary shadow-xl"><Layers aria-hidden="true" className="w-9 h-9" /></div>
      <h2 className="text-xl font-display font-extrabold tracking-tight">EVENTGRID</h2>
      {currentEvent?.name?.trim() && <p className="text-sm text-muted-foreground mt-1">{currentEvent.name}</p>}
      <p className="text-sm font-medium mt-3">{message}</p>
      {submessage && <p className="text-[11px] text-muted-foreground mt-1">{submessage}</p>}
      {slow && <p className="text-xs text-muted-foreground mt-3">La conexión está tardando más de lo habitual.</p>}
      <div aria-hidden="true" className="w-48 h-1 bg-muted rounded-full overflow-hidden mt-6 relative"><div className="absolute inset-y-0 left-0 bg-primary rounded-full w-2/5 animate-[loading-bar_1.5s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:animate-none" /></div>
    </div>
  </div>;
};
