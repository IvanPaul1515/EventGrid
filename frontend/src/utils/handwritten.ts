import {reviewedReceiptAmount} from './receiptOcr';
export type HandwrittenRow={id:string;pageId:string;firstName:string;lastName:string;email:string;documentId:string;phone:string;date:string;time:string;timezone:string;amount:string;state:'PAID'|'PENDING'|'REVIEW';method:string;reference:string;ticketType:string;notes:string;raw:string;reviewed:boolean;paymentConfirmed:boolean;selected:boolean};
export const blankHandwrittenRow=(pageId:string,id:string):HandwrittenRow=>({id,pageId,firstName:'',lastName:'',email:'',documentId:'',phone:'',date:'',time:'',timezone:'',amount:'',state:'REVIEW',method:'',reference:'',ticketType:'',notes:'',raw:'',reviewed:false,paymentConfirmed:false,selected:false});
export function parseHandwritten(text:string,pageId:string):HandwrittenRow[]{
 return text.split(/\r?\n/).map(s=>s.normalize('NFC').replace(/[\t ]+/g,' ').trim()).filter(Boolean).map((raw,index)=>{
  const row=blankHandwrittenRow(pageId,`line-${index+1}`);row.raw=raw;
  row.date=raw.match(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)\b/)?.[0]||'';
  const time=raw.match(/\b(\d{1,2}):([0-5]\d)(?::([0-5]\d))?\b/);row.time=time?`${time[1].padStart(2,'0')}:${time[2]}${time[3]?':'+time[3]:''}`:'';
  const folded=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const pending=/\b(pendiente|no pago|no pagado|debe)\b/.test(folded),paid=/\b(pago|pagado|pagada)\b/.test(folded);row.state=pending&&paid&&!/no pag/.test(folded)?'REVIEW':pending?'PENDING':paid?'PAID':'REVIEW';
  row.method=raw.match(/\b(efectivo|transferencia|tarjeta|cheque)\b/i)?.[0]||'';
  row.reference=raw.match(/(?:ref(?:erencia)?|recibo|comprobante)\s*[:#]?\s*([A-Z0-9-]{3,})/i)?.[1]||'';
  const remainder=raw.replace(row.date,'').replace(time?.[0]||'','').replace(row.reference,'').replace(/^\d+[.)]\s*/, '');
  const amounts=remainder.match(/\b\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?\b|\b\d+(?:[.,]\d{2})?\b/g)||[];if(amounts.length===1)row.amount=amounts[0];
  const name=raw.replace(/^\d+[.)]\s*/,'').split(/\s*[—–|;]\s*|\s+-\s+|(?=\b\d)|(?=\b(?:Pagó|Pagado|Pendiente)\b)/i)[0].trim();const parts=name.split(/\s+/);if(/^[\p{L}\p{M} .'-]+$/u.test(name)){row.firstName=parts[0]||'';row.lastName=parts.slice(1).join(' ');}row.notes=amounts.length>1?'Varias cifras: confirmar el importe correcto.':'';return row;
 });
}
export function lineBands(counts:number[],width:number){
 // Horizontal notebook rules are not text; segmentation is a proposal only.
 const ink=counts.map(n=>n>=Math.max(2,width*.006)&&n<width*.75);const bands:{start:number;end:number}[]=[];let start=-1,last=-1;const gap=Math.max(3,Math.round(width*.004));
 for(let y=0;y<=ink.length+gap;y++){if(ink[y]){if(start<0)start=y;last=y;}else if(start>=0&&y-last>gap){if(last-start>=2)bands.push({start:Math.max(0,start-3),end:Math.min(counts.length,last+4)});start=-1;}}
 return bands;
}
export function changeHandwritten(row:HandwrittenRow,key:keyof HandwrittenRow,value:string|boolean):HandwrittenRow{return {...row,[key]:value,...(!['selected','reviewed','paymentConfirmed'].includes(key)?{reviewed:false,paymentConfirmed:false}:{})};}

export function handwrittenAmount(value:string){const grouped=/^\d{1,3}(,\d{3})+$/.test(value.trim());return reviewedReceiptAmount(grouped?value.replace(/,/g,''):value);}
