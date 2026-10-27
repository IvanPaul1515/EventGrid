import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { MonitorSmartphone, ShieldCheck, Loader2 } from 'lucide-react';
import { useScanner } from './ScannerContext';
import { useEdition } from '../../context/EditionContext';
import { ScannerDialog } from './ScannerDialog';

export function ScannerPrompts() {
  const { presentation, notice, state, stations, connected, dismissed, dismissSuggestion, pending, message, act } = useScanner();
  const { currentEvent } = useEdition();
  const navigate = useNavigate();
  const [now, setNow] = useState(Date.now());
  const [choosing, setChoosing] = useState(false);
  const link = state.link;
  useEffect(() => { if (!link || link.status === 'LINKED') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [link?.id, link?.status]);
  const seconds = link ? Math.max(0, Math.ceil((Date.parse(link.expiresAt) - now) / 1000)) : 0;
  if (state.station?.pc && link && link.status !== 'LINKED') return <ScannerDialog label="Autorizar escáner">
    <ShieldCheck className="w-9 h-9 text-primary" /><h2 className="text-xl font-bold">Nuevo dispositivo solicita vinculación</h2>
    <dl className="text-sm space-y-2"><div><dt className="text-muted-foreground">Cuenta</dt><dd>{link.user}</dd></div><div><dt className="text-muted-foreground">Dispositivo</dt><dd>Dispositivo solicitante · escáner móvil</dd></div><div><dt className="text-muted-foreground">Estación</dt><dd>{state.station.label}</dd></div><div><dt className="text-muted-foreground">Edición</dt><dd>{currentEvent?.name}</dd></div></dl>
    <p className="text-center rounded-xl bg-background border border-border p-4"><strong className="tracking-[.35em] text-3xl">{link.code}</strong></p>
    <p role="status" className="text-sm text-muted-foreground">{!seconds ? 'La solicitud ha vencido.' : link.status === 'APPROVED' ? 'Autorizado. Esperando confirmación del teléfono.' : `Solicitud pendiente · vence en ${seconds} s`}</p>
    {message && <p role="alert" className="text-destructive">{message}</p>}
    <div className="flex gap-3"><button disabled={pending || !seconds || link.status !== 'REQUESTED'} className="btn-primary flex-1" onClick={() => void act('/'+link.id+'/decide',{approve:true})}>{pending && <Loader2 className="w-4 h-4 animate-spin" />}Autorizar</button><button disabled={pending} className="btn-secondary flex-1" onClick={() => void act('/'+link.id+'/decide',{approve:false})}>Rechazar</button></div>
  </ScannerDialog>;
  if (notice) return <p role="status" className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">{notice}</p>;
  if (presentation.device !== 'phone' || dismissed || !connected || link || !stations.length) return null;
  return <ScannerDialog label="Hay una computadora disponible" onCancel={dismissSuggestion}>
    <MonitorSmartphone className="w-10 h-10 text-primary" /><h2 className="text-xl font-bold">Hay una computadora disponible</h2>
    <p className="text-sm text-muted-foreground">Hemos detectado una sesión de EventGrid en una computadora. ¿Cómo quieres utilizar este teléfono?</p>
    {choosing && <div className="space-y-2">{stations.map(station => <button key={station.id} className="btn-secondary w-full" onClick={() => { dismissSuggestion(); navigate('/reception',{state:{openScannerLink:true}}); void act('/request',{stationId:station.id}); }}>Vincular a {station.label}</button>)}</div>}
    <div className="grid gap-3"><button className="btn-primary" onClick={() => { if (stations.length > 1) setChoosing(true); else { dismissSuggestion(); navigate('/reception',{state:{openScannerLink:true}}); void act('/request',{stationId:stations[0].id}); } }}>Vincular como escáner</button><button className="btn-secondary" onClick={dismissSuggestion}>Usar EventGrid normalmente</button></div>
  </ScannerDialog>;
}
