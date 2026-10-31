import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const isolated = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'eventgrid-functional-'));
  fs.writeFileSync(path.join(folder, 'test.db'), '');
  return { folder, url: `file:${path.join(folder, 'test.db').replaceAll('\\', '/')}` };
});
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
vi.mock('../src/config/env.js', () => ({ ENV: {
  API_PREFIX: '/api/v1', NODE_ENV: 'test', JWT_SECRET: 'isolated-functional-test-secret', JWT_EXPIRES_IN: '1h',
  COOKIE_SECRET: 'isolated-cookie', CORS_ORIGIN: [], DATABASE_URL: isolated.url,
} }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasources: { db: { url: isolated.url } } }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';
import * as smtpState from '../src/modules/communications/smtp-state.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { CreateScheduleItemSchema } from '../src/modules/schedule/schedule.dto.js';
import { formatTimeDraft } from '../../frontend/src/utils/timeDraft';

let event: any, other: any, registration: any, sponsorId: string;
const tokens: Record<string, string> = {};
const headers = (role: string, id = event.id) => ({ Authorization: `Bearer ${tokens[role]}`, 'X-Event-Id': id });

beforeAll(async () => {
  execFileSync(process.execPath, [createRequire(import.meta.url).resolve('prisma/build/index.js'), 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], {
    env: { ...process.env, DATABASE_URL: isolated.url }, stdio: 'pipe',
  });
  await prisma.applicationSettings.create({data:{id:'global',publicOrigin:'https://eventgrid.example.invalid',originStatus:'VERIFIED'}});
  const data = (slug: string) => ({ slug, name: slug, year: 2026, startDate: new Date(), endDate: new Date(), isDefault: slug === 'test-primary', settings: { create: { tshirtSizesEnabled: true, tshirtSizes: JSON.stringify(['M', 'L']) } } });
  event = await prisma.event.create({ data: data('test-primary') });
  other = await prisma.event.create({ data: data('test-other') });
  const accounts = { ADMIN: ['admin', 'Admin'], OPERATOR: ['operador', 'Op'], VIEWER: ['consulta', 'View'] };
  for (const [role, [name, suffix]] of Object.entries(accounts)) {
    const user = await prisma.user.create({ data: { email: `${name}@barcamp.org.do`, fullName: `Test ${role}`, role, passwordHash: await bcrypt.hash(`BarCamp2026!${suffix}`, 4), assignedEventId: role === 'ADMIN' ? null : event.id } });
    tokens[role] = jwt.sign({ id: user.id }, 'isolated-functional-test-secret');
  }
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: 'General', price: 123 } });
  await prisma.event.update({where:{id:event.id},data:{defaultTicketTypeId:ticket.id}});
  const participant = await prisma.participant.create({ data: { firstName: 'Fictitious', lastName: 'Participant', fullName: 'Fictitious Participant', email: 'test@example.invalid', documentId: 'isolated-test' } });
  registration = await prisma.registration.create({ data: {
    eventId: event.id, participantId: participant.id, registrationNumber: 'TEST-001', ticketTypeId: ticket.id,
    status: 'CONFIRMED', paymentStatus: 'PAID', tshirtSize: 'M', qrCode: 'isolated-qr-token',
  } });
  await prisma.tshirtInventory.create({ data: { eventId: event.id, size: 'L', initialQuantity: 5 } });
}, 30000);
afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

describe('edition boundaries and demo access', () => {
  it('keeps demo login disabled unless explicitly enabled', async () => {
    vi.stubEnv('DEMO_QUICK_ACCESS', 'false');
    expect((await request(app).post('/api/v1/auth/demo-login').send({ role: 'ADMIN' })).status).toBe(404);
    vi.stubEnv('DEMO_QUICK_ACCESS', 'true');
    for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
      const res = await request(app).post('/api/v1/auth/demo-login').send({ role });
      expect(res.status).toBe(200); expect(res.body.data.user.role).toBe(role);
    }
  });
  it('filters edition discovery, tolerates stale storage, and blocks cross-edition paths/headers/body', async () => {
    const list = await request(app).get('/api/v1/events').set(headers('OPERATOR', other.id));
    expect(list.status).toBe(200); expect(list.body.data.map((e: any) => e.id)).toEqual([event.id]);
    expect((await request(app).get(`/api/v1/events/${other.id}`).set(headers('OPERATOR'))).status).toBe(403);
    expect((await request(app).get(`/api/v1/events/${other.id}/participants`).set(headers('OPERATOR'))).status).toBe(403);
    expect((await request(app).get('/api/v1/participants').set(headers('VIEWER', other.id))).status).toBe(403);
    expect((await request(app).post('/api/v1/qr/scan').set(headers('OPERATOR')).send({ eventId: other.id, qrToken: 'fake' })).status).toBe(403);
    expect((await request(app).get('/api/v1/events').set(headers('ADMIN'))).body.data).toHaveLength(2);
    expect((await request(app).get(`/api/v1/qr/${registration.id}`).set(headers('OPERATOR', other.id))).status).toBe(403);
  });
  it('blocks edition administration and viewer writes while retaining admin access', async () => {
    for (const role of ['OPERATOR', 'VIEWER']) {
      expect((await request(app).put(`/api/v1/events/${event.id}/settings`).set(headers(role)).send({ subtitle: 'Forbidden' })).status).toBe(403);
      expect((await request(app).post('/api/v1/sponsors').set(headers(role)).send({ name: 'Forbidden' })).status).toBe(403);
      expect((await request(app).get('/api/v1/activity').set(headers(role))).status).toBe(403);
    }
    expect((await request(app).post('/api/v1/attendance/check-in').set(headers('VIEWER')).send({ confirmed: true, registrationId: registration.id })).status).toBe(403);
    expect((await request(app).put(`/api/v1/events/${event.id}/settings`).set(headers('ADMIN')).send({ primaryColor: '#123456', secondaryColor: '#654321', subtitle: 'Test configuration' })).status).toBe(200);
  });
  it('applies administrator assignment changes on the next request without trusting the existing token', async () => {
    const operator = await prisma.user.findUniqueOrThrow({ where: { email: 'operador@barcamp.org.do' } });
    expect((await request(app).put(`/api/v1/users/${operator.id}`).set(headers('ADMIN')).send({ assignedEventId: other.id })).status).toBe(200);
    expect((await request(app).get('/api/v1/events').set(headers('OPERATOR'))).body.data.map((e: any) => e.id)).toEqual([other.id]);
    expect((await request(app).get('/api/v1/participants').set(headers('OPERATOR'))).status).toBe(403);
    await request(app).put(`/api/v1/users/${operator.id}`).set(headers('ADMIN')).send({ assignedEventId: event.id });
  });
});

describe('sponsor categories preserve financial accounting', () => {
  it('starts unpriced, configures values per edition, creates and edits all categories', async () => {
    let res = await request(app).get('/api/v1/sponsors/categories').set(headers('ADMIN'));
    expect(res.body.data).toEqual(['Geek Gold', 'Geek Silver', 'Geek'].map(name => ({ name, value: null })));
    expect((await request(app).put('/api/v1/sponsors/categories').set(headers('ADMIN')).send({ values: { 'Geek Gold': 500, 'Geek Silver': null, Geek: null } })).status).toBe(200);
    res = await request(app).get('/api/v1/sponsors/categories').set(headers('ADMIN', other.id));
    expect(res.body.data[0].value).toBeNull();
    for (const [index, category] of ['Geek Gold', 'Geek Silver', 'Geek'].entries()) {
      res = await request(app).post('/api/v1/sponsors').set(headers('ADMIN')).send({ name: `Fictitious ${index}`, category, committedAmount: 100 });
      expect(res.status).toBe(201); sponsorId = res.body.data.id;
      expect((await request(app).put(`/api/v1/sponsors/${sponsorId}`).set(headers('ADMIN')).send({ category, notes: 'Simulated edit' })).body.data.category).toBe(category);
    }
    expect((await request(app).get('/api/v1/sponsors?category=Geek%20Gold').set(headers('ADMIN'))).body.data.items).toHaveLength(1);
    expect((await request(app).get(`/api/v1/sponsors/${sponsorId}`).set(headers('ADMIN', other.id))).status).toBe(404);
  });
  it('retains partial payments, history, in-kind contributions and unchanged KPI formulas', async () => {
    expect((await request(app).post(`/api/v1/sponsors/${sponsorId}/payments`).set(headers('ADMIN')).send({ amount: 40, paymentMethod: 'CASH' })).status).toBe(201);
    const detail = (await request(app).get(`/api/v1/sponsors/${sponsorId}`).set(headers('ADMIN'))).body.data;
    expect(detail.receivedAmount).toBe(40); expect(detail.pendingBalance).toBe(60); expect(detail.payments).toHaveLength(1);
    expect((await request(app).post('/api/v1/sponsors').set(headers('ADMIN')).send({ name: 'Fictitious in kind', type: 'COLLABORATOR', category: 'Legacy Partner', contributionType: 'IN_KIND', inKindDescription: 'Test materials' })).status).toBe(201);
    const summary = (await request(app).get('/api/v1/sponsors/summary').set(headers('ADMIN'))).body.data;
    expect(summary).toMatchObject({ totalSponsors: 3, totalCollaborators: 1, totalCommitted: 300, totalReceived: 40, totalPending: 260, inKindCount: 1 });
    expect(summary.byCategory.find((c: any) => c.category === 'Geek')).toMatchObject({ committed: 100, received: 40, pending: 60 });
  });
});

