import {beforeEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import request from 'supertest';
import crypto from 'node:crypto';
import {configSchema,defaultQuestions,responseSchema,suggestionSchema,snapshotAnswers,summarizeOpinions} from '../src/modules/opinions/opinions.rules.js';

const store=vi.hoisted(()=>({survey:null as any,responses:new Map<string,any>(),suggestions:new Map<string,any>(),role:'ADMIN',permissions:null as string|null,scanner:false,origin:true}));
vi.mock('../src/config/env.js',()=>({ENV:{NODE_ENV:'test',CORS_ORIGIN:['https://demo.example.invalid']}}));
vi.mock('../src/config/db.js',()=>({prisma:{
 applicationSettings:{upsert:vi.fn(async()=>({publicOrigin:store.origin?'https://demo.example.invalid':null,originStatus:store.origin?'VERIFIED':'UNCONFIGURED'}))},
 opinionSurvey:{findUnique:vi.fn(async({where}:any)=>where.publicKey&&where.publicKey!==store.survey?.publicKey?null:store.survey),upsert:vi.fn(async({update,create}:any)=>{store.survey={...(store.survey||{...create,publicKey:crypto.randomUUID()}),...update};return store.survey;})},
 opinionResponse:{findUnique:vi.fn(async({where}:any)=>store.responses.get(where.id)),create:vi.fn(async({data}:any)=>{store.responses.set(data.id,data);return data;})},
 opinionSuggestion:{findUnique:vi.fn(async({where}:any)=>store.suggestions.get(where.id)),create:vi.fn(async({data}:any)=>{store.suggestions.set(data.id,data);return data;})},
 user:{findUnique:vi.fn(async()=>({id:'actor',role:store.role,isActive:true,accountStatus:'ACTIVE',scannerOnly:store.scanner,operationalPermissions:store.permissions}))},
 auditLog:{create:vi.fn(async()=>({}))},
}}));
vi.mock('../src/utils/writeTransaction.js',()=>({writeTransaction:async(fn:any)=>fn((await import('../src/config/db.js')).prisma)}));
vi.mock('../src/middleware/auth.js',()=>({authenticateToken:(req:any,_res:any,next:any)=>{req.user={id:'actor',role:store.role,scannerOnly:store.scanner,operationalPermissions:store.permissions};next();}}));
vi.mock('../src/middleware/editionContext.js',()=>({editionContext:(req:any,_res:any,next:any)=>{req.eventId='edition';next();}}));
vi.mock('../src/modules/realtime/realtime.service.js',()=>({RealtimeService:{changed:vi.fn()}}));
import {publicOpinionsRoutes,opinionsRoutes} from '../src/modules/opinions/opinions.routes.js';
import {errorHandler} from '../src/middleware/errorHandler.js';
import {prisma} from '../src/config/db.js';
const app=express();app.set('trust proxy',1);app.use(express.json());app.use('/public',publicOpinionsRoutes);app.use('/opinions',opinionsRoutes);app.use(errorHandler);
let ip=0,key:string;
const send=(path:string,body:any)=>request(app).post(path).set('X-Forwarded-For','192.0.2.'+(++ip)).send(body);
beforeEach(()=>{vi.clearAllMocks();store.role='ADMIN';store.permissions=null;store.scanner=false;store.origin=true;store.responses.clear();store.suggestions.clear();key=crypto.randomUUID();store.survey={eventId:'edition',publicKey:key,enabled:true,buzonEnabled:true,questions:JSON.stringify(defaultQuestions),event:{name:'Evento QA',status:'ACTIVE',settings:{primaryColor:'#334155'}}};});
describe('anonymous opinions and independent suggestions',()=>{
 it('returns only public edition appearance and enabled questions, never response rows or internal notes',async()=>{
  const r=await request(app).get('/public/'+key);expect(r.status).toBe(200);expect(Object.keys(r.body.data).sort()).toEqual(['appearance','buzonEnabled','categories','name','questions','surveyEnabled']);expect(JSON.stringify(r.body)).not.toMatch(/password|email|userId|internalNotes|responses/);
 });
 it('stores an anonymous answer snapshot without identity, then safely accepts the same retry once',async()=>{
  const payload={id:crypto.randomUUID(),kind:'EVENT',answers:{general:5,recommend:true},website:''};
  expect((await send('/public/'+key+'/responses',payload)).status).toBe(201);expect((await send('/public/'+key+'/responses',payload)).status).toBe(201);
  expect(store.responses.size).toBe(1);expect(Object.keys([...store.responses.values()][0]).sort()).toEqual(['answers','eventId','id','kind']);
  expect(JSON.parse([...store.responses.values()][0].answers)[0]).toEqual({id:'general',label:'Experiencia general',type:'RATING',value:5});
  expect((await send('/public/'+key+'/responses',{...payload,answers:{general:1}})).status).toBe(400);
 });
 it('rejects hidden identity fields, invalid scores, disabled/unknown questions and populated honeypots',async()=>{
  const payload={id:crypto.randomUUID(),kind:'EVENT',answers:{general:5}};
  expect(responseSchema.safeParse({...payload,userId:'participant'}).success).toBe(false);
  expect(responseSchema.safeParse({...payload,website:'spam'}).success).toBe(false);
  expect(responseSchema.safeParse({...payload,answers:{general:6}}).success).toBe(false);
  expect(()=>snapshotAnswers(defaultQuestions,'EVENT',{email:'person@example.invalid'})).toThrow();
  expect(()=>snapshotAnswers(defaultQuestions.map(q=>({...q,enabled:false})),'EVENT',{general:5})).toThrow();
  expect(()=>snapshotAnswers(defaultQuestions,'EVENT',{general:true})).toThrow();expect(()=>snapshotAnswers(defaultQuestions,'EVENT',{})).toThrow();
 });
 it('never changes the persistent public key when an administrator edits or disables the questionnaire',async()=>{
  const r=await request(app).put('/opinions/config').send({enabled:false,questions:[...defaultQuestions].reverse()});expect(r.status).toBe(200);expect(r.body.data.publicKey).toBe(key);expect(r.body.data.publicUrl).toBe('https://demo.example.invalid/opinions/'+key);
  expect((await send('/public/'+key+'/responses',{id:crypto.randomUUID(),kind:'EVENT',answers:{general:5}})).status).toBe(400);expect(store.responses.size).toBe(0);
 });
 it('keeps the suggestion inbox independent from the questionnaire and never stores requester identity',async()=>{
  const r=await send('/public/'+key+'/suggestions',{id:crypto.randomUUID(),category:'Accesibilidad',text:'Mejorar el acceso al salón'});expect(r.status).toBe(201);expect(store.responses.size).toBe(0);expect(store.suggestions.size).toBe(1);expect(Object.keys([...store.suggestions.values()][0]).sort()).toEqual(['category','eventId','id','text']);
  expect(suggestionSchema.safeParse({id:crypto.randomUUID(),category:'Otro',text:'Texto válido',email:'qa@example.invalid'}).success).toBe(false);
 });
 it('requires explicit opinions permission and rejects scanner, viewer and ordinary legacy operator access',async()=>{
  for(const role of ['VIEWER','OPERATOR']){store.role=role;expect((await request(app).get('/opinions/config')).status).toBe(403);}
  store.permissions='["OPINIONS_READ"]';expect((await request(app).get('/opinions/config')).status).toBe(200);
  expect((await request(app).put('/opinions/config').send({enabled:true,questions:defaultQuestions})).status).toBe(403);
  store.permissions='["OPINIONS_MANAGE"]';expect((await request(app).get('/opinions/config')).status).toBe(200);
  store.scanner=true;expect((await request(app).get('/opinions/config')).status).toBe(403);
 });
 it('only aggregates actual rating samples, separates edited wording and never invents absence causes',()=>{
  const response=(answers:object,kind='EVENT')=>({kind,answers:JSON.stringify(snapshotAnswers(defaultQuestions,kind,answers))});
  const result=summarizeOpinions([response({general:5}),response({general:1}),response({absence_reason:'Trabajo'},'ABSENCE')],[{category:'Organización'},{category:'Otro'}]);
  expect(result.responses).toBe(2);expect(result.absenceResponses).toBe(1);expect(result.ratings[0]).toMatchObject({mean:3,count:2,distribution:[1,0,0,0,1]});expect(result.warning).toContain('no se extrapolan');
  const changed=JSON.stringify([{id:'general',label:'Otra pregunta',type:'RATING',value:4}]);expect(summarizeOpinions([response({general:5}),{kind:'EVENT',answers:changed}],[]).ratings).toHaveLength(2);
 });
 it('retains configured wording/order while refusing duplicate question identifiers',()=>{
  expect(configSchema.safeParse({enabled:true,questions:[defaultQuestions[0],defaultQuestions[0]]}).success).toBe(false);
  expect(configSchema.parse({enabled:true,questions:[...defaultQuestions].reverse()}).questions[0].id).toBe('absence_reason');
 });
 it('generates PNG and SVG pointing to the same stable configured public URL',async()=>{
  const svg=await request(app).get('/opinions/qr/svg'),png=await request(app).get('/opinions/qr/png');expect(svg.status).toBe(200);expect(svg.headers['content-type']).toContain('image/svg+xml');expect(png.status).toBe(200);expect(png.headers['content-type']).toContain('image/png');expect(store.survey.publicKey).toBe(key);expect(prisma.opinionSurvey.upsert).toHaveBeenCalledWith(expect.objectContaining({update:{}}));
 });
});

 it('keeps a paused public page and independent inbox, while rejecting cross-edition identifiers',async()=>{
  store.survey.enabled=false;const r=await request(app).get('/public/'+key);expect(r.status).toBe(200);expect(r.body.data).toMatchObject({surveyEnabled:false,buzonEnabled:true});
  expect((await send('/public/'+key+'/responses',{id:crypto.randomUUID(),kind:'EVENT',answers:{general:5}})).status).toBe(400);
  expect((await send('/public/'+key+'/suggestions',{id:crypto.randomUUID(),category:'Otro',text:'Una sugerencia válida'})).status).toBe(201);
  expect((await request(app).get('/public/'+crypto.randomUUID())).status).toBe(404);
  store.survey.buzonEnabled=false;expect((await send('/public/'+key+'/suggestions',{id:crypto.randomUUID(),category:'Otro',text:'Otra sugerencia válida'})).status).toBe(400);
 });
 it('prepares permanent resources without a configured domain but never exports a localhost QR',async()=>{store.origin=false;const r=await request(app).get('/opinions/config');expect(r.status).toBe(200);expect(r.body.data).toMatchObject({publicKey:key,publicUrl:null,publicPath:'/opinions/'+key});expect((await request(app).get('/opinions/qr/svg')).status).toBe(400);expect(defaultQuestions.filter(q=>q.kind==='EVENT')).toHaveLength(9);});

it('groups daily trends from actual dated event answers only, preserving anonymity',()=>{const data=[{kind:'EVENT',answers:'[]',createdAt:'2026-10-30T13:00:00Z'},{kind:'EVENT',answers:'[]',createdAt:'2026-10-30T14:00:00Z'},{kind:'ABSENCE',answers:'[]',createdAt:'2026-10-30T15:00:00Z'},{kind:'EVENT',answers:'[]'}];expect(summarizeOpinions(data,[]).trends).toEqual([{day:'2026-10-30',count:2}]);});
