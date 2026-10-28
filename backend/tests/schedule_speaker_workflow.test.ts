import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({db:{} as any}));
vi.mock('../src/config/db.js',()=>({prisma:m.db}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:async(fn:any)=>fn(m.db)}));
vi.mock('../src/modules/communications/communications.service.js',()=>({CommunicationsService:{}}));
import {ScheduleService as S} from '../src/modules/schedule/schedule.service.js';
import {CreateScheduleItemSchema} from '../src/modules/schedule/schedule.dto.js';
import {eventDates,officialDay,programmingReady} from '../src/modules/schedule/programming.js';
const id='36fcb17f-2d7d-44e5-bcba-84f857dbbffa';
beforeEach(()=>{
 vi.clearAllMocks();const event={id:'event',startDate:new Date('2026-11-07T08:00:00Z'),endDate:new Date('2026-11-07T18:00:00Z'),settings:{demoModeEnabled:true}};
 m.db.event={findUnique:vi.fn(async()=>event),findUniqueOrThrow:vi.fn(async()=>event)};
 m.db.eventSettings={findUnique:vi.fn(async()=>null)};
 m.db.scheduleItem={create:vi.fn(async({data}:any)=>({id:'talk',...data})),findFirst:vi.fn(async()=>null),findMany:vi.fn(async()=>[]),update:vi.fn(async({data}:any)=>({id:'talk',...data}))};
 m.db.speaker={findMany:vi.fn(async()=>[{id,fullName:'Charlista QA'}])};
 m.db.speakerTalk={findMany:vi.fn(async()=>[]),deleteMany:vi.fn(async()=>({count:0})),create:vi.fn(async()=>({}))};
 m.db.auditLog={create:vi.fn(async()=>({}))};m.db.scheduleChangeLog={create:vi.fn(async()=>({id:'log'}))};
});
describe('incomplete scheduling and canonical speaker links',()=>{
 it('requires only a nonblank title',()=>{expect(CreateScheduleItemSchema.parse({title:'Charla'})).toMatchObject({startTime:'',endTime:'',day:''});expect(CreateScheduleItemSchema.safeParse({title:'   '}).success).toBe(false);});
 it('derives real dates and maps historical day labels without inventing dates',()=>{const dates=eventDates('2026-11-07','2026-11-09');expect(dates).toEqual(['2026-11-07','2026-11-08','2026-11-09']);expect(officialDay('',dates)).toBe('');expect(officialDay('Día 2',dates)).toBe('2026-11-08');expect(()=>officialDay('2026-12-01',dates)).toThrow('fecha oficial');expect(officialDay('',[dates[0]])).toBe(dates[0]);});
 it('saves title-only drafts without rooms or fabricated times',async()=>{const row=await S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla'}),'admin');expect(row).toMatchObject({title:'Charla',day:'2026-11-07',startTime:'',endTime:'',room:null,visibility:'DRAFT'});expect((row as any).attended).toBeUndefined();});
 it('allows one optional time but rejects reversed complete intervals',async()=>{await expect(S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla',startTime:'10:00'}))).resolves.toMatchObject({visibility:'DRAFT'});await expect(S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla',startTime:'11:00',endTime:'10:00'}))).rejects.toThrow('hora');});
 it('publishes only complete programming and preserves the requested publication mode',async()=>{const row=await S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla',startTime:'10:00',endTime:'11:00',room:'Aula A'}));expect(row.visibility).toBe('PUBLISHED');expect(programmingReady(row)).toBe(true);});
 it('associates canonical speaker profiles atomically and deduplicates ids',async()=>{const row=await S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla',speakerIds:[id,id]}),'admin');expect(row.speakerName).toBe('Charlista QA');expect(m.db.speakerTalk.create).toHaveBeenCalledTimes(1);expect(m.db.auditLog.create).toHaveBeenCalled();expect(m.db.scheduleItem.create.mock.calls[0][0].data.attended).toBeUndefined();});
 it('rejects foreign or cancelled profiles before creating a talk',async()=>{m.db.speaker.findMany.mockResolvedValue([]);await expect(S.createItem('event',CreateScheduleItemSchema.parse({title:'Charla',speakerIds:[id]}),'admin')).rejects.toThrow('otra edición');expect(m.db.scheduleItem.create).not.toHaveBeenCalled();});
 it('filters incomplete legacy records from the public schedule',async()=>{m.db.scheduleItem.findMany.mockResolvedValue([{id:'ready',day:'Día 1',startTime:'10:00',endTime:'11:00',room:'Aula A'},{id:'missing',day:'Día 1',startTime:'',endTime:'',room:null},{id:'no-room',day:'Día 1',startTime:'12:00',endTime:'13:00',room:null}]);const result=await S.getPublicSchedule('event');expect(result.total).toBe(1);expect(result.items[0]).toMatchObject({id:'ready',day:'2026-11-07'});});
});
