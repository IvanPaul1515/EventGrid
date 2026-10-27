import React from 'react';
import {UserCheck} from 'lucide-react';
import {QueueRow} from './ReceptionQueueContext';
import {PaymentStatusBadge} from '../participants/PaymentStatusBadge';
const labels:Record<string,string>={WAITING:'En espera',CLAIMED:'En atención',INCIDENT:'Incidencia'};
export function QueueOperationalRows({rows,disabled,onAttend,onIncident,onPayment,timeZone}:{rows:QueueRow[];disabled:boolean;onAttend:(row:QueueRow)=>void;onIncident:(row:QueueRow)=>void;onPayment:(row:QueueRow)=>void;timeZone?:string}){
 return <div className="space-y-3 xl:space-y-0 xl:divide-y divide-border">
  <div className="hidden xl:grid xl:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr_auto] gap-3 px-3 py-2 text-xs font-semibold text-muted-foreground">{['Participante','Pago','Camiseta','Escaneo','Estado','Acciones'].map(label=><span key={label}>{label}</span>)}</div>
  {rows.map(row=>{const busy=disabled||row.state==='CLAIMED'&&!row.mine;return <div key={row.id} className="grid grid-cols-2 xl:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_1fr_auto] gap-3 p-3 border xl:border-0 border-border rounded-xl xl:rounded-none items-center text-sm">
   <div className="col-span-2 xl:col-span-1 min-w-0"><strong className="block break-words">{row.name}</strong><span className="font-mono text-xs text-muted-foreground">{row.number}</span></div>
   <div className="min-w-0 space-y-1">{row.payment&&<PaymentStatusBadge registration={row.payment} verbose/>}{row.payment?.methods?.length?<p className="text-xs text-muted-foreground break-words">{row.payment.methods.join(' · ')}</p>:null}{row.payment?.external&&<p className="text-xs text-muted-foreground">Plataforma externa</p>}{row.canCollect&&<button className="block text-xs underline text-primary min-h-11" disabled={busy} onClick={()=>onPayment(row)}>Registrar pago</button>}</div>
   <div className="min-w-0">{row.tshirtIncluded?<><strong className="text-base text-primary break-words">{row.selectedTshirtSize||'Por definir'}</strong><p className="text-xs text-muted-foreground">{row.tshirtDelivered?'Entregada':row.tshirtDeliveryStatus==='NOT_DELIVERED'?'No entregada':'Pendiente de entrega'}</p></>:<span className="text-xs text-muted-foreground">No incluye</span>}</div>
   <div className="min-w-0"><time>{new Date(row.scannedAt).toLocaleTimeString('es-DO',{timeZone:timeZone||'America/Santo_Domingo',hour:'2-digit',minute:'2-digit'})}</time><p className="text-xs text-muted-foreground break-words">{row.station}</p></div>
   <span className="text-xs font-semibold text-primary">{labels[row.state]||row.state}</span>
   <div className="col-span-2 xl:col-span-1 flex xl:flex-col gap-2"><button className="btn-primary min-h-11" disabled={busy} onClick={()=>onAttend(row)}><UserCheck className="w-4 h-4"/>Atender</button><button className="btn-secondary text-xs min-h-11" disabled={busy} onClick={()=>onIncident(row)}>Incidencia</button></div>
  </div>;})}
 </div>;
}
