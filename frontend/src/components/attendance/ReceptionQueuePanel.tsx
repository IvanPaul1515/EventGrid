import {useEffect,useRef,useState} from 'react';
import {ListOrdered,ScanLine,Loader2} from 'lucide-react';
import {useReceptionQueue,QueueRow} from './ReceptionQueueContext';
import {useAuth} from '../../context/AuthContext';
import {api} from '../../services/api';
import {useEdition} from '../../context/EditionContext';
import {ScannerDialog} from './ScannerDialog';
import {QrScanModal} from '../qr/QrScanModal';
import {qrFeedback} from '../../utils/qrFeedback';
const labels:Record<string,string>={WAITING:'En espera',CLAIMED:'En atención',CONFIRMED:'Asistencia confirmada',INCIDENT:'Incidencia',REJECTED:'Entrada cancelada o rechazada'};
export function ReceptionQueuePanel({onOpen,drawerOpen}:{onOpen:(id:string)=>Promise<void>;drawerOpen:boolean}){
 const q=useReceptionQueue(),{user}=useAuth(),{currentEvent}=useEdition();
 const [search,setSearch]=useState(''),[label,setLabel]=useState('Recepción PC'),[scan,setScan]=useState(false),[status,setStatus]=useState(''),[opening,setOpening]=useState(false);
 const [incident,setIncident]=useState<QueueRow|null>(null),[reason,setReason]=useState('');
 const claim=useRef<string|null>(null),seenOpen=useRef(false),base=`/events/${currentEvent?.id}/reception-queue`;
 useEffect(()=>{if(!claim.current)return;if(drawerOpen)seenOpen.current=true;else if(seenOpen.current){const id=claim.current;claim.current=null;seenOpen.current=false;void api.post(base+'/entries/'+id+'/release').catch(()=>{}).finally(()=>void q.refresh());}},[drawerOpen]);
 useEffect(()=>{const timer=setInterval(()=>{if(claim.current&&drawerOpen)void api.post(base+'/entries/'+claim.current+'/claim').catch(()=>setStatus('La reserva de atención venció o cambió. Revisa la cola antes de confirmar.'));},25000);return()=>clearInterval(timer);},[base,drawerOpen]);
 const open=async(row:QueueRow)=>{if(opening||drawerOpen)return;setOpening(true);setStatus('');try{await q.act('/entries/'+row.id+'/claim');claim.current=row.id;seenOpen.current=false;await onOpen(row.registrationId);}catch{setStatus('No se pudo abrir: puede estar en atención en otra estación.');if(claim.current){await api.post(base+'/entries/'+claim.current+'/release').catch(()=>{});claim.current=null;}}finally{setOpening(false);}};
 const pending=q.rows.filter(r=>['WAITING','CLAIMED'].includes(r.state));
 const filtered=q.rows.filter(r=>!['CONFIRMED','REJECTED'].includes(r.state)&&(r.name+' '+r.number).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const request=q.state.devices.find(d=>d.status==='REQUESTED'||d.status==='APPROVED');
 return <section className="scanner-ui rounded-2xl border border-border bg-card p-4 space-y-4" aria-label="Recepción colaborativa">
  <div className="flex flex-wrap items-end gap-3"><label className="block space-y-2 flex-1 min-w-48 text-sm font-medium">Modalidad de recepción<select aria-label="Modalidad de recepción" className="input-field" value={q.state.station?.mode||'DIRECT'} disabled={q.pending} onChange={e=>void q.act('/station',{label,mode:e.target.value}).catch(()=>{})}><option value="DIRECT">Recepción directa</option><option value="QUEUE">Recepción por cola</option></select></label>
   {user?.role==='ADMIN'&&<button className="btn-secondary" disabled={q.pending} onClick={()=>void q.act('/policy',{enabled:!q.state.enabled}).catch(()=>{})}>{q.state.enabled?'Deshabilitar cola de esta edición':'Habilitar cola de esta edición'}</button>}
   <button className="btn-secondary" onClick={()=>q.setScannerOpen(true)}>Vincular como escáner de cola</button>
  </div>
  {q.error&&<p role="alert" className="text-destructive">{q.error}</p>}{status&&<p role="status" className="text-sm text-muted-foreground">{status}</p>}
  {q.state.station?.mode==='QUEUE'&&<>
   <div className="flex flex-wrap items-end gap-3"><label className="block flex-1 space-y-2 text-sm">Nombre de la estación<input aria-label="Nombre de la estación" className="input-field" value={label} maxLength={60} onChange={e=>setLabel(e.target.value)}/></label><button className="btn-secondary" disabled={q.pending||label.trim().length<2} onClick={()=>void q.act('/station',{label,mode:'QUEUE'}).catch(()=>{})}>Guardar estación</button><button className="btn-primary" disabled={!q.state.enabled||!q.connected} onClick={()=>setScan(true)}><ScanLine className="w-5 h-5"/>Escanear para la cola</button></div>
   <p className="text-sm text-muted-foreground">Comparte esta estación con colaboradores autorizados. Cada teléfono requiere aprobación y código; las lecturas se acumulan sin abrir fichas automáticamente.</p>
   <div className="flex gap-2 flex-wrap">{q.state.devices.filter(d=>d.status==='LINKED').map(d=><div key={d.id} className="rounded-xl border border-border px-3 py-2 text-sm">{d.name}<button className="btn-secondary ml-2" onClick={()=>void q.act('/devices/'+d.id+'/unlink').catch(()=>{})}>Revocar vínculo</button></div>)}</div>
   <div className="flex gap-3 items-center"><ListOrdered className="text-primary"/><h2 className="text-lg font-bold">Cola de recepción</h2><span role="status" className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm">{pending.length} pendientes</span></div>
   <label className="block space-y-2 text-sm">Buscar en la cola<input className="input-field" placeholder="Nombre o número de entrada" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   {!q.connected&&<p role="alert" className="text-destructive">Sin conexión. No se confirmará asistencia sin respuesta del servidor.</p>}
   <div className="max-h-96 overflow-y-auto divide-y divide-border">{filtered.map(row=><div key={row.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2"><button className="flex-1 min-w-0 text-left rounded-xl p-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60" disabled={q.pending||opening||drawerOpen||row.state==='CLAIMED'&&!row.mine} onClick={()=>void open(row)}><span className="flex flex-wrap justify-between gap-2"><strong>{row.name}</strong><span className="text-sm text-primary">{labels[row.state]||'Incidencia'}</span></span><span className="text-sm text-muted-foreground flex flex-wrap gap-x-3"><span>{row.number}</span><time>{new Date(row.scannedAt).toLocaleTimeString('es-DO')}</time><span>{row.station}</span>{Date.now()-Date.parse(row.scannedAt)<30000&&<span className="text-primary">Nueva lectura</span>}</span></button><button className="btn-secondary" disabled={q.pending||drawerOpen||row.state==='CLAIMED'&&!row.mine} onClick={()=>{setReason('');setIncident(row);}}>Incidencia</button></div>)}</div>
   {!filtered.length&&<p className="text-sm text-muted-foreground">No hay entradas pendientes que coincidan.</p>}
   {q.rows.some(r=>['CONFIRMED','REJECTED'].includes(r.state))&&<details className="text-sm"><summary className="cursor-pointer p-2">Resultados recientes</summary>{q.rows.filter(r=>['CONFIRMED','REJECTED'].includes(r.state)).slice(-20).reverse().map(r=><p key={r.id} className="p-2">{r.number} · {labels[r.state]}</p>)}</details>}
  </>}
  {incident&&<ScannerDialog label="Incidencia de recepción" onCancel={()=>setIncident(null)}><h2 className="text-xl font-bold">Marcar incidencia</h2><p>{incident.name} · {incident.number}</p><label className="block space-y-2">Motivo<input className="input-field" autoFocus value={reason} maxLength={300} onChange={e=>setReason(e.target.value)}/></label><p className="text-sm text-muted-foreground">La entrada se conservará para revisión. No se registra asistencia.</p><div className="flex gap-3"><button className="btn-secondary" onClick={()=>setIncident(null)}>Cancelar</button><button className="btn-primary" disabled={q.pending||reason.trim().length<5} onClick={()=>void q.act('/entries/'+incident.id+'/incident',{reason}).then(()=>setIncident(null)).catch(()=>{})}>Guardar incidencia</button></div></ScannerDialog>}
  <QrScanModal allowManual isOpen={scan} onClose={()=>setScan(false)} onLinkedRead={async token=>{try{const result=await q.read(token);setStatus(result.status==='QUEUED'?`${result.number} · ${result.result}`:qrFeedback(result.result).title);setScan(false);return 'Lectura procesada';}catch{setStatus(qrFeedback('NETWORK').message);setScan(false);return 'Sin confirmación';}}}/>
 </section>;
}
