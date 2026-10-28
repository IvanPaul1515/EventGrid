import {BadRequestError} from '../../utils/errors.js';
export type HistoricalDate={value:string;precision:'DATE'|'SECOND';zone:string|null;source:string};
export function historicalDate(date:unknown,time:unknown,zone:unknown,source:string):HistoricalDate|null{
 const d=String(date??'').trim(),t=String(time??'').trim(),z=String(zone??'').trim();if(!d){if(t)throw new BadRequestError('La hora necesita una fecha.');return null;}
 let day='',clock='';const iso=d.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?)(Z|[+-]\d{2}:\d{2})?)?$/),local=d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
 let offset=iso?.[5]||'';
 if(iso){day=`${iso[1]}-${iso[2]}-${iso[3]}`;clock=iso[4]||'';}else if(local){day=`${local[3]}-${local[2].padStart(2,'0')}-${local[1].padStart(2,'0')}`;}else throw new BadRequestError('Fecha no reconocida: utiliza AAAA-MM-DD o DD/MM/AAAA.');
 const check=new Date(day+'T00:00:00Z');if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,10)!==day)throw new BadRequestError('Fecha inexistente.');
 if(t&&clock&&t!==clock)throw new BadRequestError('La fecha y la hora separada se contradicen.');clock=t||clock;
 if(clock&&!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(clock))throw new BadRequestError('Hora no válida; utiliza HH:mm o HH:mm:ss.');
 if(z&&!/^(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(z))throw new BadRequestError('Zona horaria: utiliza un desplazamiento explícito, por ejemplo -04:00.');
 if(offset&&z&&offset!==z)throw new BadRequestError('Zona horaria contradictoria.');offset=offset||z;
 if(clock.length===5)clock+=':00';if(clock&&offset&&!Number.isFinite(Date.parse(day+'T'+clock+offset)))throw new BadRequestError('Fecha/hora inválida.');
 return {value:day+(clock?'T'+clock+offset:''),precision:clock?'SECOND':'DATE',zone:offset||null,source};
}
export function temporalMetadata(n:Record<string,any>){return {
 purchasedAt:historicalDate(n.saleTimestamp,n.purchaseTime,n.sourceTimezone,'Excel'),
 registeredAt:historicalDate(n.registrationDate,n.registrationTime,n.sourceTimezone,'Excel'),
 paidAt:historicalDate(n.paymentDate,n.paymentTime,n.sourceTimezone,'Excel')};}
export function detectDestinations(columns:string[]){const text=columns.join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();return [
 ...(/nombre|apellido|email|correo|first name/.test(text)?['PARTICIPANTS']:[]),...(/compra|venta|pago|monto|importe|purchased/.test(text)?['PURCHASES']:[]),...(/patrocinador|sponsor|aporte|contribucion/.test(text)?['SPONSORS']:[]),...(/stock|inventario|movimiento|existencia/.test(text)?['INVENTORY']:[])];}
export const IMPORT_FIELDS=new Set("externalPaymentStatus externalPlatform buyerName externalReference firstName lastName fullName documentId organizationRnc participantCategory waitlistFlag paidFullIndicator email phone alternatePhone institution ticketType ticketPrice amountPaid paymentMethod totalAmount salesResponsible saleTimestamp purchaseTime registrationDate registrationTime paymentDate paymentTime sourceTimezone status isCourtesy courtesyAuthorizedBy attended notes registrationNumber officialRegistrationOrder".split(" "));
export function assertMapping(mapping:Record<string,string>){if(Object.values(mapping).some(v=>v&&v!=='IGNORE'&&!IMPORT_FIELDS.has(v)))throw new BadRequestError('Campo de destino no admitido.');const targets=Object.values(mapping).filter(v=>v&&v!=='IGNORE');if(new Set(targets).size!==targets.length)throw new BadRequestError('Un campo no puede recibir varias columnas incompatibles. Revisa el mapeo.');}
export function mergeHistorical(existing:string|null|undefined,incoming:ReturnType<typeof temporalMetadata>){let old:any={};if(existing){try{old=JSON.parse(existing);}catch{throw new BadRequestError('Metadatos históricos existentes requieren revisión.');}}const conflicts:string[]=[];for(const [key,next]of Object.entries(incoming)){if(!next)continue;if(old[key]&&JSON.stringify(old[key])!==JSON.stringify(next)){conflicts.push(key);continue;}old[key]=next;}return {value:JSON.stringify(old),conflicts};}

export function purchaseChronology(rows:{id:string;historicalDates?:string|null;externalReference?:string|null;source?:string;isCourtesy?:boolean;paymentStatus?:string}[]){
 const purchases=rows.map(row=>{let date:HistoricalDate|null=null;try{date=JSON.parse(row.historicalDates||'{}').purchasedAt||null;}catch{}const instant=date?.precision==='SECOND'&&date.zone&&row.externalReference&&row.source==='EXCEL_IMPORT'?Date.parse(date.value):NaN;return {id:row.id,date,instant,position:null as number|null,verification:Number.isFinite(instant)?'SOURCE_TIMESTAMP':'PENDING'};});
 const complete=purchases.every(p=>Number.isFinite(p.instant));const counts=new Map<number,number>();for(const p of purchases)if(Number.isFinite(p.instant))counts.set(p.instant,(counts.get(p.instant)||0)+1);
 const sorted=[...purchases].sort((a,b)=>Number.isFinite(a.instant)&&Number.isFinite(b.instant)?a.instant-b.instant:Number.isFinite(a.instant)?-1:1);
 sorted.forEach((p,i)=>{if(complete&&counts.get(p.instant)===1)p.position=i+1;else if(counts.get(p.instant)!==1)p.verification='PENDING';});return sorted.map(({instant,...safe})=>safe);
}
