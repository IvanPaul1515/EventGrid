import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>{
 const model=()=>({findUnique:vi.fn(),findFirst:vi.fn(),findMany:vi.fn(),findUniqueOrThrow:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn(),upsert:vi.fn()});
 return {db:{registration:model(),queueStation:model(),queueDevice:model(),queueEntry:model(),eventSettings:model(),tshirtInventory:model(),auditLog:model()},image:vi.fn(),authorize:vi.fn(),session:vi.fn()};
});
vi.mock('../src/config/db.js',()=>({prisma:mocks.db}));
vi.mock('../src/config/env.js',()=>({ENV:{DATABASE_URL:'file:mock-only',JWT_SECRET:'qr-pairing-unit'}}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:(fn:any)=>fn(mocks.db)}));
vi.mock('../src/modules/scanner/scanner.service.js',()=>({ScannerService:{authorize:mocks.authorize,session:mocks.session}}));
vi.mock('../src/middleware/editionAccess.js',()=>({assignedEdition:async(user:any)=>user.assignedEventId||null}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{queueChanged:vi.fn()}}));
vi.mock('../src/modules/attendance/attendance.service.js',()=>({AttendanceService:{}}));
vi.mock('qrcode',()=>({default:{toDataURL:mocks.image}}));
import {QrService} from '../src/modules/qr/qr.service.js';
import {ReceptionQueueService as Q} from '../src/modules/scanner/queue.service.js';
import {ticketToken,PAIRING_PREFIX} from '../src/modules/qr/qr-input.js';
import {qrFeedback,qrFailureStatus} from '../../frontend/src/utils/qrFeedback.js';
import {queueReadBody} from '../../frontend/src/utils/queueRead.js';
import {pairingCredential} from '../../frontend/src/utils/pairingQr.js';
import {finishQrCameraRelease} from '../../frontend/src/utils/qrCameraRelease.js';

const eventId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222';
const pc:any={id:'pc-user',sessionId:'pc-session',role:'OPERATOR',assignedEventId:eventId};
const mobile:any={id:'mobile-user',sessionId:'mobile-session',role:'OPERATOR',scannerOnly:true,assignedEventId:eventId};
let registration:any,station:any,devices:any[],imagePayload:string;
beforeEach(()=>{
 vi.restoreAllMocks();vi.resetAllMocks();devices=[];
 registration={id:'registration',eventId,registrationNumber:'BC26-42',qrCode:'eg_qr_unit42',attended:false,status:'CONFIRMED',ticketType:{includesTshirt:true},participant:{fullName:'Unit'},event:{name:'Unit edition'}};
 station={id:'station',eventId,userId:pc.id,sessionId:pc.sessionId,mode:'QUEUE',label:'Unit PC',leaseUntil:new Date(Date.now()+60000)};
 mocks.authorize.mockImplementation(async(user:any,event:string)=>{if(!user.sessionId||!['ADMIN','OPERATOR'].includes(user.role)||user.assignedEventId!==event)throw Error('Permisos o edición incorrectos');});
 mocks.session.mockImplementation(async(_db:any,id:string)=>({user:id===pc.sessionId?pc:mobile}));
 mocks.image.mockImplementation(async(payload:string)=>{imagePayload=payload;return 'data:image/png;base64,unit';});
 mocks.db.queueStation.findUnique.mockImplementation(async()=>station);
 const matches=(where:any)=>station.mode==='QUEUE'&&station.eventId===where.eventId&&station.leaseUntil>new Date()&&(!where.inviteExpiresAt||station.inviteExpiresAt>new Date())&&(!where.inviteHash||where.inviteHash===station.inviteHash)&&(!where.inviteTokenHash||where.inviteTokenHash===station.inviteTokenHash);
 mocks.db.queueStation.findFirst.mockImplementation(async({where}:any)=>matches(where)?station:null);
 mocks.db.queueStation.updateMany.mockImplementation(async({where,data}:any)=>{if(!matches(where))return {count:0};Object.assign(station,data);return {count:1};});
 mocks.db.queueDevice.findFirst.mockResolvedValue(null);
 mocks.db.queueDevice.create.mockImplementation(async({data}:any)=>{const d={...data,status:'REQUESTED'};devices.push(d);return d;});
 mocks.db.queueDevice.findUnique.mockImplementation(async({where}:any)=>devices.find(d=>d.id===where.id));
 mocks.db.queueDevice.updateMany.mockImplementation(async({where,data}:any)=>{if(!where.id)return {count:0};const d=devices.find(d=>d.id===where.id);if(!d||!['REQUESTED','APPROVED'].includes(d.status))return {count:0};Object.assign(d,data);return {count:1};});
 mocks.db.registration.findFirst.mockImplementation(async({where}:any)=>where.OR.some((c:any)=>c.qrCode===registration.qrCode||c.registrationNumber===registration.registrationNumber)?registration:null);
 mocks.db.registration.findUniqueOrThrow.mockImplementation(async()=>registration);
 mocks.db.auditLog.findFirst.mockResolvedValue(null);
 mocks.db.queueEntry.findUnique.mockResolvedValue(null);
 mocks.db.queueEntry.upsert.mockImplementation(async({create}:any)=>create);
 mocks.db.eventSettings.findUnique.mockResolvedValue({tshirtSizesEnabled:true});
 mocks.db.tshirtInventory.findMany.mockResolvedValue([{size:'L',initialQuantity:10,deliveredQuantity:1,staffReservedQuantity:2}]);
});

