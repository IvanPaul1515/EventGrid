import {describe,it,expect,vi} from 'vitest';
import {purchaseHour} from '../src/modules/statistics/statistics.rules.js';
vi.mock('../src/config/db.js',()=>({prisma:{event:{findUnique:vi.fn(async({where}:any)=>({id:where.id,name:where.id,startDate:new Date('2026-10-01'),endDate:new Date('2026-10-01')}))},opinionResponse:{findMany:vi.fn(async()=>[{answers:JSON.stringify([{id:'general',label:'Experiencia general',type:'RATING',value:4}])},{answers:JSON.stringify([{id:'general',label:'Pregunta cambiada',type:'RATING',value:1}])}])}}}));
import {StatisticsService} from '../src/modules/statistics/statistics.service.js';
describe('compatible descriptive comparisons without changing historical data',()=>{
 it('excludes date-only, naive timestamps and unreviewed purchases from hourly purchase charts',()=>{
  const row=(date:any)=>({historicalDates:JSON.stringify({purchasedAt:date}),source:'EXCEL_IMPORT',externalReference:'qa'}) as any;
  expect(purchaseHour(row({source:'ADMIN_REVIEWED',precision:'DATE',value:'2026-10-10'}))).toBeNull();
  expect(purchaseHour(row({source:'ADMIN_REVIEWED',precision:'SECOND',value:'2026-10-10T14:05:00Z',zone:'UTC'}))).toBe('2026-10-10 10:00');
  expect(purchaseHour(row({source:'ADMIN_REVIEWED',precision:'SECOND',value:'2026-10-10T14:05:00',zone:'UTC'}))).toBeNull();
  expect(purchaseHour(row({source:'DECLARED',precision:'SECOND',value:'2026-10-10T14:05:00Z',zone:'UTC'}))).toBeNull();
 });
 it('keeps independent currencies and excludes renamed questions from satisfaction comparisons',async()=>{
  const spy=vi.spyOn(StatisticsService,'summary').mockImplementation(async(id)=>({timezone:'America/Santo_Domingo',currency:id==='one'?'DOP':'USD',participants:{registered:0,confirmed:0,attended:0,absent:0},sales:{paymentTotal:150,pendingAmount:20},shirts:{delivered:0}} as any));
  const rows=await StatisticsService.compare(['one','two']);expect(rows.map(row=>row.currency)).toEqual(['DOP','USD']);expect(rows[0].attendanceRate).toBeNull();expect(rows[0].satisfaction).toEqual({count:1,mean:4});expect(rows[1].paymentTotal).toBe(150);spy.mockRestore();
 });
});
