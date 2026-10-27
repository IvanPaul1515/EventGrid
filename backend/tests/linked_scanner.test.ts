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




import { AuthService } from '../src/modules/auth/auth.service.js';
import { ScannerService } from '../src/modules/scanner/scanner.service.js';
import { inferDevicePresentation } from '../../frontend/src/utils/devicePresentation.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { seedBarcamp2026 } from '../prisma/barcamp2026.js';
import { AuthUser } from '../src/middleware/auth.js';
import { QrService } from '../src/modules/qr/qr.service.js';
import { qrFeedback } from '../../frontend/src/utils/qrFeedback.js';
let eventId: string, otherId: string, userId: string, regId: string;
let pc: AuthUser, phone: AuthUser, pc2: AuthUser, phone2: AuthUser, viewer: AuthUser;
const password = 'Only-Mocked-QA-Password-2026!';
async function device(email: string): Promise<AuthUser> {
 const result = await AuthService.login(email, password), data = jwt.decode(result.token) as jwt.JwtPayload;
 return { ...result.user, sessionId: data.sid, sessionVersion: data.sessionVersion } as AuthUser;
}
beforeAll(async () => {
 eventId = (await seedBarcamp2026(prisma)).id;
 otherId = (await prisma.event.create({data:{slug:'scanner-other',name:'Other',year:2025,startDate:new Date(),endDate:new Date()}})).id;
 userId = (await prisma.user.create({data:{email:'scanner@example.invalid',fullName:'Scanner QA',role:'ADMIN',passwordHash:await bcrypt.hash(password,4)}})).id;
 await prisma.user.create({data:{email:'viewer@example.invalid',fullName:'Viewer QA',role:'VIEWER',assignedEventId:eventId,passwordHash:await bcrypt.hash(password,4)}});
 [pc,phone,pc2,phone2,viewer] = await Promise.all([device('scanner@example.invalid'),device('scanner@example.invalid'),device('scanner@example.invalid'),device('scanner@example.invalid'),device('viewer@example.invalid')]);
 const participant = await prisma.participant.create({data:{firstName:'Safe',lastName:'Fixture',fullName:'Safe Fixture',email:'participant@example.invalid'}});
 regId=(await prisma.registration.create({data:{eventId,participantId:participant.id,registrationNumber:'RELAY-QA',qrCode:'relay-test-ticket',status:'CONFIRMED',isCourtesy:true}})).id;
});
afterAll(async()=>{await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
async function pair(stationUser=pc,mobile=phone) {
 const station=await ScannerService.register(stationUser,eventId,'QA PC');
 const link=await ScannerService.request(mobile,eventId,station.id);
 await ScannerService.decide(stationUser,eventId,link.id,true);
 const state=await ScannerService.snapshot(stationUser,eventId,false);
 await ScannerService.confirm(mobile,eventId,link.id,state.link!.code!);
 return {station,link};
}
import { beforeEach } from 'vitest';
beforeEach(async()=>{await prisma.scannerReading.deleteMany();await prisma.scannerLink.deleteMany();await prisma.receptionStation.deleteMany();});
describe('persisted optional scanner relay, no provider and no live participants',()=>{
 it('distinguishes known revoked QR from unknown, cancelled and foreign tickets without disclosing data',async()=>{
  const participant=await prisma.participant.create({data:{firstName:'Revocation',lastName:'Fixture',fullName:'Revocation Fixture',email:'revocation@example.invalid'}});
  const registration=await prisma.registration.create({data:{eventId,participantId:participant.id,registrationNumber:'REVOCATION-QA',qrCode:'revocation-qa-token',status:'CONFIRMED',isCourtesy:true}});
  const rotated=await QrService.revokeAndRegenerate(registration.id,userId,'Isolated QA rotation');
  expect((await QrService.validateAndScan('revocation-qa-token',eventId)).status).toBe('REVOKED');
  expect((await QrService.validateAndScan('unrecognized-qa-token',eventId)).status).toBe('INVALID_CODE');
  expect((await QrService.validateAndScan(rotated.newQrToken!,eventId)).status).toBe('VALID');
  const {link}=await pair();
  const rejected=await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'revocation-qa-token');
  expect(rejected.status).toBe('REJECTED');expect(rejected.result).toBe('REVOKED');expect(JSON.stringify(rejected)).not.toContain('Fixture');
  await prisma.registration.update({where:{id:registration.id},data:{status:'CANCELLED'}});
  expect((await QrService.validateAndScan(rotated.newQrToken!,eventId)).status).toBe('CANCELLED');
  expect((await QrService.validateAndScan(rotated.newQrToken!,otherId)).status).toBe('EDITION_MISMATCH');
  const log=await prisma.auditLog.findFirstOrThrow({where:{entityId:crypto.createHash('sha256').update('revocation-qa-token').digest('hex')}});
  expect(JSON.stringify(log)).not.toContain('revocation-qa-token');
 });
 it('maps actual scanner outcomes to distinct safe visible messages',()=>{
  expect(qrFeedback('REVOKED').title).toBe('Entrada revocada');
  expect(qrFeedback('INVALID_CODE').title).toBe('Entrada no válida');
  expect(qrFeedback('CANCELLED').title).toBe('Entrada cancelada');
  expect(qrFeedback('EDITION_MISMATCH').message).not.toContain('Other');
  expect(qrFeedback('BUSY').title).toContain('otro participante');
  expect(qrFeedback('ALREADY_CHECKED_IN').title).toBe('Asistencia ya registrada');
 });
 it('only lists explicitly registered available stations of the same account and edition',async()=>{
  expect(await ScannerService.available(phone,eventId)).toEqual([]);
  const station=await ScannerService.register(pc,eventId,'PC one');
  expect(await ScannerService.available(phone,eventId)).toEqual([{id:station.id,label:'PC one'}]);
  expect(await ScannerService.available(pc,eventId)).toEqual([]);
  expect(await ScannerService.available(phone,otherId)).toEqual([]);
 });
 it('mounts authenticated HTTP routes and rejects an unauthenticated relay',async()=>{
  const result=await AuthService.login('scanner@example.invalid',password);
  const path='/api/v1/events/'+eventId+'/scanner/stations';
  expect((await request(app).get(path)).status).toBe(401);
  expect((await request(app).get(path).set('Authorization','Bearer '+result.token)).status).toBe(200);
 });
 it('requires PC approval before the mobile can consume the code and never returns it to the phone',async()=>{
  const station=await ScannerService.register(pc,eventId,'PC');
  const link=await ScannerService.request(phone,eventId,station.id);
  const desktop=await ScannerService.snapshot(pc,eventId,false), mobile=await ScannerService.snapshot(phone,eventId,false);
  const code=desktop.link!.code!;
  expect(code).toMatch(/^\d{6}$/);expect(mobile.link!.code).toBeUndefined();
  const stored=await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}});
  expect(stored.codeHash).not.toBe(code);expect(stored.codeCipher).not.toBe(code);
  await expect(ScannerService.confirm(phone,eventId,link.id,code)).rejects.toThrow();
  await ScannerService.decide(pc,eventId,link.id,true);
  await ScannerService.confirm(phone,eventId,link.id,code);
  await expect(ScannerService.confirm(phone,eventId,link.id,code)).rejects.toThrow();
  const consumed=await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}});
  expect(consumed.codeHash).toBeNull();expect(consumed.codeCipher).toBeNull();
 });
 it('commits failed code attempts and locks the fifth attempt',async()=>{
  const station=await ScannerService.register(pc,eventId,'PC');const link=await ScannerService.request(phone,eventId,station.id);
  await ScannerService.decide(pc,eventId,link.id,true);
  const real=(await ScannerService.snapshot(pc,eventId,false)).link!.code!; const bad=real==='000000'?'111111':'000000';
  for(let i=0;i<5;i++)await expect(ScannerService.confirm(phone,eventId,link.id,bad)).rejects.toThrow();
  const row=await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}});expect(row.attempts).toBe(5);expect(row.status).toBe('REVOKED');
  await expect(ScannerService.confirm(phone,eventId,link.id,real)).rejects.toThrow();
 });
 it('rejects expired approval, unauthorized roles, foreign sessions and editions',async()=>{
  await expect(ScannerService.register(viewer,eventId,'PC')).rejects.toThrow();
  await expect(ScannerService.register({...pc,sessionId:'legacy-obsolete'},eventId,'PC')).rejects.toThrow(/Inicie sesión/);
  const station=await ScannerService.register(pc,eventId,'PC'), link=await ScannerService.request(phone,eventId,station.id);
  await expect(ScannerService.decide(phone,eventId,link.id,true)).rejects.toThrow();
  await expect(ScannerService.decide(pc2,eventId,link.id,true)).rejects.toThrow();
  await expect(ScannerService.decide(pc,otherId,link.id,true)).rejects.toThrow();
  await prisma.scannerLink.update({where:{id:link.id},data:{expiresAt:new Date(0)}});
  await expect(ScannerService.decide(pc,eventId,link.id,true)).rejects.toThrow();
 });
 it('allows two PCs and two phones but prevents two phones claiming the same station',async()=>{
  const first=await pair(pc,phone); await expect(ScannerService.request(phone2,eventId,first.station.id)).rejects.toThrow();
  await pair(pc2,phone2);
  expect(await prisma.scannerLink.count({where:{status:'LINKED'}})).toBe(2);
 });
 it('persists readings, keeps attendance untouched and gives no participant details to the phone',async()=>{
  const {link}=await pair();const requestKey=crypto.randomUUID();
  const a=await ScannerService.read(phone,eventId,link.id,requestKey,'relay-test-ticket');
  const b=await ScannerService.read(phone,eventId,link.id,requestKey,'relay-test-ticket');
  expect((await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).id).toBe(a.id);expect(a.id).toBe(b.id);expect(a.status).toBe('PENDING');expect(JSON.stringify(a)).not.toContain('Safe Fixture');
  expect((await prisma.registration.findUniqueOrThrow({where:{id:regId}})).attended).toBe(false);
  expect((await ScannerService.snapshot(pc,eventId,false)).reading!.registrationId).toBe(regId);
  expect((await ScannerService.snapshot(phone,eventId,false)).reading!.registrationId).toBeUndefined();
 });
 it('rejects invalid tickets and busy stations; dismissing allows another reading',async()=>{
  const {link}=await pair();
  const invalid=await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'unknown');expect(invalid.status).toBe('REJECTED');
  await ScannerService.snapshot(pc,eventId,true);
  await expect(ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).rejects.toThrow('atendiendo');
  await ScannerService.snapshot(pc,eventId,false);
  await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket');
  await ScannerService.dismiss(pc,eventId,link.id);
  expect((await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).status).toBe('PENDING');
 });
 it('revokes a link on unlink without closing normal sessions or confirming attendance',async()=>{
  const {link}=await pair();await ScannerService.unlink(phone,eventId,link.id);
  await expect(ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).rejects.toThrow();
  expect((await prisma.authSession.findUniqueOrThrow({where:{id:phone.sessionId}})).revokedAt).toBeNull();
 });
 it('blocks reads after either device logout or loss of PC heartbeat',async()=>{
  const {station,link}=await pair();
  await prisma.receptionStation.update({where:{id:station.id},data:{leaseUntil:new Date(0)}});
  await expect(ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).rejects.toThrow();
 });
 it('does not revive an expired phone lease on reconnect',async()=>{
  const {link}=await pair();await prisma.scannerLink.update({where:{id:link.id},data:{mobileLeaseUntil:new Date(0)}});
  expect((await ScannerService.snapshot(phone,eventId,false)).link).toBeNull();
  expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}})).status).toBe('REVOKED');
 });
 it('blocks the relay after phone logout while preserving the PC session',async()=>{
  const extraPC=await device('scanner@example.invalid'),extraPhone=await device('scanner@example.invalid');
  const {link}=await pair(extraPC,extraPhone);
  await prisma.authSession.update({where:{id:extraPhone.sessionId},data:{revokedAt:new Date()}});
  await expect(ScannerService.read(extraPhone,eventId,link.id,crypto.randomUUID(),'relay-test-ticket')).rejects.toThrow();
  expect((await ScannerService.snapshot(extraPC,eventId,false)).link).toBeNull();
  expect((await prisma.authSession.findUniqueOrThrow({where:{id:extraPC.sessionId}})).revokedAt).toBeNull();
 });
 it('targets SSE hints to the paired sessions and never broadcasts participant data',()=>{
  const a={write:vi.fn(),end:vi.fn()} as any,b={write:vi.fn(),end:vi.fn()} as any,c={write:vi.fn(),end:vi.fn()} as any;
  RealtimeService.addClient(eventId,a,{userId,role:'ADMIN',sessionId:pc.sessionId});RealtimeService.addClient(eventId,b,{userId,role:'ADMIN',sessionId:phone.sessionId});RealtimeService.addClient(eventId,c,{userId,role:'ADMIN',sessionId:pc2.sessionId});
  a.write.mockClear();b.write.mockClear();c.write.mockClear();
  RealtimeService.targetSessions(eventId,[pc.sessionId!,phone.sessionId!],{type:'SCANNER_CHANGED',data:{linkId:'safe-id'}});
  expect(a.write).toHaveBeenCalledOnce();expect(b.write).toHaveBeenCalledOnce();expect(c.write).not.toHaveBeenCalled();
  for(const client of [a,b,c])RealtimeService.removeClient(eventId,client);
 });
 it('reclaims expired and locked pairing slots without reviving old codes',async()=>{
   const station=await ScannerService.register(pc,eventId,'Available again');
   const link=await ScannerService.request(phone,eventId,station.id);
   await prisma.scannerLink.update({where:{id:link.id},data:{expiresAt:new Date(0)}});
   expect(await ScannerService.available(phone2,eventId)).toEqual([{id:station.id,label:'Available again'}]);
   expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}})).status).toBe('REVOKED');
   const next=await ScannerService.request(phone2,eventId,station.id);expect(next.id).not.toBe(link.id);
 });
 it('clears a revoked mobile session before another phone requests the station',async()=>{
   const mobile=await device('scanner@example.invalid');const {station,link}=await pair(pc,mobile);
   await prisma.authSession.update({where:{id:mobile.sessionId},data:{revokedAt:new Date()}});
   expect((await ScannerService.available(phone2,eventId)).some(s=>s.id===station.id)).toBe(true);
   expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}})).status).toBe('REVOKED');
 });
 it('does not reactivate a disabled station from a normal state request',async()=>{
   const station=await ScannerService.register(pc,eventId,'Explicit only');await ScannerService.disable(pc,eventId);
   expect((await ScannerService.snapshot(pc,eventId,false)).station).toBeNull();
   expect(await ScannerService.available(phone,eventId)).toEqual([]);
   expect((await ScannerService.register(pc,eventId,'Explicit again')).id).toBe(station.id);
 });
 it('revokes incompatible edition links, while keeping authenticated sessions',async()=>{
   const {link}=await pair();await ScannerService.snapshot(phone,otherId,false);
   expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}})).status).toBe('REVOKED');
   expect((await prisma.authSession.findUniqueOrThrow({where:{id:phone.sessionId}})).revokedAt).toBeNull();
   await ScannerService.snapshot(pc,otherId,false);expect(await ScannerService.available(phone2,eventId)).toEqual([]);
 });
 it('keeps a valid link across repeated snapshots and bounds reconnection grace',async()=>{
   const {link,station}=await pair();
   expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:link.id}})).mobileLeaseUntil.getTime()-Date.now()).toBeGreaterThan(500000);
   for(let n=0;n<3;n++){expect((await ScannerService.snapshot(pc,eventId,false)).link?.id).toBe(link.id);expect((await ScannerService.snapshot(phone,eventId,false)).link?.id).toBe(link.id);}
   await prisma.receptionStation.update({where:{id:station.id},data:{leaseUntil:new Date(0)}});
   expect((await ScannerService.snapshot(pc,eventId,false)).link).toBeNull();
   expect(await ScannerService.available(phone,eventId)).toEqual([]);
 });
 it('does not allow mobile check-in or a second PC role while linked',async()=>{
   await pair();
   await expect(AttendanceService.checkIn(eventId,regId,userId,undefined,false,phone.sessionId)).rejects.toThrow(/modo escáner vinculado/);
   expect((await prisma.registration.findUniqueOrThrow({where:{id:regId}})).attended).toBe(false);
   await expect(ScannerService.register(phone,eventId,'Not a second role')).rejects.toThrow(/Desvincule/);
 });
 it('announces station availability only to authorized sessions of its account and edition',()=>{
   const own={write:vi.fn(),end:vi.fn()} as any,foreign={write:vi.fn(),end:vi.fn()} as any,readOnly={write:vi.fn(),end:vi.fn()} as any;
   RealtimeService.addClient(eventId,own,{userId,role:'OPERATOR',sessionId:phone.sessionId});
   RealtimeService.addClient(eventId,foreign,{userId:'other-account',role:'ADMIN',sessionId:pc2.sessionId});
   RealtimeService.addClient(eventId,readOnly,{userId,role:'VIEWER',sessionId:viewer.sessionId});
   for(const c of [own,foreign,readOnly])c.write.mockClear();
   RealtimeService.scannerStationsChanged(eventId,userId);
   expect(own.write).toHaveBeenCalledOnce();expect(foreign.write).not.toHaveBeenCalled();expect(readOnly.write).not.toHaveBeenCalled();
   expect(own.write.mock.calls[0][0]).not.toContain('registrationId');expect(own.write.mock.calls[0][0]).not.toContain('stationId');
   for(const c of [own,foreign,readOnly])RealtimeService.removeClient(eventId,c);
 });
 it('uses browser capabilities for phones in both orientations and leaves touch laptops/tablets ambiguous',()=>{
   expect(inferDevicePresentation({width:390,height:844,touchPoints:5,coarse:true,fine:false,hover:false})).toBe('phone');
   expect(inferDevicePresentation({width:844,height:390,touchPoints:5,coarse:true,fine:false,hover:false})).toBe('phone');
   expect(inferDevicePresentation({width:500,height:900,touchPoints:0,coarse:false,fine:true,hover:true})).toBe('desktop');
   expect(inferDevicePresentation({width:1200,height:800,touchPoints:10,coarse:false,fine:true,hover:true})).toBe('ambiguous');
   expect(inferDevicePresentation({width:820,height:1180,touchPoints:5,coarse:true,fine:false,hover:false})).toBe('ambiguous');
 });

 it('never discovers or pairs another authenticated account despite sharing an edition',async()=>{
   const station=await ScannerService.register(pc,eventId,'Private station');
   await prisma.user.create({data:{email:'foreign-scanner@example.invalid',fullName:'Different Operator',role:'OPERATOR',assignedEventId:eventId,passwordHash:await bcrypt.hash(password,4)}});
   const foreign=await device('foreign-scanner@example.invalid');
   expect(await ScannerService.available(foreign,eventId)).toEqual([]);
   await expect(ScannerService.request(foreign,eventId,station.id)).rejects.toThrow();
 });
 it('rejects already attended QR without opening another PC reading',async()=>{
   const participant=await prisma.participant.create({data:{firstName:'Duplicate',lastName:'Fixture',fullName:'Duplicate Fixture',email:'duplicate-scanner@example.invalid'}});
   const reg=await prisma.registration.create({data:{eventId,participantId:participant.id,registrationNumber:'ALREADY-ATTENDED-QA',qrCode:'already-attended-qa',status:'CONFIRMED',isCourtesy:true,attended:true,attendedAt:new Date()}});
   const {link,station}=await pair();const result=await ScannerService.read(phone,eventId,link.id,crypto.randomUUID(),'already-attended-qa');
   expect(result).toMatchObject({status:'REJECTED',result:'ALREADY_CHECKED_IN'});
   expect((await prisma.receptionStation.findUniqueOrThrow({where:{id:station.id}})).activeReadingId).toBeNull();
   expect((await prisma.registration.findUniqueOrThrow({where:{id:reg.id}})).attended).toBe(true);
 });

 it('does not clear a newer authorized link when an old mobile history is stale',async()=>{
   const old=await pair(pc,phone);await ScannerService.unlink(phone,eventId,old.link.id);
   const current=await pair(pc,phone2);
   await prisma.scannerLink.update({where:{id:old.link.id},data:{status:'LINKED',mobileLeaseUntil:new Date(Date.now()+60000)}});
   expect((await ScannerService.snapshot(phone,eventId,false)).link).toBeNull();
   expect((await prisma.scannerLink.findUniqueOrThrow({where:{id:current.link.id}})).status).toBe('LINKED');
   expect((await prisma.receptionStation.findUniqueOrThrow({where:{id:current.station.id}})).activeLinkId).toBe(current.link.id);
 });

});

