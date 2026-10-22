import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

let event: any, other: any, registration: any, sponsorId: string;
const tokens: Record<string, string> = {};
const headers = (role: string, id = event.id) => ({ Authorization: `Bearer ${tokens[role]}`, 'X-Event-Id': id });

beforeAll(async () => {
  execFileSync(process.execPath, [fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url)), 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], {
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
    expect((await request(app).post('/api/v1/attendance/check-in').set(headers('VIEWER')).send({ registrationId: registration.id })).status).toBe(403);
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
    const responses = await Promise.all([1, 2].map(() => request(app).post('/api/v1/attendance/check-in').set(headers('OPERATOR')).send({ registrationId: registration.id, tshirtSize: 'L', tshirtDelivered: true })));
    expect(responses.filter(res => res.status === 200)).toHaveLength(1);
    const saved = await prisma.registration.findUnique({ where: { id: registration.id } });
    expect(saved).toMatchObject({ attended: true, tshirtSize: 'L', tshirtDelivered: true });
    expect(saved?.attendedAt).toBeTruthy(); expect(saved?.attendedByUserId).toBeTruthy();
    expect(await prisma.attendanceLog.count({ where: { registrationId: registration.id, action: 'CHECK_IN' } })).toBe(1);
    expect((await prisma.tshirtInventory.findFirst({ where: { eventId: event.id, size: 'L' } }))?.deliveredQuantity).toBe(1);
    expect((await request(app).post('/api/v1/qr/scan').set(headers('OPERATOR')).send({ qrToken: 'isolated-qr-token' })).body.data).toMatchObject({ status: 'ALREADY_CHECKED_IN', canCheckIn: false });
  });
});
