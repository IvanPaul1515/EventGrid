import {useEffect,useState} from 'react';
import {ScanLine,Unlink,Wifi,WifiOff,Loader2} from 'lucide-react';
import {useReceptionQueue} from './ReceptionQueueContext';
import {useEdition} from '../../context/EditionContext';
import {useAuth} from '../../context/AuthContext';
import {QrScanModal} from '../qr/QrScanModal';
import {ScannerDialog} from './ScannerDialog';
import {qrFeedback} from '../../utils/qrFeedback';
export function QueueScannerWorkspace(){
 const q=useReceptionQueue(),{currentEvent}=useEdition(),{user,logout}=useAuth();
 const [scan,setScan]=useState(false),[code,setCode]=useState(''),[unlink,setUnlink]=useState(false),[now,setNow]=useState(Date.now());
 const [feedback,setFeedback]=useState<{title:string;message:string}|null>(null),device=q.state.device;
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!q.connected||device?.status!=='LINKED'||!q.state.enabled)setScan(false);},[q.connected,device?.status,q.state.enabled]);
 const seconds=device?Math.max(0,Math.ceil((Date.parse(device.expiresAt)-now)/1000)):0;
 return <main className="scanner-ui scanner-workspace max-w-lg mx-auto p-4 space-y-5 pb-safe-content">
  <header className="space-y-2"><ScanLine className="w-10 h-10 text-primary"/><h1 className="text-2xl font-bold">Escáner de recepción</h1><p className="text-muted-foreground">{currentEvent?.name}</p></header>
  <div role="status" className="rounded-2xl border border-border bg-card p-4 space-y-2"><p className="flex gap-2 items-center">{q.connected?<Wifi className="w-5 h-5 text-primary"/>:<WifiOff className="w-5 h-5 text-destructive"/>}{q.connected?'Conectado':'Sin conexión'}</p><p>{device?.station.label||'Selecciona una estación autorizada'}</p><p className="text-sm text-muted-foreground">La lectura solo envía la entrada a recepción. La asistencia se confirma en la computadora.</p></div>
  {q.error&&<p role="alert" className="text-destructive">{q.error}</p>}
  {!q.ready&&<p role="status">Consultando estaciones…</p>}
  {!device&&<div className="space-y-3"><h2 className="font-semibold">Estaciones disponibles</h2>{q.stations.map(s=><button className="btn-secondary w-full" disabled={q.pending} key={s.id} onClick={()=>void q.act('/request',{stationId:s.id}).catch(()=>{})}>Vincular a {s.label}</button>)}{q.ready&&!q.stations.length&&<p className="text-sm text-muted-foreground">No hay estaciones de cola disponibles. Pide al responsable que habilite Recepción por cola.</p>}</div>}
  {device&&device.status!=='LINKED'&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void q.act('/devices/'+device.id+'/confirm',{code}).catch(()=>{});}}><label className="block space-y-2 font-medium">Introduce el código de tu computadora<input aria-label="Código de cola" autoFocus className="input-field scanner-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><p role="status" className="text-sm text-muted-foreground">{device.status==='REQUESTED'?'Esperando autorización del responsable.':seconds?`Autorizado · quedan ${seconds} s`:'Solicitud vencida.'}</p><button className="btn-primary w-full" disabled={q.pending||!seconds||code.length!==6||device.status!=='APPROVED'}>{q.pending&&<Loader2 className="w-4 h-4 animate-spin"/>}Confirmar vinculación</button></form>}
  {device?.status==='LINKED'&&<button className="btn-primary w-full min-h-16 text-lg" disabled={!q.connected||!q.state.enabled||q.pending} onClick={()=>setScan(true)}><ScanLine/>Escanear QR</button>}
  {device&&<button className="btn-secondary w-full" disabled={q.pending} onClick={()=>setUnlink(true)}><Unlink className="w-5 h-5"/>Desvincular</button>}
  {!device&&!user?.scannerOnly&&<button className="btn-secondary w-full" onClick={()=>q.setScannerOpen(false)}>Continuar normalmente</button>}
  {user?.scannerOnly&&<button className="btn-secondary w-full" onClick={()=>void logout()}>Cerrar sesión</button>}
  {unlink&&device&&<ScannerDialog label="Desvincular escáner de cola" onCancel={()=>setUnlink(false)}><h2 className="text-xl font-bold">¿Desvincular este escáner?</h2><p>La sesión y las entradas pendientes se conservarán.</p><div className="flex gap-3"><button className="btn-secondary" onClick={()=>setUnlink(false)}>Cancelar</button><button className="btn-primary" onClick={()=>{void q.act('/devices/'+device.id+'/unlink').then(()=>q.setScannerOpen(false)).catch(()=>{});setUnlink(false);}}>Desvincular</button></div></ScannerDialog>}
  {feedback&&<ScannerDialog label={feedback.title}><ScanLine className="w-12 h-12 mx-auto text-primary"/><h2 className="text-xl font-bold text-center">{feedback.title}</h2><p className="text-center">{feedback.message}</p><button className="btn-primary w-full" disabled={!q.connected||!q.state.enabled||device?.status!=='LINKED'} onClick={()=>{setFeedback(null);setScan(true);}}>Escanear siguiente</button><button className="btn-secondary w-full" onClick={()=>setFeedback(null)}>Volver al escáner</button></ScannerDialog>}
  <QrScanModal isOpen={scan} onClose={()=>setScan(false)} onLinkedRead={async token=>{try{const result=await q.read(token);setScan(false);setFeedback(result.status==='QUEUED'?{title:'Entrada validada',message:`${result.number} · ${result.result==='Entrada validada'?'Enviada a recepción':result.result}`}:qrFeedback(result.result));return 'Lectura procesada';}catch{setScan(false);setFeedback(qrFeedback('NETWORK'));return 'Sin confirmación';}}}/>
 </main>;
}
