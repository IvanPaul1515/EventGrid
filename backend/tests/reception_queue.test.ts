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
it.runIf(process.env.EVENTGRID_QUEUE_BROWSER==='true')('integrates two desks and two restricted scanners through HTTP SSE and real QR decoding',async()=>{
 await reset();
 const accounts=await Promise.all(['queue-admin@example.invalid','queue-op2@example.invalid','queue-scanner@example.invalid','queue-scanner2@example.invalid'].map(email=>AuthService.login(email,password)));
 for(let i=1;i<=2;i++){
  const p=await prisma.participant.create({data:{firstName:'Queue Browser',lastName:i===1?'First':'Second',fullName:i===1?'Queue Browser First':'Queue Browser Second',email:`queue-browser-${i}@example.invalid`}});
  await prisma.registration.create({data:{eventId,participantId:p.id,registrationNumber:'QB-'+i,qrCode:'queue-browser-'+i,status:'CONFIRMED',isCourtesy:true}});
 }
 const server=app.listen(4191,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try{const {createRequire}=await import('node:module');const run=createRequire(import.meta.url)('../../frontend/tests/reception-queue.cjs');const result=await run({base:'http://127.0.0.1:5189',api:'http://127.0.0.1:4191/api/v1',eventId,accounts});expect(result.sessions).toBe(4);console.log(JSON.stringify(result));}
 finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},180000);

vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));

vi.mock('../src/config/db.js', async () => {

  const { PrismaClient } = await import('@prisma/client');

  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };

});

import { prisma } from '../src/config/db.js';

import { app } from '../src/app.js';




