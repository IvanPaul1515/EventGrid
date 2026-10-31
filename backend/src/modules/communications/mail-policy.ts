export const CAMPAIGN_TEMPLATES = ['REGISTRATION_CONFIRMATION','DIGITAL_TICKET','EVENT_REMINDER','PAYMENT_REMINDER','KEYNOTE_ANNOUNCEMENT','GENERAL_ANNOUNCEMENT'] as const;
export const campaignTemplateNames:Record<string,string>={REGISTRATION_CONFIRMATION:'Confirmación de registro',DIGITAL_TICKET:'Entrada digital con QR',EVENT_REMINDER:'Recordatorio del evento',PAYMENT_REMINDER:'Recordatorio de pago',KEYNOTE_ANNOUNCEMENT:'Anuncio de keynote',GENERAL_ANNOUNCEMENT:'Comunicado general'};
export function messagePriority(code:string,configured?:string|null,env:Record<string,string|undefined>=process.env):'HIGH'|'NORMAL'{
 if(configured==='HIGH'||configured==='NORMAL')return configured;
 return env.CONTAINER_MODE==='true'&&env.DEMO_QUICK_ACCESS!=='true'&&['REGISTRATION_CONFIRMATION','DIGITAL_TICKET','PAYMENT_REMINDER'].includes(code)?'HIGH':'NORMAL';
}
export function priorityHeaders(priority:'HIGH'|'NORMAL') {return {priority:priority==='HIGH'?'high' as const:'normal' as const,headers:{Importance:priority==='HIGH'?'high':'normal','X-Priority':priority==='HIGH'?'1':'3'}};}
export function campaignTemplates<T extends {code:string;eventId?:string|null}>(items:T[],eventId?:string|null){
 const selected=new Map<string,T>();
 for(const t of items){if(!(CAMPAIGN_TEMPLATES as readonly string[]).includes(t.code))continue;if(!selected.has(t.code)||t.eventId===eventId)selected.set(t.code,t);}
 return CAMPAIGN_TEMPLATES.flatMap(code=>selected.has(code)?[{...selected.get(code)!,name:campaignTemplateNames[code]}]:[]);
}
export function registrationMessages(reg:any){return {
 registrationStateMessage:reg.status==='CONFIRMED'?'Registro confirmado':reg.status==='CANCELLED'?'Registro cancelado':'Registro recibido, pendiente de confirmación',
 paymentStateMessage:reg.isCourtesy?(reg.courtesyRequests?.some((r:any)=>r.status==='PENDING')?'Cortesía pendiente de autorización':'Cortesía autorizada'):reg.paymentStatus==='PAID'&&Number(reg.balanceDue)<=0&&Number(reg.amountPaid)>0?'Pago acreditado':'Pago pendiente de acreditación'
};}
/** Existing Json storage avoids a schema migration and keeps old variable arrays readable. */
export function templateMetadata(raw:unknown):{variables:string[];priority?:'NORMAL'|'HIGH'}{
 let value:any=raw;try{if(typeof raw==='string')value=JSON.parse(raw);}catch{return {variables:[]};}
 const list=Array.isArray(value)?value:value?.variables;
 return {variables:Array.isArray(list)?list.filter((v:unknown):v is string=>typeof v==='string'):[],...(['NORMAL','HIGH'].includes(value?.priority)?{priority:value.priority}:{})};
}
