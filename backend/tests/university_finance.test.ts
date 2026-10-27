import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';

const fixture = await vi.hoisted(async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eventgrid-courtesy-qa-'));
  const db = path.join(directory, 'test.db'); fs.writeFileSync(db, '');
  const url = 'file:' + db.replaceAll('\\', '/');
  execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)), 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  const previous = process.env.DATABASE_URL; process.env.DATABASE_URL = url;
  return { url, previous };
});
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';


import * as XLSX from 'xlsx';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { ImportService } from '../src/modules/import/import.service.js';
import { FinanceService } from '../src/modules/finance/finance.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { writeTransaction } from '../src/utils/writeTransaction.js';
import { recipientIneligibility } from '../src/modules/communications/recipient-policy.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
let adminId:string,operatorId:string,provider:any;
const mapping={ref:'externalReference',first:'firstName',last:'lastName',email:'email',doc:'documentId',paid:'paidFullIndicator',method:'paymentMethod',amount:'amountPaid'};
const row=(ref:string,paid='NO',extra:any={})=>({ref,first:'Synthetic',last:'Person '+ref,email:ref.toLowerCase()+'@example.invalid',doc:'DOC-'+ref,paid,method:'Tarjeta',...extra});
async function edition(){const event=await prisma.event.create({data:{slug:crypto.randomUUID(),name:'Synthetic university edition',year:2026,startDate:new Date(),endDate:new Date()}});const ticket=await prisma.ticketType.create({data:{eventId:event.id,name:'General',price:1750}});await prisma.event.update({where:{id:event.id},data:{defaultTicketTypeId:ticket.id}});await prisma.eventSettings.create({data:{eventId:event.id}});return {...event,ticket};}
const execute=(eventId:string,rows:any[],strategy:any='UPDATE',defaults:any={externalPlatform:'Universidad QA'})=>ImportService.executeImport(eventId,adminId,'synthetic.xlsx',1,rows,mapping,strategy,defaults);
beforeAll(async()=>{adminId=(await prisma.user.create({data:{email:'admin@university.invalid',fullName:'Synthetic Admin',role:'ADMIN',passwordHash:'unused'}})).id;operatorId=(await prisma.user.create({data:{email:'op@university.invalid',fullName:'Synthetic Operator',role:'OPERATOR',passwordHash:'unused'}})).id;provider=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('Real mail forbidden');});});
afterAll(async()=>{expect(provider).not.toHaveBeenCalled();provider.mockRestore();await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
describe('university imports and financial integrity',()=>{
 it('recognizes the shifted 17-column report and excludes decorative totals without real personal data',()=>{
  const headers=['No. Registro','Nombres','Apellidos','Doc. Identidad','Lista de Espera','Organización/Empresa','RNC','','','Email','','Teléfono','','Tel. Alterno','Forma Pago','Categoria','Pago Total'];
  const rows=Array.from({length:49},(_,i)=>['00'+(i+1),'Synthetic '+i,'Fixture','001'+String(i).padStart(7,'0')+'1','NO','Empresa QA','001234567','','','person'+i+'@example.invalid','',i===1?'+34612345678':'8095551234','','','Tarjeta','Estudiante',i<28?'SÍ':'NO']);
  const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['Reporte sintético'],[],[],[],[],headers,...rows,['','','','','','','','Total participantes','','','','49']]),'QA');
  const result=ImportService.analyzeFile(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}).toString('base64'),'synthetic.xlsx');
  expect(result.headerRowIndex).toBe(5);expect(result.totalRows).toBe(49);expect(result.autoMapping.RNC).toBe('organizationRnc');expect(result.autoMapping.Categoria).toBe('participantCategory');expect(result.autoMapping['Pago Total']).toBe('paidFullIndicator');expect(result.autoMapping['Organización/Empresa']).toBe('institution');
  expect(result.autoMapping.Columna_8).toBe('IGNORE');expect(result.autoMapping.Columna_9).toBe('IGNORE');expect(result.rows.some((r:any)=>r.Columna_8)).toBe(false);
 });
 it('credits 28 complete external payments, leaves 21 pending and never attributes the funds to EventGrid cash',async()=>{
  const e=await edition();const input=Array.from({length:49},(_,i)=>row('FORTY-'+i,i<28?'SÍ':'NO'));
  const result=await execute(e.id,input);expect(result.importedCount).toBe(49);
  const summary=await FinanceService.summary(e.id);expect(summary).toMatchObject({externalPayments:49000,onsitePayments:0,confirmedPayments:49000,receivable:36750,netAccredited:49000});
  const payments=await prisma.payment.findMany({where:{registration:{eventId:e.id}}});expect(payments).toHaveLength(28);expect(payments.every(p=>p.channel==='EXTERNAL'&&p.receivedByUserId===null&&p.recordedByUserId===adminId)).toBe(true);
  expect((await execute(e.id,input)).importedCount).toBe(0);expect(await prisma.payment.count({where:{registration:{eventId:e.id}}})).toBe(28);
 });
 it('reconciles NO to YES at the frozen historical fare and flags YES to NO without erasing payments',async()=>{
  const e=await edition();await execute(e.id,[row('CHANGE','NO')]);const old=await prisma.registration.findFirstOrThrow({where:{eventId:e.id}});
  await prisma.ticketType.update({where:{id:e.ticket.id},data:{price:2500}});await execute(e.id,[row('CHANGE','YES')]);
  const paid=await prisma.registration.findUniqueOrThrow({where:{id:old.id}});expect(Number(paid.amountPaid)).toBe(1750);expect(Number(paid.ticketPrice)).toBe(1750);expect(paid.registrationNumber).toBe(old.registrationNumber);
  // A repeated old file still reports its contradiction after a newer YES revision.
  await execute(e.id,[row('CHANGE','NO')]);expect(Number((await prisma.registration.findUniqueOrThrow({where:{id:old.id}})).amountPaid)).toBe(1750);
  expect(await prisma.financialReview.count({where:{registrationId:old.id,code:'PAID_TO_UNPAID'}})).toBe(1);expect(await prisma.payment.count({where:{registrationId:old.id}})).toBe(1);
 });
 it('keeps RNC, category, leading zero, foreign phone and shared emails separate from participant identity',async()=>{
  const e=await edition();const extraMapping={...mapping,rnc:'organizationRnc',category:'participantCategory',phone:'phone'};
  const rows=[row('SHARED-1','NO',{doc:'00112345671',email:'shared@example.invalid',rnc:'001234567',category:'Estudiante',phone:'+34612345678'}),row('SHARED-2','NO',{email:'shared@example.invalid'})];
  const result=await ImportService.executeImport(e.id,adminId,'synthetic.xlsx',1,rows,extraMapping,'UPDATE',{externalPlatform:'University'});expect(result.importedCount).toBe(2);
  const reg=await prisma.registration.findFirstOrThrow({where:{eventId:e.id,externalReference:'SHARED-1'},include:{participant:true}});expect(reg.organizationRnc).toBe('001234567');expect(reg.participant.documentId).toBe('001-1234567-1');expect(reg.participantCategory).toBe('Estudiante');expect(reg.participant.phone).toBe('+34612345678');
 });
 it('does not invent a fee among multiple alternatives or credit a numeric field from a boolean',async()=>{
  const e=await edition();await prisma.ticketType.create({data:{eventId:e.id,name:'Other',price:2500}});
  await execute(e.id,[row('AMBIGUOUS','YES')]);expect((await FinanceService.summary(e.id)).confirmedPayments).toBe(0);expect(await prisma.financialReview.count({where:{eventId:e.id,code:'AMBIGUOUS_TARIFF'}})).toBe(1);
  const bad=await ImportService.validateRows(e.id,[{...row('BAD'),amount:'SÍ'}],mapping);expect(bad.errorRows).toBe(1);
  await expect(ImportService.executeImport(e.id,operatorId,'synthetic.xlsx',1,[row('OVERRIDE','YES')],mapping,'UPDATE',{externalPlatform:'QA',ticketTypeId:e.ticket.id,tariffApproved:'true'})).rejects.toThrow(/administrativa/);
 });
 it('requires explicit refund stages, retains original funds and prevents over-refunds or repeated confirmation',async()=>{
  const e=await edition();await execute(e.id,[row('REFUND','YES')]);const r=await prisma.registration.findFirstOrThrow({where:{eventId:e.id}}),p=await prisma.payment.findFirstOrThrow({where:{registrationId:r.id}});
  await ParticipantsService.cancelRegistration(e.id,r.id,'Cancelación voluntaria de prueba',adminId);
  const requestKey=crypto.randomUUID();const refund=await FinanceService.requestRefund(e.id,adminId,{paymentId:p.id,amount:1000,reason:'Solicitud de prueba',requestKey});expect((await FinanceService.requestRefund(e.id,adminId,{paymentId:p.id,amount:1000,reason:'Solicitud de prueba',requestKey})).id).toBe(refund.id);
  await expect(FinanceService.transitionRefund(e.id,adminId,refund.id,{status:'REFUNDED',version:0,reason:'No aprobado',confirmed:true,reference:'QA',method:'Externo'})).rejects.toThrow();
  let updated=await FinanceService.transitionRefund(e.id,adminId,refund.id,{status:'APPROVED',version:0,amount:1000,reason:'Aprobado de prueba'});updated=await FinanceService.transitionRefund(e.id,adminId,refund.id,{status:'PENDING_RETURN',version:updated.version,reason:'Esperando confirmación externa'});
  expect((await FinanceService.summary(e.id)).netAccredited).toBe(1750);
  updated=await FinanceService.transitionRefund(e.id,adminId,refund.id,{status:'REFUNDED',version:updated.version,reason:'Devolución externa confirmada de prueba',confirmed:true,reference:'QA-REF-1',method:'Confirmación externa'});
  expect((await FinanceService.summary(e.id)).netAccredited).toBe(750);expect(Number((await prisma.payment.findUniqueOrThrow({where:{id:p.id}})).amount)).toBe(1750);
  await expect(FinanceService.transitionRefund(e.id,adminId,refund.id,{status:'REFUNDED',version:updated.version,reason:'Duplicado',confirmed:true,reference:'QA',method:'Externo'})).rejects.toThrow();
  const excess=await FinanceService.requestRefund(e.id,adminId,{paymentId:p.id,amount:900,reason:'Otra solicitud',requestKey:crypto.randomUUID()});await expect(FinanceService.transitionRefund(e.id,adminId,excess.id,{status:'APPROVED',version:0,reason:'Intento excesivo'})).rejects.toThrow(/supera/);
 });
 it('blocks attended cancellation and stale/noneligible nonpayment batches',async()=>{
  const e=await edition();await execute(e.id,[row('DUE','NO')]);const r=await prisma.registration.findFirstOrThrow({where:{eventId:e.id}});await prisma.eventSettings.update({where:{eventId:e.id},data:{paymentDeadlineAt:new Date(Date.now()-60000)}});
  const preview=await FinanceService.previewNonpayment(e.id,adminId,[r.id]);expect(preview.rows[0].eligible).toBe(true);
  const pm=await prisma.paymentMethod.create({data:{eventId:e.id,name:'Efectivo'}});await ParticipantsService.recordPayment(e.id,r.id,{amount:10,paymentMethodId:pm.id},adminId);
  await expect(FinanceService.cancelNonpayment(e.id,adminId,preview.token,'Plazo vencido')).rejects.toThrow(/cambió/);
  await prisma.registration.update({where:{id:r.id},data:{attended:true,attendedAt:new Date(),attendedByUserId:adminId}});
  await expect(ParticipantsService.cancelRegistration(e.id,r.id,'Intento inválido',adminId)).rejects.toThrow(/asistencia/);
  await expect(FinanceService.previewNonpayment(e.id,operatorId,[r.id])).rejects.toThrow(/administrativa/);
 });
 it('keeps the external ledger idempotent with 5, 10 and 20 concurrent imports',async()=>{
  for(const count of [5,10,20]){const e=await edition();const results=await Promise.all(Array.from({length:count},()=>execute(e.id,[row('RACE-'+count,'YES')])));expect(results.reduce((n,r)=>n+r.importedCount,0)).toBe(1);expect(await prisma.registration.count({where:{eventId:e.id}})).toBe(1);expect(await prisma.payment.count({where:{registration:{eventId:e.id}}})).toBe(1);expect((await FinanceService.summary(e.id)).externalPayments).toBe(1750);}
 });
 it('requires administrative resolution of unknown tariffs without silently crediting money', async()=>{
   const e=await edition();await prisma.ticketType.create({data:{eventId:e.id,name:'Especial',price:2500}});
   await execute(e.id,[row('TARIFF','YES')]);const r=await prisma.registration.findFirstOrThrow({where:{eventId:e.id}});
   const review=await prisma.financialReview.findFirstOrThrow({where:{registrationId:r.id,code:'AMBIGUOUS_TARIFF'}});
   await expect(FinanceService.resolveReview(e.id,operatorId,review.id,{reason:'Intento',ticketTypeId:e.ticket.id})).rejects.toThrow(/administrativa/);
   await FinanceService.resolveReview(e.id,adminId,review.id,{reason:'Tarifa general confirmada documentalmente',ticketTypeId:e.ticket.id});
   expect((await FinanceService.summary(e.id)).confirmedPayments).toBe(0);
   await execute(e.id,[row('TARIFF','YES')]);expect((await FinanceService.summary(e.id)).externalPayments).toBe(1750);
 });
 it('uses template-specific eligibility and keeps cancellation/refund notices separate from digital entry',()=>{
   const cancelled={status:'CANCELLED',balanceDue:0,cancellationType:'VOLUNTARY'};
   expect(recipientIneligibility(cancelled,'DIGITAL_TICKET')).toBeTruthy();
   expect(recipientIneligibility({status:'PENDING',balanceDue:1750,paymentStatus:'PENDING'},'DIGITAL_TICKET')).toBeTruthy();
   expect(recipientIneligibility({status:'CONFIRMED',balanceDue:0,amountPaid:1750,paymentStatus:'PAID'},'DIGITAL_TICKET')).toBeNull();
   expect(recipientIneligibility({status:'CONFIRMED',balanceDue:0,isCourtesy:true,courtesyRequests:[{status:'PENDING'}]},'DIGITAL_TICKET')).toBeTruthy();
   expect(recipientIneligibility({status:'CANCELLED',refunds:[{status:'APPROVED'}]},'REFUND_APPROVED_NOTICE')).toBeNull();
   expect(recipientIneligibility({status:'CANCELLED',refunds:[{status:'APPROVED'}]},'REFUND_NOTICE')).toBeTruthy();
   expect(recipientIneligibility(cancelled,'VOLUNTARY_CANCELLATION')).toBeNull();
   expect(recipientIneligibility({status:'CONFIRMED'},'NONPAYMENT_CANCELLATION')).toBeTruthy();
   expect(recipientIneligibility(cancelled,'REFUND_NOTICE')).toBeTruthy();
   expect(recipientIneligibility({...cancelled,refunds:[{status:'REFUNDED'}]},'REFUND_NOTICE')).toBeNull();
   expect(recipientIneligibility({status:'CONFIRMED',balanceDue:0},'PAYMENT_REMINDER')).toBeTruthy();
   expect(CommunicationsService.DEFAULT_TEMPLATES.some(t=>t.code==='PAYMENT_REMINDER')).toBe(true);
 });

 it('enforces role and edition boundaries on finance endpoints and preserves cancellation history',async()=>{
   const e=await edition(),other=await edition();await execute(e.id,[row('SCOPE','NO')]);const reg=await prisma.registration.findFirstOrThrow({where:{eventId:e.id}});
   const op=await prisma.user.create({data:{email:crypto.randomUUID()+'@example.invalid',fullName:'Scoped Operator',role:'OPERATOR',passwordHash:'unused',assignedEventId:e.id}});
   const viewer=await prisma.user.create({data:{email:crypto.randomUUID()+'@example.invalid',fullName:'Scoped Viewer',role:'VIEWER',passwordHash:'unused',assignedEventId:e.id}});
   const token=(id:string)=>jwt.sign({id},'isolated-courtesy-test',{expiresIn:'1h'});
   for(const user of [op,viewer]){
     expect((await request(app).get(`/api/v1/events/${other.id}/finance/summary`).set('Authorization','Bearer '+token(user.id))).status).toBe(403);
     expect((await request(app).post(`/api/v1/events/${e.id}/finance/refunds`).set('Authorization','Bearer '+token(user.id)).send({})).status).toBe(403);
     expect((await request(app).post(`/api/v1/participants/${reg.id}/cancel`).set('Authorization','Bearer '+token(user.id)).set('X-Event-Id',e.id).send({reason:'Intento no autorizado'})).status).toBe(403);
   }
   await expect(ParticipantsService.update(e.id,reg.id,{status:'CANCELLED'},adminId)).rejects.toThrow(/operación administrativa/);
   await prisma.eventSettings.update({where:{eventId:e.id},data:{paymentDeadlineAt:new Date(Date.now()-10000)}});
   const preview=await FinanceService.previewNonpayment(e.id,adminId,[reg.id]);await FinanceService.cancelNonpayment(e.id,adminId,preview.token,'Plazo vencido revisado');
   const cancelled=await prisma.registration.findUniqueOrThrow({where:{id:reg.id}});expect(cancelled).toMatchObject({status:'CANCELLED',cancellationType:'NONPAYMENT',cancelledByUserId:adminId});expect(cancelled.registrationNumber).toBe(reg.registrationNumber);
   await expect(FinanceService.cancelNonpayment(e.id,adminId,preview.token,'Repetido')).rejects.toThrow();
 });
 it('reserves the original payment once under concurrent refund approvals',async()=>{
   const e=await edition();await execute(e.id,[row('REFUND-RACE','YES')]);const payment=await prisma.payment.findFirstOrThrow({where:{registration:{eventId:e.id}}});
   const requests=await Promise.all([1,2].map(()=>FinanceService.requestRefund(e.id,adminId,{paymentId:payment.id,amount:1000,reason:'Solicitud simultánea',requestKey:crypto.randomUUID()})));
   const results=await Promise.allSettled(requests.map(r=>FinanceService.transitionRefund(e.id,adminId,r.id,{status:'APPROVED',version:0,reason:'Aprobación concurrente'})));
   expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await FinanceService.summary(e.id)).refunded).toBe(0);
 });

});

it.runIf(process.env.EVENTGRID_FINANCE_BROWSER === 'true')('operates the financial review UI on an isolated mobile browser without moving money',async()=>{
 const e=await edition();await execute(e.id,[row('UI-PAID','YES'),row('UI-DUE','NO')]);
 const payment=await prisma.payment.findFirstOrThrow({where:{registration:{eventId:e.id}}});
 const password='Synthetic-finance-password-2026!';await prisma.user.update({where:{id:adminId},data:{passwordHash:await bcrypt.hash(password,10)}});
 const account=await AuthService.login('admin@university.invalid',password);
 const server=app.listen(4191,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const {createRequire}=await import('node:module');const run=createRequire(import.meta.url)('../../frontend/tests/finance-operations.cjs');console.log(JSON.stringify(await run({api:'http://127.0.0.1:4191/api/v1',base:'http://127.0.0.1:5189',eventId:e.id,account,paymentId:payment.id})));}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},90000);