describe('official ticket formats and queue validation, unit mocks',()=>{
 it('reveals only the authorized name, organization and entry number on preview',async()=>{
  vi.spyOn(Q,'readAccess').mockResolvedValue('station');
  registration.participant={fullName:'Unit Participant',institution:'Unit Organization',email:'private@example.invalid',documentId:'private-id',phone:'private-phone'};
  const result=await Q.preview(mobile,eventId,registration.qrCode,'device');
  expect(result).toMatchObject({name:'Unit Participant',organization:'Unit Organization',number:'BC26-42'});
  expect(JSON.stringify(result)).not.toContain('private');expect(result).not.toHaveProperty('payment');
 });
 it.each(['eg_qr_unit42','https://eventgrid.app/t/eg_qr_unit42','https://eventgrid.app/t/eg_qr_unit42?download=1#ticket','https://eventgrid.app/t/eg%5Fqr%5Funit42/','/t/eg_qr_unit42?source=wallet',JSON.stringify({token:'eg_qr_unit42'}),JSON.stringify({eg_token:'https://eventgrid.app/t/eg_qr_unit42'})])('validates the complete official payload %s consistently in preview and read',async input=>{
  vi.spyOn(Q,'readAccess').mockResolvedValue('station');
  expect((await QrService.validateAndScan(input,eventId)).status).toBe('VALID');
  expect(await Q.preview(mobile,eventId,input,'device')).toMatchObject({status:'VALID',shirts:{enabled:true,sizes:[{size:'L',available:7}]}});
  mocks.db.queueDevice.findFirst.mockResolvedValue({id:'device'});
  mocks.db.queueStation.findFirst.mockResolvedValue(station);
  expect((await Q.submit(mobile,eventId,input,'device','L')).status).toBe('QUEUED');
 });
 it('does not truncate the camera payload and includes the authorized device',()=>{
  const input='https://eventgrid.app/t/eg_qr_unit42?download=1';
  expect(queueReadBody(input,{id:'device',status:'LINKED'},true)).toEqual({token:input,deviceId:'device'});
  expect(()=>queueReadBody(input,null,true)).toThrow();
 });
 it('does not reject a decoded QR because camera DOM cleanup failed',async()=>{
  const report=vi.fn(),validate=vi.fn();
  await finishQrCameraRelease(Promise.reject(new Error('camera DOM cleanup')),report).then(()=>validate('eg_qr_unit42'));
  expect(report).toHaveBeenCalledOnce();expect(validate).toHaveBeenCalledWith('eg_qr_unit42');
 });
 it('classifies queued, attended, cancelled, revoked, wrong-edition and unknown entries',async()=>{
  vi.spyOn(Q,'readAccess').mockResolvedValue('station');
  mocks.db.queueEntry.findUnique.mockResolvedValue({id:'already-queued'});
  expect((await Q.preview(mobile,eventId,registration.qrCode,'device')).status).toBe('QUEUED');
  registration.attended=true;expect((await QrService.validateAndScan(registration.qrCode,eventId)).status).toBe('ALREADY_CHECKED_IN');
  registration.attended=false;registration.status='CANCELLED';expect((await QrService.validateAndScan(registration.qrCode,eventId)).status).toBe('CANCELLED');
  registration.status='CONFIRMED';expect((await QrService.validateAndScan(registration.qrCode,otherId)).status).toBe('EDITION_MISMATCH');
  mocks.db.auditLog.findFirst.mockResolvedValue({id:'revoked'});expect((await QrService.validateAndScan('revoked-token',eventId)).status).toBe('REVOKED');
  mocks.db.auditLog.findFirst.mockResolvedValue(null);expect((await QrService.validateAndScan('unknown-token',eventId)).status).toBe('INVALID_CODE');
 });
 it('never sends pairing QRs to participant lookup',async()=>{
  const credential=PAIRING_PREFIX+eventId+':'+ 'a'.repeat(64);
  expect((await QrService.validateAndScan(credential,eventId)).status).toBe('PAIRING_CODE');expect(mocks.db.registration.findFirst).not.toHaveBeenCalled();
  expect(()=>pairingCredential('https://eventgrid.app/t/eg_qr_unit42',eventId)).toThrow();
  expect(()=>pairingCredential(credential,otherId)).toThrow('otra edición');
 });
 it('rejects malformed JSON/URLs safely without querying with non-string tokens',()=>{
  for(const input of ['{"token":{}}','{"token":', 'https://eventgrid.app/t/%ZZ'])expect(ticketToken(input)).toEqual({});
 });
 it.each([[undefined,'NETWORK'],[401,'SESSION_EXPIRED'],[403,'ACCESS_DENIED'],[500,'SERVER_ERROR'],[503,'SERVER_ERROR'],[400,'REQUEST_ERROR']])('keeps HTTP %s separate from an invalid QR', (status,expected)=>{
  const result=qrFailureStatus(status?{response:{status:status as number}}:{});expect(result).toBe(expected);expect(qrFeedback(result).title).not.toBe('Entrada no válida');
 });
 it('reports an unlinked device explicitly without exposing token or server details',()=>{
  const status=qrFailureStatus({response:{status:409,data:{details:{code:'SCANNER_UNLINKED'}}}});
  expect(qrFeedback(status).title).toBe('Tu escáner ya no está vinculado');
 });
});