describe('explicit QR attendance with size and atomic duplicate prevention', () => {
  it('rejects invalid codes, validates without checking in and retains existing size', async () => {
    expect((await request(app).post('/api/v1/qr/scan').set(headers('OPERATOR')).send({ qrToken: 'invalid' })).body.data.canCheckIn).toBe(false);
    const scan = await request(app).post('/api/v1/qr/scan').set(headers('OPERATOR')).send({ qrToken: 'isolated-qr-token' });
    expect(scan.body.data).toMatchObject({ canCheckIn: true, registration: { tshirtSize: 'M', attended: false } });
    expect((await prisma.registration.findUnique({ where: { id: registration.id } }))?.attended).toBe(false);
  });
  it('records one attendance, chosen size, inventory, responsible user and timestamp for concurrent confirmations', async () => {
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/v1/attendance/check-in').set(headers('OPERATOR')).send({ confirmed: true, registrationId: registration.id, tshirtSize: 'L', tshirtDelivered: true })));
    expect(responses.filter(res => res.status === 200)).toHaveLength(1);
    const saved = await prisma.registration.findUnique({ where: { id: registration.id } });
    expect(saved).toMatchObject({ attended: true, tshirtSize: 'L', tshirtDelivered: true });
    expect(saved?.attendedAt).toBeTruthy(); expect(saved?.attendedByUserId).toBeTruthy();
    expect(await prisma.attendanceLog.count({ where: { registrationId: registration.id, action: 'CHECK_IN' } })).toBe(1);
    expect((await prisma.tshirtInventory.findFirst({ where: { eventId: event.id, size: 'L' } }))?.deliveredQuantity).toBe(1);
    expect((await request(app).post('/api/v1/qr/scan').set(headers('OPERATOR')).send({ qrToken: 'isolated-qr-token' })).body.data).toMatchObject({ status: 'ALREADY_CHECKED_IN', canCheckIn: false });
  });
});


describe('definitive attendance and later delivery', () => {
  it('rejects unconfirmed requests and all reversals, preserving attendance history', async () => {
    expect((await request(app).post('/api/v1/attendance/check-in').set(headers('OPERATOR')).send({ registrationId: registration.id })).status).toBe(400);
    expect((await request(app).post('/api/v1/attendance/revert').set(headers('ADMIN')).send({ registrationId: registration.id, reason: 'Must remain irreversible' })).status).toBe(400);
    expect((await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).attended).toBe(true);
    expect(await prisma.attendanceLog.count({ where: { registrationId: registration.id } })).toBe(1);
  });
  it('keeps an undelivered size without decrementing inventory and delivers it just once later', async () => {
    const person = await prisma.participant.create({ data: { firstName: 'Later', lastName: 'Delivery', fullName: 'Later Delivery', email: 'later@example.invalid' } });
    const reg = await prisma.registration.create({ data: { eventId: event.id, participantId: person.id, registrationNumber: 'TEST-002' } });
    expect((await request(app).post('/api/v1/attendance/check-in').set(headers('OPERATOR')).send({ confirmed: true, registrationId: reg.id, tshirtSize: 'L', tshirtDelivered: false })).status).toBe(200);
    expect((await prisma.tshirtInventory.findFirstOrThrow({ where: { eventId: event.id, size: 'L' } })).deliveredQuantity).toBe(1);
    const operator = await prisma.user.findUniqueOrThrow({ where: { email: 'operador@barcamp.org.do' } });
    const deliveries = await Promise.allSettled([1, 2].map(() => ParticipantsService.deliverTshirt(event.id, reg.id, operator.id)));
    expect(deliveries.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await prisma.tshirtInventory.findFirstOrThrow({ where: { eventId: event.id, size: 'L' } })).deliveredQuantity).toBe(2);
    const saved = await prisma.registration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(saved.attended).toBe(true); expect(saved.tshirtDelivered).toBe(true); expect(saved.tshirtDeliveredAt).toBeTruthy();
  });
});

describe('staff and explicit invitations', () => {
  it('guest chooses credentials; administrative invitation cannot impose a username and welcome requires explicit activation',async()=>{
    const raw=vi.spyOn(CommunicationsService,'getRawConfig').mockResolvedValue({isEnabled:true,host:'smtp.example.invalid',port:587,fromName:'Synthetic',fromEmail:'sender@example.invalid'} as any);
    const send=vi.fn(async(mail:any)=>({accepted:[mail.to],rejected:[],messageId:'<mock-guest-welcome>'}));
    const factory=vi.spyOn(CommunicationsService,'createTransporter').mockReturnValue({sendMail:send,close:vi.fn()} as any);
    // Keep the initial invitation blocked, then authorize only the mocked activation welcome.
    const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:true,realEmailAllowed:false,simulationAllowed:true});
    try{
      const created=await request(app).post('/api/v1/users').set(headers('ADMIN')).send({fullName:'Synthetic Guest',email:'guest-choice@example.invalid',username:'admin_chosen_name',role:'OPERATOR',assignedEventId:event.id,inviteNow:true,invitationRequestKey:crypto.randomUUID()});
      expect(created.status).toBe(201);expect(created.body.data.username).toBeNull();expect(created.body.data.accountStatus).toBe('PENDING');expect(send).not.toHaveBeenCalled();
      const token=crypto.randomBytes(32).toString('base64url');await prisma.userInvitation.create({data:{userId:created.body.data.id,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000),status:'ACCEPTED_BY_PROVIDER'}});
      const info=await request(app).post('/api/v1/auth/invitation-info').send({token});expect(info.body.data).toMatchObject({fullName:'Synthetic Guest',email:'guest-choice@example.invalid',role:'OPERATOR',eventName:event.name});expect(info.body.data).not.toHaveProperty('assignedEventId');
      expect((await request(app).post('/api/v1/auth/invitation-username').send({token,username:'admin'})).status).toBe(400);
      expect((await request(app).post('/api/v1/auth/invitation-username').send({token,username:'guest_personal42'})).body.data.available).toBe(true);
      expect((await request(app).post('/api/v1/auth/accept-invitation').send({token,password:'FictitiousPassword123!'})).status).toBe(400);
      policy.mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
      const payload={token,password:'FictitiousPassword123!',username:'guest_personal42',welcomeConfirmed:true};const activated=await request(app).post('/api/v1/auth/accept-invitation').send(payload);expect(activated.status).toBe(200);expect(activated.body.data.welcomeStatus).toBe('ACCEPTED_BY_PROVIDER');expect(send).toHaveBeenCalledOnce();
      expect((await request(app).post('/api/v1/auth/accept-invitation').send(payload)).status).toBe(400);expect(send).toHaveBeenCalledOnce();
      expect((await request(app).post('/api/v1/auth/login').send({email:'GUEST_PERSONAL42',password:payload.password})).status).toBe(200);
    }finally{policy.mockRestore();factory.mockRestore();raw.mockRestore();}
  });
  it('records personnel separately without creating a user or institutional sponsor', async () => {
    const before = await prisma.user.count(); const sponsors = await prisma.sponsor.count();
    const result = await request(app).post('/api/v1/staff').set(headers('ADMIN')).send({ firstName: 'Fake', lastName: 'Staff', email: 'staff@example.invalid', area: 'Reception' });
    expect(result.status).toBe(200); expect(await prisma.user.count()).toBe(before); expect(await prisma.sponsor.count()).toBe(sponsors);
    expect((await request(app).get('/api/v1/staff').set(headers('OPERATOR'))).body.data).toHaveLength(1);
    expect((await request(app).post('/api/v1/staff').set(headers('VIEWER')).send({})).status).toBe(403);
  });
  it('prepares pending accounts without sending or exposing passwords; disabled provider retains invitations', async () => {
    const send = vi.fn(); const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any);
    try {
      const result = await request(app).post('/api/v1/users').set(headers('ADMIN')).send({ fullName: 'Pending Test', email: 'pending@example.invalid', role: 'OPERATOR', assignedEventId: event.id });
      expect(result.status).toBe(201); expect(result.body.temporaryPassword).toBeUndefined(); expect(result.body.data.isActive).toBe(false);
      const userId = result.body.data.id;
      expect((await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ userIds: [userId], requestKey: crypto.randomUUID(), confirmed: true })).body.data.results[0].status).toBe('PENDING');
      expect(await prisma.userInvitation.count({ where: { userId, status: 'PENDING' } })).toBe(1); expect(send).not.toHaveBeenCalled();
    } finally { factory.mockRestore(); }
  });
  it('authorizes one batch with individual hashed tokens, single use, expiry and replacement', async () => {
    const users = await Promise.all([1, 2].map(i => prisma.user.create({ data: { fullName: 'Invitation ' + i, email: `invite${i}@example.invalid`, role: 'OPERATOR', assignedEventId: event.id, accountStatus: 'PENDING', isActive: false, passwordHash: 'unusable' } })));
    const send = vi.fn(async (mail: any) => ({ accepted: [mail.to], messageId: '<fake-' + mail.to + '>' }));
    const raw = vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true,host:'smtp.example.invalid',port:587, fromName: 'Test', fromEmail: 'sender@example.invalid' } as any);
    const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any);
    const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
    try {
      const payload = { userIds: users.map(user => user.id), requestKey: crypto.randomUUID(), confirmed: true };
      expect((await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, confirmed: false })).status).toBe(400);
      const result = await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload);
      expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(2);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload); expect(send).toHaveBeenCalledTimes(2);
      const tokens = users.map(user => { const mail = send.mock.calls.find(([mail]) => mail.to === user.email)![0]; return new URL(mail.text.match(/https:\/\/\S+/)[0]).hash.slice(7)!; });
      expect(tokens[0]).not.toBe(tokens[1]);
      const stored = await prisma.userInvitation.findFirstOrThrow({ where: { userId: users[0].id, revokedAt: null } });
      expect(stored.tokenHash).not.toContain(tokens[0]); expect(stored.expiresAt!.getTime() - stored.createdAt.getTime()).toBeGreaterThan(86300000);
      const activation = { token: tokens[0], password: 'FictitiousPassword123!',username:'invited_user01' };
      const described=await request(app).post('/api/v1/auth/invitation-info').send({token:tokens[0]});expect(described.status).toBe(200);expect(described.body.data).not.toHaveProperty('passwordHash');
      expect((await request(app).post('/api/v1/auth/accept-invitation').send(activation)).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/login').send({email:'INVITED_USER01',password:activation.password})).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/accept-invitation').send(activation)).status).toBe(400);
      await prisma.userInvitation.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
      expect((await request(app).post('/api/v1/auth/accept-invitation').send({ ...activation, token: tokens[1] })).status).toBe(400);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, requestKey: crypto.randomUUID() });
      expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: stored.id } })).usedAt).toBeTruthy();
    } finally { factory.mockRestore(); raw.mockRestore(); policy.mockRestore(); vi.unstubAllEnvs(); }
  });
});

