import React from 'react';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { failureCopy, FailureKind } from '../../utils/appError';
interface Props { kind: FailureKind; onRetry?: () => void; home?: string; fullScreen?: boolean; }
export function ErrorPanel({ kind, onRetry, home = '/', fullScreen = false }: Props) {
  const copy = failureCopy[kind];
  const button = 'inline-flex justify-center rounded-xl px-4 py-2.5 text-sm font-semibold border border-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
  return <section role="alert" className={`${fullScreen ? 'min-h-[100dvh] p-5 flex flex-col justify-center' : 'my-8 p-5 sm:p-8 rounded-2xl border border-border'} bg-background text-foreground text-center`}>
    <div className="mx-auto w-full max-w-lg space-y-4">
      <p className="text-xs font-display font-bold tracking-widest text-muted-foreground">EVENTGRID</p>
      {kind === '401' ? <LockKeyhole aria-hidden="true" className="w-8 h-8 text-primary mx-auto" /> : <AlertTriangle aria-hidden="true" className="w-9 h-9 text-primary mx-auto" />}
      {kind === '404' && <p className="text-3xl font-mono text-primary">{kind}</p>}
      <h1 className="text-xl sm:text-2xl font-display font-bold">{copy.title}</h1>
      <p className="text-sm text-muted-foreground">{copy.message}</p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        {kind === '404' && <button className={button} onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign(home)}>Volver atrás</button>}
        {onRetry && kind !== '401' && kind !== '403' && <button className={`${button} bg-primary text-primary-foreground hover:opacity-90`} onClick={onRetry}>{['network', '503', 'timeout'].includes(kind) ? 'Reintentar conexión' : 'Reintentar'}</button>}
        <a className={`${button} ${kind === '401' ? 'bg-primary text-primary-foreground' : 'bg-card'}`} href={kind === '401' ? '/login' : home}>{kind === '401' ? 'Volver a iniciar sesión' : home === '/login' ? 'Ir al inicio' : 'Volver al panel'}</a>
      </div>
    </div>
  </section>;
}
