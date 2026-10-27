import {beforeEach,describe,expect,it} from 'vitest';
import {attendanceFilters,listNavigationScope,participantFilters,readListNavigation,saveListNavigation} from '../src/utils/listNavigation';
const token=(sid:string)=>'header.'+btoa(JSON.stringify({sid}))+'.signature';
let values:Map<string,string>,storage:{getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void};
beforeEach(()=>{values=new Map();storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{values.set(key,value);}};});
describe('list context isolated by authenticated session and edition',()=>{
 it('restores search, all filters, sorting, page and position after returning',()=>{
  const key=listNavigationScope(storage,'user',token('session'),'edition','participants');
  const filters={...participantFilters,page:7,limit:25,search:'Unit attendee',paymentMethodId:'method',salesResponsibleId:'seller',status:'CONFIRMED',isCourtesyFilter:'REGULAR' as const,sortBy:'fullName',sortOrder:'asc' as const};
  saveListNavigation(storage,key,filters,820);
  const returned=listNavigationScope(storage,'user',token('session'),'edition','participants');
  expect(returned).toBe(key);expect(readListNavigation(storage,returned,participantFilters)).toEqual({filters,scrollTop:820});
 });
 it('preserves quick reception search when a detail is merely opened and closed',()=>{
  const key=listNavigationScope(storage,'user',token('session'),'edition','reception');
  saveListNavigation(storage,key,{...attendanceFilters,search:'Unit name',page:2},200);
  expect(readListNavigation(storage,key,attendanceFilters).filters).toEqual({...attendanceFilters,search:'Unit name',page:2});
 });
 it('persists the cleared reception search after an explicitly successful check-in',()=>{
  const key=listNavigationScope(storage,'user',token('session'),'edition','reception');
  saveListNavigation(storage,key,{...attendanceFilters,search:'Unit name'},200);
  saveListNavigation(storage,key,{...attendanceFilters},0);
  expect(readListNavigation(storage,key,attendanceFilters).filters.search).toBe('');
 });
 it('keeps quick reception and attendance control independent',()=>{
  const quick=listNavigationScope(storage,'user',token('session'),'edition','reception');
  const control=listNavigationScope(storage,'user',token('session'),'edition','attendance');
  saveListNavigation(storage,quick,{...attendanceFilters,search:'Quick'},50);
  saveListNavigation(storage,control,{...attendanceFilters,statusFilter:'ATTENDED'},300);
  expect(readListNavigation(storage,quick,attendanceFilters).filters.search).toBe('Quick');
  expect(readListNavigation(storage,control,attendanceFilters).filters.statusFilter).toBe('ATTENDED');
 });
 it('does not share filters with another user or another login session',()=>{
  const key=listNavigationScope(storage,'alice',token('session-1'),'edition','participants');
  saveListNavigation(storage,key,{...participantFilters,search:'private query'},50);
  for(const [user,session] of [['bob','session-1'],['alice','session-2']]){
   const other=listNavigationScope(storage,user,token(session),'edition','participants');
   expect(readListNavigation(storage,other,participantFilters).filters).toEqual(participantFilters);
  }
  expect([...values.keys()].join(' ')).not.toContain(token('session-1'));
 });
 it('resets all views on edition change, including returning to the first edition',()=>{
  const a=listNavigationScope(storage,'user',token('session'),'edition-a','participants');
  saveListNavigation(storage,a,{...participantFilters,page:9,search:'old query'},500);
  const b=listNavigationScope(storage,'user',token('session'),'edition-b','attendance');
  expect(readListNavigation(storage,b,attendanceFilters).filters).toEqual(attendanceFilters);
  const back=listNavigationScope(storage,'user',token('session'),'edition-a','participants');
  expect(back).not.toBe(a);expect(readListNavigation(storage,back,participantFilters)).toEqual({filters:participantFilters,scrollTop:0});
 });
 it.each([null,'malformed','header.'+btoa('{}')+'.signature'])('does not persist without a verifiable session identifier (%s)',badToken=>{
  const key=listNavigationScope(storage,'user',badToken,'edition','participants');expect(key).toBeNull();
  saveListNavigation(storage,key,participantFilters,0);expect(values.size).toBe(0);
 });
 it('ignores the old shared keys instead of importing another account search',()=>{
  storage.setItem('eventgrid_participants_filters',JSON.stringify({search:'previous user'}));
  const key=listNavigationScope(storage,'user',token('session'),'edition','participants');
  expect(readListNavigation(storage,key,participantFilters).filters.search).toBe('');
 });
 it('rejects malformed, expired and future context',()=>{
  const now=10000000;
  for(const value of ['{','null',JSON.stringify({version:1,updatedAt:now-60*60*1000-1,filters:{...participantFilters,search:'stale'}}),JSON.stringify({version:1,updatedAt:now+1,filters:{...participantFilters,search:'future'}})]){
   storage.setItem('key',value);expect(readListNavigation(storage,'key',participantFilters,now)).toEqual({filters:participantFilters,scrollTop:0});
  }
 });
 it('validates saved values and clamps unreasonable scroll positions',()=>{
  storage.setItem('key',JSON.stringify({version:1,updatedAt:1000,filters:{...participantFilters,page:-2,limit:999,sortBy:'invalid',sortOrder:'up',search:{unexpected:true}},scrollTop:-4}));
  expect(readListNavigation(storage,'key',participantFilters,1000)).toEqual({filters:participantFilters,scrollTop:0});
 });
 it('tolerates unavailable storage without breaking navigation',()=>{
  const blocked={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('quota');}};
  expect(listNavigationScope(blocked,'user',token('session'),'edition','participants')).toBeNull();
  expect(readListNavigation(blocked,'key',participantFilters)).toEqual({filters:participantFilters,scrollTop:0});
  expect(()=>saveListNavigation(blocked,'key',participantFilters,50)).not.toThrow();
 });
});