describe('schedule time drafts', () => {
  it('supports typing and deletion without restoring defaults; validates ranges', () => {
    expect(formatTimeDraft('0')).toBe('0'); expect(formatTimeDraft('09', '0')).toBe('09:');
    expect(formatTimeDraft('093', '09:')).toBe('09:3'); expect(formatTimeDraft('0930', '09:3')).toBe('09:30');
    expect(formatTimeDraft('09', '09:')).toBe('09'); expect(formatTimeDraft('')).toBe('');
    expect(CreateScheduleItemSchema.safeParse({ title: 'Test', startTime: '24:00', endTime: '25:00' }).success).toBe(false);
  });
});


describe('communication preview and explicit endpoint validation', () => {
  it('renders preview and rejects malformed or disabled sends without contacting a provider', async () => {
    const sendMail = vi.fn(); const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail } as any);
    try {
      const preview = await request(app).post('/api/v1/communications/preview').set(headers('ADMIN')).send({ templateCode: 'GENERAL_ANNOUNCEMENT', sampleType: 'MOCK', eventId: event.id });
      expect(preview.status).toBe(200);
      const malformed = await request(app).post('/api/v1/communications/send').set(headers('ADMIN')).send({});
      expect(malformed.status).toBe(400); expect(malformed.body.message).toMatch(/participante|plantilla/);
      const disabled = await request(app).post('/api/v1/communications/send').set(headers('ADMIN')).send({ registrationId: registration.id, templateCode: 'GENERAL_ANNOUNCEMENT', eventId: event.id });
      expect(disabled.status).toBe(400); expect(disabled.body.message).toMatch(/deshabilitado|configurado/);
      expect(sendMail).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
    } finally { factory.mockRestore(); }
  });
  it('verifies schedule order and conflicts without sending announcements', async () => {
    expect((await request(app).post(`/api/v1/events/${event.id}/schedule`).set(headers('ADMIN')).send({ title: 'Invalid time', startTime: '12:00', endTime: '11:00', room: 'Test room' })).status).toBe(400);
    const valid = await request(app).post(`/api/v1/events/${event.id}/schedule`).set(headers('ADMIN')).send({ title: 'Mock talk', startTime: '09:00', endTime: '10:00', room: 'Test room' });
    expect(valid.status).toBe(201);
    expect((await request(app).get(`/api/v1/events/${event.id}/schedule`).set(headers('ADMIN'))).body.data.items.some((item: any) => item.id === valid.body.data.id)).toBe(true);
    const conflict = await request(app).post(`/api/v1/events/${event.id}/schedule`).set(headers('ADMIN')).send({ title: 'Overlap', startTime: '09:30', endTime: '10:30', room: 'Test room' });
    expect(conflict.status).toBe(400);
  });
});


describe('manual provider acceptance and duplicate protection', () => {
  it('allows one explicit send, blocks concurrent duplicates, and waits for a verified webhook to claim delivery', async () => {
    const send = vi.fn(async () => { await new Promise(resolve => setTimeout(resolve, 80)); return { accepted: ['test@example.invalid'], rejected: [], messageId: '<mock-manual-send>' }; });
    const raw = vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true, host: 'smtp.provider.invalid', fromName: 'Test', fromEmail: 'sender@example.invalid' } as any);
    const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any);
    try {
      const payload = { registrationId: registration.id, eventId: event.id, templateCode: 'GENERAL_ANNOUNCEMENT' };
      const results = await Promise.all([1, 2].map(() => request(app).post('/api/v1/communications/send').set(headers('ADMIN')).send(payload)));
      expect(results.filter(result => result.status === 200)).toHaveLength(1); expect(send).toHaveBeenCalledOnce();
      let log = await prisma.emailLog.findUniqueOrThrow({ where: { messageId: '<mock-manual-send>' } });
      expect(log.status).toBe('ACCEPTED_BY_SMTP');
      expect((await request(app).post('/api/v1/communications/webhooks/brevo').send({ event: 'delivered', messageId: log.messageId, email: 'test@example.invalid' })).status).toBe(400);
      vi.stubEnv('BREVO_WEBHOOK_SECRET', 'mock-webhook-secret');
      await request(app).post('/api/v1/communications/webhooks/brevo').set('x-brevo-webhook-secret', 'mock-webhook-secret').send({ event: 'delivered', messageId: '<different-message>', email: 'test@example.invalid' });
      expect((await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe('ACCEPTED_BY_SMTP');
      await request(app).post('/api/v1/communications/webhooks/brevo').set('x-brevo-webhook-secret', 'mock-webhook-secret').send({ event: 'delivered', messageId: log.messageId, email: 'test@example.invalid' });
      expect((await prisma.emailLog.findUniqueOrThrow({ where: { id: log.id } })).status).toBe('DELIVERED');
    } finally { raw.mockRestore(); factory.mockRestore(); vi.unstubAllEnvs(); }
  });
});


