import { api } from '../../services/api';
import {useEffect,useState} from 'react';
import {ScanLine,Unlink,Wifi,WifiOff,Loader2} from 'lucide-react';
import {useReceptionQueue} from './ReceptionQueueContext';
import {useEdition} from '../../context/EditionContext';
import {useAuth} from '../../context/AuthContext';
import {QueueScanFlow} from './QueueScanFlow';
import {ScannerDialog} from './ScannerDialog';
import {qrFeedback,qrFailureStatus} from '../../utils/qrFeedback';
import {QrScanModal} from '../qr/QrScanModal';
import {pairingCredential,scannerDeviceLabel} from '../../utils/pairingQr';
export function QueueScannerWorkspace(){
 const q=useReceptionQueue(),{currentEvent}=useEdition(),{user,logout}=useAuth();
 const [scan,setScan]=useState(false),[code,setCode]=useState(''),[unlink,setUnlink]=useState(false),[now,setNow]=useState(Date.now()),[inviteCode,setInviteCode]=useState('');
 const [pairScan,setPairScan]=useState(false);
 const [feedback,setFeedback]=useState<{title:string;message:string}|null>(null),device=q.state.device;
 useEffect(()=>{setCode('');},[device?.id]);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!q.connected||device?.status!=='LINKED'||!q.state.enabled)setScan(false);},[q.connected,device?.status,q.state.enabled]);
 useEffect(()=>{
  if(!currentEvent)return;const base=`/events/${currentEvent.id}/reception-queue`;
  const announce=()=>{if(navigator.onLine&&document.visibilityState==='visible')void api.post(base+'/discoverable',{active:true}).catch(()=>{});};
  announce();const timer=setInterval(announce,30000);window.addEventListener('online',announce);
  return()=>{clearInterval(timer);window.removeEventListener('online',announce);void api.post(base+'/discoverable',{active:false}).catch(()=>{});};
 },[currentEvent?.id]);
 const seconds=device?Math.max(0,Math.ceil((Date.parse(device.expiresAt)-now)/1000)):0;
 return <main className="scanner-ui scanner-workspace max-w-lg mx-auto w-full min-h-[100dvh] px-4 py-6 flex flex-col gap-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
  <header className="space-y-2"><ScanLine className="w-8 h-8 text-primary"/><h1 className="text-xl font-bold">{device?.status==='LINKED'?'Escáner QR':'Vincular escáner QR'}</h1><p className="text-muted-foreground">{currentEvent?.name}</p></header>
  <div role="status" className="rounded-2xl border border-border bg-card p-4 space-y-2"><p className="flex gap-2 items-center">{q.connected?<Wifi className="w-5 h-5 text-primary"/>:<WifiOff className="w-5 h-5 text-destructive"/>}{q.connected?'Conectado':'Sin conexión'}</p><p>{device?'Conectado a: '+device.station.label:'Selecciona una estación autorizada'}</p><p className="text-sm text-muted-foreground">La lectura solo envía la entrada a recepción. La asistencia se confirma en la computadora.</p></div>
  {q.error&&<p role="alert" className="text-destructive">{q.error}</p>}
  {!device&&q.state.lastDeviceStatus&&<p role="status">{q.state.lastDeviceStatus==='EXPIRED'?'Solicitud vencida.':'Solicitud rechazada o dispositivo desvinculado.'} Puedes solicitar una nueva vinculación.</p>}
  {!q.ready&&<p role="status">Consultando estaciones…</p>}
  {!device&&<div className="space-y-3"><button className="btn-primary w-full min-h-16" disabled={q.pending||!q.connected} onClick={()=>setPairScan(true)}><ScanLine/>Escanear QR de vinculación</button><p className="text-sm text-muted-foreground">En la PC, pulsa Agregar escáner. Escanea su QR y espera la autorización del operador.</p></div>}
  {!device&&<details><summary className="cursor-pointer text-sm">Alternativa sin cámara</summary><p className="text-sm text-muted-foreground">Introduce el código alternativo mostrado en la PC y espera su autorización. No necesitarás otro código.</p><form className="space-y-3" onSubmit={e=>{e.preventDefault();void q.act('/join',{code:inviteCode,deviceLabel:scannerDeviceLabel()}).catch(()=>{});}}><label className="block space-y-2">Código de invitación de la estación<input aria-label="Código de invitación" className="input-field font-mono uppercase tracking-widest" value={inviteCode} maxLength={10} autoComplete="off" onChange={e=>setInviteCode(e.target.value.replace(/[^a-f0-9]/gi,'').toUpperCase())}/></label><button className="btn-secondary w-full" disabled={q.pending||![8,10].includes(inviteCode.length)}>Solicitar vinculación por código</button></form></details>}
  {device?.status==='REQUESTED'&&<p role="status">Solicitud enviada · Esperando autorización de la PC.</p>}
  {device?.status==='APPROVED'&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void q.act('/devices/'+device.id+'/confirm',{code}).catch(()=>{});}}><label className="block space-y-2 font-medium">Código de seguridad mostrado en la PC<input aria-label="Código de cola" autoFocus className="input-field scanner-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={e=>setCode(e.target.value.replace(/\D/g,''))}/></label><p role="status" className="text-sm text-muted-foreground">{seconds?`Autorizado · quedan ${seconds} s`:'Solicitud vencida.'}</p><button className="btn-primary w-full" disabled={q.pending||!seconds||code.length!==6||device.status!=='APPROVED'}>{q.pending&&<Loader2 className="w-4 h-4 animate-spin"/>}Confirmar vinculación</button></form>}
  {device?.status==='LINKED'&&<p role="status" className="text-primary font-semibold">Escáner vinculado correctamente</p>}
  {device?.status==='LINKED'&&<button className="btn-primary w-full min-h-16 text-lg" disabled={!q.connected||!q.state.enabled||q.pending} onClick={()=>setScan(true)}><ScanLine/>Comenzar a escanear entradas</button>}

  {!device&&!user?.scannerOnly&&<button className="btn-secondary w-full" onClick={()=>q.setScannerOpen(false)}>Continuar normalmente</button>}

  {q.stats&&<section aria-label="Mis estadísticas de escaneo" className="rounded-2xl border border-border bg-card p-4 space-y-3"><h2 className="font-semibold">Mi actividad de hoy</h2><div className="grid grid-cols-3 gap-2 text-center">{[{label:'Mis lecturas de hoy',value:q.stats.reads},{label:'Entradas válidas enviadas',value:q.stats.sent},{label:'Lecturas rechazadas',value:q.stats.rejected}].map(item=><div key={item.label}><strong className="block text-2xl text-primary">{item.value}</strong><span className="text-xs text-muted-foreground">{item.label}</span></div>)}</div><p className="text-xs text-muted-foreground">Esta sesión: {q.stats.sessionReads||0} · Repetidas: {q.stats.repeated} · Confirmadas por la mesa: {q.stats.confirmedByDesk} · Lecturas históricas: {q.stats.total}</p><p className="text-xs text-muted-foreground">{q.stats.today} · {q.stats.timeZone}. El escáner no confirma asistencia.</p></section>}
  <footer className="mt-auto pt-6 border-t border-border space-y-3">  {device&&<button className="btn-secondary w-full" disabled={q.pending} onClick={()=>setUnlink(true)}><Unlink className="w-5 h-5"/>Desvincular</button>}  {user&&<button className="btn-secondary w-full" onClick={()=>void logout()}>Cerrar sesión</button>}</footer>
  {unlink&&device&&<ScannerDialog label="Desvincular escáner de cola" onCancel={()=>setUnlink(false)}><h2 className="text-xl font-bold">¿Desvincular este escáner?</h2><p>La sesión y las entradas pendientes se conservarán.</p><div className="flex gap-3"><button className="btn-secondary" onClick={()=>setUnlink(false)}>Cancelar</button><button className="btn-primary" onClick={()=>{void q.act('/devices/'+device.id+'/unlink').then(()=>q.setScannerOpen(false)).catch(()=>{});setUnlink(false);}}>Desvincular</button></div></ScannerDialog>}
  {feedback&&<ScannerDialog label={feedback.title}><ScanLine className="w-12 h-12 mx-auto text-primary"/><h2 className="text-xl font-bold text-center">{feedback.title}</h2><p className="text-center">{feedback.message}</p><button className="btn-primary w-full" disabled={!q.connected||!q.state.enabled||device?.status!=='LINKED'} onClick={()=>{setFeedback(null);setScan(true);}}>Escanear siguiente</button><button className="btn-secondary w-full" onClick={()=>setFeedback(null)}>Volver al escáner</button></ScannerDialog>}
  <QrScanModal purpose="PAIRING" isOpen={pairScan&&!device} onClose={()=>setPairScan(false)} onLinkedRead={async raw=>{try{const code=pairingCredential(raw,currentEvent!.id);await q.act('/join',{code,deviceLabel:scannerDeviceLabel()});setPairScan(false);}catch(e:any){setPairScan(false);setFeedback({title:'No se pudo vincular',message:e.response?qrFeedback(qrFailureStatus(e)).message:e.message==='Network Error'?qrFeedback('NETWORK').message:e.message||'Comprueba la invitación e intenta nuevamente.'});}return 'Solicitud de vinculación procesada';}}/>
  <QueueScanFlow isOpen={scan} onClose={()=>setScan(false)} onResult={result=>setFeedback(result.status==='QUEUED'?{title:result.result==='Entrada validada'?'Entrada validada — Enviada a recepción':'Esta entrada ya está en la cola',message:`${result.number} · ${result.result}`}:qrFeedback(result.result))}/>
 </main>;
}