import { AuthService } from '../src/modules/auth/auth.service.js';
import { ReceptionQueueService as Q } from '../src/modules/scanner/queue.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { seedBarcamp2026 } from '../prisma/barcamp2026.js';
import { AuthUser } from '../src/middleware/auth.js';
let eventId:string,otherId:string,admin:AuthUser,op:AuthUser,op2:AuthUser,scanner:AuthUser,scanner2:AuthUser,viewer:AuthUser,registrationId:string;
const password='Isolated-queue-fixture-2026!';
async function account(email:string,role:'ADMIN'|'OPERATOR'|'VIEWER',scannerOnly=false){
 const user=await prisma.user.create({data:{email,role,scannerOnly,assignedEventId:eventId,fullName:email.split('@')[0],passwordHash:await bcrypt.hash(password,4)}});
 const login=await AuthService.login(email,password),decoded=jwt.decode(login.token) as any;
 return {...login.user,sessionId:decoded.sid,sessionVersion:decoded.sessionVersion,token:login.token} as AuthUser&{token:string};
}
beforeAll(async()=>{
 eventId=(await seedBarcamp2026(prisma)).id;
 otherId=(await prisma.event.create({data:{name:'Other',slug:'queue-other',year:2027,startDate:new Date(),endDate:new Date()}})).id;
 admin=await account('queue-admin@example.invalid','ADMIN');op=await account('queue-op@example.invalid','OPERATOR');op2=await account('queue-op2@example.invalid','OPERATOR');scanner=await account('queue-scanner@example.invalid','OPERATOR',true);scanner2=await account('queue-scanner2@example.invalid','OPERATOR',true);viewer=await account('queue-viewer@example.invalid','VIEWER');
 const p=await prisma.participant.create({data:{firstName:'Queue',lastName:'Fixture',fullName:'Queue Fixture',email:'queue-person@example.invalid'}});
 registrationId=(await prisma.registration.create({data:{eventId,participantId:p.id,registrationNumber:'QUEUE-QA',qrCode:'queue-qa-token',status:'CONFIRMED',isCourtesy:true}})).id;
});
afterAll(async()=>{await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
async function reset(){await prisma.queueEntry.deleteMany();await prisma.queueDevice.deleteMany();await prisma.queueStation.deleteMany();await prisma.receptionQueue.deleteMany();await prisma.registration.update({where:{id:registrationId},data:{attended:false,attendedAt:null,status:'CONFIRMED'}});await Q.configure(admin,eventId,true);}
async function link(mobile=scanner,owner=op,stationId?:string){
 const s=stationId?{id:stationId}:await Q.station(owner,eventId,'QA station','QUEUE');
 const d=await Q.request(mobile,eventId,s.id);
 await Q.decide(owner,eventId,d.id,true);
 const state=await Q.state(owner,eventId),code=state.devices.find(x=>x.id===d.id)!.code!;
 await Q.confirm(mobile,eventId,d.id,code);return d;
}
describe('collaborative reception, isolated SQLite and no mail',()=>{
 it('is opt-in and requires administration for policy, preserving Consulta',async()=>{
  await expect(Q.configure(op,eventId,true)).rejects.toThrow();await expect(Q.configure(viewer,eventId,true)).rejects.toThrow();
  await expect(Q.station(op,eventId,'QA','QUEUE')).rejects.toThrow();await reset();
 });
 it('supports different accounts and multiple scanners, with explicit approval and private codes',async()=>{
  await reset();const s=await Q.station(op,eventId,'PC multi','QUEUE');
  const pending=await Q.request(scanner,eventId,s.id);
  const mobile=await Q.state(scanner,eventId);expect(JSON.stringify(mobile)).not.toContain('code');
  await expect(Q.confirm(scanner,eventId,pending.id,'000000')).rejects.toThrow();
  await Q.decide(op,eventId,pending.id,true);const code=(await Q.state(op,eventId)).devices[0].code!;await Q.confirm(scanner,eventId,pending.id,code);
  await link(scanner2,op,s.id);expect((await Q.state(op,eventId)).devices.filter(d=>d.status==='LINKED')).toHaveLength(2);
  await expect(Q.decide(op2,eventId,pending.id,true)).rejects.toThrow();
 });
 it('deduplicates concurrent reads without check-in and excludes invalid tickets',async()=>{
  await reset();const a=await link(),s=(await Q.state(op,eventId)).station!,b=await link(scanner2,op,s.id);
  const reads=await Promise.all([Q.submit(scanner,eventId,'queue-qa-token',a.id),Q.submit(scanner2,eventId,'queue-qa-token',b.id)]);
  expect(reads.every(x=>x.status==='QUEUED')).toBe(true);expect(await prisma.queueEntry.count()).toBe(1);
  expect((await prisma.registration.findUniqueOrThrow({where:{id:registrationId}})).attended).toBe(false);
  expect((await Q.submit(scanner,eventId,'invalid-qa',a.id)).status).toBe('REJECTED');expect(await prisma.queueEntry.count()).toBe(1);
 });
 it('claims atomically across operators, renews and recovers expiry',async()=>{
  await reset();const d=await link();await Q.submit(scanner,eventId,'queue-qa-token',d.id);const e=(await Q.list(op,eventId))[0];
  const claims=await Promise.allSettled([Q.claim(op,eventId,e.id),Q.claim(op2,eventId,e.id)]);expect(claims.filter(c=>c.status==='fulfilled')).toHaveLength(1);
  const owner=(await prisma.queueEntry.findUniqueOrThrow({where:{id:e.id}})).claimedByUserId===op.id?op:op2,other=owner.id===op.id?op2:op;
  await expect(AttendanceService.checkIn(eventId,registrationId,other.id,undefined,false,other.sessionId)).rejects.toThrow();
  await prisma.queueEntry.update({where:{id:e.id},data:{claimUntil:new Date(0)}});await Q.claim(other,eventId,e.id);
  await AttendanceService.checkIn(eventId,registrationId,other.id,undefined,false,other.sessionId);
  expect((await Q.list(op,eventId))[0].state).toBe('CONFIRMED');expect((await Q.submit(scanner,eventId,'queue-qa-token',d.id)).result).toBe('ALREADY_CHECKED_IN');
 });
 it('blocks scanner administrative HTTP access, including direct attendance and alternative aliases',async()=>{
  const token=(scanner as any).token,h={Authorization:'Bearer '+token,'X-Event-Id':eventId};
  for(const path of ['/participants','/users','/attendance','/finance','/events/'+eventId+'/reception-queue/entries','/events/'+eventId+'/scanner/state','/api/events/'+eventId+'/status']){
   const result=await request(app).get(path.startsWith('/api/')?path:'/api/v1'+path).set(h);expect([403,404]).toContain(result.status);
  }
  expect((await request(app).post('/api/v1/attendance/check-in').set(h).send({registrationId})).status).toBe(403);
  const events=await request(app).get('/api/v1/events').set(h);expect(events.status).toBe(200);expect(events.body.data).toHaveLength(1);
  await expect(Q.list(scanner,eventId)).rejects.toThrow();await expect(Q.station(scanner,eventId,'Forbidden','QUEUE')).rejects.toThrow();
 });
 it('rejects other editions, revoked devices and disabled policies without deleting entries',async()=>{
  await reset();const d=await link();await Q.submit(scanner,eventId,'queue-qa-token',d.id);
  await expect(Q.submit(scanner,otherId,'queue-qa-token',d.id)).rejects.toThrow();await Q.unlink(op,eventId,d.id);
  await expect(Q.submit(scanner,eventId,'queue-qa-token',d.id)).rejects.toThrow();await Q.configure(admin,eventId,false);expect(await prisma.queueEntry.count()).toBe(1);
 });
 it('does not revive expired codes and prevents concurrent active device requests',async()=>{
  await reset();const s=await Q.station(op,eventId,'PC','QUEUE');const attempts=await Promise.allSettled([Q.request(scanner,eventId,s.id),Q.request(scanner,eventId,s.id)]);expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
  const d=await prisma.queueDevice.findFirstOrThrow({where:{sessionId:scanner.sessionId!}});await prisma.queueDevice.update({where:{id:d.id},data:{expiresAt:new Date(0)}});await expect(Q.decide(op,eventId,d.id,true)).rejects.toThrow();
  expect((await Q.state(scanner,eventId)).device).toBeNull();expect((await Q.request(scanner,eventId,s.id)).id).not.toBe(d.id);
 });
 it('keeps queue SSE hints free of participant data and filters administrative events for scanners',async()=>{
  const {RealtimeService}=await import('../src/modules/realtime/realtime.service.js'),messages:string[]=[];
  const response={write:(s:string)=>{messages.push(s);},end:()=>{}} as any;
  RealtimeService.addClient(eventId,response,{userId:scanner.id,role:'OPERATOR',scannerOnly:true,sessionId:scanner.sessionId});messages.length=0;
  RealtimeService.emit(eventId,{type:'CHECK_IN_CONFIRMED',data:{registrationId:'hidden'}});expect(messages).toHaveLength(0);
  Q.hint(eventId);expect(messages.join('')).toContain('RECEPTION_QUEUE_CHANGED');expect(messages.join('')).not.toContain('hidden');RealtimeService.removeClient(eventId,response);
 });
 it('records incidents without attendance and only allows the claim owner to change an entry in attention',async()=>{
  await reset();const d=await link();await Q.submit(scanner,eventId,'queue-qa-token',d.id);const e=(await Q.list(op,eventId))[0];
  await Q.claim(op,eventId,e.id);await expect(Q.incident(op2,eventId,e.id,'Foreign claim')).rejects.toThrow();
  await Q.incident(op,eventId,e.id,'Documento pendiente de verificación');expect((await Q.list(op,eventId))[0].state).toBe('INCIDENT');
  expect((await prisma.registration.findUniqueOrThrow({where:{id:registrationId}})).attended).toBe(false);
  expect(await prisma.auditLog.count({where:{entityId:registrationId,action:'UPDATE'}})).toBeGreaterThan(0);
  await Q.claim(op2,eventId,e.id);expect((await Q.list(op2,eventId))[0].mine).toBe(true);
 });
 it('adds queue tables to an existing isolated SQLite without losing registration history',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{execFileSync}=await import('node:child_process'),{PrismaClient}=await import('@prisma/client');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eventgrid-queue-upgrade-')),url='file:'+path.join(dir,'upgrade.db').replaceAll('\\','/');
  fs.writeFileSync(path.join(dir,'upgrade.db'),'');
  const {fileURLToPath}=await import('node:url');
  const currentSchema=fileURLToPath(new URL('../prisma/schema.sqlite.prisma',import.meta.url));
  const prismaCli=fileURLToPath(new URL('../../node_modules/prisma/build/index.js',import.meta.url));
  const source=fs.readFileSync(currentSchema,'utf8'),before=source.split('// Collaborative reception is opt-in;')[0].replace(/  scannerOnly Boolean @default\(false\)\r?\n/,'');
  const schema=path.join(dir,'before.prisma');fs.writeFileSync(schema,before);
  const push=(schema:string)=>execFileSync(process.execPath,[prismaCli,'db','push','--schema',schema,'--skip-generate'],{env:{...process.env,DATABASE_URL:url},stdio:'pipe'});
  push(schema);const old=new PrismaClient({datasourceUrl:url});let eId:string,id:string;
  try{const e=await old.event.create({data:{name:'Preserved fixture',slug:'preserved-fixture',year:2026,startDate:new Date(),endDate:new Date()}});eId=e.id;const p=await old.participant.create({data:{firstName:'Preserved',lastName:'Fixture',fullName:'Preserved Fixture',email:'preserved@example.invalid'}});id=(await old.registration.create({data:{eventId:e.id,participantId:p.id,registrationNumber:'KEEP-1',qrCode:'keep-qr',attended:true,attendedAt:new Date('2026-10-01T10:00:00Z'),ticketPrice:1750,amountPaid:1750,totalAmount:1750,status:'CONFIRMED'}})).id;}finally{await old.$disconnect();}
  push(currentSchema);const upgraded=new PrismaClient({datasourceUrl:url});try{const row=await upgraded.registration.findUniqueOrThrow({where:{id:id!}});expect(row.registrationNumber).toBe('KEEP-1');expect(row.attended).toBe(true);expect(Number(row.amountPaid)).toBe(1750);expect(row.qrCode).toBe('keep-qr');expect(await upgraded.queueEntry.count()).toBe(0);}finally{await upgraded.$disconnect();}
 });
});