describe('simplified personnel and selected access invitations', () => {
  it('retains hidden staff history, detects normalized duplicates per event, and does not create accounts', async () => {
    const payload = { firstName: 'History', lastName: 'Preserved', email: 'history-staff@example.invalid', phone: '8294616106', function: 'Historic function', area: 'Historic area', notes: 'Keep', status: 'INACTIVE' };
    const created = await request(app).post('/api/v1/staff').set(headers('ADMIN')).send(payload);
    expect(created.status).toBe(200);
    const updated = await request(app).put(`/api/v1/staff/${created.body.data.id}`).set(headers('ADMIN')).send({ firstName: 'Updated', lastName: 'Preserved', email: payload.email, phone: '' });
    expect(updated.body.data).toMatchObject({ function: payload.function, area: payload.area, notes: 'Keep', status: 'INACTIVE' });
    expect((await request(app).post('/api/v1/staff').set(headers('ADMIN')).send({ ...payload, email: ' HISTORY-STAFF@EXAMPLE.INVALID ' })).status).toBe(400);
    expect((await request(app).post('/api/v1/staff').set(headers('ADMIN', other.id)).send(payload)).status).toBe(200);
    expect(await prisma.user.count({ where: { email: payload.email } })).toBe(0);
  });
  it('creates from three fields with internal edition binding, no usable password, no automatic activation or send', async () => {
    const send = vi.fn(); const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any);
    try {
      const created = await request(app).post('/api/v1/users').set(headers('ADMIN', other.id)).send({ fullName: 'Three Fields', email: 'three-fields@example.invalid', role: 'VIEWER', password: 'MustNeverBecomePassword123!', isActive: true });
      expect(created.status).toBe(201); expect(created.body).not.toHaveProperty('temporaryPassword'); expect(created.body.data).toMatchObject({ assignedEventId: other.id, accountStatus: 'PENDING', isActive: false });
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: created.body.data.id } }); expect(stored.passwordHash).toMatch(/^pending-activation:/);
      expect((await request(app).patch(`/api/v1/users/${stored.id}/toggle-status`).set(headers('ADMIN'))).status).toBe(400);
      expect((await request(app).put(`/api/v1/users/${stored.id}`).set(headers('ADMIN')).send({ isActive: true })).status).toBe(400);
      expect((await request(app).post('/api/v1/users').set(headers('ADMIN')).send({ fullName: 'Duplicate', email: stored.email.toUpperCase(), role: 'VIEWER' })).status).toBe(400);
      expect(send).not.toHaveBeenCalled(); expect(factory).not.toHaveBeenCalled();
    } finally { factory.mockRestore(); }
  });
  it('keeps scoped administrators inside their edition and preserves legacy global administration', async () => {
    const created = await request(app).post('/api/v1/users').set(headers('ADMIN')).send({ fullName: 'Scoped Admin', email: 'scoped-admin@example.invalid', role: 'ADMIN' });
    expect(created.body.data.assignedEventId).toBe(event.id);
    await prisma.user.update({ where: { id: created.body.data.id }, data: { accountStatus: 'ACTIVE', isActive: true } });
    const token = jwt.sign({ id: created.body.data.id }, 'isolated-functional-test-secret'); const h = { Authorization: `Bearer ${token}`, 'X-Event-Id': event.id };
    expect((await request(app).get('/api/v1/events').set(h)).body.data.map((item: any) => item.id)).toEqual([event.id]);
    expect((await request(app).get('/api/v1/participants').set({ ...h, 'X-Event-Id': other.id })).status).toBe(403);
    expect((await request(app).post('/api/v1/events').set(h).send({})).status).toBe(403);
    const foreign = await prisma.user.findUniqueOrThrow({ where: { email: 'three-fields@example.invalid' } });
    for (const endpoint of [`/api/v1/users/${foreign.id}`, `/api/v1/users/${foreign.id}/invitations`]) expect((await request(app).get(endpoint).set(h)).status).toBe(403);
    expect((await request(app).post('/api/v1/users/invitations/send').set(h).send({ userIds: [foreign.id], requestKey: crypto.randomUUID(), confirmed: true })).status).toBe(403);
    expect((await request(app).put(`/api/v1/users/${created.body.data.id}`).set(h).send({ assignedEventId: null })).status).toBe(403);
    expect((await request(app).put('/api/v1/communications/config').set(h).send({ eventId: null })).status).toBe(403);
    expect((await request(app).get('/api/v1/communications/history/registration/foreign-registration').set(h)).status).toBe(403);
    const list = await request(app).get('/api/v1/users').set(h); expect(list.body.data.every((item: any) => item.assignedEventId === event.id)).toBe(true);
    expect((await request(app).get('/api/v1/events').set(headers('ADMIN'))).body.data).toHaveLength(2);
  });
  it('denies every invitation operation to operators and viewers', async () => {
    for (const role of ['OPERATOR', 'VIEWER']) for (const endpoint of ['selection', 'send', 'preview']) expect((await request(app).post(`/api/v1/users/invitations/${endpoint}`).set(headers(role)).send({})).status).toBe(403);
  });
  it('invites only selected unique accounts, isolates failures, skips active users and records authenticated delivery', async () => {
    const pending = await Promise.all([1, 2, 3].map(i => prisma.user.create({ data: { fullName: 'Selected ' + i, email: `selected-${i}@example.invalid`, role: 'VIEWER', assignedEventId: event.id, accountStatus: 'PENDING', isActive: false, passwordHash: 'unusable' } })));
    const active = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@barcamp.org.do' } });
    const send = vi.fn(async (mail: any) => { if (mail.to === pending[1].email) throw Object.assign(new Error('mock authentication failure'), { code: 'EAUTH' }); return { accepted: [mail.to], messageId: '<selection-' + crypto.randomUUID() + '>' }; });
    const raw = vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true,host:'smtp.example.invalid',port:587, fromName: 'Mock', fromEmail: 'sender@example.invalid' } as any);
    const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send, close: vi.fn() } as any); const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
    try {
      const payload = { userIds: [pending[0].id, pending[1].id, pending[0].id, active.id], requestKey: crypto.randomUUID(), confirmed: true };
      const result = await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload);
      expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(2); expect(send.mock.calls.every(([mail]) => mail.to !== pending[2].email && mail.to !== active.email)).toBe(true);
      expect(result.body.data.results.find((item: any) => item.userId === pending[1].id).status).toBe('FAILED');
      expect(result.body.data.results.find((item: any) => item.userId === active.id).status).toBe('ACTIVATED');
      expect((await prisma.user.findUniqueOrThrow({ where: { id: active.id } })).passwordHash).toBe(active.passwordHash);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload); expect(send).toHaveBeenCalledTimes(2);
      expect((await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, userIds: [pending[2].id] })).status).toBe(400);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, requestKey: crypto.randomUUID(), userIds: [pending[0].id] }); expect(send).toHaveBeenCalledTimes(2);
      const old = await prisma.userInvitation.findFirstOrThrow({ where: { userId: pending[0].id, revokedAt: null } });
      vi.stubEnv('BREVO_WEBHOOK_SECRET', 'mock-invitation-webhook');
      await request(app).post('/api/v1/communications/webhooks/brevo').set('x-brevo-webhook-secret', 'mock-invitation-webhook').send({ event: 'delivered', messageId: old.messageId });
      expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('DELIVERED');
      const history = await request(app).get(`/api/v1/users/${pending[0].id}/invitations`).set(headers('ADMIN')); expect(history.status).toBe(200); expect(history.body.data[0]).not.toHaveProperty('tokenHash');
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, requestKey: crypto.randomUUID(), userIds: [pending[0].id], reinvite: true });
      expect(send).toHaveBeenCalledTimes(3); expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: old.id } })).revokedAt).toBeTruthy();
      expect((await prisma.auditLog.findMany({ where: { action: 'USER_UPDATE' } })).some(log => JSON.parse(String(log.changes)).operation === 'INVITATIONS_DISPATCH')).toBe(true);
    } finally { raw.mockRestore(); factory.mockRestore(); policy.mockRestore(); vi.unstubAllEnvs(); }
  });
});


