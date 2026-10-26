import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
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
    const u = await prisma.user.create({ data: { email: role.toLowerCase()+'@courtesy.invalid', fullName: 'QA '+role, role, assignedEventId: role === 'ADMIN' ? null : eventId, accountStatus: 'ACTIVE', passwordHash: await bcrypt.hash(password, 4) } });
    ids[role] = u.id; tokens[role] = jwt.sign({ id: u.id }, 'isolated-courtesy-test');
  }
  general = (await prisma.ticketType.create({ data: { eventId, name: 'Entrada General', price: 2000 } })).id;
  await prisma.event.update({where:{id:eventId},data:{defaultTicketTypeId:general}});
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
  it('never accepts an administrator password supplied by the operator', async () => {
    const res = await post('OPERATOR', body({ isCourtesy: true, courtesyReason: 'Invitado autorizado', courtesyApproval: approval }));
    expect(res.status).toBe(403);
  });
  it('rejects wrong password and a viewer even with administrator credentials', async () => {
    expect((await post('OPERATOR', body({ isCourtesy: true, courtesyReason: 'Motivo QA', courtesyApproval: { ...approval, password: 'incorrect' } }))).status).toBe(403);
    expect((await post('VIEWER', body({ isCourtesy: true, courtesyReason: 'Motivo QA', courtesyApproval: approval }))).status).toBe(403);
  });
  it('requires reason; normal edit cannot become courtesy without approval', async () => {
    expect((await post('ADMIN', body({ isCourtesy: true }))).status).toBe(400);
    const r = await post('ADMIN', body({ amountPaid: 0 })); expect(r.status).toBe(201);
    expect((await put('OPERATOR', r.body.data.id, { ticketTypeId: free, courtesyReason: 'Bypass' })).status).toBe(403);
    const updated = await put('ADMIN', r.body.data.id, { isCourtesy: true, courtesyReason: 'Aprobación posterior', courtesyApproval: approval });
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
    for (const amount of [0, 500, 1750, 2000]) {
      const paid = await request(app).post('/api/v1/participants').set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', event.id).send(body({ ticketTypeId: undefined, ticketPrice: 1, amountPaid: amount }));
      expect(paid.status).toBe(201); expect(Number(paid.body.data.ticketPrice)).toBe(1750); expect(Number(paid.body.data.balanceDue)).toBe(Math.max(0,1750-amount));
      const ledger = await prisma.payment.aggregate({ where: { registrationId: paid.body.data.id }, _sum: { amount: true } }); expect(Number(ledger._sum.amount || 0)).toBe(amount);
    }

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

  const sendRequest = (role: string, payload: any, token = tokens[role]) => request(app).post('/api/v1/participants/courtesy-requests').set('Authorization', 'Bearer '+token).set('X-Event-Id', eventId).send(payload);
  const decision = (role: string, id: string, value: string) => request(app).post(`/api/v1/participants/courtesy-requests/${id}/decision`).set('Authorization', 'Bearer '+tokens[role]).set('X-Event-Id', eventId).send({ decision: value, reason: 'Decisión QA' });
  it('atomically requests a new courtesy, deduplicates lost responses and requires a separate admin session', async () => {
    const payload = { requestKey: crypto.randomUUID(), reason: 'Ponente solicitado', registration: body({ amountPaid: 999, isCourtesy: true }) };
    const [one, two] = await Promise.all([sendRequest('OPERATOR', payload), sendRequest('OPERATOR', payload)]);
    expect(one.status).toBe(201); expect(two.status).toBe(201); expect(one.body.data.id).toBe(two.body.data.id);
    const pending = await prisma.registration.findUniqueOrThrow({ where: { id: one.body.data.registration.id } });
    expect(pending.isCourtesy).toBe(false); expect(pending.status).toBe('PENDING'); expect(Number(pending.amountPaid)).toBe(0); expect(Number(pending.ticketPrice)).toBe(2000);
    expect(await prisma.payment.count({ where: { registrationId: pending.id } })).toBe(0);
    const check = await request(app).post('/api/v1/attendance/check-in').set('Authorization', 'Bearer '+tokens.OPERATOR).set('X-Event-Id', eventId).send({ registrationId: pending.id, confirmed: true }); expect(check.status).toBe(400);
    expect((await decision('OPERATOR', one.body.data.id, 'APPROVED')).status).toBe(403);
    expect((await sendRequest('VIEWER', payload)).status).toBe(403);
    const race = await Promise.all([decision('ADMIN', one.body.data.id, 'APPROVED'), decision('ADMIN', one.body.data.id, 'REJECTED')]);
    expect(race.map(r => r.status).sort()).toEqual([200,409]);
    const resolved = await prisma.courtesyRequest.findUniqueOrThrow({ where: { id: one.body.data.id } });
    const actual = await prisma.registration.findUniqueOrThrow({ where: { id: pending.id } });
    expect(actual.isCourtesy).toBe(resolved.status === 'APPROVED'); expect(resolved.decidedByUserId).toBe(ids.ADMIN);
    if (actual.isCourtesy) expect(Number(actual.ticketPrice)).toBe(0);
    const query = await request(app).get('/api/v1/participants/courtesy-requests').set('Authorization', 'Bearer '+tokens.OPERATOR).set('X-Event-Id', eventId);
    expect(query.status).toBe(200); expect(query.body.data.find((r: any) => r.id === resolved.id).status).toBe(resolved.status);
  });
  it('rejects a request without changing the original inscription and scopes review to the edition', async () => {
    const r = await post('ADMIN', body({ amountPaid: 0 }));
    const sent = await sendRequest('OPERATOR', { requestKey: crypto.randomUUID(), reason: 'Solicitud a rechazar', registrationId: r.body.data.id }); expect(sent.status).toBe(201);
    const other = await seedBarcamp2026(prisma);
    expect((await request(app).post(`/api/v1/participants/courtesy-requests/${sent.body.data.id}/decision`).set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', other.id).send({ decision: 'APPROVED' })).status).toBe(404);
    expect((await decision('ADMIN', sent.body.data.id, 'REJECTED')).status).toBe(200);
    const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: r.body.data.id } }); expect(unchanged.isCourtesy).toBe(false); expect(Number(unchanged.ticketPrice)).toBe(2000);
    const logs = await prisma.auditLog.findMany({ where: { entityId: unchanged.id } }); expect(JSON.stringify(logs)).toContain('DECIDE_COURTESY');
    expect((await request(app).get('/api/v1/attendance/operations').set('Authorization', 'Bearer '+tokens.OPERATOR).set('X-Event-Id', eventId)).status).toBe(403);
    const overview = await request(app).get('/api/v1/attendance/operations').set('Authorization', 'Bearer '+tokens.ADMIN).set('X-Event-Id', eventId); expect(overview.status).toBe(200); expect(overview.body.data.connectionMeaning).toContain('SSE');
  });
  it('covers exact, partial, overpaid and unpaid official fares', async () => {
    for (const amount of [0, 500, 2000, 2500]) {
      const r = await post('ADMIN', body({ amountPaid: amount })); expect(r.status).toBe(201);
      expect(Number(r.body.data.ticketPrice)).toBe(2000); expect(Number(r.body.data.balanceDue)).toBe(Math.max(0,2000-amount));
      const ledger = await prisma.payment.aggregate({ where: { registrationId: r.body.data.id }, _sum: { amount: true } }); expect(Number(ledger._sum.amount || 0)).toBe(amount);
      expect(r.body.data.paymentStatus).toBe(amount === 0 ? 'PENDING' : amount < 2000 ? 'PARTIAL' : 'PAID');
    }
  });
  it('runs controlled 5/10/20 operator waves with payments, courtesy decisions, shirts and SSE', async () => {
    const { EventEmitter } = await import('node:events'); const waves: any[] = [];
    const method = await prisma.paymentMethod.create({ data: { eventId, name: 'Load QA Cash' } });
    await prisma.eventSettings.create({ data: { eventId, tshirtSizesEnabled: true, tshirtSizes: JSON.stringify(['M5','M10','M20']) } });
    for (const count of [5,10,20]) {
      const size = 'M'+count; await prisma.tshirtInventory.create({ data: { eventId, size, initialQuantity: count } });
      const operators = [];
      for (let index=0; index<count; index++) {
        const user = await prisma.user.create({ data: { email: `load${count}-${index}@qa.invalid`, fullName: `Operador QA ${index}`, role: 'OPERATOR', assignedEventId: eventId, passwordHash: 'unused' } });
        const client: any = new EventEmitter(); client.frames = []; client.write = (frame: string) => { client.frames.push(frame); }; client.end = () => {};
        RealtimeService.addClient(eventId, client, { userId: user.id, role: 'OPERATOR', assignedEventId: eventId });
        operators.push({ token: jwt.sign({ id: user.id }, 'isolated-courtesy-test'), client });
      }
      const start = performance.now(), latencies: number[] = []; let duplicatePrevented=0;
      try {
        await Promise.all(operators.map(async ({token}, index) => {
          const h = { Authorization: 'Bearer '+token, 'X-Event-Id': eventId };
          const started = performance.now(); expect((await request(app).get('/api/v1/attendance?search=Prueba').set(h)).status).toBe(200);
          const created = await request(app).post('/api/v1/participants').set(h).send(body({ amountPaid: 0 })); expect(created.status).toBe(201);
          const id = created.body.data.id;
          expect((await request(app).post(`/api/v1/participants/${id}/payments`).set(h).send({ amount: 100, paymentMethodId: method.id })).status).toBe(201);
          const payload = { registrationId: id, confirmed: true, tshirtSize: size, tshirtDelivered: true };
          expect((await request(app).post('/api/v1/attendance/check-in').set(h).send(payload)).status).toBe(200);
          expect((await request(app).post('/api/v1/attendance/check-in').set(h).send(payload)).status).toBe(400); duplicatePrevented++;
          const sent = await sendRequest('OPERATOR', { requestKey: crypto.randomUUID(), reason: 'Solicitud carga QA', registration: body() }, token); expect(sent.status).toBe(201);
          expect((await decision('ADMIN', sent.body.data.id, index%2 ? 'REJECTED' : 'APPROVED')).status).toBe(200);
          const incident = await request(app).post('/api/v1/attendance/incidents').set(h).send({requestKey:crypto.randomUUID(),participantLabel:'Load QA '+index,category:'ADMIN',description:'Revisión controlada de recepción'}); expect(incident.status).toBe(201);
          expect((await request(app).patch('/api/v1/attendance/incidents/'+incident.body.data.id).set({Authorization:'Bearer '+tokens.ADMIN,'X-Event-Id':eventId}).send({status:'RESOLVED',resolution:'Caso QA resuelto'})).status).toBe(200);
          latencies.push(performance.now()-started);
        }));
        const inventory = await prisma.tshirtInventory.findUniqueOrThrow({ where: { eventId_size: { eventId, size } } }); expect(inventory.deliveredQuantity).toBe(count);
        expect(duplicatePrevented).toBe(count);
        for (const {client} of operators) { expect(client.frames.some((frame: string) => frame.includes('courtesies'))).toBe(true); expect(client.frames.some((frame: string) => frame.includes('inventory'))).toBe(true); }
        latencies.sort((a,b)=>a-b); waves.push({ operators: count, elapsedMs: Math.round(performance.now()-start), p95WorkflowMs: Math.round(latencies[Math.ceil(count*.95)-1]), unexpectedErrors: 0, duplicatesPrevented: duplicatePrevented, delivered: inventory.deliveredQuantity, rssMB: Math.round(process.memoryUsage().rss/1048576) });
      } finally { for (const {client} of operators) RealtimeService.removeClient(eventId,client); }
    }
    const { writeFileSync } = await import('node:fs'); writeFileSync(new URL('../../docs/RECEPTION_COURTESY_LOAD_RESULTS.json', import.meta.url),JSON.stringify({ environment: 'Isolated temporary SQLite, in-process HTTP integration and SSE subscribers. Not production capacity.', waves },null,2)+'\n');
  },120000);

  it('protects the last shirt across two registrations and permits a single later delivery', async () => {
    await prisma.eventSettings.update({ where: { eventId }, data: { tshirtSizes: JSON.stringify(['M5','M10','M20','LAST']) } });
    await prisma.tshirtInventory.create({ data: { eventId, size: 'LAST', initialQuantity: 1 } });
    const records = await Promise.all([post('ADMIN',body({ amountPaid: 0 })),post('ADMIN',body({ amountPaid: 0 }))]);
    const h = { Authorization:'Bearer '+tokens.OPERATOR, 'X-Event-Id':eventId };
    const check = (id: string, delivered: boolean, size = 'LAST') => request(app).post('/api/v1/attendance/check-in').set(h).send({ registrationId:id, confirmed:true, tshirtSize:size, tshirtDelivered:delivered });
    const race = await Promise.all(records.map(r => check(r.body.data.id,true))); expect(race.map(r=>r.status).sort()).toEqual([200,400]);
    const loser = records[race.findIndex(r=>r.status===400)].body.data.id;
    expect((await check(loser,false,'UNKNOWN')).status).toBe(400);
    expect((await check(loser,false)).status).toBe(200);
    const inv = await prisma.tshirtInventory.findUniqueOrThrow({ where:{eventId_size:{eventId,size:'LAST'}} }); expect(inv.deliveredQuantity).toBe(1);
    await prisma.tshirtInventory.update({where:{id:inv.id},data:{initialQuantity:2}});
    const delivery = () => request(app).post(`/api/v1/participants/${loser}/deliver-tshirt`).set(h).send({size:'LAST'});
    const deliveries = await Promise.all([delivery(),delivery()]); expect(deliveries.map(r=>r.status).sort()).toEqual([200,400]);
    expect((await prisma.tshirtInventory.findUniqueOrThrow({where:{id:inv.id}})).deliveredQuantity).toBe(2);
    expect(await prisma.attendanceLog.count({where:{registrationId:loser,action:'CHECK_IN'}})).toBe(1);
  });

});
