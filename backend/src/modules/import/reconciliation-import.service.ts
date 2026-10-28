import {mergeHistorical} from './intelligence.js';
import {MerchService} from '../merch/merch.service.js';
import crypto from 'node:crypto';
import { prisma } from '../../config/db.js';
import { ENV } from '../../config/env.js';
import { writeTransaction } from '../../utils/writeTransaction.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { FinanceService, financeAudit } from '../finance/finance.service.js';

const stored = (value: unknown) => ENV.DATABASE_URL?.startsWith('file:') ? JSON.stringify(value) : value;
export async function executeReconciledImport(input: { eventId: string; userId: string; fileName: string; fileSize: number; rows: any[]; columnMapping: Record<string,string>; conflictStrategy: string; batchDefaults: Record<string,string>; validation: any }) {
  const {eventId,userId,validation,batchDefaults} = input;
  const contentHash = crypto.createHash('sha256').update(JSON.stringify({ eventId, rows: input.rows, mapping: input.columnMapping, defaults: batchDefaults, strategy: input.conflictStrategy })).digest('hex');
  if(batchDefaults.importKind==='PURCHASES'&&input.conflictStrategy!=='UPDATE')throw new BadRequestError('Las compras históricas requieren confirmar la conciliación de registros existentes.');
  // Reserve from the shared atomic sequence, outside the batch transaction.
  // A failed/replayed import may leave gaps; reserved numbers are never reused.
  const reserved = new Map<number,string>();
  for (const row of validation.rowsSummary) if (row.status === 'VALID' && !row.normalized.identityConflict && !row.normalized.existingRegistrationId) reserved.set(row.rowNumber, await ParticipantsService.getNextRegistrationNumber(eventId));
  const result=await writeTransaction(async tx => {
    const actor=await tx.user.findUnique({where:{id:userId}});
    if(actor?.scannerOnly||!actor?.isActive||actor.accountStatus!=='ACTIVE'||!['ADMIN','OPERATOR'].includes(actor.role)||(actor.assignedEventId&&actor.assignedEventId!==eventId))throw new ForbiddenError('Importador fuera de la edición autorizada.');
    const event=await tx.event.findUnique({where:{id:eventId},include:{ticketTypes:true,paymentMethods:true}});if(!event)throw new NotFoundError('Edición no encontrada.');
    const previous=await tx.importBatch.findUnique({where:{eventId_contentHash:{eventId,contentHash}}});
    if(previous) {
      let updatedCount=0,reviewCount=0;
      for(const row of validation.rowsSummary) {
        const n=row.normalized;if(row.status==='ERROR'||n.identityConflict||!n.externalReference)continue;
        const match=await tx.registration.findFirst({where:{eventId,externalPlatform:n.externalPlatform,externalReference:n.externalReference},include:{participant:true}});
        if(!match||match.source!=='EXCEL_IMPORT'||(n.documentId&&match.participant.documentId&&n.documentId!==match.participant.documentId)||Number(match.ticketPrice)<=0)continue;
        const outcome=await FinanceService.externalReport(tx,{eventId,registrationId:match.id,actorId:userId,batchId:previous.id,reportedFull:n.paidFullIndicator||'UNKNOWN',cumulativeAmount:n.amountPaidProvided?Number(n.amountPaid):n.totalAmountProvided?Number(n.totalAmount):undefined,method:n.paymentMethod||undefined,reference:n.externalReference});
        if(outcome.outcome==='CREDITED')updatedCount++;if(outcome.outcome==='REVIEW')reviewCount++;
      }
      return {batchId:previous.id,fileName:previous.fileName,totalRows:input.rows.length,importedCount:0,updatedCount,skippedCount:input.rows.length-updatedCount,errorCount:0,reviewCount,errors:[],alreadyProcessed:true};
    }
    let approvedTicket:any;
    if(batchDefaults.ticketTypeId) {
      if(actor.role!=='ADMIN'||batchDefaults.tariffApproved!=='true')throw new ForbiddenError('La regla de tarifa del lote requiere confirmación administrativa.');
      approvedTicket=event.ticketTypes.find(t=>t.id===batchDefaults.ticketTypeId&&t.isActive&&Number(t.price)>0);if(!approvedTicket)throw new BadRequestError('Tarifa del lote fuera de la edición.');
    }
    const paidTickets=event.ticketTypes.filter(t=>t.isActive&&Number(t.price)>0);
    const batch=await tx.importBatch.create({data:{eventId,importedByUserId:userId,fileName:input.fileName,fileSize:input.fileSize,totalRows:input.rows.length,validRows:validation.validRows,importedRows:0,contentHash,mappingConfig:stored({columns:input.columnMapping,defaults:batchDefaults}) as any}});
    let importedCount=0,updatedCount=0,skippedCount=0,errorCount=0,reviewCount=0;
    const errors:any[]=[];
    for(const row of validation.rowsSummary) {
      const n=row.normalized;
      if(row.status==='ERROR') {errorCount++;const message=row.errors.join('; ');errors.push({rowNumber:row.rowNumber,message});await tx.importError.create({data:{importBatchId:batch.id,rowNumber:row.rowNumber,fieldName:'validation',errorMessage:message,rawRowData:stored(row.raw) as any}});continue;}
      let existing=n.existingRegistrationId?await tx.registration.findFirst({where:{id:n.existingRegistrationId,eventId},include:{participant:true}}):null;
      if(!existing&&n.externalReference)existing=await tx.registration.findFirst({where:{eventId,externalPlatform:n.externalPlatform,externalReference:n.externalReference},include:{participant:true}});
      const docKey=(v:string)=>String(v||'').replace(/[\s-]/g,'').toUpperCase();
      if(existing&&n.documentId&&existing.participant.documentId&&docKey(n.documentId)!==docKey(existing.participant.documentId))n.identityConflict=true;
      if(n.identityConflict) {
        await FinanceService.review(tx,{eventId,registrationId:existing?.id,sourceBatchId:batch.id,code:'IDENTITY_CONFLICT',reason:'La referencia y los datos de identidad requieren revisión; no se fusionaron personas.',evidence:{rowNumber:row.rowNumber,reference:n.externalReference},actorId:userId});reviewCount++;skippedCount++;continue;
      }
      if(existing&&input.conflictStrategy!=='UPDATE'){skippedCount++;continue;}
      if(existing&&(existing.source!=='EXCEL_IMPORT'||(existing.externalReference&&existing.externalReference!==n.externalReference)||(existing.externalPlatform&&existing.externalPlatform!==n.externalPlatform))) {
        await FinanceService.review(tx,{eventId,registrationId:existing.id,sourceBatchId:batch.id,code:'SOURCE_ASSOCIATION',reason:'La inscripción existente debe vincularse administrativamente a esta fuente; no se modificó.',evidence:{rowNumber:row.rowNumber,reference:n.externalReference},actorId:userId});reviewCount++;skippedCount++;continue;
      }
      const explicitTicket=n.ticketType?paidTickets.find(t=>t.name.toLowerCase()===String(n.ticketType).toLowerCase()):undefined;
      const ticket=existing?undefined:approvedTicket||explicitTicket||(paidTickets.length===1?paidTickets[0]:undefined);
      const price=existing?Number(existing.ticketPrice):n.ticketPriceProvided?Number(n.ticketPrice):ticket?Number(ticket.price):0;
      const ambiguous=!existing&&!n.ticketPriceProvided&&!ticket;
      if(!existing&&price<=0&&!ambiguous)throw new BadRequestError('Una tarifa nula no autoriza una cortesía por Excel.');
      const explicitPaid=n.amountPaidProvided?Number(n.amountPaid):n.totalAmountProvided?Number(n.totalAmount):undefined;
      let registration=existing;
      if(!registration&&batchDefaults.importKind==='PURCHASES')throw new BadRequestError('Las compras históricas solo actualizan inscripciones existentes identificadas.');
      if(!registration) {
        // Document/reference are the primary identity signals; shared email alone
        // never selects another physical participant.
        let participant=n.documentId?await tx.participant.findFirst({where:{documentId:n.documentId}}):null;
        if(!participant)participant=await tx.participant.create({data:{firstName:n.firstName,lastName:n.lastName||'—',fullName:`${n.firstName} ${n.lastName||''}`.trim(),email:n.email,documentId:n.documentId||null,phone:n.phone||null,alternatePhone:n.alternatePhone||null,institution:n.institution||null}});
        if(await tx.registration.findUnique({where:{eventId_participantId:{eventId,participantId:participant.id}}})) {
          await FinanceService.review(tx,{eventId,sourceBatchId:batch.id,code:'IDENTITY_CONFLICT',reason:'El documento ya tiene inscripción en esta edición.',evidence:{rowNumber:row.rowNumber},actorId:userId});reviewCount++;skippedCount++;continue;
        }
        let responsibleId:string|null=null;
        if(n.salesResponsible){const name=String(n.salesResponsible).trim();const found=await tx.salesResponsible.findFirst({where:{eventId,name}});responsibleId=found?.id||(await tx.salesResponsible.create({data:{eventId,name}})).id;}
        registration=await tx.registration.create({data:{eventId,participantId:participant.id,registrationNumber:reserved.get(row.rowNumber)!,source:'EXCEL_IMPORT',importBatchId:batch.id,ticketTypeId:ticket?.id||null,ticketPrice:price,amountPaid:0,totalAmount:0,balanceDue:price,paymentStatus:'PENDING',status:'PENDING',isVerified:false,externalReference:n.externalReference||null,externalPlatform:n.externalPlatform,externalPaymentStatus:n.externalPaymentStatus||null,externalPaymentMethod:n.paymentMethod||null,buyerName:n.buyerName||null,originLabel:n.externalPlatform,createdByUserId:userId,commercialUserId:null,salesResponsibleId:responsibleId,organizationRnc:n.organizationRnc||null,participantCategory:n.participantCategory||null,waitlistState:n.waitlistState,importOriginalData:JSON.stringify(row.raw),qrCode:'eg_qr_'+crypto.randomBytes(16).toString('hex'),qrGeneratedAt:new Date(),notes:n.notes||null,historicalDates:JSON.stringify(n.historicalDates||{}),...(n.historicalDates?.purchasedAt?.precision==='SECOND'&&n.historicalDates.purchasedAt.zone?{saleTimestamp:new Date(n.historicalDates.purchasedAt.value)}:{})},include:{participant:true}});
        importedCount++;
        await financeAudit(tx,userId,eventId,registration.id,'REGISTRATION_IMPORTED',{batchId:batch.id,externalReference:n.externalReference,source:n.externalPlatform,ticketPrice:price,reportedFull:n.paidFullIndicator,tariffRule:approvedTicket?.id||null});
      } else {
        // Personal differences are not silently overwritten by subsequent files.
        if(row.normalized.personalChanges?.length){await FinanceService.review(tx,{eventId,registrationId:registration.id,sourceBatchId:batch.id,code:'PERSONAL_DATA_CHANGED',reason:'La fuente propone cambios personales; se conservaron los valores existentes.',evidence:{fields:row.normalized.personalChanges,rowNumber:row.rowNumber},actorId:userId});reviewCount++;}
        await tx.registration.update({where:{id:registration.id},data:{lastExternalSyncAt:new Date(),externalPaymentStatus:n.externalPaymentStatus||undefined,importOriginalData:JSON.stringify(row.raw)}});updatedCount++;
      }
      if(n.historicalDates){const history=mergeHistorical(registration.historicalDates,n.historicalDates);if(history.conflicts.length){await FinanceService.review(tx,{eventId,registrationId:registration.id,sourceBatchId:batch.id,code:'HISTORICAL_DATE_CONFLICT',reason:'Fechas históricas conservadas; la nueva fuente requiere revisión.',evidence:{fields:history.conflicts},actorId:userId});reviewCount++;}await tx.registration.update({where:{id:registration.id},data:{historicalDates:history.value}});}
      if(ambiguous) {await FinanceService.review(tx,{eventId,registrationId:registration.id,sourceBatchId:batch.id,code:'AMBIGUOUS_TARIFF',reason:'La fuente no aporta importe de tarifa y hay varias tarifas posibles. No se acreditó dinero.',evidence:{rowNumber:row.rowNumber,reportedFull:n.paidFullIndicator},actorId:userId});reviewCount++;continue;}
      const outcome=await FinanceService.externalReport(tx,{eventId,registrationId:registration.id,actorId:userId,batchId:batch.id,reportedFull:n.paidFullIndicator||'UNKNOWN',cumulativeAmount:explicitPaid,method:n.paymentMethod||undefined,reference:n.externalReference||registration.registrationNumber});
      if(outcome.outcome==='REVIEW')reviewCount++;
    }
    await tx.importBatch.update({where:{id:batch.id},data:{importedRows:importedCount,updatedRows:updatedCount,skippedRows:skippedCount,errorRows:errorCount}});
    return {batchId:batch.id,fileName:input.fileName,totalRows:input.rows.length,importedCount,updatedCount,skippedCount,errorCount,reviewCount,errors};
  },{timeout:60000});
  let merch;try{merch=await MerchService.reconcileOfficialCaps(eventId,userId);}catch(error){console.warn('Conciliación de gorras pendiente tras importación conservada');merch={eligible:[],issues:[{reason:'Importación conservada; conciliación de gorras pendiente. Revisa Inventario de merch.'}]};}
  return {...result,merchReconciliation:merch};
}