describe('invitation concurrency and explicit reinvitation', () => {
  it('does not classify a preparation failure as an uncertain SMTP attempt',async()=>{
    const pending=await prisma.user.create({data:{fullName:'Synthetic Preparation',email:'prepare-diagnostic@example.invalid',role:'VIEWER',assignedEventId:event.id,accountStatus:'PENDING',isActive:false,passwordHash:'unusable'}});
    const raw=vi.spyOn(CommunicationsService,'getRawConfig').mockResolvedValue({isEnabled:true,host:'smtp.example.invalid',port:587,fromName:'Synthetic',fromEmail:'sender@example.invalid'} as any);
    const factory=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('Private preparation detail');});
    const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
    try{const r=await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({userIds:[pending.id],requestKey:crypto.randomUUID(),confirmed:true});expect(r.body.data.results[0]).toMatchObject({status:'FAILED',attempted:false});expect(JSON.stringify(r.body)).not.toContain('Private preparation detail');expect((await prisma.user.findUniqueOrThrow({where:{id:pending.id}})).accountStatus).toBe('PENDING');}finally{policy.mockRestore();factory.mockRestore();raw.mockRestore();}
  });
  it('preserves unknown outcomes, persists per-recipient results and requires explicit duplicate-risk authorization even after expiry',async()=>{
    const pending=await Promise.all([1,2].map(i=>prisma.user.create({data:{email:`diagnostic-invite-${i}@example.invalid`,fullName:'Synthetic Invitation '+i,role:'OPERATOR',assignedEventId:event.id,isActive:false,accountStatus:'PENDING',passwordHash:'unusable'}})));
    let uncertain=true;
    const send=vi.fn(async(mail:any)=>{if(mail.to===pending[1].email&&uncertain)throw Object.assign(Error('private SMTP transcript must not be persisted'),{code:'ETIMEDOUT',command:'DATA',password:'synthetic-private-value'});return {accepted:[{address:' '+mail.to.toUpperCase()+' '}],messageId:'<mock-diagnostics>'};});
    const raw=vi.spyOn(CommunicationsService,'getRawConfig').mockResolvedValue({isEnabled:true,host:'smtp.example.invalid',port:587,fromName:'Synthetic',fromEmail:'sender@example.invalid'} as any);
    const factory=vi.spyOn(CommunicationsService,'createTransporter').mockReturnValue({sendMail:send,close:vi.fn()} as any);
    const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
    try{
      const body={userIds:pending.map(u=>u.id),requestKey:crypto.randomUUID(),confirmed:true};
      const first=await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(body);expect(first.status).toBe(200);expect(first.body.data.results.find((r:any)=>r.userId===pending[0].id).status).toBe('ACCEPTED_BY_PROVIDER');expect(first.body.data.results.find((r:any)=>r.userId===pending[1].id)).toMatchObject({status:'UNKNOWN_DELIVERY_STATUS',attempted:true,errorCode:'ETIMEDOUT',stage:'DATA'});expect(JSON.stringify(first.body)).not.toContain('synthetic-private');
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(body);expect(send).toHaveBeenCalledTimes(2);
      const unknown=await prisma.userInvitation.findFirstOrThrow({where:{userId:pending[1].id,revokedAt:null}});expect(unknown.sentAt).toBeTruthy();await prisma.userInvitation.update({where:{id:unknown.id},data:{expiresAt:new Date(0)}});
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({...body,userIds:[pending[1].id],requestKey:crypto.randomUUID(),reinvite:true});expect(send).toHaveBeenCalledTimes(2);
      await prisma.applicationSettings.update({where:{id:'global'},data:{publicOrigin:null,originStatus:'UNCONFIGURED'}});
      const selection=await request(app).post('/api/v1/users/invitations/selection').set(headers('ADMIN')).send({userIds:[pending[1].id]});expect(selection.body.data[0].invitationDiagnostic).toMatchObject({deliveryState:'UNKNOWN_DELIVERY_STATUS',tokenState:'EXPIRED',canSend:false,requiresDuplicateRiskConfirmation:true});expect(selection.body.data[0].invitationDiagnostic.blocks[0].code).toBe('PUBLIC_DOMAIN_MISSING');expect(selection.body.data[0].invitation).not.toHaveProperty('messageId');
      const blocked=await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({...body,userIds:[pending[1].id],requestKey:crypto.randomUUID()});expect(blocked.body.data.results[0]).toMatchObject({status:'PENDING',code:'PUBLIC_DOMAIN_MISSING',attempted:false});expect(send).toHaveBeenCalledTimes(2);expect((await prisma.userInvitation.findUniqueOrThrow({where:{id:unknown.id}})).status).toBe('UNKNOWN_DELIVERY_STATUS');
      const history=await request(app).get('/api/v1/users/'+pending[1].id+'/invitations').set(headers('ADMIN'));expect(history.body.diagnostic.blocks[0].code).toBe('PUBLIC_DOMAIN_MISSING');expect(JSON.stringify(history.body)).not.toContain('tokenHash');
      await prisma.applicationSettings.update({where:{id:'global'},data:{publicOrigin:'https://eventgrid.example.invalid',originStatus:'VERIFIED'}});uncertain=false;
      const retried=await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({...body,userIds:[pending[1].id],requestKey:crypto.randomUUID(),reinvite:true,confirmedDuplicateRisk:true});expect(retried.body.data.results[0].status).toBe('ACCEPTED_BY_PROVIDER');expect(send).toHaveBeenCalledTimes(3);expect((await prisma.userInvitation.findUniqueOrThrow({where:{id:unknown.id}})).revokedAt).toBeTruthy();
    }finally{policy.mockRestore();factory.mockRestore();raw.mockRestore();await prisma.applicationSettings.update({where:{id:'global'},data:{publicOrigin:'https://eventgrid.example.invalid',originStatus:'VERIFIED'}});}
  });
  it('revokes an unused invitation when its pending account is disabled and rejects duplicate usernames',async()=>{
    const pending=await prisma.user.create({data:{fullName:'Synthetic Pending',email:'disabled-pending@example.invalid',username:'reserved_user',role:'OPERATOR',assignedEventId:event.id,accountStatus:'PENDING',isActive:false,passwordHash:'unusable'}});
    const token=crypto.randomBytes(32).toString('base64url');
    await prisma.userInvitation.create({data:{userId:pending.id,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt:new Date(Date.now()+86400000),status:'ACCEPTED_BY_PROVIDER'}});
    const duplicate=await request(app).post('/api/v1/users').set(headers('ADMIN')).send({fullName:'Other Synthetic',email:'username-conflict@example.invalid',username:'RESERVED_USER',role:'OPERATOR',assignedEventId:event.id});expect(duplicate.status).toBe(400);
    expect((await request(app).put('/api/v1/users/'+pending.id).set(headers('ADMIN')).send({isActive:false})).status).toBe(200);
    expect((await request(app).post('/api/v1/auth/accept-invitation').send({token,password:'SyntheticOnlyPassword123!'})).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({where:{id:pending.id}})).accountStatus).toBe('PENDING');
  });
  it('claims one account across distinct concurrent batches and only reinvites active accounts on explicit authorization', async () => {
    const pending = await prisma.user.create({ data: { fullName: 'Concurrent Invite', email: 'concurrent-invite@example.invalid', role: 'OPERATOR', assignedEventId: event.id, accountStatus: 'PENDING', isActive: false, passwordHash: 'unusable' } });
    const send = vi.fn(async (mail: any) => { await new Promise(resolve => setTimeout(resolve, 80)); return { accepted: [mail.to], messageId: '<concurrent-' + crypto.randomUUID() + '>' }; });
    const raw = vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true,host:'smtp.example.invalid',port:587, fromName: 'Mock', fromEmail: 'sender@example.invalid' } as any);
    const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any); const policy=vi.spyOn(smtpState,'smtpPolicy').mockReturnValue({realEmailBlocked:false,realEmailAllowed:true,simulationAllowed:false});
    const dispatch = (extra = {}) => request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ userIds: [pending.id], requestKey: crypto.randomUUID(), confirmed: true, ...extra });
    try {
      await Promise.all([dispatch(), dispatch()]); expect(send).toHaveBeenCalledOnce();
      const firstMail = send.mock.calls[0][0]; const token = new URL(firstMail.text.match(/https:\/\/\S+/)[0]).hash.slice(7);
      expect((await request(app).post('/api/v1/auth/accept-invitation').send({ token, password: 'UserChosenPassword123!',username:'concurrent_user01' })).status).toBe(200);
      const active = await prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
      await dispatch(); expect(send).toHaveBeenCalledOnce();
      await dispatch({ reinvite: true }); expect(send).toHaveBeenCalledTimes(2);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: pending.id } })).passwordHash).toBe(active.passwordHash);
      expect((await request(app).post('/api/v1/auth/login').send({ email: pending.email, password: 'UserChosenPassword123!' })).status).toBe(200);
    } finally { raw.mockRestore(); factory.mockRestore(); policy.mockRestore(); vi.unstubAllEnvs(); }
  });
});


