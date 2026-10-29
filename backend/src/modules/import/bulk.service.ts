import { z } from 'zod';
import { prisma } from '../../config/db.js';
import { BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { ImportService, normalizeDocumentId } from './import.service.js';
import { HandwrittenRowSchema, handwrittenRecord, assertHandwrittenRole } from './handwritten.service.js';
import { ModuleImportService } from './module-import.service.js';
import { capEligibility, capRegistrationSelect } from '../merch/official-order.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { temporalMetadata } from './intelligence.js';

export const BulkInputSchema=z.object({batchId:z.string().uuid(),source:z.string().trim().min(1).max(100),
 kind:z.enum(['PARTICIPANTS','ONSITE']).default('PARTICIPANTS'),confirmed:z.boolean().optional(),
 verifiedHistory:z.boolean().default(false),historyComplete:z.boolean().default(false),evidenceReason:z.string().trim().max(500).default(''),
 rows:z.array(HandwrittenRowSchema.extend({fullName:z.string().max(200).default(''),institution:z.string().max(200).default(''),
  registrationDate:z.string().max(40).default(''),registrationTime:z.string().max(12).default(''),paymentDate:z.string().max(40).default(''),paymentTime:z.string().max(12).default(''),source:z.string().max(100).default(''),
  action:z.enum(['NEW','SKIP','USE_EXISTING','UPDATE']).default('NEW')})).min(1).max(200)}).refine(input=>new Set(input.rows.map(row=>row.id)).size===input.rows.length,{message:'Identificadores de fila repetidos'});
type Input=z.infer<typeof BulkInputSchema>;
type Actor={id:string;role:string;scannerOnly?:boolean};
export function assertBulkAccess(actor:Actor,input:Input) {
 assertHandwrittenRole(actor);
 if((input.verifiedHistory||input.historyComplete||input.rows.some(r=>r.action==='UPDATE'))&&actor.role!=='ADMIN')throw new ForbiddenError('La revisión oficial, la integridad histórica y las actualizaciones requieren administrador.');
 if((input.verifiedHistory||input.historyComplete)&&input.evidenceReason.length<10)throw new BadRequestError('Documenta la fuente y el alcance de la revisión administrativa.');
}
export function bulkRecords(input:Input) {
 const rows=input.rows.filter(row=>!['SKIP','USE_EXISTING'].includes(row.action));
 const records=rows.map(row=>{
  if(row.fullName.trim()&&(!row.firstName.trim()||!row.lastName.trim()))throw new BadRequestError('Revisa la separación de nombres y apellidos.');
  const record=handwrittenRecord(row,input.batchId);
  return {...record,externalReference:row.reference.trim()||`BULK:${row.pageId}:${row.id}`,externalPlatform:input.source,
   institution:row.institution,registrationDate:row.registrationDate,registrationTime:row.registrationTime,paymentDate:row.paymentDate,paymentTime:row.paymentTime,
   notes:JSON.stringify({...JSON.parse(record.notes),capture:'BULK',source:row.source||input.source,verifiedHistory:input.verifiedHistory,evidenceReason:input.evidenceReason}),
  };
 });
 return {rows,records};
}
const mapping=(rows:Record<string,unknown>[])=>Object.fromEntries([...new Set(rows.flatMap(r=>Object.keys(r)))].map(k=>[k,k]));
const defaults=(input:Input)=>({externalPlatform:input.source,captureKind:input.verifiedHistory?'BULK_REVIEWED':'HANDWRITTEN',deferMerchReconciliation:'true'});
function onsiteRecords(records:ReturnType<typeof bulkRecords>['records']) {
 return records.map(r=>({firstName:r.firstName,lastName:r.lastName,email:r.email,documentId:r.documentId,
  date:r.saleTimestamp,time:r.purchaseTime,timezone:r.sourceTimezone,amount:r.amountPaid,paymentMethod:r.paymentMethod,
  ticketType:r.ticketType,externalReference:r.externalReference,notes:r.notes,registrationDate:r.registrationDate,registrationTime:r.registrationTime,paymentDate:r.paymentDate,paymentTime:r.paymentTime,institution:r.institution,phone:r.phone}));
}
export async function validateBulk(eventId:string,actor:Actor,input:Input) {
 assertBulkAccess(actor,input);
 const active=input.rows.filter(row=>!['SKIP','USE_EXISTING'].includes(row.action));
 if(!active.length)throw new BadRequestError('Selecciona al menos una fila nueva o por actualizar.');
 const rows:Input['rows']=[],records:ReturnType<typeof bulkRecords>['records']=[],localErrors:any[]=[];
 for(const row of active)try{
  if(input.kind==='ONSITE'&&(row.state!=='PAID'||!row.paymentConfirmed))throw new BadRequestError('Una venta histórica requiere importe, método y confirmación explícita de dinero recibido.');
  const record=bulkRecords({...input,rows:[row]}).records[0];rows.push(row);records.push(record);
 }catch(error){localErrors.push({rowId:row.id,status:'ERROR',errors:[error instanceof BadRequestError?error.message:'No se pudo preparar la fila.']});}
 const validation=!records.length?{rowsSummary:[]}:input.kind==='ONSITE'?await ModuleImportService.validate(prisma,eventId,'ONSITE',onsiteRecords(records),mapping(onsiteRecords(records)),input.source):
  await ImportService.validateRows(eventId,records,mapping(records),defaults(input));
 // Shared email alone is a possible match, never permission to create a second identity silently.
 const existing=await prisma.registration.findMany({where:{eventId},select:{...capRegistrationSelect,isDemo:true,status:true,participant:{select:{email:true,documentId:true}}}});
 const seen=new Map<string,string>();
 validation.rowsSummary.forEach((result:any,index:number)=>{
  result.rowId=rows[index].id;
  const row=rows[index],email=row.email.trim().toLowerCase(),document=normalizeDocumentId(row.documentId)||row.documentId.replace(/[\s-]/g,'').toUpperCase();
  const keys=[email&&'email:'+email,document&&'doc:'+document,'ref:'+records[index].externalReference].filter((x):x is string=>!!x);
  if(keys.some(key=>seen.has(key))){result.status='ERROR';result.errors.push('Posible duplicado dentro del lote; revisa correo, documento o referencia.');}keys.forEach(key=>seen.set(key,row.id));
  const matches=existing.filter(r=>r.participant.email.toLowerCase()===email||!!document&&(r.participant.documentId||'').replace(/[\s-]/g,'').toUpperCase()===document);
  if(matches.length&&result.status==='VALID'&&!result.normalized?.existingRegistrationId){result.status='DUPLICATE';result.errors.push('Posible coincidencia existente; usa u omite el registro, o concilia como administrador.');}
 });
 const cap=await prisma.merchItem.findUnique({where:{eventId_systemCode:{eventId,systemCode:'OFFICIAL_CAP'}}});
 const candidates=validation.rowsSummary.filter((row:any)=>row.status==='VALID').map((row:any)=>{
  const record=records[rows.findIndex(r=>r.id===row.rowId)],dates=temporalMetadata(record);
  for(const key of ['purchasedAt','registeredAt','paidAt'] as const)if(dates[key])dates[key]!.source=input.verifiedHistory?'ADMIN_REVIEWED':'DECLARED';
  return {id:'candidate:'+row.rowId,source:'EXCEL_IMPORT',historicalDates:JSON.stringify(dates),externalReference:record.externalReference,amountPaid:row.normalized.amountPaid??row.normalized.amount,isCourtesy:false};
 });
 const complete=input.historyComplete||cap?.historyComplete===true;
 const current=existing.filter(r=>!r.isDemo&&r.status!=='CANCELLED');
 const combined=[...current,...candidates],ranking=capEligibility(combined,cap?.criterion,cap?.participantQuota??100,complete);
 const before=capEligibility(current,cap?.criterion,cap?.participantQuota??100,complete);
 const assignments=cap?await prisma.merchAllocation.findMany({where:{eventId,itemId:cap.id,kind:'PARTICIPANT',status:{not:'RELEASED'}},select:{recipientId:true,status:true}}):[];
 const outcomes=[...validation.rowsSummary,...localErrors].sort((a:any,b:any)=>active.findIndex(r=>r.id===a.rowId)-active.findIndex(r=>r.id===b.rowId));
 return {rows:outcomes,policy:ranking.policy,historyComplete:complete,cutoff:cap?.participantQuota??100,
  ranking:candidates.map(row=>({id:row.id.slice(10),position:ranking.orders[row.id]??null,status:!complete||ranking.issues.some(i=>i.registrationId===row.id)||!ranking.orders[row.id]?'PENDING':ranking.eligible.includes(row.id)?'ELIGIBLE':'OUTSIDE'})),
  changedExisting:existing.filter(r=>(before.orders[r.id]??null)!==(ranking.orders[r.id]??null)).length,
  protectedAssignments:assignments.filter(a=>!ranking.eligible.includes(a.recipientId)).length,
  summary:{detected:active.length,valid:outcomes.filter((r:any)=>r.status==='VALID').length,duplicates:outcomes.filter((r:any)=>r.status==='DUPLICATE').length,review:outcomes.filter((r:any)=>r.status==='ERROR').length}};
}
export async function executeBulk(eventId:string,actor:Actor,input:Input) {
 assertBulkAccess(actor,input);if(!input.confirmed)throw new BadRequestError('Confirma expresamente la incorporación masiva.');
 const preview=await validateBulk(eventId,actor,input);
 if(preview.rows.some((row:any)=>row.status==='ERROR'||row.status==='DUPLICATE'&&input.rows.find(r=>r.id===row.rowId)?.action!=='UPDATE'))throw new BadRequestError('Corrige u omite las filas con errores y posibles duplicados antes de confirmar.');
 const {rows,records}=bulkRecords(input);let result:any;
 if(input.kind==='ONSITE')result=await ModuleImportService.execute(eventId,actor.id,'ONSITE',onsiteRecords(records),mapping(onsiteRecords(records)),input.source,`Masivo-${input.batchId}.json`,0,false,input.verifiedHistory);
 else {
  const results=[];
  // Retain the shared transaction/idempotency machinery, split only explicit authorized update decisions.
  for(const action of ['NEW','UPDATE'] as const){const group=records.filter((_,index)=>rows[index].action===action);if(group.length)results.push(await ImportService.executeImport(eventId,actor.id,`Masivo-${input.batchId}-${action}.json`,0,group,mapping(group),action==='UPDATE'?'UPDATE':'SKIP',defaults(input)));}
  result={batches:results,importedCount:results.reduce((n,r)=>n+r.importedCount,0),updatedCount:results.reduce((n,r)=>n+r.updatedCount,0),skippedCount:results.reduce((n,r)=>n+r.skippedCount,0),errorCount:results.reduce((n,r)=>n+r.errorCount,0)};
 }
 await writeTransaction(async tx=>{
  const fresh=await tx.user.findUnique({where:{id:actor.id}});if(!fresh?.isActive||fresh.scannerOnly||input.historyComplete&&fresh.role!=='ADMIN')throw new ForbiddenError('Revisión administrativa requerida.');
  const complete=input.historyComplete&&result.errorCount===0;
  await tx.merchItem.updateMany({where:{eventId,systemCode:'OFFICIAL_CAP'},data:{historyComplete:complete}});
  await tx.auditLog.create({data:{userId:actor.id,action:'UPDATE',entity:'EVENT',entityId:eventId,changes:JSON.stringify({operation:complete?'ATTEST_OFFICIAL_HISTORY_COMPLETE':'HISTORY_REVIEW_REQUIRED',batchId:input.batchId,reason:input.evidenceReason})}});
 });
 return {...result,message:'Datos incorporados. Las asignaciones y entregas previas se conservan; revisa la conciliación de merch antes de aplicar nuevos derechos.'};
}
