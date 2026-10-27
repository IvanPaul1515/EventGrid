import { Smartphone, MonitorSmartphone, ScanLine, Unlink, CheckCircle2, Clock3, WifiOff, AlertTriangle, Loader2, Link2, ChevronDown, Camera } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useScanner } from './ScannerContext';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { QrScanModal } from '../qr/QrScanModal';

export function LinkedScannerPanel({ eventId, busy, onRead, onLinkedMode }: {
  eventId: string; busy: boolean; onRead: (id: string) => Promise<void>; onLinkedMode: (linked: boolean) => void;
}) {
  const location = useLocation();
  const { state, stations, connected, pending, message, presentation, refresh, act, setBusy } = useScanner();
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const [transmitting, setTransmitting] = useState(false);
  const [lastReadError, setLastReadError] = useState('');
  const [readError, setReadError] = useState('');
  const [expanded, setExpanded] = useState(false), [code, setCode] = useState(''), [scan, setScan] = useState(false), [now, setNow] = useState(Date.now());
  const seen = useRef<string | null>(null), callback = useRef(onRead); callback.current = onRead;
  const modeCallback = useRef(onLinkedMode); modeCallback.current = onLinkedMode;
  useEffect(() => { modeCallback.current(Boolean(state.link?.status === 'LINKED' && !state.station?.pc)); }, [state.link?.status, state.station?.pc]);
  useEffect(() => { setBusy(busy); }, [busy, setBusy]);
  useEffect(() => () => { setBusy(true); }, [eventId]);
  const openReading = async (id: string) => { try { await callback.current(id); setReadError(''); } catch { setReadError('No se pudo abrir la ficha. Compruebe la conexión y reintente.'); } };
  useEffect(() => {
    if (!state.link || !connected) setScan(false);
    const reading = state.reading;
    if (state.station?.pc && reading?.status === 'PENDING' && reading.registrationId && !busy && seen.current !== reading.id) {
      seen.current = reading.id;
      void openReading(reading.registrationId);
    }
  }, [state, busy, connected]);
  useEffect(() => { if (location.state?.openScannerLink) setExpanded(true); }, [location.key, location.state]);
  useEffect(() => { setExpanded(Boolean(location.state?.openScannerLink)); setCode(''); setScan(false); seen.current = null; }, [eventId]);
  useEffect(() => { if (!state.link || state.link.status === 'LINKED') return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state.link?.id, state.link?.status]);
  useEffect(() => { setLastReadError(''); }, [state.reading?.id, state.reading?.status]);
  const link = state.link;
  const seconds = link ? Math.max(0, Math.ceil((Date.parse(link.expiresAt) - now) / 1000)) : 0;
  const isPC = presentation.device === 'desktop' || (presentation.device === 'ambiguous' && Boolean(state.station?.pc));
  const showPanel = expanded || Boolean(link && !state.station?.pc);
  const mobileLinked = link?.status === 'LINKED' && !state.station?.pc;
  const result = state.reading;
  const currentStatus = !connected ? { title:navigator.onLine?'Conexión con la PC no disponible':'Sin conexión', detail:'Comprueba la conexión. No se ha confirmado ninguna asistencia.', icon:WifiOff, tone:'text-destructive' }
    : transmitting ? { title:'QR identificado', detail:'Enviando la lectura a la computadora.', icon:Loader2, tone:'text-primary' }
    : scan ? { title:'Cámara activa', detail:'Apunta al QR de la entrada.', icon:Camera, tone:'text-primary' }
    : message ? { title:'Operación no completada', detail:message, icon:AlertTriangle, tone:'text-destructive' }
    : lastReadError ? { title:lastReadError.includes('ocupada') ? 'PC ocupada' : 'Lectura no disponible', detail:lastReadError, icon:AlertTriangle, tone:'text-destructive' }
    : pending ? { title:'Actualizando vinculación', detail:'Espera un momento.', icon:Loader2, tone:'text-primary' }
    : result?.status === 'PENDING' ? { title:'Esperando confirmación', detail:'Lectura enviada. Confirma la asistencia desde la computadora.', icon:Clock3, tone:'text-primary' }
    : result?.status === 'CONFIRMED' ? { title:'Asistencia confirmada', detail:'La PC confirmó el ingreso. Puedes leer la siguiente entrada.', icon:CheckCircle2, tone:'text-emerald-500' }
    : result?.status === 'REJECTED' ? { title:result.result === 'ALREADY_CHECKED_IN' ? 'Participante que ya asistió' : 'QR inválido', detail:'No se ha registrado una nueva asistencia. Revisa la entrada y vuelve a escanear.', icon:AlertTriangle, tone:'text-destructive' }
    : { title:result?.status === 'DISMISSED' ? 'Lectura descartada' : 'Vinculado y listo', detail:'Escanea las entradas. La asistencia se confirma desde la computadora.', icon:ScanLine, tone:'text-primary' };
  const StateIcon = currentStatus.icon;
  const unlink = () => { setScan(false); setConfirmUnlink(true); };
  return <section className={mobileLinked ? 'space-y-5' : 'rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3 text-sm'} aria-label="Vinculación de escáner móvil">
    {mobileLinked ? <>
      <header className="flex items-center gap-3 pt-4"><div className="p-3 rounded-2xl bg-primary/10 text-primary"><Smartphone className="w-7 h-7" /></div><div><h1 className="text-2xl font-bold">Escáner móvil</h1><span className="inline-flex items-center gap-1 text-sm text-primary"><Link2 className="w-4 h-4" />Vinculado</span></div></header>
      <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs uppercase tracking-wide text-muted-foreground">Estación</p><p className="font-semibold mt-1 break-words">{state.station?.label}</p></div>
      <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-card px-5 py-8 text-center space-y-3"><StateIcon className={'w-10 h-10 mx-auto '+currentStatus.tone+(pending?' animate-spin':'')} /><h2 className="text-lg font-semibold">{currentStatus.title}</h2><p className="text-sm text-muted-foreground">{currentStatus.detail}</p></div>
      <div className="space-y-3"><button className="w-full min-h-16 rounded-2xl bg-primary text-primary-foreground font-semibold text-lg flex items-center justify-center gap-3 disabled:opacity-50" disabled={!connected || pending || result?.status === 'PENDING'} onClick={() => { setLastReadError(''); setScan(true); }}><ScanLine className="w-6 h-6" />Leer QR</button>
      <button className="w-full min-h-14 rounded-2xl border border-border bg-card font-semibold flex items-center justify-center gap-2 disabled:opacity-50" disabled={pending} onClick={unlink}><Unlink className="w-5 h-5" />Desvincular</button></div>
    </> : <>
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><MonitorSmartphone className="w-5 h-5 text-primary" /><div><p className="font-semibold">Escáner móvil</p><p className="text-xs text-muted-foreground">{state.station?.pc ? link?.status === 'LINKED' ? 'Teléfono vinculado' : 'Estación de recepción disponible' : 'Vincula un teléfono a esta recepción'}</p></div></div>
        <button className="btn-secondary inline-flex items-center gap-2" disabled={pending} aria-expanded={showPanel} onClick={() => { setExpanded(v=>!v); void refresh(); if(isPC&&!state.station?.pc)void act('/station',{label:'Recepción PC'}); }}>{pending?<Loader2 className="w-4 h-4 animate-spin" />:<ChevronDown className="w-4 h-4" />}{isPC&&!state.station?.pc?'Habilitar escáner móvil':isPC?'Escáner móvil':'Vincular teléfono a una PC'}</button>
      </div>
      {presentation.detected === 'ambiguous' && <label className="block text-xs text-muted-foreground">Dispositivo<select aria-label="Tipo de dispositivo" className="input-field text-base ml-2 max-w-48" value={presentation.override} onChange={e=>presentation.choose(e.target.value)}><option value="">Detección automática</option><option value="desktop">PC o laptop</option><option value="phone">Teléfono</option></select></label>}
      {readError && <p role="alert" className="text-destructive">{readError} <button className="btn-secondary" onClick={()=>{if(state.reading?.registrationId)void openReading(state.reading.registrationId);}}>Reintentar abrir ficha</button></p>}
      {showPanel && <div className="border-t border-border pt-3 space-y-3">
        {!connected&&<p role="status" className="text-destructive">Sin conexión con la estación. <button onClick={()=>void refresh()} className="underline">Reintentar</button></p>}
        {message&&<p role="alert" className="text-destructive">{message}</p>}
        {!isPC&&state.station?.pc&&<button className="btn-secondary" disabled={pending} onClick={()=>void act('/station/disable')}>Deshabilitar estación de esta sesión y usar como teléfono</button>}
        {!isPC&&!link&&!state.station?.pc&&<div className="space-y-2">{stations.map(station=><button key={station.id} disabled={pending} className="btn-secondary w-full flex items-center gap-2" onClick={()=>void act('/request',{stationId:station.id})}><MonitorSmartphone className="w-4 h-4 text-primary" />Vincular a {station.label}</button>)}{!stations.length&&<p className="text-muted-foreground">Para vincular este teléfono, abre Recepción rápida en tu PC y selecciona Habilitar escáner móvil.</p>}</div>}
        {link&&<div className="space-y-3">
          <p className="text-sm text-muted-foreground">{state.station?.pc?'Teléfono de '+link.user:'Estación: '+state.station?.label} · {link.status==='LINKED'?'Vinculado':'Código temporal ('+seconds+' s)'}</p>
          {!state.station?.pc&&['REQUESTED','APPROVED'].includes(link.status)&&<form className="space-y-2" onSubmit={e=>{e.preventDefault();void act('/'+link.id+'/confirm',{code});}}><label className="block text-sm">Código mostrado en la PC<input className="input-field text-base tracking-widest" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} /></label><button className="btn-primary w-full" disabled={pending||link.status!=='APPROVED'||code.length!==6}>Confirmar vinculación</button></form>}
          {state.reading&&<div role="status" className="rounded-xl bg-background border border-border p-3 flex gap-3"><StateIcon className={'w-5 h-5 shrink-0 '+currentStatus.tone} /><div><p className="font-medium">{currentStatus.title}</p><p className="text-xs text-muted-foreground">{currentStatus.detail}</p></div></div>}
          <div className="flex flex-wrap gap-2">{state.station?.pc&&state.reading?.status==='PENDING'&&<button className="btn-secondary" disabled={pending} onClick={()=>void act('/'+link.id+'/dismiss')}>Descartar lectura pendiente</button>}<button className="btn-secondary inline-flex items-center gap-2" disabled={pending} onClick={unlink}><Unlink className="w-4 h-4" />Desvincular</button></div>
        </div>}
      </div>}
    </>}
    {confirmUnlink&&link&&<div role="dialog" aria-modal="true" aria-label="Desvincular escáner" className="fixed inset-0 z-[90] bg-black/60 p-4 flex items-center justify-center"><div className="bg-card border border-border rounded-2xl p-5 max-w-sm space-y-4"><h2 className="font-semibold text-lg">¿Desvincular este escáner?</h2><p className="text-sm text-muted-foreground">Volverás a EventGrid normal. Ninguna de las dos sesiones se cerrará.</p><div className="flex gap-3"><button className="btn-secondary flex-1" onClick={()=>setConfirmUnlink(false)}>Continuar vinculado</button><button className="btn-primary flex-1" disabled={pending} onClick={()=>{setConfirmUnlink(false);setScan(false);void act('/'+link.id+'/unlink');}}>Desvincular</button></div></div></div>}
    {link&&state.station?.pc&&link.status!=='LINKED'&&<div role="dialog" aria-modal="true" aria-label="Autorizar escáner" className="fixed inset-0 z-[80] bg-black/60 p-4 flex items-center justify-center"><div className="bg-card text-foreground border border-border rounded-2xl p-5 max-w-md space-y-4"><div className="flex gap-2 items-center"><Smartphone className="text-primary" /><h2 className="font-semibold text-lg">Solicitud de vinculación</h2></div><p className="text-sm text-muted-foreground">Comprueba que reconoces el teléfono antes de autorizar.</p><p className="text-center rounded-xl bg-background border border-border p-4"><strong className="tracking-[.35em] text-2xl">{link.code}</strong></p><div className="flex gap-3"><button disabled={pending||!seconds||link.status!=='REQUESTED'} className="btn-primary flex-1" onClick={()=>void act('/'+link.id+'/decide',{approve:true})}>Autorizar</button><button disabled={pending} className="btn-secondary flex-1" onClick={()=>void act('/'+link.id+'/decide',{approve:false})}>Rechazar</button></div></div></div>}
    <QrScanModal isOpen={scan&&connected&&link?.status==='LINKED'} onClose={()=>setScan(false)} onLinkedRead={async token=>{
      if(!link)throw new Error('Dispositivo desvinculado');
      setTransmitting(true);
      try {
        const result=(await api.post(`/events/${eventId}/scanner/`+link.id+'/read',{token,requestKey:crypto.randomUUID()})).data.data;
        await refresh();
        if(result.status==='REJECTED'){
          const messages:Record<string,string>={ALREADY_CHECKED_IN:'Esta entrada ya tiene asistencia registrada.',INVALID_CODE:'El código QR no es válido.',CANCELLED:'La entrada está cancelada.',EDITION_MISMATCH:'La entrada pertenece a otra edición.'};
          throw {response:{data:{message:messages[result.result]||'Lectura rechazada. No se ha confirmado asistencia.'}}};
        }
        setScan(false);setLastReadError('');return result.result;
      } catch(error:any){setLastReadError(error.response?.status===409?'La PC está ocupada. Espera a que termine la operación.':error.response?.data?.message||'No se pudo enviar la lectura. Comprueba la conexión.');throw error;} finally {setTransmitting(false);}
    }} />
  </section>;
}
