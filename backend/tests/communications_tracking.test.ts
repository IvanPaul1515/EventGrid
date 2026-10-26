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
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { seedBarcamp2026 } from '../prisma/barcamp2026.js';
import { beforeEach } from 'vitest';
let eventId:string,otherId:string,regs:string[]=[];const tokens:Record<string,string>={};let provider:any;
const requestApi=(path:string,role='ADMIN')=>request(app).get('/api/v1/communications'+path).set('Authorization','Bearer '+tokens[role]).set('X-Event-Id',eventId);
const postApi=(path:string,role:string,body:any)=>request(app).post('/api/v1/communications'+path).set('Authorization','Bearer '+tokens[role]).set('X-Event-Id',eventId).send(body);
const log=(registrationId:string,status:string,templateCode='DIGITAL_TICKET')=>prisma.emailLog.create({data:{eventId,registrationId,recipientEmail:'safe@example.invalid',subject:'Asunto guardado',templateCode,status,errorMessage:status==='FAILED'?'EAUTH password=secret-test-token':null}});
beforeAll(async()=>{
 const event=await seedBarcamp2026(prisma);eventId=event.id;
 await prisma.eventSettings.create({data:{eventId}});
 otherId=(await prisma.event.create({data:{slug:'other-tracking',name:'Other',year:2025,startDate:new Date(),endDate:new Date()}})).id;
 for(const role of ['ADMIN','OPERATOR','VIEWER']){const user=await prisma.user.create({data:{email:role+'@tracking.invalid',fullName:role,role,assignedEventId:role==='ADMIN'?null:eventId,passwordHash:'unused'}});tokens[role]=jwt.sign({id:user.id},'isolated-courtesy-test');}
 for(let i=0;i<5;i++){const p=await prisma.participant.create({data:{firstName:'Ana María',lastName:'Gómez Pérez '+i,fullName:'Ana María Gómez Pérez '+i,email:i===4?'invalid-address':'ana'+i+'@example.invalid',documentId:'QA-DOC-'+i}});regs.push((await prisma.registration.create({data:{eventId,participantId:p.id,registrationNumber:'QA-'+i,qrCode:crypto.randomUUID(),status:i===3?'PENDING':'CONFIRMED',ticketPrice:1750,balanceDue:1750,isCourtesy:i===2}})).id);}
 provider=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('No provider allowed in read-only QA');});
});
beforeEach(async()=>{await prisma.emailBatchItem.deleteMany();await prisma.emailBatchJob.deleteMany();await prisma.emailLog.deleteMany();});
afterAll(async()=>{expect(provider).not.toHaveBeenCalled();provider.mockRestore();await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
describe('communication tracking, isolated real SQLite',()=>{
 it('treats an empty history as success and paginates participant search by full surname, email, document and registration',async()=>{
  const empty=await requestApi('/tracking/registration/'+regs[0]);expect(empty.status).toBe(200);expect(empty.body.data).toEqual([]);
  for(const search of ['Ana María Gómez Pérez','ana0@example.invalid','QA-DOC-0','QA-0']){const r=await requestApi('/tracking/participants?search='+encodeURIComponent(search)+'&limit=1');expect(r.status,r.text).toBe(200);expect(r.body.data).toHaveLength(1);expect(r.body.pagination.total).toBeGreaterThan(0);}
 });
 it('deduplicates batch mirrors, counts accepted participants once, excludes simulations and invalid recipients',async()=>{
  const accepted=await log(regs[0],'ACCEPTED_BY_SMTP');await log(regs[0],'FAILED');await log(regs[1],'SIMULATED');
  const job=await prisma.emailBatchJob.create({data:{eventId,subject:'Job',templateCode:'DIGITAL_TICKET'}});
  await prisma.emailLog.update({where:{id:accepted.id},data:{batchId:job.id,messageId:'mock-message'}});
  await prisma.emailBatchItem.create({data:{jobId:job.id,registrationId:regs[0],recipientEmail:'safe@example.invalid',status:'ACCEPTED_BY_SMTP',attempts:1,messageId:'mock-message'}});
  await prisma.emailBatchItem.create({data:{jobId:job.id,registrationId:regs[2],recipientEmail:'safe2@example.invalid',status:'PENDING',attempts:0}});
  const r=await requestApi('/tracking/summary');expect(r.status,r.text).toBe(200);expect(r.body.data).toMatchObject({records:4,totalAttempts:3,accepted:1,failed:1,simulated:1,pending:1,uniqueContacted:1,missingDigital:2,invalidExcluded:1});
  expect(r.body.data.days.length).toBeGreaterThan(0);expect(r.body.data.templates[0].count).toBe(4);
 });
 it('filters persisted states, missing digital eligibility, courtesy and unpaid participants in the database',async()=>{
  await log(regs[0],'DELIVERED');await log(regs[1],'UNKNOWN_DELIVERY_STATUS');await log(regs[2],'PROCESSING');
  const expected:any={NONE:2,DIGITAL:1,ACCEPTED:1,UNCERTAIN:1,PENDING:1,MISSING_DIGITAL:2,COURTESY:1,CONFIRMED:4,UNPAID:5};
  for(const [filter,total] of Object.entries(expected)){const r=await requestApi('/tracking/participants?filter='+filter);expect(r.status,r.text).toBe(200);expect(r.body.pagination.total,filter).toBe(total);}
 });
 it('scopes all readers to the edition and operator digital-ticket capability without leaking raw provider errors',async()=>{
  await log(regs[0],'FAILED');await log(regs[0],'SENT','EVENT_REMINDER');
  const operator=await requestApi('/tracking/registration/'+regs[0],'OPERATOR');expect(operator.status).toBe(200);expect(operator.body.data).toHaveLength(1);expect(operator.body.data[0].errorMessage).toBeNull();
  const admin=await requestApi('/tracking/registration/'+regs[0]);expect(admin.body.data).toHaveLength(2);expect(JSON.stringify(admin.body)).not.toContain('secret-test-token');
  expect((await requestApi('/tracking/summary?eventId='+otherId,'OPERATOR')).status).toBe(403);
  expect((await requestApi('/tracking/summary','VIEWER')).status).toBe(403);
  const p=await prisma.participant.create({data:{firstName:'Other',lastName:'Event',fullName:'Other Event',email:'other@qa.invalid'}});
  const foreign=await prisma.registration.create({data:{eventId:otherId,participantId:p.id,registrationNumber:'OTHER',qrCode:crypto.randomUUID()}});
  expect((await requestApi('/tracking/registration/'+foreign.id)).status).toBe(404);
  await prisma.registration.create({data:{eventId:otherId,participantId:(await prisma.registration.findUniqueOrThrow({where:{id:regs[0]}})).participantId,registrationNumber:'OTHER-SAME',qrCode:crypto.randomUUID()}});
  const details=await request(app).get('/api/v1/participants/'+regs[0]).set('Authorization','Bearer '+tokens.OPERATOR).set('X-Event-Id',eventId);
  expect(details.status,details.text).toBe(200);expect(details.body.data.editionHistory).toEqual([]);expect(details.body.data.emailHistory.every((item:any)=>item.templateCode==='DIGITAL_TICKET'&&!item.errorMessage)).toBe(true);
 });
 it('provides one paged badge query and rejects oversized untrusted filters',async()=>{
  await log(regs[0],'PENDING');const r=await requestApi('/tracking/badges?ids='+regs.slice(0,2).join(','));expect(r.status,r.text).toBe(200);expect(r.body.data).toHaveLength(2);expect(r.body.data[0].communicationCount).toBe(1);
  expect((await requestApi('/tracking/participants?limit=10000')).status).toBe(400);
 });
 it('keeps operator templates official, prohibits edits/custom HTML and never sends on previews or statistics',async()=>{
  const templates=await requestApi('/templates','OPERATOR');expect(templates.status).toBe(200);expect(templates.body.data.every((x:any)=>x.code==='DIGITAL_TICKET')).toBe(true);
  expect((await postApi('/preview','OPERATOR',{eventId,registrationId:regs[0],templateCode:'EVENT_REMINDER'})).status).toBe(403);
  expect((await postApi('/send','OPERATOR',{eventId,registrationId:regs[0],templateCode:'DIGITAL_TICKET',customSubject:'tamper'})).status).toBe(403);
  const preview=await postApi('/preview','OPERATOR',{eventId,registrationId:regs[0],templateCode:'DIGITAL_TICKET'});expect(preview.status,preview.text).toBe(200);expect(preview.body.data.html).toContain('QR');expect(preview.body.data.qrDataUrl).toContain('data:image/');
  expect(await prisma.emailLog.count()).toBe(0);
  expect((await request(app).put('/api/v1/communications/templates/x').set('Authorization','Bearer '+tokens.OPERATOR).set('X-Event-Id',eventId).send({subject:'tamper'})).status).toBe(403);
 });
 it('invalidates communications after an explicit simulated send, without contacting a provider',async()=>{
  const emit=vi.spyOn(RealtimeService,'changed');try{const result=await postApi('/send','OPERATOR',{eventId,registrationId:regs[0],templateCode:'DIGITAL_TICKET',mode:'SIMULATION',simulateOnly:true});expect(result.status,result.text).toBe(200);expect(result.body.data.simulated).toBe(true);expect(emit).toHaveBeenCalledWith(eventId,['communications']);const summary=await requestApi('/tracking/summary');expect(summary.body.data).toMatchObject({accepted:0,simulated:1,uniqueContacted:0});}finally{emit.mockRestore();}
 });
 it('distinguishes every processing state and counts no simulated contact as real',async()=>{
  for(const state of ['PREPARED','PENDING','PROCESSING','ACCEPTED_BY_SMTP','DELIVERED','FAILED','UNKNOWN_DELIVERY_STATUS','SIMULATED','CANCELLED','DEFERRED','BLOCKED'])await log(regs[0],state);
  const r=await requestApi('/tracking/summary');expect(r.status,r.text).toBe(200);expect(r.body.data).toMatchObject({records:11,totalAttempts:8,accepted:2,delivered:1,pending:3,processing:1,failed:2,uncertain:1,simulated:1,uniqueContacted:1});
  const history=await requestApi('/tracking/registration/'+regs[0]+'?limit=2&page=2');expect(history.status).toBe(200);expect(history.body.data).toHaveLength(2);expect(history.body.pagination).toMatchObject({page:2,total:11,totalPages:6});
 });
 it('counts a requeued batch state without counting its historical attempt twice',async()=>{
  const previous=await log(regs[0],'FAILED');const job=await prisma.emailBatchJob.create({data:{eventId,subject:'Retry review',templateCode:'DIGITAL_TICKET'}});
  await prisma.emailLog.update({where:{id:previous.id},data:{batchId:job.id}});await prisma.emailBatchItem.create({data:{jobId:job.id,registrationId:regs[0],recipientEmail:'qa@example.invalid',status:'PENDING',attempts:1}});
  const summary=await requestApi('/tracking/summary');expect(summary.status,summary.text).toBe(200);expect(summary.body.data).toMatchObject({records:2,totalAttempts:1,pending:1,failed:1});
  expect((await postApi('/send-bulk','OPERATOR',{eventId,templateCode:'DIGITAL_TICKET',targetGroup:'ALL'})).status).toBe(403);
 });
 it('rejects a recipient changed after preview without logging or contacting a provider',async()=>{
  const r=await postApi('/send','OPERATOR',{eventId,registrationId:regs[0],templateCode:'DIGITAL_TICKET',expectedRecipientEmail:'previous@example.invalid'});expect(r.status).toBe(400);expect(await prisma.emailLog.count()).toBe(0);
 });
 it('does not retry uncertain messages from an operator session, even with resend flags',async()=>{
  await log(regs[0],'UNKNOWN_DELIVERY_STATUS');const r=await postApi('/send','OPERATOR',{eventId,registrationId:regs[0],templateCode:'DIGITAL_TICKET',forceResend:true,confirmedResend:true,resendReason:'unsafe retry'});expect(r.status).toBe(403);expect(await prisma.emailLog.count()).toBe(1);
 });
});
