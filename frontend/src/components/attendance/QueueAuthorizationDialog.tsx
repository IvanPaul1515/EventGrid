import {useReceptionQueue} from './ReceptionQueueContext';
import {useEdition} from '../../context/EditionContext';
import {ScannerDialog} from './ScannerDialog';
export function QueueAuthorizationDialog(){
 const q=useReceptionQueue(),{currentEvent}=useEdition();
 const request=q.state.devices.find(d=>d.status==='REQUESTED'||d.status==='APPROVED');
 if(!request)return null;
 return <ScannerDialog label="Autorizar escáner de cola"><h2 className="text-xl font-bold">Nuevo dispositivo solicita vinculación</h2><p>{request.name} · {q.state.station?.label} · {currentEvent?.name}</p><p className="text-center text-3xl tracking-[.35em] font-mono"><strong>{request.code}</strong></p><p className="text-sm text-muted-foreground">{request.status==='APPROVED'?'Esperando confirmación del teléfono.':'Comprueba la identidad del colaborador antes de autorizar.'} Vence a las {new Date(request.expiresAt).toLocaleTimeString('es-DO')}.</p>{q.error&&<p role="alert" className="text-destructive">{q.error}</p>}<div className="flex gap-3"><button className="btn-primary flex-1" disabled={q.pending||request.status!=='REQUESTED'} onClick={()=>void q.act('/devices/'+request.id+'/decide',{approve:true}).catch(()=>{})}>Autorizar</button><button className="btn-secondary flex-1" disabled={q.pending} onClick={()=>void q.act('/devices/'+request.id+'/decide',{approve:false}).catch(()=>{})}>Rechazar</button></div></ScannerDialog>;
}
