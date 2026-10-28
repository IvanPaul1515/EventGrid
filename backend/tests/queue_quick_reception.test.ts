import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, createHmac } from 'node:crypto';

const mocks=vi.hoisted(()=>{
 const model=()=>({findUnique:vi.fn(),findUniqueOrThrow:vi.fn(),findFirst:vi.fn(),findMany:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn(),upsert:vi.fn()});
 return {db:{speaker:model(),registration:model(),queueEntry:model(),queueDevice:model(),queueStation:model(),eventSettings:model(),tshirtInventory:model(),courtesyRequest:model(),user:model(),scannerLink:model(),receptionStation:model(),auditLog:model(),attendanceLog:model()},qr:vi.fn(),session:vi.fn(),hint:vi.fn(),emit:vi.fn()};
});
vi.mock('../src/config/db.js',()=>({prisma:mocks.db}));
vi.mock('../src/config/env.js',()=>({ENV:{DATABASE_URL:'file:mock-only',JWT_SECRET:'unit-test-secret'}}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:(fn:any)=>fn(mocks.db)}));
vi.mock('../src/modules/qr/qr.service.js',()=>({QrService:{validateAndScan:mocks.qr}}));
vi.mock('../src/modules/scanner/scanner.service.js',()=>({ScannerService:{authorize:vi.fn(),session:mocks.session}}));
vi.mock('../src/middleware/editionAccess.js',()=>({assignedEdition:async()=>null}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{queueChanged:mocks.hint,emit:mocks.emit}}));
vi.mock('../src/modules/inventory/inventory.service.js',()=>({InventoryService:{validateSize:async(_event:string,size:string)=>size}}));
import {ReceptionQueueService as Q} from '../src/modules/scanner/queue.service.js';
import {AttendanceService as A} from '../src/modules/attendance/attendance.service.js';
import {queueTshirts,validateQueueSize} from '../src/modules/scanner/queue-tshirts.js';

const operator:any={id:'operator',sessionId:'pc-session',role:'OPERATOR'},phone:any={id:'phone-user',sessionId:'mobile-session',role:'OPERATOR',scannerOnly:true};
let reg:any,entry:any,stock:any;
beforeEach(()=>{
 vi.restoreAllMocks();vi.resetAllMocks();
 reg={id:'registration',eventId:'event',registrationNumber:'UNIT-42',qrCode:'unit-qr',status:'CONFIRMED',source:'MANUAL',isCourtesy:false,balanceDue:0,ticketPrice:1750,attended:false,tshirtDelivered:false,tshirtSize:null,ticketType:{includesTshirt:true},participant:{fullName:'Unit Participant'}};
 entry={id:'entry',eventId:'event',registrationId:reg.id,stationId:'station',state:'CLAIMED',claimedBySessionId:operator.sessionId,claimedByUserId:operator.id,claimUntil:new Date(Date.now()+90000),selectedTshirtSize:'M',validatedQrHash:createHash('sha256').update(reg.qrCode).digest('hex')};
 stock={id:'stock',size:'M',eventId:'event',initialQuantity:10,deliveredQuantity:2,staffReservedQuantity:3,staffDeliveredQuantity:0,isActive:true};
 mocks.session.mockImplementation(async(_db:any,_id:string,userId:string)=>({user:{...operator,id:userId}}));
 mocks.db.user.findUnique.mockResolvedValue(operator);
 mocks.db.registration.findFirst.mockImplementation(async({where}:any)=>where.source?null:reg);
 mocks.db.registration.findUniqueOrThrow.mockImplementation(async()=>reg);
 mocks.db.registration.findUnique.mockImplementation(async()=>reg);
 mocks.db.registration.updateMany.mockImplementation(async({data}:any)=>{if(reg.attended)return {count:0};reg={...reg,...data};return {count:1};});
 mocks.db.eventSettings.findUnique.mockResolvedValue({tshirtSizesEnabled:true});
 mocks.db.tshirtInventory.findMany.mockResolvedValue([stock,{...stock,id:'stock-l',size:'L'}]);
 mocks.db.tshirtInventory.findUnique.mockImplementation(async()=>stock);
 mocks.db.tshirtInventory.updateMany.mockResolvedValue({count:1});
 mocks.db.queueEntry.findUnique.mockImplementation(async()=>entry);
 mocks.db.queueEntry.findFirst.mockImplementation(async()=>entry);
 mocks.db.queueEntry.updateMany.mockResolvedValue({count:1});
 mocks.db.queueEntry.upsert.mockImplementation(async({create}:any)=>create);
 mocks.db.queueStation.findUnique.mockResolvedValue({id:'station',eventId:'event',mode:'QUEUE',sessionId:operator.sessionId,userId:operator.id,leaseUntil:new Date(Date.now()+60000)});
 mocks.db.queueStation.findFirst.mockResolvedValue({id:'station'});
 mocks.db.queueDevice.findFirst.mockResolvedValue({id:'device'});
 mocks.db.courtesyRequest.findUnique.mockResolvedValue(null);
 mocks.db.scannerLink.findFirst.mockResolvedValue(null);
 mocks.qr.mockImplementation(async()=>({valid:true,canCheckIn:true,status:'VALID',registration:reg}));
 vi.spyOn(A,'getCounters').mockResolvedValue({totalRegistrations:1,attendedCount:1,pendingCount:0});
});

