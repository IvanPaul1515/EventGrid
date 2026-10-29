import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {editionDraftKey,newEditionDraft,readEditionDraft,editionSetupPayload} from '../../frontend/src/utils/editionDraft';
const state=vi.hoisted(()=>({actor:{id:'admin',role:'ADMIN',isActive:true,scannerOnly:false,assignedEventId:null as string|null,accountStatus:'ACTIVE'},existing:null as any,audits:[] as any[],writes:[] as any[]}));
const tx=vi.hoisted(()=>({
 user:{findUnique:vi.fn(async()=>state.actor)},
 event:{findUnique:vi.fn(async()=>state.existing),create:vi.fn(async({data}:any)=>{state.writes.push(['event',data]);return data;}),update:vi.fn(async(args:any)=>{state.writes.push(['eventUpdate',args]);return args;})},
 ticketType:{create:vi.fn(async({data}:any)=>{state.writes.push(['ticket',data]);return {id:'ticket',...data};})},
 paymentMethod:{create:vi.fn(async(args:any)=>state.writes.push(['method',args.data]))},
 tshirtInventory:{create:vi.fn(async(args:any)=>state.writes.push(['shirts',args.data]))},
 merchItem:{create:vi.fn(async(args:any)=>state.writes.push(['caps',args.data]))},
 opinionSurvey:{create:vi.fn(async(args:any)=>state.writes.push(['survey',args.data]))},
 auditLog:{findMany:vi.fn(async()=>state.audits),create:vi.fn(async(args:any)=>state.writes.push(['audit',args.data]))},
}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:vi.fn(async(fn:any)=>fn(tx))}));
import {editionSetupSchema,setupEdition} from '../src/modules/events/edition-setup.js';
const validDraft=()=>({...newEditionDraft(),name:'Evento QA',slug:'evento-qa',venue:'Salón QA',startDate:'2026-11-01T08:00',endDate:'2026-11-01T18:00',ticketPrice:'1750',capsEnabled:true,capQuantity:'150',participantQuota:'100',staffQuota:'50'});
beforeEach(()=>{vi.clearAllMocks();state.writes=[];state.existing=null;state.audits=[];state.actor.assignedEventId=null;state.actor.role='ADMIN';state.actor.isActive=true;});
describe('edition wizard drafts and transactional publication',()=>{
 it('scopes a non-secret local draft to both account and device session',()=>{
  const token=(sid:string)=>'header.'+btoa(JSON.stringify({sid}))+'.signature';
  expect(editionDraftKey('a',token('one'))).not.toBe(editionDraftKey('b',token('one')));
  expect(editionDraftKey('a',token('one'))).not.toBe(editionDraftKey('a',token('two')));
  expect(editionDraftKey('a',token('one'))).not.toContain('signature');expect(editionDraftKey('a','invalid')).toBeNull();
 });
 it('restores only a recent structurally valid draft and does not trust arbitrary saved properties',()=>{
  const draft={...validDraft(),step:4},storage={getItem:()=>JSON.stringify({version:1,at:1000,draft:{...draft,password:'must-not-return'}})};
  expect(readEditionDraft(storage,'key',2000)).toEqual(draft);expect(readEditionDraft(storage,'key',86402000).name).toBe('');
  expect(readEditionDraft({getItem:()=>'{broken'},'key').name).toBe('');expect(readEditionDraft({getItem:()=>JSON.stringify({version:1,at:1000,draft:{...draft,step:9}})},'key',2000).name).toBe('');
 });
 it('parses stock declarations and rejects invalid dates, repeated sizes and overcommitted quotas before writing',async()=>{
  const payload=editionSetupPayload(validDraft());expect(payload.shirts).toContainEqual({size:'M',quantity:0});
  expect(()=>editionSetupPayload({...validDraft(),shirts:'not a stock row'})).toThrow();
  expect(()=>editionSetupPayload({...validDraft(),endDate:'2026-10-01T08:00'})).toThrow();
  expect(editionSetupSchema.safeParse({...payload,shirts:[{size:'M',quantity:1},{size:'m',quantity:1}]}).success).toBe(false);
  await expect(setupEdition({...payload,caps:{...payload.caps,quantity:5}},'admin')).rejects.toThrow();expect(state.writes).toHaveLength(0);
 });
 it('creates only new edition configuration in one transaction, with no copied business records or SMTP changes',async()=>{
  const payload=editionSetupPayload(validDraft());await setupEdition(payload,'admin');
  expect(state.writes.find(([kind])=>kind==='event')[1]).toMatchObject({id:payload.id,isDefault:false,settings:{create:{demoModeEnabled:false,allowOnsitePayments:false}}});
  expect(state.writes.find(([kind])=>kind==='ticket')[1]).toMatchObject({eventId:payload.id,price:1750});
  expect(state.writes.find(([kind])=>kind==='eventUpdate')[1]).toEqual({where:{id:payload.id},data:{defaultTicketTypeId:'ticket'}});
  expect(state.writes.find(([kind])=>kind==='caps')[1]).toMatchObject({eventId:payload.id,participantQuota:100,staffQuota:50});
  expect(state.writes.find(([kind])=>kind==='survey')[1]).toMatchObject({eventId:payload.id,enabled:false});
  expect(state.writes.map(([kind])=>kind)).not.toContain('registration');expect(JSON.stringify(state.writes)).not.toContain('smtp');
 });
 it('rechecks the global administrator in the write transaction and does not expand a scoped administrator',async()=>{
  state.actor.assignedEventId='old-edition';await expect(setupEdition(editionSetupPayload(validDraft()),'admin')).rejects.toThrow();expect(state.writes).toHaveLength(0);
  state.actor.assignedEventId=null;state.actor.role='OPERATOR';await expect(setupEdition(editionSetupPayload(validDraft()),'admin')).rejects.toThrow();
 });
 it('makes an uncertain-response retry idempotent without overwriting the first configuration',async()=>{
  const payload=editionSetupPayload(validDraft());state.existing={id:payload.id,slug:payload.slug,name:payload.name};state.audits=[{changes:JSON.stringify({operation:'EVENT_SETUP',requestHash:createHash('sha256').update(JSON.stringify(editionSetupSchema.parse(payload))).digest('hex')})}];
  expect(await setupEdition(payload,'admin')).toEqual(state.existing);expect(state.writes).toHaveLength(0);
  await expect(setupEdition({...payload,ticket:{...payload.ticket,price:100}},'admin')).rejects.toThrow();
  state.audits=[];await expect(setupEdition(payload,'admin')).rejects.toThrow();
 });
});
