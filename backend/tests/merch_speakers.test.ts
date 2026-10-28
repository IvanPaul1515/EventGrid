import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
const m=vi.hoisted(()=>({db:{} as any,qr:vi.fn(),number:vi.fn(),hint:vi.fn()}));
vi.mock('../src/config/db.js',()=>({prisma:m.db}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:async(fn:any)=>fn(m.db)}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{changed:m.hint}}));
vi.mock('../src/modules/qr/qr.service.js',()=>({QrService:{getTicketQr:m.qr,revokeAndRegenerate:vi.fn(async()=>({}))}}));
vi.mock('../src/modules/participants/participants.service.js',()=>({ParticipantsService:{getNextRegistrationNumber:m.number}}));
import {MerchService as M} from '../src/modules/merch/merch.service.js';
import {SpeakersService as S} from '../src/modules/speakers/speakers.service.js';
import {stockSummary,assertCapacity,assertQuota} from '../src/modules/merch/merch.rules.js';
import {ItemSchema,AssignSchema} from '../src/modules/merch/merch.dto.js';
import {SpeakerSchema} from '../src/modules/speakers/speakers.dto.js';
let item:any,allocations:any[],movements:any[],speaker:any;
beforeEach(()=>{
 vi.clearAllMocks();allocations=[];movements=[];speaker={id:'speaker',eventId:'event',fullName:'Charlista QA',email:'speaker@example.invalid',status:'CONFIRMED',version:0,registrationId:null};
 item={id:'cap',eventId:'event',initialQuantity:150,participantQuota:100,staffQuota:50,criterion:'REGISTRATION',version:0,allocations,movements};
 m.db.merchItem={findFirst:vi.fn(async({where}:any)=>where.eventId===item.eventId&&where.id===item.id?item:null),create:vi.fn(async({data}:any)=>({...data,id:'new'})),updateMany:vi.fn(async()=>({count:1})),update:vi.fn(async({data}:any)=>Object.assign(item,data))};
 m.db.merchMovement={findMany:vi.fn(async()=>movements),findUnique:vi.fn(async({where}:any)=>movements.find(m=>m.requestKey===where.requestKey)),create:vi.fn(async({data}:any)=>{const row={id:'m'+movements.length,...data};movements.push(row);return row;})};
 m.db.merchAllocation={findUnique:vi.fn(async({where}:any)=>allocations.find(a=>a.itemId===where.itemId_kind_recipientId.itemId&&a.kind===where.itemId_kind_recipientId.kind&&a.recipientId===where.itemId_kind_recipientId.recipientId)),findFirst:vi.fn(async({where}:any)=>allocations.find(a=>a.id===where.id&&a.eventId===where.eventId)),count:vi.fn(async({where}:any)=>allocations.filter(a=>a.kind===where.kind&&a.status!=='RELEASED').length),create:vi.fn(async({data}:any)=>{const row={id:'a'+allocations.length,status:'RESERVED',...data};allocations.push(row);return row;}),update:vi.fn(async({where,data}:any)=>Object.assign(allocations.find(a=>a.id===where.id),data)),updateMany:vi.fn(async({where,data}:any)=>{const row=allocations.find(a=>a.id===where.id&&a.status===where.status);if(!row)return {count:0};Object.assign(row,data);return {count:1};})};
 m.db.registration={findFirst:vi.fn(async({where}:any)=>where.eventId==='event'?{id:where.id,attended:true,status:'CONFIRMED'}:null),findMany:vi.fn(async()=>[{id:'first'},{id:'second'}]),findUnique:vi.fn(async()=>null),create:vi.fn(async({data}:any)=>({id:'reg',...data})),update:vi.fn(async()=>({}))};
 m.db.staffMember={findFirst:vi.fn(async()=>({id:'staff'}))};m.db.auditLog={create:vi.fn(async()=>({}))};
 m.db.speaker={findFirst:vi.fn(async({where}:any)=>where.email?null:where.eventId==='event'?speaker:null),create:vi.fn(async({data}:any)=>({id:'new-speaker',...data})),update:vi.fn(async({data}:any)=>Object.assign(speaker,data)),updateMany:vi.fn(async({data}:any)=>{const previous=speaker.version;Object.assign(speaker,data);if(data.version)speaker.version=previous+1;return {count:1};})};
 m.db.participant={findMany:vi.fn(async()=>[]),create:vi.fn(async({data}:any)=>({id:'person',...data}))};
 m.db.scheduleItem={findFirst:vi.fn(async()=>({id:'talk'}))};m.db.speakerTalk={upsert:vi.fn(async()=>({})),deleteMany:vi.fn(async()=>({count:1}))};
 m.qr.mockImplementation(async(id:string)=>({registrationId:id}));m.number.mockResolvedValue('QA-1');
});
describe('merch accounting and scoped operations',()=>{
 it('separates physical stock, reservations and delivery without counting scan selections',()=>{
  expect(stockSummary(150,[{kind:'RECEIVE',quantity:10},{kind:'RESERVE',quantity:100},{kind:'DELIVER',quantity:20},{kind:'RELEASE',quantity:5}])).toEqual({initial:150,received:10,delivered:20,reserved:75,physical:140,available:65});
 });
 it('rejects insufficient stock and invalid combined quotas',()=>{expect(()=>assertCapacity(stockSummary(0,[]))).toThrow();expect(()=>assertQuota(100,51,150)).toThrow();});
 it('accepts articles without sizes, but requires an administrative criterion explanation',()=>{
  const input={name:'Gorras',initialQuantity:150,participantQuota:100,staffQuota:50,criterion:'REGISTRATION'};
  expect(ItemSchema.parse(input).variant).toBe('');expect(ItemSchema.safeParse({...input,criterion:'ADMIN'}).success).toBe(false);expect(AssignSchema.safeParse({kind:'STAFF',recipientId:'invalid',reason:'Motivo QA'}).success).toBe(false);
 });
 it('creates nothing automatically; explicit creation keeps edition-specific quantities',async()=>{await M.create('event','admin',ItemSchema.parse({name:'Gorras',initialQuantity:150,participantQuota:100,staffQuota:50,criterion:'REGISTRATION'}));expect(m.db.merchItem.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({eventId:'event',initialQuantity:150})}));expect(m.db.merchMovement.create).not.toHaveBeenCalled();});
 it('reserves once per recipient and keeps staff quota separate',async()=>{
  await M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'});await M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'});
  expect(movements).toHaveLength(1);expect(stockSummary(150,movements).physical).toBe(150);
  item.staffQuota=0;await expect(M.assign('event','admin','cap',{kind:'STAFF',recipientId:'staff',reason:'Criterio QA'})).rejects.toThrow('Cupo');
 });
 it('rejects cross-edition items and recipients before mutation',async()=>{
  await expect(M.assign('other','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'})).rejects.toThrow();m.db.registration.findFirst.mockResolvedValue(null);await expect(M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'})).rejects.toThrow('Destinatario');expect(movements).toHaveLength(0);
 });
 it('freezes deterministic registration ordering and does not use scan time',async()=>{
  item.participantQuota=2;await M.freeze('event','admin','cap','Lista revisada');expect(m.db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({orderBy:[{createdAt:'asc'},{id:'asc'}],take:2}));expect(allocations.map(a=>a.recipientId)).toEqual(['first','second']);await expect(M.freeze('event','admin','cap','Repetir lista')).rejects.toThrow('fijada');
 });
 it('purchase eligibility excludes courtesies and unpaid registrations',async()=>{item.criterion='PURCHASE';await M.freeze('event','admin','cap','Compras revisadas');expect(m.db.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{eventId:'event',status:{not:'CANCELLED'},isCourtesy:false,amountPaid:{gt:0}},orderBy:[{saleTimestamp:'asc'},{id:'asc'}]}));});
 it('records a single delivery and actor, preserving physical and reserved stock',async()=>{
  const a=await M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'});await M.deliver('event','operator',a.id);await M.deliver('event','operator',a.id);
  expect(movements.filter(m=>m.kind==='DELIVER')).toHaveLength(1);expect(a).toMatchObject({status:'DELIVERED',deliveredBy:'operator'});expect(stockSummary(150,movements)).toMatchObject({physical:149,available:149,reserved:0});expect(m.db.auditLog.create).toHaveBeenCalled();
 });
 it('requires confirmed attendance before participant delivery',async()=>{
  const a=await M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'});m.db.registration.findFirst.mockResolvedValue(null);await expect(M.deliver('event','operator',a.id)).rejects.toThrow('llegada');expect(movements.filter(m=>m.kind==='DELIVER')).toHaveLength(0);
 });
 it('releases reserved eligibility with audit and forbids releasing delivered items',async()=>{
  const a=await M.assign('event','admin','cap',{kind:'PARTICIPANT',recipientId:'p',reason:'Criterio QA'});await M.release('event','admin','cap',a.id,'Corrección revisada');expect(stockSummary(150,movements).available).toBe(150);a.status='DELIVERED';await expect(M.release('event','admin','cap',a.id,'Corrección revisada')).rejects.toThrow();
 });
 it('deduplicates stock receipts and rejects changed payloads',async()=>{const input={quantity:4,reason:'Entrada QA',requestKey:'key'};await M.receive('event','admin','cap',input);await M.receive('event','admin','cap',input);expect(movements).toHaveLength(1);await expect(M.receive('event','admin','cap',{...input,quantity:5})).rejects.toThrow('otra cantidad');});
 it('rejects an inventory version conflict before stock or delivery changes',async()=>{m.db.merchItem.updateMany.mockResolvedValue({count:0});await expect(M.assign('event','admin','cap',{kind:'STAFF',recipientId:'staff',reason:'Criterio QA'})).rejects.toThrow('cambió');expect(movements).toHaveLength(0);});
});
describe('speaker identities, existing QR and talks',()=>{
 it('allows provisional profiles without fabricated email and rejects unsafe photo URLs',()=>{expect(SpeakerSchema.parse({fullName:'Persona QA',email:null,provisional:true}).email).toBeNull();expect(SpeakerSchema.safeParse({fullName:'Persona QA',photoUrl:'javascript:alert(1)'}).success).toBe(false);});
 it('blocks credentials for provisional or cancelled speakers without creating participants',async()=>{speaker.provisional=true;await expect(S.credential('event','admin','speaker')).rejects.toThrow('Revisa');expect(m.db.participant.create).not.toHaveBeenCalled();speaker.provisional=false;speaker.status='CANCELLED';await expect(S.credential('event','admin','speaker')).rejects.toThrow();});
 it('issues credentials before participation confirmation without marking attendance',async()=>{speaker.status='PENDING';await S.credential('event','admin','speaker');expect(m.db.registration.create.mock.calls[0][0].data.attended).toBeUndefined();expect(speaker.status).toBe('PENDING');});
 it('does not invent an email when a speaker has none',async()=>{speaker.email=null;await S.credential('event','admin','speaker');expect(m.db.participant.create.mock.calls[0][0].data.email).toBe('');});
 it('audits revocation and blocks credential lookup until authorized regeneration',async()=>{speaker.registrationId='existing';await S.revoke('event','admin','speaker','Cambio administrativo');expect(speaker.credentialRevokedAt).toBeInstanceOf(Date);await expect(S.credential('event','admin','speaker')).rejects.toThrow('revocada');await S.regenerate('event','admin','speaker','Credencial renovada');expect(speaker.credentialRevokedAt).toBeNull();expect(m.qr).toHaveBeenCalledWith('existing');});
 it('reuses linked registration and official QR without creating a duplicate person',async()=>{speaker.registrationId='existing';expect(await S.credential('event','admin','speaker')).toEqual({registrationId:'existing'});expect(m.qr).toHaveBeenCalledWith('existing');expect(m.db.participant.create).not.toHaveBeenCalled();});
 it('creates a zero-price, audited speaker credential without checking in or sending email',async()=>{await S.credential('event','admin','speaker');expect(m.db.registration.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({isCourtesy:true,participantCategory:'SPEAKER',status:'CONFIRMED',courtesyUserId:'admin'})}));const input=m.db.registration.create.mock.calls[0][0].data;expect(input.attended).toBeUndefined();expect(m.qr).toHaveBeenCalledWith('reg');expect(m.db.auditLog.create).toHaveBeenCalled();});
 it('uses existing identity and registration instead of duplicating them',async()=>{m.db.participant.findMany.mockResolvedValue([{id:'existing-person'}]);m.db.registration.findUnique.mockResolvedValue({id:'existing-reg',status:'CONFIRMED'});await S.credential('event','admin','speaker');expect(m.db.participant.create).not.toHaveBeenCalled();expect(m.db.registration.create).not.toHaveBeenCalled();expect(m.qr).toHaveBeenCalledWith('existing-reg');});
 it('requires explicit identity resolution for ambiguous email matches',async()=>{m.db.participant.findMany.mockResolvedValue([{id:'one'},{id:'two'}]);await expect(S.credential('event','admin','speaker')).rejects.toThrow('identidades');expect(m.db.registration.create).not.toHaveBeenCalled();});
 it('does not reactivate cancelled registrations when issuing credentials',async()=>{m.db.participant.findMany.mockResolvedValue([{id:'person'}]);m.db.registration.findUnique.mockResolvedValue({id:'cancelled',status:'CANCELLED'});await expect(S.credential('event','admin','speaker')).rejects.toThrow('cancelada');expect(m.qr).not.toHaveBeenCalled();});
 it('rejects cross-edition profiles, links and attempts to detach issued credentials',async()=>{await expect(S.credential('other','admin','speaker')).rejects.toThrow('encontrado');m.db.scheduleItem.findFirst.mockResolvedValue(null);await expect(S.linkTalk('event','admin','speaker','other-talk')).rejects.toThrow('otra edición');speaker.registrationId='existing';await expect(S.save('event','admin',{fullName:'Persona QA',registrationId:null},'speaker')).rejects.toThrow('desvincular');});
 it('links several speakers and talks idempotently using a composite key',async()=>{await S.linkTalk('event','admin','speaker','talk');await S.linkTalk('event','admin','speaker','talk');expect(m.db.speakerTalk.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{speakerId_scheduleItemId:{speakerId:'speaker',scheduleItemId:'talk'}}}));});
 it('migration is additive and leaves historical shirt tables untouched',()=>{const sql=readFileSync(new URL('../prisma/migrations/20261028010000_merch_speakers/migration.sql',import.meta.url),'utf8');expect(sql).toContain('CREATE TABLE "merch_items"');expect(sql).toContain('CREATE TABLE "speakers"');expect(sql).not.toMatch(/^(?:DROP |DELETE |TRUNCATE |ALTER TABLE "tshirt)/im);});
});