it.runIf(process.env.EVENTGRID_REALTIME_BROWSER === 'true')('synchronizes real operations across independent browser sessions over actual SSE', async () => {
  const paymentMethod = await prisma.paymentMethod.create({ data: { eventId: event.id, name: 'Realtime cash' } });
  const ticket = await prisma.ticketType.findFirstOrThrow({ where: { eventId: event.id, price: 123 } });
  const participant = await prisma.participant.create({ data: { firstName: 'Live', lastName: 'Arrival', fullName: 'Live Arrival', email: 'live-arrival@example.invalid', documentId: 'live-arrival-doc' } });
  const arrival = await prisma.registration.create({ data: { eventId: event.id, participantId: participant.id, registrationNumber: 'LIVE-ARRIVAL', ticketTypeId: ticket.id, status: 'CONFIRMED', paymentStatus: 'PAID', amountPaid: 100, ticketPrice: 100, totalAmount: 100, balanceDue: 0, tshirtSize: 'L' } });
  const raceParticipant = await prisma.participant.create({ data: { firstName: 'Live', lastName: 'Race', fullName: 'Live Race', email: 'live-race@example.invalid' } });
  const raceArrival = await prisma.registration.create({ data: { eventId: event.id, participantId: raceParticipant.id, registrationNumber: 'LIVE-RACE', ticketTypeId: ticket.id, status: 'CONFIRMED', paymentStatus: 'PAID', amountPaid: 100, ticketPrice: 100, totalAmount: 100, balanceDue: 0, tshirtSize: 'L' } });
  const activateUser = await prisma.user.create({ data: { fullName: 'Activated QA User', email: 'activated-qa@example.invalid', role: 'VIEWER', assignedEventId: event.id, accountStatus: 'PENDING', isActive: false, passwordHash: 'unusable' } });
  const activationToken = crypto.randomBytes(32).toString('base64url');
  await prisma.userInvitation.create({ data: { userId: activateUser.id, tokenHash: crypto.createHash('sha256').update(activationToken).digest('hex'), expiresAt: new Date(Date.now() + 86400000), status: 'ACCEPTED_BY_PROVIDER' } });
  const account = async (role: string) => ({ token: tokens[role], user: await prisma.user.findUniqueOrThrow({ where: { email: role === 'ADMIN' ? 'admin@barcamp.org.do' : role === 'OPERATOR' ? 'operador@barcamp.org.do' : 'consulta@barcamp.org.do' }, select: { id: true, email: true, fullName: true, role: true, assignedEventId: true } }) });
  const operatorTwo = await prisma.user.create({ data: { fullName: 'Second Operator', email: 'second-operator@example.invalid', role: 'OPERATOR', assignedEventId: event.id, passwordHash: 'unusable' } });
  const server = app.listen(4191, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockImplementation(() => { throw new Error('Real email forbidden in browser QA'); });
  try {
    const run = createRequire(import.meta.url)('../../frontend/tests/realtime-multiuser.cjs');
    await run({ api: 'http://127.0.0.1:4191/api/v1', base: 'http://127.0.0.1:5189', eventId: event.id, otherId: other.id, admin: await account('ADMIN'), operator: await account('OPERATOR'), secondOperator: { token: jwt.sign({ id: operatorTwo.id }, 'isolated-functional-test-secret'), user: { id: operatorTwo.id, fullName: operatorTwo.fullName, email: operatorTwo.email, role: operatorTwo.role, assignedEventId: event.id } }, viewer: await account('VIEWER'), registrationId: arrival.id, concurrentRegistrationId: raceArrival.id, paymentMethodId: paymentMethod.id, ticketTypeId: ticket.id, activationToken, activationUserId: activateUser.id });
    expect(factory).not.toHaveBeenCalled();
  } finally { factory.mockRestore(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}, 180000);

describe('personnel access beta and operator mail capabilities', () => {
  it('formats and validates international phones, preserves legacy stored phones', async () => {
    const { formatPhone, normalizedPhone } = await import('../../frontend/src/utils/phone');
    expect(formatPhone('8294616106')).toBe('(829) 461-6106');
    expect(formatPhone('+18294616106')).toBe('+1 (829) 461-6106');
    expect(normalizedPhone('8095551234')).toBe('+18095551234');
    expect(normalizedPhone('+12025550123')).toBe('+12025550123');
    expect(normalizedPhone('+34612345678')).toBe('+34612345678');
    expect(normalizedPhone('123')).toBeNull();
    expect((await request(app).post('/api/v1/staff').set(headers('ADMIN')).send({ firstName:'Phone',lastName:'Invalid',email:'invalid-phone@example.invalid',phone:'123' })).status).toBe(400);
    const legacy = await prisma.staffMember.create({data:{eventId:event.id, firstName:'Old',lastName:'Phone',email:'old-phone@example.invalid',phone:'000',function:'Keep'}});
    const updated = await request(app).put('/api/v1/staff/'+legacy.id).set(headers('ADMIN')).send({firstName:'Old',lastName:'Phone',email:legacy.email,phone:'000'});
    expect(updated.status).toBe(200); expect(updated.body.data).toMatchObject({phone:'000',function:'Keep'});
  });
  it('atomically creates a pending account linked to staff without mailing or credentials', async () => {
    const transport = vi.spyOn(CommunicationsService, 'createTransporter').mockImplementation(() => { throw Error('No transport allowed'); });
    try {
      const staff = await prisma.staffMember.create({ data:{eventId:event.id,firstName:'Linked',lastName:'Person',email:'linked-person@example.invalid'} });
      const result = await request(app).post('/api/v1/staff/'+staff.id+'/access').set(headers('ADMIN')).send({role:'VIEWER'});
      expect(result.status).toBe(200); expect(result.body.data).toMatchObject({accountStatus:'PENDING',role:'VIEWER'});
      expect(JSON.stringify(result.body)).not.toMatch(/password|token/i);
      expect((await prisma.staffMember.findUniqueOrThrow({where:{id:staff.id}})).userId).toBe(result.body.data.id);
      expect((await prisma.user.findUniqueOrThrow({where:{id:result.body.data.id}})).isActive).toBe(false);
      expect((await request(app).post('/api/v1/staff/'+staff.id+'/access').set(headers('ADMIN')).send({role:'ADMIN'})).status).toBe(400);
      const list = await request(app).get('/api/v1/users?limit=100').set(headers('ADMIN'));
      expect(list.body.data.find((u:any)=>u.id===result.body.data.id).staffMembers[0].id).toBe(staff.id);
      expect(transport).not.toHaveBeenCalled();
    } finally { transport.mockRestore(); }
  });
  it('requires explicit matching-account links and rejects foreign identities, editions and roles', async () => {
    const account=await prisma.user.create({data:{fullName:'Existing Person',email:'existing-link@example.invalid',role:'VIEWER',assignedEventId:event.id,passwordHash:'unusable'}});
    const staff=await prisma.staffMember.create({data:{eventId:event.id,firstName:'Existing',lastName:'Person',email:account.email}});
    const path='/api/v1/staff/'+staff.id+'/access';
    expect((await request(app).get(path).set(headers('ADMIN'))).body.data.account.id).toBe(account.id);
    expect((await request(app).post(path).set(headers('ADMIN')).send({role:'ADMIN'})).status).toBe(400);
    expect((await request(app).post(path).set(headers('ADMIN')).send({role:'ADMIN',linkExisting:true})).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({where:{id:account.id}})).role).toBe('VIEWER');
    const mismatch=await prisma.staffMember.create({data:{eventId:event.id,firstName:'Wrong',lastName:'Identity',email:account.email}});
    expect((await request(app).post('/api/v1/staff/'+mismatch.id+'/access').set(headers('ADMIN')).send({linkExisting:true})).status).toBe(400);
    const foreign=await prisma.staffMember.create({data:{eventId:other.id,firstName:'Existing',lastName:'Person',email:account.email}});
    expect((await request(app).post('/api/v1/staff/'+foreign.id+'/access').set(headers('ADMIN',other.id)).send({linkExisting:true})).status).toBe(400);
    for(const role of ['OPERATOR','VIEWER']) expect((await request(app).post(path).set(headers(role)).send({})).status).toBe(403);
  });
  it('confines operators to unmodified digital tickets and safe status, with no provider calls', async () => {
    const send=vi.spyOn(CommunicationsService,'sendSingleEmail').mockResolvedValue({success:true, simulated:true, message:'Mock only',log:{id:'mock',status:'SIMULATED',recipientEmail:'test@example.invalid'}} as any);
    const preview=vi.spyOn(CommunicationsService,'previewEmail').mockResolvedValue({subject:'Mock only'} as any);
    try {
      expect((await request(app).get('/api/v1/communications/status').set(headers('OPERATOR'))).status).toBe(200);
      const templates=await request(app).get('/api/v1/communications/templates').set(headers('OPERATOR'));
      expect(templates.status).toBe(200); expect(templates.body.data.every((t:any)=>t.code==='DIGITAL_TICKET')).toBe(true);
      const payload={registrationId:registration.id,eventId:event.id,templateCode:'DIGITAL_TICKET'};
      expect((await request(app).post('/api/v1/communications/send').set(headers('OPERATOR')).send(payload)).status).toBe(200);
      for(const change of [{templateCode:'GENERAL_ANNOUNCEMENT'},{customSubject:'Override'},{customBodyHtml:'<p>Override</p>'},{customMessage:'Override'}]) {
        for(const route of ['send','preview']) expect((await request(app).post('/api/v1/communications/'+route).set(headers('OPERATOR')).send({...payload,...change})).status).toBe(403);
      }
      expect(send).toHaveBeenCalledTimes(1); expect(preview).not.toHaveBeenCalled();
      expect((await request(app).post('/api/v1/communications/preview').set(headers('OPERATOR')).send(payload)).status).toBe(200);
      for(const route of ['config','smtp-summary','jobs']) expect((await request(app).get('/api/v1/communications/'+route).set(headers('OPERATOR'))).status).toBe(403);
      expect((await request(app).post('/api/v1/communications/send-bulk').set(headers('OPERATOR')).send(payload)).status).toBe(403);
      expect((await request(app).get('/api/v1/communications/status').set(headers('VIEWER'))).status).toBe(403);
    } finally {send.mockRestore();preview.mockRestore();}
  });
  it('cannot override operator mail history ownership through filters', async () => {
    const spy=vi.spyOn(CommunicationsService,'getLogs').mockResolvedValue({data:[],pagination:{total:0}} as any);
    try {
      expect((await request(app).get('/api/v1/communications/logs?sentByUserId=other&templateCode=CUSTOM').set(headers('OPERATOR'))).status).toBe(200);
      expect(spy.mock.calls[0][1]).toMatchObject({sentByUserId:expect.any(String),templateCode:'DIGITAL_TICKET'});
      expect(spy.mock.calls[0][1]?.sentByUserId).not.toBe('other');
    } finally {spy.mockRestore();}
    const operator = await prisma.user.findUniqueOrThrow({where:{email:'operador@barcamp.org.do'}});
    const admin = await prisma.user.findUniqueOrThrow({where:{email:'admin@barcamp.org.do'}});
    const base = {eventId:event.id,registrationId:registration.id,recipientEmail:'test@example.invalid',subject:'Mock history',status:'SIMULATED'};
    const own = await prisma.emailLog.create({data:{...base,sentByUserId:operator.id,templateCode:'DIGITAL_TICKET'}});
    const foreign = await prisma.emailLog.create({data:{...base,sentByUserId:admin.id,templateCode:'DIGITAL_TICKET'}});
    const restricted = await prisma.emailLog.create({data:{...base,sentByUserId:operator.id,templateCode:'CUSTOM'}});
    const logs = await request(app).get('/api/v1/communications/logs?sentByUserId='+admin.id+'&limit=100').set(headers('OPERATOR'));
    expect(logs.body.data.map((row:any)=>row.id)).toContain(own.id);
    expect(logs.body.data.map((row:any)=>row.id)).not.toContain(foreign.id);
    expect(logs.body.data.map((row:any)=>row.id)).not.toContain(restricted.id);
    const history = await request(app).get('/api/v1/communications/history/registration/'+registration.id).set(headers('OPERATOR'));
    expect(history.body.data.map((row:any)=>row.id)).toContain(own.id);
    expect(history.body.data.map((row:any)=>row.id)).not.toContain(foreign.id);
    expect(history.body.data.map((row:any)=>row.id)).not.toContain(restricted.id);
  });
});

describe('reception audit guards and financial history', () => {
  it('blocks administrative and imported attendance, without altering previous check-in evidence', async () => {
    const before = await prisma.registration.findUniqueOrThrow({where:{id:registration.id}});
    expect((await request(app).put('/api/v1/participants/'+registration.id).set(headers('ADMIN')).send({status:'ATTENDED'})).status).toBe(400);
    await request(app).put('/api/v1/participants/'+registration.id).set(headers('ADMIN')).send({attended:false,attendedAt:null});
    const after = await prisma.registration.findUniqueOrThrow({where:{id:registration.id}});
    expect(after.attended).toBe(before.attended); expect(after.attendedAt).toEqual(before.attendedAt); expect(after.attendedByUserId).toBe(before.attendedByUserId);
    await expect(ParticipantsService.update(event.id,registration.id,{status:'ATTENDED'} as any)).rejects.toThrow(/check-in/);
    const {ImportService} = await import('../src/modules/import/import.service.js');
    const input={fileName:'mock.csv',sheetName:'QA',rows:[{first:'No',last:'Bypass',email:'bypass-import@example.invalid',attended:'SI'}],columnMapping:{first:'firstName',last:'lastName',email:'email',attended:'attended'}};
    const validation=await ImportService.validateRows(event.id,input.rows,input.columnMapping);
    expect(JSON.stringify(validation)).toContain('check-in');
    expect((await request(app).delete('/api/v1/participants/'+registration.id).set(headers('ADMIN'))).status).toBe(400);
    await expect(ParticipantsService.purgeEdition(event.id,'ELIMINAR PARTICIPANTES')).rejects.toThrow(/asistencia/);
  });
  it('uses configured prices, separates courtesy, preserves ledger and rejects foreign tariffs', async () => {
    const ticket=await prisma.ticketType.create({data:{eventId:event.id,name:'Audit tariff',price:315}});
    const method=await prisma.paymentMethod.create({data:{eventId:event.id,name:'Audit payment'}});
    const operator=await prisma.user.findUniqueOrThrow({where:{email:'operador@barcamp.org.do'}});
    for(const [i,paid,status] of [[0,315,'PAID'],[1,100,'PARTIAL'],[2,400,'PAID']] as const) {
      const record=await ParticipantsService.create(event.id,{firstName:'Audit',lastName:'Financial'+i,email:'audit-finance'+i+'@example.invalid',ticketTypeId:ticket.id,amountPaid:paid,totalAmount:paid,isCourtesy:false,isVerified:true,isDemo:false,status:'CONFIRMED',paymentMethodId:method.id});
      expect(Number(record.ticketPrice)).toBe(123);expect(Number(record.amountPaid)).toBe(paid);expect(record.paymentStatus).toBe(status);
      await expect(ParticipantsService.update(event.id,record.id,{amountPaid:1})).rejects.toThrow(/históricos/);
    }
    const courtesy=await ParticipantsService.create(event.id,{firstName:'Audit',lastName:'Courtesy',email:'audit-courtesy@example.invalid',isCourtesy:true,isVerified:true,isDemo:false,status:'CONFIRMED',amountPaid:999,totalAmount:999,paymentMethodId:method.id,courtesyReason:'Cortesía de prueba aprobada'},(await prisma.user.findFirstOrThrow({where:{role:'ADMIN'}})).id);
    expect(Number(courtesy.ticketPrice)).toBe(0);expect(Number(courtesy.amountPaid)).toBe(0);expect(courtesy.paymentMethodId).toBeNull();expect(courtesy.paymentStatus).toBe('COURTESY');
    await expect(ParticipantsService.update(other.id, 'missing', {ticketTypeId:ticket.id})).rejects.toThrow();
    const base=await prisma.registration.create({data:{eventId:event.id,participantId:(await prisma.participant.create({data:{firstName:'Atomic',lastName:'Payments',fullName:'Atomic Payments',email:'atomic-payments@example.invalid'}})).id,registrationNumber:'ATOMIC-PAY',ticketPrice:1000,amountPaid:0,totalAmount:0,balanceDue:1000}});
    const outcomes=await Promise.allSettled([30,40].map(amount=>ParticipantsService.recordPayment(event.id,base.id,{amount,paymentMethodId:method.id},operator.id)));
    expect(outcomes.some(o=>o.status==='fulfilled')).toBe(true);
    const ledger=await prisma.payment.aggregate({where:{registrationId:base.id},_sum:{amount:true}});
    expect(Number((await prisma.registration.findUniqueOrThrow({where:{id:base.id}})).amountPaid)).toBe(Number(ledger._sum.amount));
  });
  it('keeps valid credentials on database failure and isolates all SSE diagnostics', async () => {
    const originalFind = prisma.user.findUnique; const silence=vi.spyOn(console,'error').mockImplementation(()=>{});
    const spy=vi.spyOn(prisma.user,'findUnique').mockRejectedValueOnce(new Error('mock database outage'));
    try { expect((await request(app).get('/api/v1/auth/me').set(headers('OPERATOR'))).status).toBe(500); } finally {spy.mockRestore(); prisma.user.findUnique = originalFind; silence.mockRestore();}
    for(const path of ['/status','/realtime/status','/stream','/realtime/stream']) {
      expect((await request(app).get('/api/v1/events/'+other.id+path).set(headers('OPERATOR'))).status).toBe(403);
      const expired=jwt.sign({id:'expired'},'isolated-functional-test-secret',{expiresIn:-1});
      expect((await request(app).get('/api/v1/events/'+event.id+path).set('Authorization','Bearer '+expired)).status).toBe(401);
    }
    for(const role of ['ADMIN','OPERATOR','VIEWER']) expect((await request(app).get('/api/v1/events/'+event.id+'/status').set(headers(role))).status).toBe(200);
    expect((await request(app).get('/api/v1/events/'+other.id+'/status').set(headers('ADMIN'))).status).toBe(200);
    const scoped=await prisma.user.findUniqueOrThrow({where:{email:'scoped-admin@example.invalid'}});
    const scopedHeaders={Authorization:'Bearer '+jwt.sign({id:scoped.id},'isolated-functional-test-secret'),'X-Event-Id':event.id};
    const foreignParticipant=await prisma.participant.create({data:{firstName:'Foreign',lastName:'QR',fullName:'Foreign QR',email:'foreign-qr-audit@example.invalid'}});
    const foreignReg=await prisma.registration.create({data:{eventId:other.id,participantId:foreignParticipant.id,registrationNumber:'FOREIGN-QR-AUDIT',qrCode:'eg_qr_foreign_audit'}});
    expect((await request(app).get('/api/v1/qr/'+foreignReg.id).set(scopedHeaders)).status).toBe(403);
    const scanned=await request(app).post('/api/v1/qr/scan').set(scopedHeaders).send({codeOrToken:foreignReg.qrCode});
    expect(scanned.body.data.registration).toBeNull();
    const foreignTemplate=await prisma.emailTemplate.create({data:{eventId:other.id,code:'AUDIT_FOREIGN',name:'Foreign QA',subject:'Mock only',bodyHtml:'<p>Mock</p>'}});
    expect((await request(app).put('/api/v1/communications/templates/'+foreignTemplate.id).set(scopedHeaders).send({subject:'Forbidden',bodyHtml:'Forbidden'})).status).toBe(403);
    const inactive=await prisma.user.create({data:{fullName:'Inactive SSE',email:'inactive-sse@example.invalid',role:'VIEWER',assignedEventId:event.id,isActive:false,passwordHash:'unusable'}});
    const inactiveToken=jwt.sign({id:inactive.id},'isolated-functional-test-secret');
    expect((await request(app).get('/api/v1/events/'+event.id+'/status').set('Authorization','Bearer '+inactiveToken)).status).toBe(401);
  });
  it('reports interrupted mail without changing jobs or invoking a provider', async () => {
    const {EmailQueueWorker}=await import('../src/modules/communications/communications.queue.js');
    expect(EmailQueueWorker.executionState({id:'historical',status:'PROCESSING'})).toEqual({executionState:'INTERRUPTED',requiresAuthorization:true});
    expect(EmailQueueWorker.executionState({id:'pending',status:'PENDING'}).requiresAuthorization).toBe(true);
    expect(EmailQueueWorker.executionState({id:'done',status:'COMPLETED'}).requiresAuthorization).toBe(false);
  });
});

it('measures controlled 5, 10 and 20 operator reception waves without production data', async () => {
  const fs=await import('node:fs/promises'); const path=await import('node:path');
  const loadEvent=await prisma.event.create({data:{slug:'audit-load',name:'Isolated Load QA',year:2026,startDate:new Date(),endDate:new Date(),settings:{create:{tshirtSizesEnabled:true,tshirtSizes:JSON.stringify(['LOAD'])}}}});
  const method=await prisma.paymentMethod.create({data:{eventId:loadEvent.id,name:'Mock load payment'}});
  const ticket=await prisma.ticketType.create({data:{eventId:loadEvent.id,name:'Load tariff',price:100}});
  await prisma.event.update({where:{id:loadEvent.id},data:{defaultTicketTypeId:ticket.id}});
  await prisma.tshirtInventory.create({data:{eventId:loadEvent.id,size:'LOAD',initialQuantity:100}});
  const server=await new Promise<any>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
  const url='http://127.0.0.1:'+server.address().port+'/api/v1';
  const waves:any[]=[];
  try {
    for(const size of [5,10,20]){
      const operators=await Promise.all(Array.from({length:size},(_,i)=>prisma.user.create({data:{fullName:'QA Operator '+size+' '+i,email:'load-'+size+'-'+i+'@example.invalid',role:'OPERATOR',assignedEventId:loadEvent.id,passwordHash:'unusable'}})));
      const rows=await Promise.all(operators.map(async(_,i)=>{
        const participant=await prisma.participant.create({data:{firstName:'Load',lastName:size+'-'+i,fullName:'Load '+size+'-'+i,email:'load-participant-'+size+'-'+i+'@example.invalid'}});
        return prisma.registration.create({data:{eventId:loadEvent.id,participantId:participant.id,ticketTypeId:ticket.id,ticketPrice:100,amountPaid:0,totalAmount:0,balanceDue:100,registrationNumber:'LOAD-'+size+'-'+i,qrCode:'load-token-'+size+'-'+i}});
      }));
      const latencies:number[]=[];const failures:any[]=[];const rssBefore=process.memoryUsage().rss;const began=performance.now();
      await Promise.all(operators.map(async(operator,i)=>{
        const token=jwt.sign({id:operator.id},'isolated-functional-test-secret');
        const call=async(endpoint:string,method='GET',body?:any)=>{
          const start=performance.now();
          const res=await fetch(url+endpoint,{method,headers:{Authorization:'Bearer '+token,'X-Event-Id':loadEvent.id,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
          latencies.push(performance.now()-start);await res.text();
          if(!res.ok) failures.push({endpoint,status:res.status});return res.ok;
        };
        await call('/participants?search=Load');
        await call('/participants/'+rows[i].id);
        await call('/qr/scan','POST',{codeOrToken:rows[i].qrCode,eventId:loadEvent.id});
        const paid=await call('/participants/'+rows[i].id+'/payments','POST',{amount:100,paymentMethodId:method.id});
        if(paid) await call('/attendance/check-in','POST',{registrationId:rows[i].id,confirmed:true,tshirtSize:'LOAD',tshirtDelivered:true});
        await call('/attendance/counters');
        await call('/events/'+loadEvent.id+'/stats');
      }));
      latencies.sort((a,b)=>a-b);
      const ledger=await prisma.payment.aggregate({where:{registration:{eventId:loadEvent.id}},_sum:{amount:true}});
      const registrations=await prisma.registration.findMany({where:{eventId:loadEvent.id}});
      expect(registrations.reduce((sum,r)=>sum+Number(r.amountPaid),0)).toBe(Number(ledger._sum.amount||0));
      const inventory=await prisma.tshirtInventory.findFirstOrThrow({where:{eventId:loadEvent.id,size:'LOAD'}});
      expect(inventory.deliveredQuantity).toBe(registrations.filter(r=>r.tshirtDelivered).length);
      waves.push({operators:size,requests:latencies.length,durationMs:Math.round(performance.now()-began),p50Ms:Math.round(latencies[Math.floor(latencies.length*.5)]),p95Ms:Math.round(latencies[Math.floor(latencies.length*.95)]),maxMs:Math.round(latencies.at(-1)!),errorCount:failures.length,errorRate:Number((failures.length/latencies.length).toFixed(4)),failures,rssDeltaMiB:Number(((process.memoryUsage().rss-rssBefore)/1048576).toFixed(1))});
    }
    console.log(JSON.stringify({isolatedReceptionLoad:waves},null,2));
    await fs.writeFile(fileURLToPath(new URL('../../docs/RECEPTION_LOAD_RESULTS.json',import.meta.url)),JSON.stringify({environment:'Local Windows, Node '+process.version+', SQLite temporary database, real loopback HTTP, one wave per concurrency level. Not a Render or PostgreSQL capacity certification.',waves},null,2)+'\n');
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
},120000);

it('serializes physical shirt size changes and concurrent returns without duplicate inventory movements', async () => {
  const owner=await prisma.user.findUniqueOrThrow({where:{email:'admin@barcamp.org.do'}});
  const e=await prisma.event.create({data:{slug:'audit-shirts',name:'Isolated Shirt QA',year:2026,startDate:new Date(),endDate:new Date(),settings:{create:{tshirtSizesEnabled:true,tshirtSizes:JSON.stringify(['M','L'])}}}});
  const participant=await prisma.participant.create({data:{firstName:'Shirt',lastName:'Audit',fullName:'Shirt Audit',email:'shirt-audit@example.invalid'}});
  const reg=await prisma.registration.create({data:{eventId:e.id,participantId:participant.id,registrationNumber:'SHIRT-AUDIT',attended:true,attendedAt:new Date(),attendedByUserId:owner.id,tshirtSize:'M',tshirtDelivered:true}});
  await prisma.tshirtInventory.create({data:{eventId:e.id,size:'M',initialQuantity:5,deliveredQuantity:1}});
  await prisma.tshirtInventory.create({data:{eventId:e.id,size:'L',initialQuantity:5,deliveredQuantity:0}});
  await Promise.all([1,2].map(()=>ParticipantsService.updateTshirtSize(e.id,reg.id,'L',owner.id)));
  expect((await prisma.tshirtInventory.findUniqueOrThrow({where:{eventId_size:{eventId:e.id,size:'M'}}})).deliveredQuantity).toBe(0);
  expect((await prisma.tshirtInventory.findUniqueOrThrow({where:{eventId_size:{eventId:e.id,size:'L'}}})).deliveredQuantity).toBe(1);
  const returns=await Promise.allSettled([1,2].map(()=>ParticipantsService.returnTshirt(e.id,reg.id,owner.id,'Mock return')));
  expect(returns.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect((await prisma.tshirtInventory.findUniqueOrThrow({where:{eventId_size:{eventId:e.id,size:'L'}}})).deliveredQuantity).toBe(0);
  expect((await prisma.registration.findUniqueOrThrow({where:{id:reg.id}})).attended).toBe(true);
});

it('only explicitly reviews an interrupted batch and never dispatches mail', async () => {
  const {EmailQueueWorker}=await import('../src/modules/communications/communications.queue.js');
  const owner=await prisma.user.findUniqueOrThrow({where:{email:'admin@barcamp.org.do'}});
  const job=await prisma.emailBatchJob.create({data:{eventId:event.id,subject:'Mock interruption',status:'PROCESSING',items:{create:[{recipientEmail:'uncertain@example.invalid',status:'PROCESSING',attempts:1},{recipientEmail:'pending@example.invalid',status:'PENDING',attempts:0}]}}});
  const spy=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('No provider allowed');});
  try {
    expect((await request(app).post('/api/v1/communications/jobs/'+job.id+'/review-interrupted').set(headers('OPERATOR')).send({confirmed:true})).status).toBe(403);
    expect((await request(app).post('/api/v1/communications/jobs/'+job.id+'/review-interrupted').set(headers('ADMIN')).send({})).status).toBe(400);
    await EmailQueueWorker.reviewInterrupted(job.id,event.id,owner.id);
    const items=await prisma.emailBatchItem.findMany({where:{jobId:job.id}});
    expect(items.map(item=>item.status).sort()).toEqual(['PENDING','UNKNOWN_DELIVERY_STATUS']);
    expect(spy).not.toHaveBeenCalled();
    expect(await prisma.emailBatchJob.count({where:{id:job.id}})).toBe(1);
  } finally {spy.mockRestore();}
});
