import {money} from './module-rules.js';
import {z} from 'zod';
import {BadRequestError,ForbiddenError} from '../../utils/errors.js';
import {ImportService} from './import.service.js';
export const HandwrittenRowSchema=z.object({
 id:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),pageId:z.string().regex(/^[a-f0-9]{64}$/),
 firstName:z.string().max(100),lastName:z.string().max(100),email:z.string().max(200),documentId:z.string().max(60).default(''),phone:z.string().max(60).default(''),
 date:z.string().max(40),time:z.string().max(12),timezone:z.string().max(6).default(''),amount:z.string().max(30),state:z.enum(['PAID','PENDING','REVIEW']),method:z.string().max(100),reference:z.string().max(120),ticketType:z.string().max(150),notes:z.string().max(2000),raw:z.string().max(2000),reviewed:z.boolean(),paymentConfirmed:z.boolean()
});
export const HandwrittenInputSchema=z.object({batchId:z.string().uuid(),rows:z.array(HandwrittenRowSchema).min(1).max(200),confirmed:z.boolean().optional()});
export type HandwrittenRow=z.infer<typeof HandwrittenRowSchema>;
export function assertHandwrittenRole(actor:any){if(!actor||actor.scannerOnly||!['ADMIN','OPERATOR'].includes(actor.role))throw new ForbiddenError('Solo administrador u operador autorizado puede incorporar listas manuscritas.');}
export function handwrittenRecord(row:HandwrittenRow,batchId:string){
 if(!row.reviewed)throw new BadRequestError('Revise expresamente esta fila contra la fotografía.');
 if(!row.firstName.trim()||!row.lastName.trim()||!row.ticketType.trim())throw new BadRequestError('Complete nombres, apellidos y entrada.');
 if(row.state==='REVIEW')throw new BadRequestError('El estado del pago requiere revisión. Una cifra no confirma un pago.');
 if(row.state==='PAID'&&(!row.paymentConfirmed||!row.amount.trim()||!row.method.trim()))throw new BadRequestError('Confirme el pago recibido e indique importe y método; el OCR no acredita dinero.');
 const amount=row.state==='PAID'?money(row.amount):0;if(row.state==='PAID'&&amount<=0)throw new BadRequestError('Un pago confirmado necesita un importe positivo.');
 return {firstName:row.firstName.trim(),lastName:row.lastName.trim(),email:row.email.trim(),documentId:row.documentId,phone:row.phone,saleTimestamp:row.date,purchaseTime:row.time,sourceTimezone:row.timezone,ticketType:row.ticketType,externalReference:row.reference.trim()||`HW:${row.pageId}:${row.id}`,externalPlatform:'Lista manuscrita',amountPaid:String(amount),paidFullIndicator:'UNKNOWN',externalPaymentStatus:row.state==='PAID'?'Pago recibido confirmado manualmente':'Pendiente',paymentMethod:row.method,notes:JSON.stringify({capture:'HANDWRITTEN',batchId,pageId:row.pageId,rowId:row.id,originalText:row.raw,identifiedAmount:row.amount,note:row.notes,reviewed:true})};
}
const defaults={importKind:'PARTICIPANTS',externalPlatform:'Lista manuscrita',captureKind:'HANDWRITTEN'};
export async function validateHandwritten(eventId:string,input:z.infer<typeof HandwrittenInputSchema>){
 const results=[];const refs=new Set<string>();
 for(const row of input.rows){try{const record=handwrittenRecord(row,input.batchId),key=record.externalReference;if(refs.has(key))throw new BadRequestError('Referencia repetida dentro del lote.');refs.add(key);const result=await ImportService.validateRows(eventId,[record],Object.fromEntries(Object.keys(record).map(k=>[k,k])),defaults);results.push({id:row.id,pageId:row.pageId,...result.rowsSummary[0]});}catch(e){results.push({id:row.id,pageId:row.pageId,status:'ERROR',errors:[e instanceof BadRequestError?e.message:'No se pudo validar la fila. Reintente.']});}}
 return results;
}
export async function executeHandwritten(eventId:string,userId:string,input:z.infer<typeof HandwrittenInputSchema>){
 if(!input.confirmed)throw new BadRequestError('Confirme expresamente la incorporación de los participantes seleccionados.');
 const preview=await validateHandwritten(eventId,input);const results=[];
 for(let i=0;i<input.rows.length;i++){const row=input.rows[i],validation=preview[i];if(validation.status!=='VALID'){results.push({...validation,importedCount:0,skippedCount:validation.status==='DUPLICATE'?1:0});continue;}
 try{const record=handwrittenRecord(row,input.batchId);const result=await ImportService.executeImport(eventId,userId,`Manuscrita-${input.batchId}-${row.id}.json`,0,[record],Object.fromEntries(Object.keys(record).map(k=>[k,k])),'SKIP',defaults);results.push({id:row.id,pageId:row.pageId,status:result.errorCount?'ERROR':result.importedCount?'IMPORTED':'SKIPPED',...result});}
 catch{results.push({id:row.id,pageId:row.pageId,status:'ERROR',errors:['No se pudo incorporar esta fila. Verifique el estado antes de reintentar.'],importedCount:0,skippedCount:0});}}
 return {results,importedCount:results.reduce((n,r)=>n+(r.importedCount||0),0),skippedCount:results.reduce((n,r)=>n+(r.skippedCount||0),0),errorCount:results.filter(r=>r.status==='ERROR').length};
}
