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
  const data = (slug: string) => ({ slug, name: slug, year: 2026, startDate: new Date(), endDate: new Date(), isDefault: slug === 'test-primary', settings: { create: { tshirtSizesEnabled: true, tshirtSizes: JSON.stringify(['M', 'L']) } } });
  event = await prisma.event.create({ data: data('test-primary') });
  other = await prisma.event.create({ data: data('test-other') });
  const accounts = { ADMIN: ['admin', 'Admin'], OPERATOR: ['operador', 'Op'], VIEWER: ['consulta', 'View'] };
  for (const [role, [name, suffix]] of Object.entries(accounts)) {
    const user = await prisma.user.create({ data: { email: `${name}@barcamp.org.do`, fullName: `Test ${role}`, role, passwordHash: await bcrypt.hash(`BarCamp2026!${suffix}`, 4), assignedEventId: role === 'ADMIN' ? null : event.id } });
    tokens[role] = jwt.sign({ id: user.id }, 'isolated-functional-test-secret');
  }
  const ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: 'General', price: 123 } });
  const participant = await prisma.participant.create({ data: { firstName: 'Fictitious', lastName: 'Participant', fullName: 'Fictitious Participant', email: 'test@example.invalid', documentId: 'isolated-test' } });
  registration = await prisma.registration.create({ data: {
    eventId: event.id, participantId: participant.id, registrationNumber: 'TEST-001', ticketTypeId: ticket.id,
    status: 'CONFIRMED', paymentStatus: 'PAID', tshirtSize: 'M', qrCode: 'isolated-qr-token',
  } });
  await prisma.tshirtInventory.create({ data: { eventId: event.id, size: 'L', initialQuantity: 5 } });
}, 30000);
afterAll(async () => {
  await prisma.$disconnect();
  const { rmSync } = await import('node:fs');
  rmSync(isolated.folder, { recursive: true, force: true });
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
    const raw = vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true, fromName: 'Test', fromEmail: 'sender@example.invalid' } as any);
    const factory = vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail: send } as any);
    vi.stubEnv('FRONTEND_URL', 'https://eventgrid.example.invalid');
    try {
      const payload = { userIds: users.map(user => user.id), requestKey: crypto.randomUUID(), confirmed: true };
      expect((await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, confirmed: false })).status).toBe(400);
      const result = await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload);
      expect(result.status).toBe(200); expect(send).toHaveBeenCalledTimes(2);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send(payload); expect(send).toHaveBeenCalledTimes(2);
      const tokens = send.mock.calls.map(([mail]) => new URL(mail.text.match(/https:\/\/\S+/)[0]).searchParams.get('token')!);
      expect(tokens[0]).not.toBe(tokens[1]);
      const stored = await prisma.userInvitation.findFirstOrThrow({ where: { userId: users[0].id, revokedAt: null } });
      expect(stored.tokenHash).not.toContain(tokens[0]); expect(stored.expiresAt!.getTime() - stored.createdAt.getTime()).toBeGreaterThan(86300000);
      const activation = { token: tokens[0], password: 'FictitiousPassword123!' };
      expect((await request(app).post('/api/v1/auth/accept-invitation').send(activation)).status).toBe(200);
      expect((await request(app).post('/api/v1/auth/accept-invitation').send(activation)).status).toBe(400);
      await prisma.userInvitation.updateMany({ where: { userId: users[1].id }, data: { expiresAt: new Date(0) } });
      expect((await request(app).post('/api/v1/auth/accept-invitation').send({ ...activation, token: tokens[1] })).status).toBe(400);
      await request(app).post('/api/v1/users/invitations/send').set(headers('ADMIN')).send({ ...payload, requestKey: crypto.randomUUID() });
      expect((await prisma.userInvitation.findUniqueOrThrow({ where: { id: stored.id } })).usedAt).toBeTruthy();
    } finally { factory.mockRestore(); raw.mockRestore(); vi.unstubAllEnvs(); }
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
