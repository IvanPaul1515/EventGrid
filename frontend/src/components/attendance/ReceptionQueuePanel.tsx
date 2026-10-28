import {returnToReception} from '../../utils/queueReturn';
import {QueueOperationalRows} from './QueueOperationalRows';
import {QueueInventorySummary} from './QueueInventorySummary';
import {useEffect,useRef,useState} from 'react';
import {ListOrdered,ScanLine,Loader2} from 'lucide-react';
import {useReceptionQueue,QueueRow} from './ReceptionQueueContext';
import {useAuth} from '../../context/AuthContext';
import {api} from '../../services/api';
import {useEdition} from '../../context/EditionContext';
import {ScannerDialog} from './ScannerDialog';
import {QueueScanFlow} from './QueueScanFlow';
import {QueueQuickConfirm} from './QueueQuickConfirm';
import {QueuePairingInvitation,PairingInvitation} from './QueuePairingInvitation';
import {qrFeedback} from '../../utils/qrFeedback';
const labels:Record<string,string>={WAITING:'En espera',CLAIMED:'En atención',CONFIRMED:'Asistencia confirmada',INCIDENT:'Incidencia',REJECTED:'Entrada cancelada o rechazada'};
export function ReceptionQueuePanel({onOpen,drawerOpen,onSale}:{onSale?:()=>void;onOpen:(id:string)=>Promise<void>;drawerOpen:boolean}){
 const q=useReceptionQueue(),{user}=useAuth(),{currentEvent}=useEdition();
 const [context,setContext]=useState({search:'',selected:null as QueueRow|null});
 const {search,selected}=context;const setSearch=(search:string)=>setContext(v=>({...v,search})),setSelected=(selected:QueueRow|null)=>setContext(v=>({...v,selected}));
 const [label,setLabel]=useState('Recepción PC'),[scan,setScan]=useState(false),[status,setStatus]=useState(''),[opening,setOpening]=useState(false);
 const [incident,setIncident]=useState<QueueRow|null>(null),[reason,setReason]=useState('');
 const [paymentRequested,setPaymentRequested]=useState(false);
 const claim=useRef<string|null>(null),seenOpen=useRef(false),base=`/events/${currentEvent?.id}/reception-queue`;
 useEffect(()=>{if(!claim.current)return;if(drawerOpen)seenOpen.current=true;else if(seenOpen.current){const id=claim.current;claim.current=null;seenOpen.current=false;void api.post(base+'/entries/'+id+'/release').catch(()=>{}).finally(()=>void q.refresh());}},[drawerOpen]);
 useEffect(()=>{const timer=setInterval(()=>{if(claim.current&&(drawerOpen||selected))void api.post(base+'/entries/'+claim.current+'/claim').catch(()=>setStatus('La reserva de atención venció o cambió. Revisa la cola antes de confirmar.'));},25000);return()=>clearInterval(timer);},[base,drawerOpen,selected?.id]);
 const open=async(row:QueueRow,collect=false)=>{if(opening||drawerOpen)return;setOpening(true);setStatus('');try{await q.act('/entries/'+row.id+'/claim');claim.current=row.id;seenOpen.current=false;setPaymentRequested(collect);setSelected(row);}catch{setStatus('No se pudo abrir: puede estar en atención en otra estación.');if(claim.current){await api.post(base+'/entries/'+claim.current+'/release').catch(()=>{});claim.current=null;}}finally{setOpening(false);}};
 useEffect(()=>{claim.current=null;setContext({search:'',selected:null});},[currentEvent?.id,user?.id]);
 const pending=q.rows.filter(r=>['WAITING','CLAIMED'].includes(r.state));
 const filtered=q.rows.filter(r=>!['CONFIRMED','REJECTED'].includes(r.state)&&(r.name+' '+r.number).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const [changing,setChanging]=useState(false),[inviteOpen,setInviteOpen]=useState(false);
 const [inviteValue,setInviteValue]=useState<PairingInvitation|null>(null);
 const queued=q.state.station?.mode==='QUEUE';
 useEffect(()=>{if(q.state.devices.some(d=>d.status==='REQUESTED'))setInviteOpen(false);if(!queued)setInviteOpen(false);},[q.state.devices,queued]);
 useEffect(()=>{if(q.state.station?.label)setLabel(q.state.station.label);},[q.state.station?.id,q.state.station?.label]);
 const change=(mode:string,confirmed=false)=>{if(queued&&mode==='DIRECT'&&!confirmed&&(q.state.devices.length||q.rows.some(r=>r.mine&&r.state==='CLAIMED'))){setChanging(true);return;}void q.act('/station',{label,mode,confirmed}).then(()=>setChanging(false)).catch(()=>{});};
 const invitation=async()=>{try{const value=await q.act('/invite');setInviteValue(value);setInviteOpen(true);}catch{}};
 return <section className="scanner-ui space-y-5" aria-label="Recepción colaborativa">
  <div className="flex flex-wrap items-center justify-between gap-3">
   {queued&&<div><h1 className="text-2xl font-bold">Recepción por cola</h1><p className="text-sm text-muted-foreground">{q.state.station?.label} · {q.connected?'Conectado en tiempo real':'Sin conexión'}</p></div>}
   <label className="block space-y-2 w-full sm:w-64 text-sm font-medium">Modalidad de recepción<select aria-label="Modalidad de recepción" className="input-field" value={q.state.station?.mode||'DIRECT'} disabled={q.pending||drawerOpen||Boolean(selected)} onChange={e=>change(e.target.value)}><option value="DIRECT">Recepción directa</option><option value="QUEUE">Recepción por cola</option></select></label>
  </div>
  {queued&&<div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[{label:'Participantes pendientes',value:q.rows.filter(r=>r.state==='WAITING').length},{label:'En atención',value:q.rows.filter(r=>r.state==='CLAIMED').length},{label:'Confirmados recientemente',value:q.rows.filter(r=>r.state==='CONFIRMED').length},{label:'Escáneres conectados',value:q.state.devices.filter(d=>d.status==='LINKED').length}].map(item=><div key={item.label} className="rounded-2xl border border-border bg-card p-4"><p className="text-sm text-muted-foreground">{item.label}</p><strong className="text-2xl">{item.value}</strong></div>)}</div>}
  {queued&&<QueueInventorySummary/>}
  {queued&&currentEvent?.settings?.allowOnsitePayments&&onSale&&<button className="btn-secondary w-full sm:w-auto" onClick={onSale}>Nueva venta presencial</button>}
  {q.error&&<p role="alert" className="text-destructive">{q.error}</p>}{status&&<p role="status" className="text-sm text-muted-foreground">{status}</p>}
  {queued&&<div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start"><div className="min-w-0 rounded-2xl border border-border bg-card p-4 space-y-4">
   <div className="flex gap-3 items-center"><ListOrdered className="text-primary"/><h2 className="text-lg font-bold">Cola de recepción</h2><span role="status" className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">{pending.length} pendientes</span></div>
   <label className="block space-y-2 text-sm">Buscar en la cola<input className="input-field" placeholder="Nombre o número de entrada" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   {!q.connected&&<p role="alert" className="text-destructive">Sin conexión. No se confirmará asistencia sin respuesta del servidor.</p>}
   <QueueOperationalRows rows={filtered} disabled={q.pending||opening||drawerOpen||Boolean(selected)} onAttend={row=>void open(row)} onPayment={row=>void open(row,true)} onIncident={row=>{setReason('');setIncident(row);}} timeZone={currentEvent?.settings?.timeZone}/>
   {!filtered.length&&<p className="text-sm text-muted-foreground">No hay entradas pendientes que coincidan.</p>}
   {q.rows.some(r=>['CONFIRMED','REJECTED'].includes(r.state))&&<details className="text-sm"><summary className="cursor-pointer p-2">Resultados recientes</summary>{q.rows.filter(r=>['CONFIRMED','REJECTED'].includes(r.state)).slice(-20).reverse().map(r=><p key={r.id} className="p-2">{r.number} · {labels[r.state]}</p>)}</details>}
  </div><aside aria-label="Dispositivos de escaneo" className="rounded-2xl border border-border bg-card p-4 space-y-4 min-w-0">
   <h2 className="font-bold">Escáneres de la estación</h2><button className="btn-primary w-full" disabled={q.pending} onClick={()=>void invitation()}>Agregar escáner</button>
   <section className="space-y-2"><h3 className="text-sm font-semibold">Conectados</h3>{q.state.devices.filter(d=>d.status==='LINKED').map(d=><div key={d.id} className="rounded-xl border border-border p-3 space-y-2"><p className="break-words">Escáner de {d.name} · {d.deviceLabel||'Escáner móvil'} · Conectado</p><button className="btn-secondary w-full" disabled={q.pending} onClick={()=>void q.act('/devices/'+d.id+'/unlink').catch(()=>{})}>Desvincular dispositivo</button></div>)}{!q.state.devices.some(d=>d.status==='LINKED')&&<p className="text-sm text-muted-foreground">Ninguno conectado.</p>}</section>
   <section className="space-y-2"><h3 className="text-sm font-semibold">Solicitudes pendientes</h3>{q.state.devices.filter(d=>d.status!=='LINKED').map(d=><p key={d.id} className="text-sm break-words">{d.name} · {d.status==='APPROVED'?'Esperando código':'Requiere autorización'}</p>)}{!q.state.devices.some(d=>d.status!=='LINKED')&&<p className="text-sm text-muted-foreground">Sin solicitudes.</p>}</section>
   <section className="space-y-2"><h3 className="text-sm font-semibold">Disponibles para vincular</h3>{q.state.availableDevices?.map(d=><div key={d.id} className="text-sm rounded-xl border border-border p-3 space-y-2"><p>{d.name}</p><button className="btn-secondary w-full" onClick={()=>void invitation()}>Preparar invitación</button></div>)}{!q.state.availableDevices?.length&&<p className="text-sm text-muted-foreground">Aquí aparecerán quienes entren voluntariamente como escáner QR.</p>}</section>
   <details><summary className="text-sm font-semibold cursor-pointer py-2">Configuración de la estación</summary><label className="block space-y-2 text-sm mt-3">Nombre de la estación<input aria-label="Nombre de la estación" className="input-field" value={label} maxLength={60} onChange={e=>setLabel(e.target.value)}/></label><button className="btn-secondary w-full mt-3" disabled={q.pending||label.trim().length<2} onClick={()=>void q.act('/station',{label,mode:'QUEUE'}).catch(()=>{})}>Guardar estación</button><button className="btn-secondary w-full mt-3" onClick={()=>setScan(true)}>Escanear para la cola</button></details>
  </aside></div>}
  {changing&&<ScannerDialog label="Cambiar modalidad" onCancel={()=>setChanging(false)}><h2 className="text-xl font-bold">¿Volver a recepción directa?</h2><p>Se desvincularán solamente los escáneres de esta estación y se liberará su atención. La cola, las entradas y las otras computadoras se conservarán.</p><div className="flex gap-3"><button className="btn-secondary" onClick={()=>setChanging(false)}>Cancelar</button><button className="btn-primary" disabled={q.pending} onClick={()=>change('DIRECT',true)}>Confirmar cambio</button></div></ScannerDialog>}
  {inviteOpen&&inviteValue&&<QueuePairingInvitation value={inviteValue} pending={q.pending} active={Boolean(q.state.invitation)} onRegenerate={()=>void invitation()} onClose={()=>void q.act('/invite/revoke').then(()=>setInviteOpen(false)).catch(()=>{})}/>}

  {incident&&<ScannerDialog label="Incidencia de recepción" onCancel={()=>setIncident(null)}><h2 className="text-xl font-bold">Marcar incidencia</h2><p>{incident.name} · {incident.number}</p><label className="block space-y-2">Motivo<input className="input-field" autoFocus value={reason} maxLength={300} onChange={e=>setReason(e.target.value)}/></label><p className="text-sm text-muted-foreground">La entrada se conservará para revisión. No se registra asistencia.</p><div className="flex gap-3"><button className="btn-secondary" onClick={()=>setIncident(null)}>Cancelar</button><button className="btn-primary" disabled={q.pending||reason.trim().length<5} onClick={()=>void q.act('/entries/'+incident.id+'/incident',{reason}).then(()=>setIncident(null)).catch(()=>{})}>Guardar incidencia</button></div></ScannerDialog>}
  {selected&&<QueueQuickConfirm key={selected.id} row={selected} startPayment={paymentRequested} onClose={()=>{const id=claim.current;claim.current=null;setSelected(null);if(id)void api.post(base+'/entries/'+id+'/release').catch(()=>{}).finally(()=>void q.refresh());}} onFull={async()=>{await onOpen(selected.registrationId);setSelected(null);}} onCommitted={()=>{claim.current=null;}} onIncident={()=>{setReason('');setIncident(selected);setSelected(null);}} onConfirmed={message=>{claim.current=null;setContext(returnToReception);setStatus(message);void q.refresh();}}/>}
  <QueueScanFlow allowManual isOpen={scan} onClose={()=>setScan(false)} onResult={result=>setStatus(result.status==='QUEUED'?`${result.number} · ${result.result}`:qrFeedback(result.result).title)}/>
 </section>;
}
