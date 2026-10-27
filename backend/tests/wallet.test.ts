import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import crypto from 'node:crypto';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';

const fixture = await vi.hoisted(async () => {
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { execFileSync } = await import('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eventgrid-courtesy-qa-'));
  const db = path.join(directory, 'test.db'); fs.writeFileSync(db, '');
  const url = 'file:' + db.replaceAll('\\', '/');
  execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)), 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  const previous = process.env.DATABASE_URL; process.env.DATABASE_URL = url;
  return { url, previous };
});
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';


const archive = vi.hoisted(() => ({ files: {} as Record<string,Buffer> }));
vi.mock('passkit-generator',()=>({PKPass:class {constructor(files:Record<string,Buffer>){archive.files=files;}setRelevantDate(){}setExpirationDate(){}getAsBuffer(){return Buffer.from('mock-signed-pkpass');}}}));
import { WalletService } from '../src/modules/wallet/wallet.service.js';
import { QrService } from '../src/modules/qr/qr.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { afterEach } from 'vitest';
let eventId:string,registrationId:string,operatorId:string,reg:any;
const envs=['APPLE_WALLET_ENABLED','GOOGLE_WALLET_ENABLED','GOOGLE_WALLET_ISSUER_APPROVED','WALLET_PUBLIC_BASE_URL','GOOGLE_WALLET_ISSUER_ID','GOOGLE_WALLET_CLIENT_EMAIL','GOOGLE_WALLET_KEY_PEM_BASE64','GOOGLE_WALLET_ORIGINS'];
beforeAll(async()=>{
 for(const e of envs)vi.stubEnv(e,'');
 const event=await prisma.event.create({data:{slug:'wallet-fixture',name:'Synthetic Event',year:2027,venue:'Synthetic Venue',startDate:new Date('2027-06-01T14:00:00Z'),endDate:new Date('2027-06-02T21:00:00Z')}});eventId=event.id;
 await prisma.eventSettings.create({data:{eventId,primaryColor:'#123456',logoUrl:'/pucmm-logo.png'}});
 const person=await prisma.participant.create({data:{firstName:'Synthetic',lastName:'Wallet',fullName:'Synthetic Wallet',email:'wallet@example.invalid'}});
 registrationId=(await prisma.registration.create({data:{eventId,participantId:person.id,registrationNumber:'WALLET-QA-1',qrCode:'eg_qr_private_wallet_fixture',isCourtesy:true,status:'CONFIRMED',paymentStatus:'COURTESY'}})).id;
 operatorId=(await prisma.user.create({data:{email:'wallet-op@example.invalid',fullName:'Synthetic Operator',role:'OPERATOR',passwordHash:'unused',assignedEventId:eventId}})).id;
 reg=await WalletService.registration(registrationId);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();WalletService.clearCache();});
