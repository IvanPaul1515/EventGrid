import {BadRequestError} from '../../utils/errors.js';
export const NON_DELIVERY_REASONS=['Talla solicitada agotada','El participante no desea camiseta','Otro motivo'] as const;
export type ShirtDecision={decision:'DELIVER'|'NO_DELIVERY';reason?:string;notes?:string};
export function shirtDecision(input:ShirtDecision|undefined,delivered:boolean){
 if(!input)return {status:delivered?'DELIVERED':'PENDING',reason:delivered?null:'Entrega pendiente',notes:null};
 if(input.decision==='DELIVER')return {status:'DELIVERED',reason:null,notes:null};
 if(!NON_DELIVERY_REASONS.includes(input.reason as any))throw new BadRequestError('Selecciona un motivo de no entrega.');
 const notes=input.notes?.trim()||null;
 if(input.reason==='Otro motivo'&&(!notes||notes.length<5))throw new BadRequestError('Explica la incidencia de no entrega (mínimo 5 caracteres).');
 return {status:['El participante no desea camiseta','Otro motivo'].includes(input.reason!)?'NOT_DELIVERED':'PENDING',reason:input.reason!,notes};
}
export function eventDay(date:Date,timeZone:string){
 return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function localMidnight(day:string,timeZone:string){
 const target=Date.parse(day+'T00:00:00Z');let value=target;
 for(let i=0;i<3;i++){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const displayed=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));
  value+=target-displayed;
 }
 return new Date(value);
}
export function supervisionFilters(where:any,query:{dateFrom?:string;dateTo?:string;tshirtDelivery?:string},timeZone:string){
 if(query.dateFrom||query.dateTo)where.attendedAt={...(query.dateFrom?{gte:localMidnight(query.dateFrom,timeZone)}:{}),...(query.dateTo?{lt:localMidnight(new Date(Date.parse(query.dateTo+'T00:00:00Z')+86400000).toISOString().slice(0,10),timeZone)}:{})};
 if(query.tshirtDelivery==='DELIVERED')where.tshirtDelivered=true;
 if(query.tshirtDelivery==='NOT_DELIVERED'){where.tshirtDelivered=false;where.tshirtDeliveryStatus='NOT_DELIVERED';}
 if(query.tshirtDelivery==='PENDING'){const noShows=where.attended===false;where.tshirtDelivered=false;where.attended=true;where.tshirtSize={not:null};where.AND=[{OR:[{tshirtDeliveryStatus:'PENDING'},{tshirtDeliveryStatus:null}]},...(noShows?[{attended:false}]:[])];}
 return where;
}
export function paymentSummary(reg:any){
 return {methods:[...new Set((reg.payments||[]).map((payment:any)=>payment.channel==='EXTERNAL'?'Plataforma externa':payment.paymentMethod?.name||'Manual / histórico'))] as string[],isCourtesy:reg.isCourtesy,paymentStatus:reg.isCourtesy?'COURTESY':reg.paymentStatus||(Number(reg.balanceDue)<=0?'PAID':Number(reg.amountPaid)>0?'PARTIAL':'PENDING'),balanceDue:Number(reg.balanceDue||0),amountPaid:Number(reg.amountPaid||0),external:Boolean(reg.externalPlatform||reg.source==='EXCEL_IMPORT')};
}
