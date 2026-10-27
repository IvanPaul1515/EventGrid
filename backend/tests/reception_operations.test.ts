import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {shirtDecision,eventDay,localMidnight,supervisionFilters,paymentSummary} from '../src/modules/scanner/reception-operations.js';
import {ShirtDeliveryChoice} from '../../frontend/src/components/attendance/ShirtDeliveryChoice.js';
import {PaymentStatusBadge} from '../../frontend/src/components/participants/PaymentStatusBadge.js';
import {UpdateEventSettingsSchema} from '../src/modules/events/events.dto.js';
import {QueueOperationalRows} from '../../frontend/src/components/attendance/QueueOperationalRows.js';
const mocks=vi.hoisted(()=>{
 const model=()=>({findUnique:vi.fn(),findFirst:vi.fn(),findFirstOrThrow:vi.fn(),findUniqueOrThrow:vi.fn(),findMany:vi.fn(),create:vi.fn(),update:vi.fn(),updateMany:vi.fn(),upsert:vi.fn(),count:vi.fn(),groupBy:vi.fn()});
 return {db:{user:model(),registration:model(),payment:model(),paymentMethod:model(),eventSettings:model(),tshirtInventory:model(),auditLog:model(),queueScanActivity:model()},transaction:vi.fn()};
});
vi.mock('../src/config/db.js',()=>({prisma:mocks.db}));
vi.mock('../src/config/env.js',()=>({ENV:{DATABASE_URL:'file:unit-mocks'}}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:(fn:any)=>mocks.transaction(fn)}));
vi.mock('../src/modules/communications/communications.service.js',()=>({CommunicationsService:{}}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{emit:vi.fn(),queueChanged:vi.fn()}}));
import {ParticipantsService as P} from '../src/modules/participants/participants.service.js';
import {ScanActivity} from '../src/modules/scanner/scan-activity.js';
let reg:any,stock:any,actor:any,settings:any,payments:any[],activities:any[];
beforeEach(()=>{
 vi.resetAllMocks();reg={id:'registration',eventId:'event',ticketPrice:1750,amountPaid:0,balanceDue:1750,status:'PENDING',isCourtesy:false,source:'MANUAL',participant:{fullName:'Unit Participant'},tshirtSize:'L',tshirtDelivered:false,tshirtDeliveryStatus:'PENDING',tshirtNonDeliveryReason:'Entrega pendiente'};
 stock={id:'stock',size:'L',isActive:true,initialQuantity:10,deliveredQuantity:0,staffReservedQuantity:2,staffDeliveredQuantity:0};
 actor={id:'operator',isActive:true,role:'OPERATOR',accountStatus:'ACTIVE',assignedEventId:'event',scannerOnly:false};
 settings={allowOnsitePayments:true,requirePaymentForEntry:true,timeZone:'America/Santo_Domingo'};payments=[];activities=[];
 mocks.transaction.mockImplementation(async(fn:any)=>{const snapshot={reg:{...reg},stock:{...stock},payments:[...payments]};try{return await fn(mocks.db);}catch(e){Object.assign(reg,snapshot.reg);Object.assign(stock,snapshot.stock);payments=snapshot.payments;throw e;}});
 mocks.db.user.findUnique.mockImplementation(async()=>actor);
 mocks.db.eventSettings.findUnique.mockImplementation(async()=>settings);
 mocks.db.registration.findFirst.mockImplementation(async()=>reg);
 mocks.db.registration.findFirstOrThrow.mockImplementation(async()=>reg);
 mocks.db.registration.findUnique.mockImplementation(async()=>reg);
 mocks.db.registration.update.mockImplementation(async({data}:any)=>{Object.assign(reg,data);return reg;});
 mocks.db.registration.updateMany.mockImplementation(async({data,where}:any)=>{if(reg.tshirtDelivered||reg.status==='CANCELLED'||where.eventId!==reg.eventId)return {count:0};Object.assign(reg,data);return {count:1};});
 mocks.db.paymentMethod.findFirst.mockResolvedValue({id:'cash',code:'CASH',isActive:true,eventId:'event'});
 mocks.db.payment.findUnique.mockImplementation(async({where}:any)=>payments.find(p=>p.idempotencyKey===where.idempotencyKey)||null);
 mocks.db.payment.create.mockImplementation(async({data}:any)=>{const p={id:'payment-'+payments.length,...data};payments.push(p);return p;});
 mocks.db.tshirtInventory.findMany.mockResolvedValue([stock]);
 mocks.db.tshirtInventory.findUnique.mockImplementation(async()=>stock);
 mocks.db.tshirtInventory.updateMany.mockImplementation(async({data}:any)=>{Object.assign(stock,data);return {count:1};});
 mocks.db.queueScanActivity.findUnique.mockImplementation(async({where}:any)=>activities.find(a=>Object.entries(where.eventId_userId_requestKey).every(([key,value])=>a[key]===value))||null);
 mocks.db.queueScanActivity.upsert.mockImplementation(async({create,update,where}:any)=>{const old=await mocks.db.queueScanActivity.findUnique({where});if(old){Object.assign(old,update);return old;}const a={registrationId:null,...create};activities.push(a);return a;});
 mocks.db.queueScanActivity.count.mockImplementation(async({where}:any)=>activities.filter(a=>a.eventId===where.eventId&&a.userId===where.userId&&(!where.eventDay||a.eventDay===where.eventDay)&&(!where.submitted||a.submitted)).length);
 mocks.db.queueScanActivity.groupBy.mockImplementation(async({where}:any)=>activities.filter(a=>a.eventId===where.eventId&&a.userId===where.userId&&a.eventDay===where.eventDay).map(a=>({...a,_count:{id:1}})));
});
describe('explicit delivery decisions and supervision',()=>{
 it('renders operational columns with a real Atender button, payment and delivery status',()=>{
  const html=renderToStaticMarkup(React.createElement(QueueOperationalRows,{rows:[{id:'entry',registrationId:'registration',name:'Unit Participant',number:'BC26-42',state:'WAITING',scannedAt:'2026-10-27T10:00:00Z',station:'Unit PC',mine:false,tshirtIncluded:true,tshirtDelivered:false,tshirtDeliveryStatus:'PENDING',selectedTshirtSize:'L',payment:{isCourtesy:false,paymentStatus:'PENDING',balanceDue:1750,amountPaid:0,external:false}}],disabled:false,onAttend:vi.fn(),onIncident:vi.fn(),onPayment:vi.fn()}));
  expect(html).toContain('Participante');expect(html).toContain('Pago pendiente');expect(html).toContain('Pendiente de entrega');expect(html).toMatch(/<button[^>]*>.*?Atender<\/button>/);
 });
 it('updates reception policy without resetting theme, colors or event prefix',()=>{
  expect(UpdateEventSettingsSchema.parse({allowOnsitePayments:true})).toEqual({allowOnsitePayments:true});
  expect(()=>UpdateEventSettingsSchema.parse({timeZone:'Invalid/Zone'})).toThrow();
 });
 it('does not preselect either delivery action',()=>{
  const html=renderToStaticMarkup(React.createElement(ShirtDeliveryChoice,{value:null,disabled:false,onChange:vi.fn()}));
  expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);expect(html).toContain('No entregar camiseta');
 });
 it('keeps delivery and non-delivery mutually exclusive',()=>{
  const html=renderToStaticMarkup(React.createElement(ShirtDeliveryChoice,{value:'DELIVER',disabled:false,onChange:vi.fn()}));
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
 });
 it('records pending, no-shirt-requested and delivery as distinct states',()=>{
  expect(shirtDecision({decision:'NO_DELIVERY',reason:'Entrega pendiente'},false)).toMatchObject({status:'PENDING'});
  expect(shirtDecision({decision:'NO_DELIVERY',reason:'El participante no la solicitó'},false)).toMatchObject({status:'NOT_DELIVERED'});
  expect(shirtDecision({decision:'DELIVER'},true)).toMatchObject({status:'DELIVERED',reason:null});
 });
 it.each(['Otro motivo','Agotada','Talla no disponible'])('requires justification for %s',reason=>{
  expect(()=>shirtDecision({decision:'NO_DELIVERY',reason},false)).toThrow('Explica');
  expect(shirtDecision({decision:'NO_DELIVERY',reason,notes:'Se agotó la talla XL'},false).notes).toContain('XL');
 });
 it('does not accept arbitrary reasons',()=>expect(()=>shirtDecision({decision:'NO_DELIVERY',reason:'inventado'},false)).toThrow());
 it('uses the event timezone, including a daylight-saving date boundary',()=>{
  expect(eventDay(new Date('2026-10-28T02:00:00Z'),'America/Santo_Domingo')).toBe('2026-10-27');
  expect(localMidnight('2026-03-08','America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
  expect(localMidnight('2026-03-09','America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
 });
 it('filters pending deliveries and check-in dates without affecting the other edition',()=>{
  const where=supervisionFilters({eventId:'event'},{dateFrom:'2026-10-27',dateTo:'2026-10-27',tshirtDelivery:'PENDING'},'America/Santo_Domingo');
  expect(where).toMatchObject({eventId:'event',attended:true,tshirtDelivered:false});expect(where.attendedAt.gte.toISOString()).toBe('2026-10-27T04:00:00.000Z');expect(where.attendedAt.lt.toISOString()).toBe('2026-10-28T04:00:00.000Z');
 });
 it('delivers later with one stock deduction and retains the earlier reason',async()=>{
  await P.deliverTshirt('event',reg.id,'operator','L');expect(reg).toMatchObject({tshirtDelivered:true,tshirtDeliveryStatus:'DELIVERED',tshirtNonDeliveryReason:'Entrega pendiente'});expect(stock.deliveredQuantity).toBe(1);
  await expect(P.deliverTshirt('event',reg.id,'operator','L')).rejects.toThrow('previamente');expect(stock.deliveredQuantity).toBe(1);
 });
 it('refuses late delivery for cancelled entries',async()=>{reg.status='CANCELLED';await expect(P.deliverTshirt('event',reg.id,'operator','L')).rejects.toThrow('cancelada');expect(stock.deliveredQuantity).toBe(0);});
});
describe('authorized reception collection reuses payment accounting',()=>{
 const input={amount:1750,paymentMethodId:'cash',requestKey:'11111111-1111-4111-8111-111111111111',source:'RECEPTION_QUEUE' as const};
 it('records a single onsite payment and returns the same operation on retry',async()=>{
  await P.recordPayment('event',reg.id,input,'operator');await P.recordPayment('event',reg.id,input,'operator');
  expect(payments).toHaveLength(1);expect(payments[0]).toMatchObject({channel:'ONSITE',receivedByUserId:'operator'});expect(reg.balanceDue).toBe(0);expect(reg.paymentStatus).toBe('PAID');
 });
 it('does not treat imported university payments as onsite cash',async()=>{reg.source='EXCEL_IMPORT';reg.externalPlatform='Universidad';await expect(P.recordPayment('event',reg.id,input,'operator')).rejects.toThrow('externo');expect(payments).toHaveLength(0);});
 it('honors editions that prohibit collection at the desk',async()=>{settings.allowOnsitePayments=false;await expect(P.recordPayment('event',reg.id,input,'operator')).rejects.toThrow('no autoriza');});
 it('rejects scanner profiles, courtesy entries and overpayments',async()=>{
  actor.scannerOnly=true;await expect(P.recordPayment('event',reg.id,input,'operator')).rejects.toThrow('No autorizado');actor.scannerOnly=false;
  reg.isCourtesy=true;await expect(P.recordPayment('event',reg.id,input,'operator')).rejects.toThrow('cortesías');reg.isCourtesy=false;
  await expect(P.recordPayment('event',reg.id,{...input,amount:2000},'operator')).rejects.toThrow('pendiente');expect(payments).toHaveLength(0);
 });
 it('uses the same payment badges and keeps external attribution',()=>{
  expect(paymentSummary({...reg,source:'EXCEL_IMPORT'}).external).toBe(true);
  expect(renderToStaticMarkup(React.createElement(PaymentStatusBadge,{registration:{isCourtesy:true},verbose:true}))).toContain('Cortesía');
 });
});
describe('persistent scanner activity without QR secrets',()=>{
 it('counts one read across preview, submission and a retry',async()=>{
  const user={id:'scanner',sessionId:'session'};
  await ScanActivity.record(mocks.db,user,'event','read-key','VALID','registration','device');
  await ScanActivity.record(mocks.db,user,'event','read-key','VALID','registration','device',true);
  await ScanActivity.record(mocks.db,user,'event','read-key','VALID','registration','device',false,true);
  expect(activities).toHaveLength(1);expect(activities[0]).toMatchObject({submitted:true,duplicate:false});
  expect(JSON.stringify(activities)).not.toContain('qrCode');
 });
 it('separates repeated reads, rejections and unique submissions across sessions',async()=>{
  await ScanActivity.record(mocks.db,{id:'scanner',sessionId:'session-1'},'event','a','VALID','registration','device',true);
  await ScanActivity.record(mocks.db,{id:'scanner',sessionId:'session-2'},'event','b','VALID','registration','device-2',false,true);
  await ScanActivity.record(mocks.db,{id:'scanner',sessionId:'session-2'},'event','c','REJECTED');
  await ScanActivity.record(mocks.db,{id:'other',sessionId:'other-session'},'event','d','VALID','other-registration','other-device',true);
  const stats=await ScanActivity.stats('scanner','event');expect(stats).toMatchObject({reads:3,sent:1,repeated:1,rejected:1,total:3});
 });
 it('does not reuse one request identity for another participant',async()=>{
  await ScanActivity.record(mocks.db,{id:'scanner',sessionId:'s'},'event','a','VALID','first');
  await expect(ScanActivity.record(mocks.db,{id:'scanner',sessionId:'s'},'event','a','VALID','second')).rejects.toThrow('utilizado');
 });
});