afterAll(async()=>{await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
it('reuses the existing QR byte for byte, edition theme and stable identifiers',async()=>{
 const ticket=await QrService.getTicketQr(registrationId),apple=WalletService.appleData(reg),google=WalletService.googleData(reg);
 expect(apple.barcodes[0].message).toBe(ticket.qrPayload);expect(google.barcode.value).toBe(ticket.qrPayload);
 expect(apple.serialNumber).toBe(WalletService.appleData(reg).serialNumber);expect(google.id).toBe(WalletService.googleData(reg).id);expect(google.id).not.toBe(WalletService.googleData({...reg,qrCode:'replacement-credential'}).id);expect(apple.backgroundColor).toBe('rgb(18, 52, 86)');expect(google.ticketNumber).toBe('WALLET-QA-1');expect(google.barcode.alternateText).not.toContain(reg.qrCode);
 expect((await prisma.registration.findUniqueOrThrow({where:{id:registrationId}})).attended).toBe(false);
});
it('keeps both providers hidden without official configuration and rejects fake Apple credentials',async()=>{
 for(const e of envs)vi.stubEnv(e,'');
 expect(await WalletService.readiness(reg)).toEqual({apple:false,google:false});expect(await WalletService.emailButtons(reg)).toBe('');
 vi.stubEnv('APPLE_WALLET_ENABLED','true');vi.stubEnv('APPLE_WALLET_CERT_PEM_BASE64',Buffer.from('fake certificate').toString('base64'));
 expect(WalletService.appleCredentials()).toBeNull();await expect(WalletService.apple(reg)).rejects.toThrow(/no está habilitado/);
});
it('uses a limited opaque capability, rejects tampering, expiry, cancellation and QR rotation',async()=>{
 const access=WalletService.capability(reg);expect(access).not.toContain(registrationId);expect(access.split('.')).toHaveLength(1);expect((await WalletService.authorizeAccess(access)).id).toBe(registrationId);
 await expect(WalletService.authorizeAccess(access.slice(0,-4)+'aaaa')).rejects.toThrow();await expect(WalletService.authorizeAccess(WalletService.capability(reg,Date.now()-1000))).rejects.toThrow();
 await prisma.registration.update({where:{id:registrationId},data:{status:'CANCELLED'}});await expect(WalletService.authorizeAccess(access)).rejects.toThrow();
 await prisma.registration.update({where:{id:registrationId},data:{status:'CONFIRMED',qrCode:'rotated-wallet-token'}});await expect(WalletService.authorizeAccess(access)).rejects.toThrow();
 await prisma.registration.update({where:{id:registrationId},data:{qrCode:reg.qrCode}});
});
it('authorizes staff access by edition and never requires an administrative session in email links',async()=>{
 const other=await prisma.event.create({data:{slug:'wallet-other',name:'Other',year:2027,startDate:new Date(),endDate:new Date()}});
 const token=jwt.sign({id:operatorId},'isolated-courtesy-test');
 expect((await request(app).get(`/api/v1/wallet/${registrationId}/options`).set('Authorization','Bearer '+token)).status).toBe(200);
 const user=await prisma.user.findUniqueOrThrow({where:{id:operatorId}});await expect(WalletService.registration(registrationId,{...user,assignedEventId:other.id} as any)).rejects.toThrow();
 expect((await request(app).get(`/api/v1/wallet/${registrationId}/options`)).status).toBe(401);expect((await request(app).get(`/api/v1/wallet/${registrationId}/options`).set('Cookie','barcamp_token='+token)).status).toBe(200);
});
it('renders a private participant page without token text and never changes check-in or sends mail',async()=>{
 const provider=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('No email permitted');});
 const access=WalletService.capability(reg);const response=await request(app).post('/api/v1/wallet/ticket').send({access});
 expect(response.status).toBe(200);expect(response.headers['cache-control']).toContain('no-store');expect(response.headers['referrer-policy']).toBe('no-referrer');expect(response.text).toContain('Synthetic Wallet');expect(response.text).not.toContain(reg.qrCode);expect(response.text).not.toContain('Añadir a Apple Wallet');
 expect((await request(app).post('/api/v1/wallet/ticket').send({access:'bad'})).status).toBe(400);
 expect(provider).not.toHaveBeenCalled();expect(await prisma.emailLog.count()).toBe(0);expect((await prisma.registration.findUniqueOrThrow({where:{id:registrationId}})).attended).toBe(false);
});
it('does not issue passes for unpaid, cancelled or pending-courtesy registrations',()=>{
 for(const invalid of [{...reg,status:'CANCELLED'},{...reg,isCourtesy:false,amountPaid:0,balanceDue:1750,paymentStatus:'PENDING'},{...reg,courtesyRequests:[{status:'PENDING'}]}])expect(()=>WalletService.appleData(invalid)).toThrow();
 expect(WalletService.appleData({...reg,attended:true}).eventTicket.headerFields[0].value).toBe('Asistencia registrada');expect(WalletService.appleData({...reg,attended:true}).voided).toBe(true);expect(WalletService.googleData({...reg,attended:true}).state).toBe('INACTIVE');
});
it('signs a Google save JWT only for an approved class and upserts the same object id',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 vi.stubEnv('GOOGLE_WALLET_ENABLED','true');vi.stubEnv('GOOGLE_WALLET_ISSUER_APPROVED','true');vi.stubEnv('GOOGLE_WALLET_CLIENT_EMAIL','wallet@test.iam.gserviceaccount.com');vi.stubEnv('GOOGLE_WALLET_ISSUER_ID','123456');vi.stubEnv('GOOGLE_WALLET_KEY_PEM_BASE64',Buffer.from(privateKey.export({format:'pem',type:'pkcs8'})).toString('base64'));vi.stubEnv('GOOGLE_WALLET_ORIGINS','https://example.invalid');vi.stubEnv('WALLET_PUBLIC_BASE_URL','https://example.invalid/api/v1/wallet');
 const objects:any[]=[];let objectExists=false;
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{
  const url=String(input);
  if(url.includes('oauth2'))return new Response(JSON.stringify({access_token:'mock-token',expires_in:300}),{status:200});
  if(url.includes('eventTicketClass'))return new Response(JSON.stringify({id:WalletService.ids(reg).classId,reviewStatus:'APPROVED'}),{status:200});
  if(init?.method==='PATCH'&&!objectExists)return new Response('{}',{status:404});
  objects.push(JSON.parse(String(init?.body)));objectExists=true;return new Response('{}',{status:200});
 });
 for(let n=0;n<2;n++){const url=await WalletService.google(reg);expect(url.startsWith('https://pay.google.com/gp/v/save/')).toBe(true);const claims=jwt.verify(url.split('/save/')[1],publicKey,{algorithms:['RS256'],audience:'google'}) as any;expect(claims.typ).toBe('savetowallet');expect(claims.payload.eventTicketObjects[0].id).toBe(WalletService.ids(reg).objectId);}
 expect(objects).toHaveLength(2);expect(objects[0].id).toBe(objects[1].id);expect(objects[0].barcode.value).toBe(QrService.payload(reg.qrCode));
 const buttons=await WalletService.emailButtons(reg);expect(buttons).toContain('/ticket#access=');expect(buttons).not.toContain('Bearer');
});

