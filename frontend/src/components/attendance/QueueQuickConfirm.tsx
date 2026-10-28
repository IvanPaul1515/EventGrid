import {selectShirtSize} from '../../utils/shirtSelection';
import {useEffect,useRef,useState} from 'react';
import {api} from '../../services/api';
import {ScannerDialog} from './ScannerDialog';
import {useReceptionQueue,QueueRow} from './ReceptionQueueContext';
import {useEdition} from '../../context/EditionContext';
import {useAuth} from '../../context/AuthContext';
import type {QueueShirts} from './QueueScanFlow';
import {SpeakerReception} from '../participants/SpeakerReception';
import {PaymentStatusBadge} from '../participants/PaymentStatusBadge';
import {RecordPaymentModal} from '../participants/RecordPaymentModal';
import {participantsService} from '../../services/participants.service';
import {PaymentMethod} from '../../types';
import {ShirtDeliveryChoice,DeliveryChoice,NON_DELIVERY_REASONS} from './ShirtDeliveryChoice';
import {useRealtimeRefresh} from '../../context/RealtimeContext';

type Receipt={name:string;number:string;shirt:{status:string;size:string|null;reason:string|null};cap:{status:string}};
type Detail={category?:string;name:string;number:string;officialOrder:number|null;cap:{eligible:boolean;delivered:boolean;pendingVerification?:boolean}|null;canCheckIn:boolean;blockedReason?:string;selectedTshirtSize?:string;shirts:QueueShirts;payment?:{isCourtesy:boolean;paymentStatus:string;balanceDue:number;amountPaid:number;ticketPrice:number;external:boolean;methods:string[]};canCollect?:boolean;paymentMethods?:PaymentMethod[]};
type Props={startPayment?:boolean;row:QueueRow;onClose:()=>void;onFull:()=>Promise<void>;onConfirmed:(message:string)=>void;onCommitted?:()=>void;onIncident?:()=>void};
export function QueueQuickConfirm({row,onClose,onFull,onConfirmed,onCommitted,onIncident,startPayment=false}:Props){
 const q=useReceptionQueue(),{currentEvent}=useEdition(),{user}=useAuth();
 const [detail,setDetail]=useState<Detail|null>(null),[size,setSize]=useState(''),[decision,setDecision]=useState<DeliveryChoice>(null),[capDecision,setCapDecision]=useState<DeliveryChoice>(null),[reason,setReason]=useState(''),[notes,setNotes]=useState('');
 const [pendingSize,setPendingSize]=useState<string|null>(null);
 const [error,setError]=useState(''),[sending,setSending]=useState(false),[paymentOpen,setPaymentOpen]=useState(startPayment),[receipt,setReceipt]=useState<Receipt|null>(null),[uncertain,setUncertain]=useState(false);
 const lock=useRef(false),paymentKey=useRef(crypto.randomUUID()),confirmationKey=useRef(crypto.randomUUID()),active=useRef(true),base=`/events/${currentEvent?.id}/reception-queue/entries/${row.id}`;
 useEffect(()=>{active.current=true;api.get(base+'/details').then(res=>{if(active.current){setDetail(res.data.data);setSize(res.data.data.selectedTshirtSize||'');}}).catch(()=>{if(active.current)setError('No se pudo consultar la entrada. Vuelve a la cola y reintenta.');});return()=>{active.current=false;};},[base]);
 useRealtimeRefresh('attendance',async()=>{if(receipt)return;const fresh=(await api.get(base+'/details')).data.data;if(active.current)setDetail(fresh);});
 const needsShirt=Boolean(detail?.shirts.enabled&&!detail.shirts.delivered),deliver=decision==='DELIVER',needsCap=Boolean(detail?.cap?.eligible&&!detail.cap.delivered);
 const availability=detail?.shirts.sizes.find(item=>item.size===size)?.available||0,needsNotes=reason==='Otro motivo';
 const validShirt=!needsShirt||decision==='DELIVER'&&Boolean(size)&&availability>0||decision==='NO_DELIVERY'&&Boolean(reason)&&(!needsNotes||notes.trim().length>=5);
 const validCap=!needsCap||capDecision!==null;
 const confirm=async()=>{
  if(lock.current||!detail||!validShirt||!validCap)return;
  lock.current=true;setSending(true);setError('');
  try{
   const result=await q.act('/entries/'+row.id+'/confirm',{requestKey:confirmationKey.current,confirmed:true,tshirtSize:needsShirt?(size||detail.selectedTshirtSize)||undefined:undefined,tshirtDelivered:needsShirt&&deliver,deliveryDecision:needsShirt?{decision,reason:deliver?undefined:reason,notes:deliver?undefined:notes}:undefined,capDecision:needsCap?capDecision:undefined});
   if(!result.confirmationReceipt)throw Error('No se recibió el resumen confirmado. Reintenta para consultar el resultado.');
   if(active.current){setReceipt(result.confirmationReceipt);setUncertain(false);onCommitted?.();void q.refresh();}
  }catch(e:any){if(active.current){setUncertain(!e.response||e.response.status>=500);setError(e.response?.data?.message||e.message||'No se obtuvo confirmación. Reintenta de forma segura antes de continuar.');}}
  finally{lock.current=false;if(active.current)setSending(false);}
 };
 if(pendingSize)return <ScannerDialog label="¿Confirmar cambio de talla?" onCancel={()=>setPendingSize(null)}><h2 className="text-lg font-bold">¿Confirmar cambio de talla?</h2><p>La talla registrada durante el escaneo fue {detail?.selectedTshirtSize}. Vas a cambiarla a {pendingSize}.</p><div className="grid grid-cols-2 gap-3"><button className="btn-secondary" onClick={()=>setPendingSize(null)}>Cancelar</button><button className="btn-primary" onClick={()=>{setSize(pendingSize);setPendingSize(null);}}>Confirmar cambio</button></div></ScannerDialog>;
 if(receipt)return <ScannerDialog label="Asistencia confirmada" onCancel={()=>onConfirmed('Asistencia confirmada.')}>
  <h2 className="text-xl font-bold">Asistencia confirmada</h2><p className="font-semibold break-words">{receipt.name}</p><p className="font-mono">{receipt.number}</p>
  {receipt.shirt.status==='DELIVERED'&&<p className="text-emerald-600 dark:text-emerald-400">Camiseta entregada — Talla {receipt.shirt.size}</p>}
  {receipt.shirt.status==='NOT_DELIVERED'&&<p className="text-amber-600 dark:text-amber-400">Camiseta no entregada — {receipt.shirt.reason||'Entrega pendiente'}</p>}
  {receipt.cap.status==='DELIVERED'&&<p className="text-emerald-600 dark:text-emerald-400">Gorra entregada</p>}
  {receipt.cap.status==='PENDING'&&<p className="text-amber-600 dark:text-amber-400">Gorra pendiente de entrega</p>}
  <button className="btn-primary w-full min-h-12" onClick={()=>onConfirmed('Asistencia confirmada.')}>Volver a recepción</button>
 </ScannerDialog>;
 if(paymentOpen&&detail?.payment&&detail.canCollect)return <RecordPaymentModal isOpen requireMethodChoice responsibleName={user?.fullName} originalAmount={detail.payment.ticketPrice} amountPaid={detail.payment.amountPaid} participantName={row.name} registrationNumber={row.number} balanceDue={detail.payment.balanceDue} paymentMethods={detail.paymentMethods||[]} onClose={()=>setPaymentOpen(false)} onConfirm={async(amount,method,paymentNotes)=>{
  await participantsService.recordPayment(row.registrationId,{amount,paymentMethodId:method,notes:paymentNotes,requestKey:paymentKey.current,source:'RECEPTION_QUEUE'});
  const fresh=(await api.get(base+'/details')).data.data;if(active.current){setDetail(fresh);paymentKey.current=crypto.randomUUID();void q.refresh();window.dispatchEvent(new CustomEvent('eventgrid:data-refresh'));}
 }}/>;
 return <ScannerDialog wide label="Confirmar entrada" onCancel={sending?undefined:onClose}>
  <h2 className="text-xl font-bold">Confirmar entrada</h2>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start"><div className="min-w-0 space-y-3"><section className="rounded-xl border border-border p-3 space-y-1"><h3 className="text-sm font-bold text-muted-foreground">Participante</h3><p className="text-xl font-semibold break-words">{row.name}</p><p className="font-mono">Boleta: {row.number}</p>{detail?.officialOrder&&<p>Inscripción n.º {detail.officialOrder} · Orden oficial verificado</p>}</section>
  {!detail&&!error&&<p role="status">Validando entrada…</p>}
  {detail&&<>
   {detail.category==='SPEAKER'&&<SpeakerReception registrationId={row.registrationId} attended={false}/>}
   <section className="rounded-xl border border-border p-3 space-y-2"><h3 className="font-bold">Pago</h3>
    {detail.payment&&<><PaymentStatusBadge registration={detail.payment} verbose/><p>Saldo pendiente: RD${detail.payment.balanceDue.toLocaleString('es-DO',{minimumFractionDigits:2})}</p><p className="text-xs text-muted-foreground">{detail.payment.external?'Plataforma externa · conciliación autorizada':detail.payment.methods?.join(' · ')}</p>{detail.canCollect&&<button className="btn-secondary" disabled={sending} onClick={()=>setPaymentOpen(true)}>Registrar pago</button>}</>}
    <p role="status" className={detail.canCheckIn?'text-primary font-semibold':'text-destructive font-semibold'}>{detail.canCheckIn?'Entrada válida':detail.blockedReason}</p>
   </section>
  </>} </div>{detail&&<section className="min-w-0 rounded-xl border border-border p-3 space-y-3"><h3 className="font-bold">Merch</h3>
    {detail.shirts.enabled&&(detail.shirts.delivered?<p>Camiseta ya entregada · {detail.selectedTshirtSize}</p>:<div className="space-y-3"><h4 className="font-semibold">Camiseta</h4><p className="text-sm">Talla registrada al escanear: <strong>{detail.selectedTshirtSize||'Sin especificar'}</strong></p><ShirtDeliveryChoice value={decision} onChange={setDecision} disabled={sending}/>
     {deliver&&<label>Talla definitiva / a entregar<select className="input-field" value={size} disabled={sending} onChange={e=>{const next=selectShirtSize(size,detail.selectedTshirtSize||'',e.target.value);setSize(next.size);setPendingSize(next.pending);}}><option value="" disabled>Seleccionar talla</option>{detail.shirts.sizes.map(item=><option key={item.size} value={item.size}>{item.size} · {item.available} disponibles</option>)}</select><span className="block text-sm mt-1">Disponibles: {availability}</span></label>}
     {decision==='NO_DELIVERY'&&<><label>Motivo de no entrega<select className="input-field" value={reason} disabled={sending} onChange={e=>setReason(e.target.value)}><option value="" disabled>Seleccionar motivo</option>{NON_DELIVERY_REASONS.map(value=><option key={value}>{value}</option>)}</select></label><label>Observaciones {needsNotes?'(obligatorias)':'(opcional)'}<textarea className="input-field" maxLength={500} required={needsNotes} value={notes} disabled={sending} onChange={e=>setNotes(e.target.value)}/></label></>}
    </div>)}
    {detail.cap?.delivered&&!detail.cap.eligible&&<p>Gorra ya entregada · Historial conservado</p>}
    {!detail.cap?.eligible&&!detail.cap?.delivered&&<div className="border-t border-border pt-2 text-sm"><h4 className="font-semibold">{detail.cap?.pendingVerification?'Elegibilidad pendiente de verificación':'Gorra no incluida'}</h4><p>{detail.cap?.pendingVerification?'Se requiere verificar la fuente y la asignación oficial.':'No corresponde al cupo de los primeros 100 inscritos'}</p></div>}
    {detail.cap?.eligible&&<div className="space-y-2 border-t border-border pt-3"><h4 className="font-semibold">Gorra incluida</h4><p className="text-sm text-muted-foreground">Inscripción oficial n.º {detail.officialOrder} · Dentro de los primeros 100</p>{detail.cap.delivered?<p>Gorra ya entregada</p>:<div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="group" aria-label="Decisión de gorra">{([['DELIVER','Entregar gorra'],['NO_DELIVERY','No entregar gorra']] as const).map(([key,label])=><button key={key} type="button" className={(capDecision===key?'btn-primary':'btn-secondary')+' min-h-14'} aria-pressed={capDecision===key} disabled={sending} onClick={()=>setCapDecision(key)}>{label}</button>)}</div>}</div>}
   </section>}</div>
   {detail&&<section className="space-y-2"><h3 className="font-bold">Confirmación</h3><button className="btn-primary w-full min-h-14" disabled={sending||!q.connected||(!detail.canCheckIn&&!uncertain)||!validShirt||!validCap} onClick={()=>void confirm()}>{sending?'Confirmando…':uncertain?'Reintentar confirmación':'Confirmar asistencia y entregas'}</button>{!validShirt&&<p role="status" className="text-sm text-amber-700 dark:text-amber-400">{deliver?(size&&availability<1?'Talla agotada: escoge otra talla o registra la no entrega.':'Selecciona una talla disponible.'):'Indica la decisión de camiseta y, si no se entrega, su motivo.'}</p>}{!validCap&&<p className="text-sm">Indica si se entregará la gorra.</p>}{!q.connected&&<p role="status">Sin conexión: espera a reconectar antes de confirmar.</p>}</section>
  }
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <div className="grid sm:grid-cols-3 gap-2"><button className="btn-secondary" disabled={sending} onClick={()=>void onFull().catch(()=>setError('No se pudo abrir la ficha completa.'))}>Revisar ficha completa</button>{onIncident&&<button className="btn-secondary" disabled={sending} onClick={onIncident}>Derivar a incidencia</button>}<button className="btn-secondary" disabled={sending} onClick={onClose}>Volver a la cola</button></div>
 </ScannerDialog>;
}
