import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({user:{id:'scanner',email:'scanner@example.invalid',username:'scanner_01',passwordHash:'fixture',role:'OPERATOR',isActive:true,accountStatus:'ACTIVE',scannerOnly:true,assignedEventId:'edition'} as any,match:true}));
vi.mock('../src/config/db.js',()=>({prisma:{user:{findUnique:vi.fn(async()=>state.user)}}}));
vi.mock('bcryptjs',()=>({default:{compare:vi.fn(async()=>state.match)}}));
vi.mock('../src/modules/auth/device-session.service.js',()=>({DeviceSessionService:{issue:vi.fn(async()=> 'mock-session')}}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{}}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:vi.fn()}));
import {prisma} from '../src/config/db.js';
import {AuthService} from '../src/modules/auth/auth.service.js';
import {DeviceSessionService} from '../src/modules/auth/device-session.service.js';
beforeEach(()=>{vi.clearAllMocks();state.match=true;state.user={id:'scanner',email:'scanner@example.invalid',username:'scanner_01',passwordHash:'fixture',role:'OPERATOR',isActive:true,accountStatus:'ACTIVE',scannerOnly:true,assignedEventId:'edition'};});
describe('email and username authenticate the same independent restricted account',()=>{
 it('uses a normalized username and retains restricted profile and assigned edition',async()=>{const r=await AuthService.login(' SCANNER_01 ','fixture',true);expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{username:'scanner_01'}});expect(r.user).toMatchObject({id:'scanner',username:'scanner_01',scannerOnly:true,assignedEventId:'edition',role:'OPERATOR'});expect(DeviceSessionService.issue).toHaveBeenCalledOnce();expect(r.user).not.toHaveProperty('passwordHash');});
 it('continues to accept email without changing other sessions',async()=>{await AuthService.login(' Scanner@Example.Invalid ','fixture');expect(prisma.user.findUnique).toHaveBeenCalledWith({where:{email:'scanner@example.invalid'}});});
 it.each([null,{isActive:false},{accountStatus:'PENDING'}])('returns the same safe login error for unavailable accounts %j',async patch=>{state.user=patch?{...state.user,...patch}:null;await expect(AuthService.login('scanner_01','fixture',true)).rejects.toThrow('Credenciales incorrectas');expect(DeviceSessionService.issue).not.toHaveBeenCalled();});
 it('does not issue scanner sessions to normal operators, even with a correct password',async()=>{state.user.scannerOnly=false;await expect(AuthService.login('scanner_01','fixture',true)).rejects.toThrow('Credenciales incorrectas');expect(DeviceSessionService.issue).not.toHaveBeenCalled();});
 it('requires a valid password before granting the restricted session',async()=>{state.match=false;await expect(AuthService.login('scanner_01','fixture',true)).rejects.toThrow('Credenciales incorrectas');expect(DeviceSessionService.issue).not.toHaveBeenCalled();});
});