it.runIf(process.env.EVENTGRID_SCANNER_BROWSER === 'true')('relays through real HTTP and SSE with independent PC and mobile browser sessions',async()=>{
 const {createRequire}=await import('node:module');
 await prisma.user.create({data:{email:'scanner-op@example.invalid',fullName:'Operator Scanner QA',role:'OPERATOR',assignedEventId:eventId,passwordHash:await bcrypt.hash(password,4)}});
 const accounts=await Promise.all(Array.from({length:4},()=>AuthService.login('scanner-op@example.invalid',password)));
 const second=await prisma.participant.create({data:{firstName:'Second',lastName:'Safe Fixture',fullName:'Second Safe Fixture',email:'second-scanner@example.invalid'}});
 const secondReg=await prisma.registration.create({data:{eventId,participantId:second.id,registrationNumber:'RELAY-QA-2',qrCode:'relay-test-ticket-2',status:'CONFIRMED',isCourtesy:true}});
 const server=app.listen(4191,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 try {
  const run=createRequire(import.meta.url)('../../frontend/tests/linked-scanner.cjs');
  const results=await run({api:'http://127.0.0.1:4191/api/v1',base:'http://127.0.0.1:5189',eventId,accounts});
  expect(results.browserSessions).toBe(2);expect(results.role).toBe('OPERATOR');expect((await prisma.registration.findUniqueOrThrow({where:{id:secondReg.id}})).attended).toBe(true);
  expect((await prisma.registration.findUniqueOrThrow({where:{id:regId}})).attended).toBe(true);
  console.log(JSON.stringify(results));
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
},180000);
