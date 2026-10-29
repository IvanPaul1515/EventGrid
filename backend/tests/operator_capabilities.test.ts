import {describe,it,expect} from 'vitest';
import {assertOperationalAccess,capabilitiesFor,serializeCapabilities,OPERATOR_PROFILES} from '../src/modules/users/operator-policy.js';
import {CreateUserSchema,UpdateUserSchema} from '../src/modules/users/users.dto.js';
import {canOpenSection,operatorHome,userCapability} from '../../frontend/src/utils/capabilities';

const operator=(permissions:string[]|null)=>({role:'OPERATOR',operationalPermissions:permissions===null?null:JSON.stringify(permissions)});
const allow=(permissions:string[],method:string,path:string,body?:object)=>expect(()=>assertOperationalAccess(operator(permissions),method,path,body)).not.toThrow();
const deny=(permissions:string[],method:string,path:string,body?:object)=>expect(()=>assertOperationalAccess(operator(permissions),method,path,body)).toThrow();
describe('explicit operator capabilities without expanding existing role guards',()=>{
 it('defaults new accounts to reception and preserves legacy permissions only when unconfigured',()=>{
  expect(JSON.parse(serializeCapabilities('OPERATOR',false)!)).toEqual(OPERATOR_PROFILES.RECEPTION.capabilities);
  expect(capabilitiesFor(operator(null))).toContain('CHECK_IN');
  expect(capabilitiesFor(operator(null))).not.toContain('OPINIONS_READ');
  expect(capabilitiesFor(operator([]))).toEqual([]);
  expect(()=>assertOperationalAccess(operator(null),'POST','/legacy-operation')).not.toThrow();
 });
 it('does not grant administrative powers through a profile or malformed database value',()=>{
  for(const value of ['invalid','{}','["ADMIN"]','["constructor"]'])expect(capabilitiesFor({role:'OPERATOR',operationalPermissions:value})).toEqual([]);
  expect(capabilitiesFor({role:'OPERATOR',scannerOnly:true,operationalPermissions:serializeCapabilities('OPERATOR',false,'FULL')})).toEqual([]);
  expect(serializeCapabilities('OPERATOR',true,'FULL')).toBe('[]');
  expect(serializeCapabilities('VIEWER',false,'FULL')).toBeNull();
  deny(OPERATOR_PROFILES.FULL.capabilities,'GET','/users');
  deny(OPERATOR_PROFILES.FULL.capabilities,'GET','/statistics');
 });
 it('validates known unique permissions and does not accept arbitrary role escalation',()=>{
  const base={fullName:'Cuenta QA',email:'qa@example.invalid',role:'OPERATOR'};
  expect(CreateUserSchema.parse(base).operatorProfile).toBe('RECEPTION');
  expect(CreateUserSchema.safeParse({...base,operationalPermissions:['ADMIN']}).success).toBe(false);
  expect(UpdateUserSchema.safeParse({operationalPermissions:['CHECK_IN','CHECK_IN']}).success).toBe(false);
  expect(UpdateUserSchema.parse({fullName:'Cambio de nombre'}).operationalPermissions).toBeUndefined();
 });
 it('separates registration, identity edits, payments and onsite sales',()=>{
  allow(['REGISTRATION_CREATE'],'POST','/participants',{amountPaid:0});
  deny(['REGISTRATION_CREATE'],'POST','/participants',{amountPaid:20});
  allow(['REGISTRATION_CREATE','PAYMENT_REGISTER'],'POST','/participants',{amountPaid:20});
  allow(['REGISTRATION_EDIT'],'PUT','/events/edition/participants/id',{phone:'123'});
  deny(['REGISTRATION_EDIT'],'PUT','/participants/id',{amountPaid:0});
  deny(['REGISTRATION_EDIT'],'POST','/participants/id/payments');
  allow(['PAYMENT_REGISTER'],'POST','/participants/id/payments');
  deny(['REGISTRATION_CREATE'],'POST','/participants/onsite-sale');
  allow(['SALE_REGISTER'],'POST','/participants/onsite-sale');
 });
 it('requires distinct check-in, shirt and cap permissions for atomic queue confirmation',()=>{
  const path='/events/edition/reception-queue/entries/entry/confirm';
  deny(['QUEUE_MANAGE'],'POST',path,{confirmed:true});
  allow(['QUEUE_MANAGE','CHECK_IN'],'POST',path,{confirmed:true,tshirtDelivered:false,capDecision:'NO_DELIVERY'});
  deny(['QUEUE_MANAGE','CHECK_IN'],'POST',path,{tshirtDelivered:true});
  deny(['QUEUE_MANAGE','CHECK_IN','SHIRT_DELIVER'],'POST',path,{tshirtDelivered:true,capDecision:'DELIVER'});
  allow(['QUEUE_MANAGE','CHECK_IN','SHIRT_DELIVER','CAP_DELIVER'],'POST',path,{tshirtDelivered:true,capDecision:'DELIVER'});
 });
 it('protects direct check-in and delivery endpoints as well as queue entry points',()=>{
  deny(['CHECK_IN'],'POST','/attendance/check-in',{tshirtDelivered:true});
  allow(['CHECK_IN','SHIRT_DELIVER'],'POST','/attendance/check-in',{tshirtDelivered:true});
  deny(['CHECK_IN'],'POST','/participants/id/deliver-tshirt');
  allow(['SHIRT_DELIVER'],'POST','/participants/id/deliver-tshirt');
  deny(['SHIRT_DELIVER'],'POST','/merch/deliver/id');
  allow(['CAP_DELIVER'],'POST','/merch/deliver/id');
  allow(['CHECK_IN'],'GET','/events/edition/reception-queue/state');
  deny(['CHECK_IN'],'POST','/events/edition/reception-queue/station');
 });
 it('keeps imports, exports, speaker management and incidents separately authorized',()=>{
  deny(['REGISTRATION_CREATE'],'POST','/import/bulk/commit');
  allow(['IMPORT_MANAGE'],'POST','/events/edition/import/bulk/validate');
  deny(['REPORTS_READ'],'GET','/participants/export');
  allow(['EXPORT'],'GET','/participants/export');
  allow(['SPEAKERS_MANAGE'],'PUT','/events/edition/speakers/id');
  deny(['CHECK_IN'],'POST','/attendance/incidents');
  allow(['INCIDENTS_MANAGE'],'POST','/attendance/incidents');
 });
 it('allows account/session/edition recovery without letting an empty profile perform business operations',()=>{
  for(const [method,path] of [['GET','/auth/me'],['POST','/auth/logout'],['GET','/events'],['GET','/events/edition'],['GET','/events/edition/stream'],['GET','/notifications']])allow([],method,path);
  deny([],'GET','/participants');deny([],'POST','/events/edition');
 });
 it('does not send restricted operators into a forbidden dashboard or a redirect loop',()=>{
  const reception=operator(OPERATOR_PROFILES.RECEPTION.capabilities);
  expect(canOpenSection(reception,'/')).toBe(false);expect(operatorHome(reception)).toBe('/reception');
  expect(canOpenSection(reception,'/users')).toBe(false);expect(canOpenSection(reception,'/communications')).toBe(false);
  expect(canOpenSection(reception,'/reception')).toBe(true);expect(operatorHome(operator([]))).toBeNull();
  expect(operatorHome(operator(OPERATOR_PROFILES.FINANCE.capabilities))).toBe('/');
  expect(canOpenSection(operator(null),'/communications')).toBe(true);
  expect(userCapability({...reception,scannerOnly:true},'CHECK_IN')).toBe(false);
 });
});
