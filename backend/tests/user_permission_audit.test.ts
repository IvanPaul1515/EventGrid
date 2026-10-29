import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({active:true,recorded:null as any,updated:false}));
const account={id:'operator',role:'OPERATOR',scannerOnly:false,isActive:true,accountStatus:'ACTIVE',assignedEventId:'edition',operationalPermissions:'["CHECK_IN"]'};
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:async(fn:any)=>fn({user:{findUnique:async({where}:any)=>where.id==='admin'?{id:'admin',role:'ADMIN',isActive:state.active,accountStatus:'ACTIVE',scannerOnly:false,assignedEventId:null}:account,update:async({data}:any)=>{state.updated=true;return {...account,...data};}},auditLog:{create:async({data}:any)=>{state.recorded=typeof data.changes==='string'?JSON.parse(data.changes):data.changes;}}})}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{notifyAccess:vi.fn()}}));
import {updateUserSafely} from '../src/modules/users/userSafety.js';
beforeEach(()=>{state.active=true;state.recorded=null;state.updated=false;});
describe('permission changes retain accurate audit values',()=>{
 it('records a cleared capability list as null when switching to a read-only role',async()=>{const result=await updateUserSafely('operator',{role:'VIEWER',operationalPermissions:null},'admin','UPDATE');expect(result.operationalPermissions).toBeNull();expect(state.recorded.before.operationalPermissions).toBe('["CHECK_IN"]');expect(state.recorded.after.operationalPermissions).toBeNull();});
 it('records explicit empty permissions without falling back to inherited rights',async()=>{await updateUserSafely('operator',{operationalPermissions:'[]'},'admin','UPDATE');expect(state.recorded.after.operationalPermissions).toBe('[]');});
 it('rechecks current administrator activity before changing capabilities',async()=>{state.active=false;await expect(updateUserSafely('operator',{operationalPermissions:'[]'},'admin','UPDATE')).rejects.toThrow();expect(state.updated).toBe(false);expect(state.recorded).toBeNull();});
});
