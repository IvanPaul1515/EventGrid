import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({db:{} as any}));
vi.mock('../src/config/db.js',()=>({prisma:m.db}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:async(fn:any)=>fn(m.db)}));
vi.mock('../src/modules/participants/participants.service.js',()=>({ParticipantsService:{getNextRegistrationNumber:vi.fn()}}));
vi.mock('../src/modules/communications/communications.service.js',()=>({CommunicationsService:{}}));
import {ScheduleController} from '../src/modules/schedule/schedule.controller.js';
import {DemoService as D} from '../src/modules/demo/demo.service.js';
import {ScheduleService as S} from '../src/modules/schedule/schedule.service.js';
beforeEach(()=>{
 vi.restoreAllMocks();vi.clearAllMocks();m.db.event={findUnique:vi.fn(async()=>({id:'event',year:2026,settings:{demoModeEnabled:false},ticketTypes:[{id:'ticket',price:1750}],paymentMethods:[{id:'method'}]}))};
 m.db.eventSettings={update:vi.fn(async()=>({}))};
 m.db.registration={count:vi.fn(async({where}:any)=>where.isDemo===true?25:7),findMany:vi.fn(async()=>[{id:'demo-id',participantId:'demo-person'}]),create:vi.fn(),deleteMany:vi.fn(async()=>({count:1}))};
 m.db.participant={count:vi.fn(async()=>1),deleteMany:vi.fn(async()=>({count:0}))};
 m.db.payment={deleteMany:vi.fn()};m.db.attendanceLog={deleteMany:vi.fn()};m.db.emailLog={deleteMany:vi.fn()};
 m.db.scheduleItem={findMany:vi.fn(async()=>[{id:'demo-talk'}]),deleteMany:vi.fn(async()=>({count:1}))};m.db.speakerTalk={deleteMany:vi.fn(async()=>({count:0}))};
 m.db.$transaction=async(fn:any)=>fn(m.db);
});
describe('central demo controls preserve real data',()=>{
 it.each(['deleteItem','updateItem'] as const)('blocks operator management of demo talks through generic %s',async action=>{vi.spyOn(S,'getItemById').mockResolvedValue({id:'demo-talk',isDemo:true} as any);const remove=vi.spyOn(S,'deleteItem'),edit=vi.spyOn(S,'updateItem');const next=vi.fn();await ScheduleController[action]({params:{eventId:'event',id:'demo-talk'},eventId:'event',body:{title:'Cambio'},user:{role:'OPERATOR'}} as any,{} as any,next);expect(next.mock.calls[0][0].statusCode).toBe(403);expect(remove).not.toHaveBeenCalled();expect(edit).not.toHaveBeenCalled();});

 it('toggle changes only edition demo visibility, never real records or prices',async()=>{await D.toggle('event',true);expect(m.db.eventSettings.update).toHaveBeenCalledWith(expect.objectContaining({data:{demoModeEnabled:true}}));expect(m.db.registration.deleteMany).not.toHaveBeenCalled();expect(m.db.registration.create).not.toHaveBeenCalled();});
 it('repeated generation targets the existing demo count without duplicating data',async()=>{const a=await D.generate('event',25,'admin'),b=await D.generate('event',25,'admin');expect(a.generatedCount).toBe(0);expect(b.generatedCount).toBe(0);expect(m.db.registration.create).not.toHaveBeenCalled();});
 it('schedule cleanup deletes only explicitly marked demo rows in the edition, never by title',async()=>{await S.clearDemoSchedule('event');expect(m.db.scheduleItem.findMany).toHaveBeenCalledWith({where:{eventId:'event',isDemo:true},select:{id:true}});expect(m.db.scheduleItem.deleteMany).toHaveBeenCalledWith({where:{eventId:'event',isDemo:true}});});
 it('participant cleanup selects only demo registrations and preserves people with remaining registrations',async()=>{await D.reset('event');expect(m.db.registration.findMany).toHaveBeenCalledWith({where:{eventId:'event',isDemo:true},select:{id:true,participantId:true}});expect(m.db.registration.deleteMany).toHaveBeenCalledWith({where:{id:{in:['demo-id']},eventId:'event',isDemo:true}});expect(m.db.participant.deleteMany).not.toHaveBeenCalled();});
});