describe('single-use station invitations, unit mocks',()=>{
 const prepare=()=>vi.spyOn(Q,'requestChecks').mockResolvedValue(undefined);
 it('generates a short manual fallback and a random opaque QR, storing hashes only',async()=>{
  const invite=await Q.invite(pc,eventId);expect(invite.code).toMatch(/^[A-F0-9]{8}$/);
  expect(imagePayload).toMatch(new RegExp('^'+PAIRING_PREFIX+eventId+':[a-f0-9]{64}$'));
  const raw=imagePayload.split(':').at(-1)!;
  expect(station.inviteTokenHash).toBe(createHash('sha256').update(raw).digest('hex'));
  expect(JSON.stringify(station)).not.toContain(raw);expect(invite.qrDataUrl).toContain('data:image/png');
 });
 it('consumes the QR once, awaits PC approval and links without a second code',async()=>{
  prepare();await Q.invite(pc,eventId);const qr=imagePayload;
  const d=await Q.join(mobile,eventId,qr,'Unit Android');expect(d).toMatchObject({status:'REQUESTED',invitationVerified:true,codeHash:null,codeCipher:null});
  expect(station.inviteHash).toBeNull();expect(station.inviteTokenHash).toBeNull();
  await Q.decide(pc,eventId,d.id,true);expect(d.status).toBe('LINKED');expect(d.deviceLabel).toBe('Unit Android');
  await expect(Q.join({...mobile,sessionId:'second'},eventId,qr)).rejects.toThrow();
 });
 it('supports the manual alternative with the same approval and no second code',async()=>{
  prepare();const invite=await Q.invite(pc,eventId);const d=await Q.join(mobile,eventId,invite.code);
  await Q.decide(pc,eventId,d.id,true);expect(d.status).toBe('LINKED');expect(d.codeHash).toBeNull();
 });
 it('rejects from the PC without establishing a link',async()=>{
  prepare();const invite=await Q.invite(pc,eventId);const d=await Q.join(mobile,eventId,invite.code);
  await Q.decide(pc,eventId,d.id,false);expect(d.status).toBe('REVOKED');
 });
 it('rejects expired invitations and does not revive inactive stations',async()=>{
  prepare();const invite=await Q.invite(pc,eventId);station.inviteExpiresAt=new Date(0);
  await expect(Q.join(mobile,eventId,invite.code)).rejects.toThrow();
  station.leaseUntil=new Date(0);await expect(Q.invite(pc,eventId)).rejects.toThrow();
 });
 it('revokes invitations explicitly before they expire',async()=>{
  prepare();const invite=await Q.invite(pc,eventId);await Q.revokeInvite(pc,eventId);
  await expect(Q.join(mobile,eventId,invite.code)).rejects.toThrow();
 });
 it('requires authentication and an authorized edition',async()=>{
  await expect(Q.invite({...pc,sessionId:null},eventId)).rejects.toThrow();
  await expect(Q.join(mobile,otherId,'12345678')).rejects.toThrow();
 });
 it('allows only one of two devices to consume the same invitation',async()=>{
  prepare();const invite=await Q.invite(pc,eventId);
  const results=await Promise.allSettled([Q.join(mobile,eventId,invite.code),Q.join({...mobile,sessionId:'mobile-second'},eventId,invite.code)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(devices).toHaveLength(1);
 });
 it('links multiple phones with independent invitations and invalidates regenerated QRs',async()=>{
  prepare();const first=await Q.invite(pc,eventId),oldQr=imagePayload;const replacement=await Q.invite(pc,eventId);
  await expect(Q.join(mobile,eventId,oldQr)).rejects.toThrow();
  const a=await Q.join(mobile,eventId,replacement.code);await Q.decide(pc,eventId,a.id,true);
  const next=await Q.invite(pc,eventId),b=await Q.join({...mobile,sessionId:'mobile-second'},eventId,next.code);await Q.decide(pc,eventId,b.id,true);
  expect(devices.map(d=>d.status)).toEqual(['LINKED','LINKED']);expect(first.code).not.toBe(next.code);
 });
});