describe('queue scan selection and compact confirmation, unit mocks only',()=>{
 it('blocks a revoked speaker credential at quick confirmation and backend check-in',async()=>{
  reg.participantCategory='SPEAKER';mocks.db.speaker.findFirst.mockResolvedValue({id:'speaker',credentialRevokedAt:new Date()});
  await expect(Q.complete(operator,'event','entry','M',false)).rejects.toThrow('revocada');
  expect(mocks.db.registration.updateMany).not.toHaveBeenCalled();expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('previews a ticket and real configured availability without enqueue or inventory writes',async()=>{
  mocks.db.queueEntry.findUnique.mockResolvedValue(null);
  const preview=await Q.preview(operator,'event','unit-qr');
  expect(preview).toMatchObject({status:'VALID',number:'UNIT-42',shirts:{enabled:true,sizes:[{size:'M',available:5},{size:'L',available:5}]}});
  expect(mocks.db.queueEntry.upsert).not.toHaveBeenCalled();expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
  expect(preview).toMatchObject({name:'Unit Participant'});expect(JSON.stringify(preview)).not.toContain('passwordHash');
 });
 it.each([false,true])('skips size selection when event/ticket excludes shirts (%s)',async ticketExclusion=>{
  if(ticketExclusion)reg.ticketType.includesTshirt=false;else mocks.db.eventSettings.findUnique.mockResolvedValue({tshirtSizesEnabled:false});
  expect(await queueTshirts(mocks.db,'event',reg)).toMatchObject({enabled:false,sizes:[]});
  expect(()=>validateQueueSize({enabled:false,delivered:false,sizes:[]},undefined)).not.toThrow();
 });
 it('requires a configured size and rejects invented sizes',async()=>{
  const shirts=await queueTshirts(mocks.db,'event',reg);
  expect(()=>validateQueueSize(shirts,undefined)).toThrow('Selecciona');
  expect(()=>validateQueueSize(shirts,'invented')).toThrow('configurada');
 });
 it('stores the selected size on the queue entry without delivering or changing the registration',async()=>{
  mocks.db.queueEntry.findUnique.mockResolvedValue(null);
  expect((await Q.submit(operator,'event','unit-qr',undefined,'L')).status).toBe('QUEUED');
  expect(mocks.db.queueEntry.upsert.mock.calls[0][0].create.selectedTshirtSize).toBe('L');
  expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();expect(mocks.db.registration.updateMany).not.toHaveBeenCalled();
 });
 it('does not duplicate a queued entry or silently overwrite its size',async()=>{
  expect(await Q.submit(operator,'event','unit-qr',undefined,'L')).toMatchObject({status:'QUEUED',result:'Esta entrada ya está en cola'});
  expect(mocks.db.queueEntry.upsert).not.toHaveBeenCalled();expect(entry.selectedTshirtSize).toBe('M');
 });
 it('requires a live link owned by the phone before previewing',async()=>{
  mocks.db.queueDevice.findUnique.mockResolvedValue({id:'device',eventId:'event',stationId:'station',sessionId:'someone-else'});
  await expect(Q.preview(phone,'event','unit-qr','device')).rejects.toThrow();expect(mocks.qr).not.toHaveBeenCalled();
 });
 it('does not allow restricted scanners to confirm a queue entry',async()=>{
  mocks.session.mockResolvedValue({user:{...phone}});
  await expect(Q.complete(phone,'event','entry','M',true)).rejects.toThrow();
 });
 it('corrects M to L and deducts only once when actually delivering',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);stock.size='L';
  await Q.complete(operator,'event','entry','L',true);
  expect(reg).toMatchObject({attended:true,tshirtSize:'L',tshirtDelivered:true,attendedByUserId:operator.id});
  expect(mocks.db.tshirtInventory.updateMany).toHaveBeenCalledTimes(1);
  await expect(Q.complete(operator,'event','entry','L',true)).rejects.toThrow();
  expect(mocks.db.tshirtInventory.updateMany).toHaveBeenCalledTimes(1);expect(mocks.hint).toHaveBeenCalled();
 });
 it('confirms without delivery and does not deduct inventory',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);
  await Q.complete(operator,'event','entry','M',false);
  expect(reg).toMatchObject({attended:true,tshirtSize:'M',tshirtDelivered:false});expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('persists a justified non-delivery decision with actor and time in the same check-in',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);
  await Q.complete(operator,'event','entry','M',false,{decision:'NO_DELIVERY',reason:'Talla solicitada agotada'});
  expect(reg).toMatchObject({attended:true,tshirtDeliveryStatus:'PENDING',tshirtNonDeliveryReason:'Talla solicitada agotada',tshirtNonDeliveryNotes:null,tshirtDecisionByUserId:operator.id});expect(reg.tshirtDecisionAt).toBeInstanceOf(Date);
  expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('rejects a non-delivery incident without justification before changing attendance',async()=>{
  await expect(Q.complete(operator,'event','entry','M',false,{decision:'NO_DELIVERY',reason:'Otro motivo'})).rejects.toThrow('Explica');
  expect(mocks.db.registration.updateMany).not.toHaveBeenCalled();
 });
 it.each(['expired','other-station'])('refuses an %s attention claim',async scenario=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);
  if(scenario==='expired')entry.claimUntil=new Date(0);else entry.claimedBySessionId='another-session';
  await expect(Q.complete(operator,'event','entry','M',true)).rejects.toThrow('reserva');
  expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('rejects out of stock delivery without a check-in',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);stock.initialQuantity=5;
  await expect(Q.complete(operator,'event','entry','M',true)).rejects.toThrow('AGOTADA');
  expect(mocks.db.registration.updateMany).not.toHaveBeenCalled();expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it.each(['cancelled','payment','revoked'])('blocks %s entries with an actionable reason',async scenario=>{
  if(scenario==='cancelled')reg.status='CANCELLED';if(scenario==='payment')reg.balanceDue=100;if(scenario==='revoked')reg.qrCode='rotated';
  expect((await Q.details(operator,'event','entry')).canCheckIn).toBe(false);
  await expect(Q.complete(operator,'event','entry','M',true)).rejects.toThrow();
  expect(mocks.db.registration.updateMany).not.toHaveBeenCalled();
 });
 it('does not edit or deduct a shirt already delivered',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);reg.tshirtDelivered=true;reg.tshirtSize='M';
  await expect(Q.complete(operator,'event','entry','L',true)).rejects.toThrow('ajuste');
  await Q.complete(operator,'event','entry','M',false);
  expect(reg.tshirtDelivered).toBe(true);expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('revalidates a payment change inside the check-in transaction',async()=>{
  mocks.db.queueDevice.findFirst.mockResolvedValue(null);let reads=0;
  mocks.db.registration.findUniqueOrThrow.mockImplementation(async()=>{if(++reads===2)reg.balanceDue=100;return reg;});
  await expect(Q.complete(operator,'event','entry','M',true)).rejects.toThrow('Pago');
  expect(mocks.db.tshirtInventory.updateMany).not.toHaveBeenCalled();
 });
 it('retains PC approval plus one single-use security code without weakening pairing',async()=>{
  const d:any={id:'device',stationId:'station',eventId:'event',sessionId:phone.sessionId,userId:phone.id,status:'REQUESTED',expiresAt:new Date(Date.now()+90000),leaseUntil:new Date(Date.now()+60000),attempts:0,codeHash:createHmac('sha256','unit-test-secret').update('queue:device:123456').digest('hex'),codeCipher:'encrypted'};
  mocks.db.queueDevice.findUnique.mockImplementation(async()=>d);
  mocks.db.queueDevice.findUniqueOrThrow.mockImplementation(async()=>d);
  mocks.db.queueDevice.update.mockImplementation(async({data}:any)=>Object.assign(d,data));
  mocks.db.queueDevice.updateMany.mockImplementation(async({data}:any)=>{Object.assign(d,data);return {count:1};});
  await expect(Q.confirm(phone,'event',d.id,'123456')).rejects.toThrow();
  await Q.decide(operator,'event',d.id,true);
  expect(await Q.confirm(phone,'event',d.id,'123456')).toEqual({status:'LINKED'});
  expect(d.codeHash).toBeNull();expect(d.codeCipher).toBeNull();
  await expect(Q.confirm(phone,'event',d.id,'123456')).rejects.toThrow();
 });
 it('does not approve an expired pairing request',async()=>{
  mocks.db.queueDevice.findUnique.mockResolvedValue({id:'device',stationId:'station',eventId:'event',sessionId:phone.sessionId,userId:phone.id,status:'REQUESTED',expiresAt:new Date(0)});
  await expect(Q.decide(operator,'event','device',true)).rejects.toThrow('vencida');
 });
});
