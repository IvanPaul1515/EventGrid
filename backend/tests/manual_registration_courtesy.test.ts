import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

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
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';
import { seedBarcamp2026 } from '../prisma/barcamp2026.js';
import { ImportService } from '../src/modules/import/import.service.js';

let eventId: string, general: string, presale: string, free: string, courtesyMethod: string;
const tokens: Record<string, string> = {}, ids: Record<string, string> = {};
let serial = 0;
const password = 'MockApproval!2026';
const approval = { email: 'admin@courtesy.invalid', password };
const body = (extra = {}) => ({ firstName: 'Prueba', lastName: 'Cortesia', email: `qa${++serial}@courtesy.invalid`, ticketTypeId: presale, ticketPrice: 1, amountPaid: 50, ...extra });
const post = (role: string, payload: any) => request(app).post('/api/v1/participants').set('Authorization', 'Bearer '+tokens[role]).set('X-Event-Id', eventId).send(payload);
const put = (role: string, id: string, payload: any) => request(app).put('/api/v1/participants/'+id).set('Authorization', 'Bearer '+tokens[role]).set('X-Event-Id', eventId).send(payload);

beforeAll(async () => {
  const event = await prisma.event.create({ data: { slug: 'courtesy-qa', name: 'Courtesy QA', year: 2026, startDate: new Date(), endDate: new Date(), isDefault: true } });
  eventId = event.id;
  for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
    const u = await prisma.user.create({ data: { email: role.toLowerCase()+'@courtesy.invalid', fullName: 'QA '+role, role, accountStatus: 'ACTIVE', passwordHash: await bcrypt.hash(password, 4) } });
    ids[role] = u.id; tokens[role] = jwt.sign({ id: u.id }, 'isolated-courtesy-test');
  }
  general = (await prisma.ticketType.create({ data: { eventId, name: 'Entrada General', price: 2000 } })).id;
  presale = (await prisma.ticketType.create({ data: { eventId, name: 'Preventa', price: 1000 } })).id;
  free = (await prisma.ticketType.create({ data: { eventId, name: 'Cortesía', price: 0 } })).id;
  courtesyMethod = (await prisma.paymentMethod.create({ data: { eventId, name: 'Cortesía' } })).id;
});
afterAll(async () => { await prisma.$disconnect(); if (fixture.previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous; });

describe('manual official tariff and administrative courtesy', () => {
  it('ignores client tariff and invented price for normal registration', async () => {
    const res = await post('OPERATOR', body()); expect(res.status).toBe(201);
    expect(res.body.data.ticketTypeId).toBe(general); expect(Number(res.body.data.ticketPrice)).toBe(2000);
    expect(Number(res.body.data.amountPaid)).toBe(50); expect(res.body.data.isCourtesy).toBe(false);
  });
  it('allows administrator and stores trusted identity, reason, date and audit', async () => {
    const res = await post('ADMIN', body({ isCourtesy: true, courtesyReason: 'Ponente invitado', courtesyAuthorizedBy: 'Fake' }));
    expect(res.status).toBe(201); const r = res.body.data;
    expect(Number(r.ticketPrice)).toBe(0); expect(Number(r.amountPaid)).toBe(0);
    expect(r.courtesyUserId).toBe(ids.ADMIN); expect(r.courtesyAuthorizedBy).toBe('QA ADMIN'); expect(r.courtesyDate).toBeTruthy();
    const logs = await prisma.auditLog.findMany({ where: { entityId: r.id } });
    expect(JSON.stringify(logs)).toContain('authorizedByUserId'); expect(JSON.stringify(logs)).toContain('Ponente invitado');
    expect(JSON.stringify(logs)).not.toContain(password);
  });
  it.each([{ isCourtesy: true }, { ticketTypeId: '__FREE__' }, { paymentMethodId: '__METHOD__' }])('rejects operator bypass %o', async raw => {
    const extra = { ...raw };
    if (extra.ticketTypeId) extra.ticketTypeId = free;
    if (extra.paymentMethodId) extra.paymentMethodId = courtesyMethod;
    expect((await post('OPERATOR', body({ ...extra, courtesyReason: 'Intento sin aprobación' }))).status).toBe(403);
  });
  it('operator requires real admin credentials and records both identities', async () => {
    const res = await post('OPERATOR', body({ isCourtesy: true, courtesyReason: 'Invitado autorizado', courtesyApproval: approval }));
    expect(res.status).toBe(201); const r = res.body.data; expect(r.courtesyUserId).toBe(ids.ADMIN);
    const logs = await prisma.auditLog.findMany({ where: { entityId: r.id } });
    const text = JSON.stringify(logs); expect(text).toContain(ids.OPERATOR); expect(text).toContain(ids.ADMIN); expect(text).not.toContain(password);
  });
  it('rejects wrong password and a viewer even with administrator credentials', async () => {
    expect((await post('OPERATOR', body({ isCourtesy: true, courtesyReason: 'Motivo QA', courtesyApproval: { ...approval, password: 'incorrect' } }))).status).toBe(403);
    expect((await post('VIEWER', body({ isCourtesy: true, courtesyReason: 'Motivo QA', courtesyApproval: approval }))).status).toBe(403);
  });
  it('requires reason; normal edit cannot become courtesy without approval', async () => {
    expect((await post('ADMIN', body({ isCourtesy: true }))).status).toBe(400);
    const r = await post('ADMIN', body({ amountPaid: 0 })); expect(r.status).toBe(201);
    expect((await put('OPERATOR', r.body.data.id, { ticketTypeId: free, courtesyReason: 'Bypass' })).status).toBe(403);
    const updated = await put('OPERATOR', r.body.data.id, { isCourtesy: true, courtesyReason: 'Aprobación posterior', courtesyApproval: approval });
    expect(updated.status).toBe(200); expect(updated.body.data.courtesyUserId).toBe(ids.ADMIN);
    const logs = await prisma.auditLog.findMany({ where: { entityId: r.body.data.id } }); expect(JSON.stringify(logs)).not.toContain(password);
  });
  it('blocks courtesy through onsite sale without elevated approval', async () => {
    const res = await request(app).post('/api/v1/participants/onsite-sale').set('Authorization', 'Bearer '+tokens.OPERATOR).set('X-Event-Id', eventId)
      .send({ ...body(), ticketTypeId: free, courtesyReason: 'Intento presencial' });
    expect(res.status).toBe(403);
  });
  it('operator cannot invent a zero tariff through edit', async () => {
    const r = await post('ADMIN', body({ amountPaid: 0 }));
    expect((await put('OPERATOR', r.body.data.id, { ticketPrice: 0 })).status).toBe(400);
  });
  it('spreadsheet courtesy requires individual approval before any batch is written', async () => {
    const validate = vi.spyOn(ImportService, 'validateRows').mockResolvedValue({ rowsSummary: [{ normalized: { isCourtesy: true } }] } as any);
    const before = await prisma.importBatch.count();
    await expect(ImportService.executeImport(eventId, ids.OPERATOR, 'mock.xlsx', 1, [], {}, 'SKIP')).rejects.toThrow('aprobación administrativa individual');
    expect(await prisma.importBatch.count()).toBe(before); validate.mockRestore();
  });

  it('initializes only BarCamp 2026 with a database tariff of 1750 and uses it for registration', async () => {
    const event = await seedBarcamp2026(prisma);
    const tariffs = await prisma.ticketType.findMany({ where: { eventId: event.id } });
    expect(tariffs).toHaveLength(1); expect(Number(tariffs[0].price)).toBe(1750);
    const res = await request(app).post('/api/v1/participants').set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', event.id).send(body({ ticketTypeId: undefined, ticketPrice: 1 }));
    expect(res.status).toBe(201); expect(Number(res.body.data.ticketPrice)).toBe(1750);
    expect(Number((await prisma.ticketType.findUnique({ where: { id: general } }))!.price)).toBe(2000);
  });
  it('admin tariff edits survive initialization and historical registrations remain unchanged', async () => {
    const event = await seedBarcamp2026(prisma);
    const tariff = await prisma.ticketType.findFirstOrThrow({ where: { eventId: event.id } });
    const edit = await request(app).put(`/api/v1/events/${event.id}/ticket-types/${tariff.id}`).set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', event.id).send({ price: 1900 });
    expect(edit.status).toBe(200);
    await seedBarcamp2026(prisma);
    expect(Number((await prisma.ticketType.findUnique({ where: { id: tariff.id } }))!.price)).toBe(1900);
    const historical = await prisma.registration.findFirstOrThrow({ where: { eventId: event.id } }); expect(Number(historical.ticketPrice)).toBe(1750);
    const courtesy = await request(app).post('/api/v1/participants').set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', event.id).send(body({ ticketTypeId: tariff.id, isCourtesy: true, courtesyReason: 'Ponente QA autorizado' }));
    expect(courtesy.status).toBe(201); expect(Number(courtesy.body.data.ticketPrice)).toBe(0);
  });

});
