import { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { ScannerDialog } from './ScannerDialog';
import { useReceptionQueue, QueueRow } from './ReceptionQueueContext';
import { useEdition } from '../../context/EditionContext';
import { useAuth } from '../../context/AuthContext';
import type { QueueShirts } from './QueueScanFlow';
import {PaymentStatusBadge} from '../participants/PaymentStatusBadge';
import {RecordPaymentModal} from '../participants/RecordPaymentModal';
import {participantsService} from '../../services/participants.service';
import {PaymentMethod} from '../../types';
import {ShirtDeliveryChoice,DeliveryChoice,NON_DELIVERY_REASONS} from './ShirtDeliveryChoice';
import {useRealtimeRefresh} from '../../context/RealtimeContext';
type Detail={name:string;number:string;canCheckIn:boolean;blockedReason?:string;selectedTshirtSize?:string;shirts:QueueShirts;payment?:{isCourtesy:boolean;paymentStatus:string;balanceDue:number;external:boolean};canCollect?:boolean;paymentMethods?:PaymentMethod[]};
export function QueueQuickConfirm({row,onClose,onFull,onConfirmed,startPayment=false}:{startPayment?:boolean;row:QueueRow;onClose:()=>void;onFull:()=>Promise<void>;onConfirmed:(message:string)=>void}){
 const q=useReceptionQueue(),{currentEvent}=useEdition(),{user}=useAuth();
 const [detail,setDetail]=useState<Detail|null>(null),[size,setSize]=useState(''),[decision,setDecision]=useState<DeliveryChoice>(null),[reason,setReason]=useState(''),[notes,setNotes]=useState('');
 const [error,setError]=useState(''),[sending,setSending]=useState(false),[paymentOpen,setPaymentOpen]=useState(startPayment);
 const lock=useRef(false),paymentKey=useRef(crypto.randomUUID()),base=`/events/${currentEvent?.id}/reception-queue/entries/${row.id}`;
 useEffect(()=>{let active=true;api.get(base+'/details').then(res=>{if(active){setDetail(res.data.data);setSize(res.data.data.selectedTshirtSize||'');}}).catch(()=>{if(active)setError('No se pudo consultar la entrada. Vuelve a la cola y reintenta.');});return()=>{active=false;};},[base]);
 useRealtimeRefresh('attendance',async()=>{const fresh=(await api.get(base+'/details')).data.data;setDetail(fresh);});
 const needsDecision=Boolean(detail?.shirts.enabled&&!detail.shirts.delivered),deliver=decision==='DELIVER';
 const availability=detail?.shirts.sizes.find(item=>item.size===size)?.available||0;
 const needsNotes=['Agotada','Talla no disponible','Otro motivo'].includes(reason);
 const validDecision=!needsDecision||decision==='DELIVER'&&Boolean(size)&&availability>0||decision==='NO_DELIVERY'&&Boolean(reason)&&(!needsNotes||notes.trim().length>=5);
 const confirm=async()=>{if(lock.current||!detail||!validDecision)return;lock.current=true;setSending(true);setError('');try{const result=await q.act('/entries/'+row.id+'/confirm',{confirmed:true,tshirtSize:needsDecision?size||undefined:undefined,tshirtDelivered:needsDecision&&deliver,deliveryDecision:needsDecision?{decision,reason:deliver?undefined:reason,notes:deliver?undefined:notes}:undefined});onConfirmed(result.message);}catch(e:any){setError(e.response?.data?.message||'Sin confirmación del servidor. Consulta el estado antes de reintentar.');}finally{lock.current=false;setSending(false);}};
 if(paymentOpen&&detail?.payment&&detail.canCollect)return <RecordPaymentModal isOpen requireMethodChoice responsibleName={user?.fullName} participantName={row.name} registrationNumber={row.number} balanceDue={detail.payment.balanceDue} paymentMethods={detail.paymentMethods||[]} onClose={()=>setPaymentOpen(false)} onConfirm={async(amount,method,paymentNotes)=>{await participantsService.recordPayment(row.registrationId,{amount,paymentMethodId:method,notes:paymentNotes,requestKey:paymentKey.current,source:'RECEPTION_QUEUE'});const fresh=(await api.get(base+'/details')).data.data;setDetail(fresh);paymentKey.current=crypto.randomUUID();void q.refresh();window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));}}/>;
 return <ScannerDialog label="Confirmar entrada" onCancel={sending?undefined:onClose}>
  <h2 className="text-xl font-bold">Confirmar entrada</h2><h3 className="text-xl font-semibold break-words">{row.name}</h3><p className="font-mono text-lg">{row.number}</p>
  {!detail&&!error&&<p role="status">Validando entrada…</p>}
  {detail&&<>
   {detail.payment&&<div className="flex flex-wrap items-center gap-3"><PaymentStatusBadge registration={detail.payment} verbose/>{detail.payment.external&&<span className="text-xs text-muted-foreground">Plataforma externa · conciliación autorizada</span>}{detail.canCollect&&<button className="btn-secondary" disabled={sending} onClick={()=>setPaymentOpen(true)}>Registrar pago</button>}</div>}
   <p role="status" className={detail.canCheckIn?'text-primary font-semibold':'text-destructive font-semibold'}>{detail.canCheckIn?'Entrada válida':detail.blockedReason}</p>
   {detail.shirts.enabled&&(detail.shirts.delivered?<p className="font-semibold">Camiseta entregada · {detail.selectedTshirtSize||'Talla registrada'}</p>:<div className="space-y-3">
    <ShirtDeliveryChoice value={decision} onChange={setDecision} disabled={sending}/>
    <label className="block space-y-2 font-semibold">Talla solicitada<select className="input-field text-lg" value={size} disabled={sending} onChange={e=>setSize(e.target.value)}><option value="" disabled>Seleccionar talla</option>{detail.shirts.sizes.map(item=><option key={item.size} value={item.size}>{item.size} · {item.available} disponibles</option>)}</select></label>
    {deliver&&<><p className="text-sm">Disponibles: {availability} · <strong>Se descontará 1 unidad al confirmar</strong></p>{availability<1&&<p className="text-destructive">Talla agotada. Corrige la talla o selecciona No entregar camiseta.</p>}</>}
    {decision==='NO_DELIVERY'&&<><label className="block space-y-2">Motivo de no entrega<select className="input-field" required value={reason} onChange={e=>setReason(e.target.value)}><option value="" disabled>Seleccionar motivo</option>{NON_DELIVERY_REASONS.map(value=><option key={value}>{value}</option>)}</select></label><label className="block space-y-2">Observaciones {needsNotes?'(obligatorias)':'(opcional)'}<textarea className="input-field" maxLength={500} required={needsNotes} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Explica lo ocurrido"/></label><p className="text-sm text-muted-foreground">No se descontará inventario. La decisión quedará registrada con tu usuario y fecha.</p></>}
   </div>)}
   <button className="btn-primary w-full min-h-14" disabled={sending||!q.connected||!detail.canCheckIn||!validDecision} onClick={()=>void confirm()}>{sending?'Confirmando…':!needsDecision?'Confirmar asistencia':deliver?'Confirmar asistencia y entrega':'Confirmar asistencia sin entregar camiseta'}</button>
  </>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <button className="btn-secondary w-full min-h-12" disabled={sending} onClick={()=>void onFull().catch(()=>setError('No se pudo abrir la ficha completa.'))}>Revisar ficha completa</button><button className="btn-secondary w-full min-h-12" disabled={sending} onClick={onClose}>Volver a la cola</button>
 </ScannerDialog>;
}