it('blocks Google issuance when the issuer or edition class is not approved',async()=>{
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 vi.stubEnv('GOOGLE_WALLET_ENABLED','true');vi.stubEnv('GOOGLE_WALLET_CLIENT_EMAIL','wallet@test.iam.gserviceaccount.com');vi.stubEnv('GOOGLE_WALLET_ISSUER_ID','123456');vi.stubEnv('GOOGLE_WALLET_KEY_PEM_BASE64',Buffer.from(privateKey.export({format:'pem',type:'pkcs8'})).toString('base64'));vi.stubEnv('GOOGLE_WALLET_ORIGINS','https://example.invalid');
 expect(WalletService.googleCredentials()).toBeNull();vi.stubEnv('GOOGLE_WALLET_ISSUER_APPROVED','true');
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async(input)=>new Response(JSON.stringify(String(input).includes('oauth2')?{access_token:'mock-token',expires_in:300}:{id:WalletService.ids(reg).classId,reviewStatus:'DRAFT'}),{status:200}));
 expect(await WalletService.googleReady(reg)).toBe(false);await expect(WalletService.google(reg)).rejects.toThrow(/no está habilitado/);expect(fetcher.mock.calls.some(c=>String(c[0]).includes('eventTicketObject'))).toBe(false);
});

it('assembles Apple pass fields and PNG resources through the signer adapter with mocks only',async()=>{
 vi.spyOn(WalletService,'appleCredentials').mockReturnValue({signerCert:Buffer.from('mock'),wwdr:Buffer.from('mock'),signerKey:Buffer.from('mock'),signerKeyPassphrase:undefined});
 expect((await WalletService.apple(reg)).toString()).toBe('mock-signed-pkpass');
 const data=JSON.parse(archive.files['pass.json'].toString());expect(data.eventTicket.primaryFields[0].value).toBe('Synthetic Wallet');expect(data.barcodes[0].message).toBe(QrService.payload(reg.qrCode));
 for(const name of ['icon.png','icon@2x.png','logo.png','logo@2x.png'])expect(archive.files[name].subarray(1,4).toString()).toBe('PNG');
});
