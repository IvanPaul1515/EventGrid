import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
const fixture = await vi.hoisted(async () => {
    const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const { execFileSync } = await import('node:child_process');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eventgrid-evolution-'));
    const db = path.join(directory, 'test.db');
    fs.writeFileSync(db, '');
    const url = 'file:' + db.replaceAll('\\', '/');
    execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)), 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    return { url, previous };
});
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-evolution-test', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
    const { PrismaClient } = await import('@prisma/client');
    return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { updateUserSafely } from '../src/modules/users/userSafety.js';
let event: any, other: any, admin: any, operator: any, viewer: any, scoped: any, ticket: any;
const password = 'FixturePassword!2026', tokens: Record<string, string> = {};
const headers = (role = 'ADMIN', eventId = event.id) => ({ Authorization: 'Bearer ' + tokens[role], 'X-Event-Id': eventId });
const newParticipant = () => ({ firstName: 'Evolution', lastName: 'QA', email: crypto.randomUUID() + '@qa.invalid', amountPaid: 0 });
beforeAll(async () => {
    event = await prisma.event.create({ data: { slug: 'evolution-main', name: 'Evolution', year: 2026, startDate: new Date(), endDate: new Date(), isDefault: true } });
    other = await prisma.event.create({ data: { slug: 'evolution-other', name: 'Other', year: 2025, startDate: new Date(), endDate: new Date() } });
    for (const role of ['ADMIN', 'OPERATOR', 'VIEWER']) {
        const u = await prisma.user.create({ data: { email: role.toLowerCase() + '@evolution.invalid', fullName: 'QA ' + role, role, assignedEventId: role === 'ADMIN' ? null : event.id, passwordHash: await bcrypt.hash(password, 4) } });
        tokens[role] = jwt.sign({ id: u.id }, 'isolated-evolution-test');
        if (role === 'ADMIN')
            admin = u;
        else if (role === 'OPERATOR')
            operator = u;
        else
            viewer = u;
    }
    scoped = await prisma.user.create({ data: { email: 'scoped@evolution.invalid', fullName: 'Scoped', role: 'ADMIN', assignedEventId: event.id, passwordHash: 'unused' } });
    tokens.SCOPED = jwt.sign({ id: scoped.id }, 'isolated-evolution-test');
    ticket = await prisma.ticketType.create({ data: { eventId: event.id, name: 'Arbitrary ticket label', price: 1750 } });
    await prisma.event.update({ where: { id: event.id }, data: { defaultTicketTypeId: ticket.id } });
});
afterAll(async () => { await prisma.$disconnect(); if (fixture.previous === undefined)
    delete process.env.DATABASE_URL;
else
    process.env.DATABASE_URL = fixture.previous; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('history and explicit administrative safety', () => {
    it('deactivates without physical deletion, preserves records and invalidates old tokens after reactivation', async () => {
        const u = await prisma.user.create({ data: { email: 'history@evolution.invalid', fullName: 'History Operator', role: 'OPERATOR', assignedEventId: event.id, passwordHash: await bcrypt.hash(password, 4) } });
        const token = jwt.sign({ id: u.id }, 'isolated-evolution-test');
        const p = await prisma.participant.create({ data: { firstName: 'History', lastName: 'Person', fullName: 'History Person', email: 'history-person@qa.invalid' } });
        const reg = await prisma.registration.create({ data: { eventId: event.id, participantId: p.id, registrationNumber: 'HISTORY', attended: true, attendedByUserId: u.id, attendedAt: new Date() } });
        await prisma.attendanceLog.create({ data: { registrationId: reg.id, userId: u.id, action: 'CHECK_IN' } });
        expect((await request(app).delete('/api/v1/users/' + u.id).set(headers())).status).toBe(200);
        expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).isActive).toBe(false);
        expect(await prisma.attendanceLog.count({ where: { userId: u.id } })).toBe(1);
        expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(401);
        expect((await request(app).put('/api/v1/users/' + u.id).set(headers()).send({ isActive: true })).status).toBe(200);
        expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer ' + token)).status).toBe(401);
    });
    it('protects the last global and last per-edition administrator and blocks foreign management', async () => {
        await expect(updateUserSafely(admin.id, { isActive: false }, admin.id, 'TEST')).rejects.toThrow('último administrador global');
        await prisma.user.update({ where: { id: admin.id }, data: { isActive: false } });
        try {
            await expect(updateUserSafely(scoped.id, { isActive: false }, scoped.id, 'TEST')).rejects.toThrow('sin administrador');
        }
        finally {
            await prisma.user.update({ where: { id: admin.id }, data: { isActive: true } });
        }
        expect((await request(app).delete('/api/v1/users/' + admin.id).set(headers('SCOPED'))).status).toBe(403);
    });
    it('uses an explicit tariff despite renaming and refuses silent fallback or disabling', async () => {
        await prisma.ticketType.update({ where: { id: ticket.id }, data: { name: 'VIP etiqueta sin palabras clave' } });
        const first = await request(app).post('/api/v1/participants').set(headers()).send({ ...newParticipant(), ticketPrice: 1 });
        expect(first.status).toBe(201);
        expect(Number(first.body.data.ticketPrice)).toBe(1750);
        expect((await request(app).put(`/api/v1/events/${event.id}/ticket-types/${ticket.id}`).set(headers()).send({ isActive: false })).status).toBe(400);
        const foreign = await prisma.ticketType.create({ data: { eventId: other.id, name: 'Foreign', price: 2000 } });
        expect((await request(app).put(`/api/v1/events/${event.id}/default-ticket`).set(headers()).send({ ticketTypeId: foreign.id })).status).toBe(400);
        const next = await prisma.ticketType.create({ data: { eventId: event.id, name: 'Nuevo precio', price: 1850 } });
        expect((await request(app).put(`/api/v1/events/${event.id}/default-ticket`).set(headers()).send({ ticketTypeId: next.id })).status).toBe(200);
        const created = await request(app).post('/api/v1/participants').set(headers()).send(newParticipant());
        expect(Number(created.body.data.ticketPrice)).toBe(1850);
        expect(Number((await prisma.registration.findUniqueOrThrow({ where: { id: first.body.data.id } })).ticketPrice)).toBe(1750);
        await prisma.event.update({ where: { id: event.id }, data: { defaultTicketTypeId: null } });
        expect((await request(app).post('/api/v1/participants').set(headers()).send({ ...newParticipant(), ticketTypeId: ticket.id, ticketPrice: 1750 })).status).toBe(400);
        await prisma.event.update({ where: { id: event.id }, data: { defaultTicketTypeId: ticket.id } });
    });
});
describe('separate password recovery, mock provider only', () => {
    it('returns a neutral response with disabled delivery and never queues historical recovery mail', async () => {
        vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: false } as any);
        const send = vi.spyOn(CommunicationsService, 'createTransporter');
        const known = await request(app).post('/api/v1/auth/recovery/request').send({ email: admin.email });
        const unknown = await request(app).post('/api/v1/auth/recovery/request').send({ email: 'missing@qa.invalid' });
        expect(known.status).toBe(202);
        expect(known.body).toEqual(unknown.body);
        expect(send).not.toHaveBeenCalled();
        expect(await prisma.passwordReset.count()).toBe(0);
    });
    it('hashes tokens, expires links, consumes a reset once and revokes previous sessions without leaking secrets', async () => {
        vi.stubEnv('FRONTEND_URL', 'https://qa.example.invalid');
        vi.spyOn(CommunicationsService, 'getRawConfig').mockResolvedValue({ isEnabled: true, fromName: 'QA', fromEmail: 'no-reply@qa.invalid' } as any);
        const u = await prisma.user.create({ data: { email: 'recover@qa.invalid', fullName: 'Recovery', role: 'OPERATOR', assignedEventId: event.id, passwordHash: await bcrypt.hash(password, 4) } });
        const tokenBefore = jwt.sign({ id: u.id }, 'isolated-evolution-test');
        const sendMail = vi.fn().mockResolvedValue({ accepted: [u.email] });
        vi.spyOn(CommunicationsService, 'createTransporter').mockReturnValue({ sendMail, close: vi.fn() } as any);
        const sent = await request(app).post('/api/v1/auth/recovery/request').send({ email: u.email });
        expect(sent.status).toBe(202);
        expect(sendMail).toHaveBeenCalledTimes(1);
        const text = sendMail.mock.calls[0][0].text as string;
        const link = text.match(/https:\/\/\S+/)![0];
        const token = new URLSearchParams(new URL(link).hash.slice(1)).get('token')!;
        const row = await prisma.passwordReset.findFirstOrThrow({ where: { userId: u.id } });
        expect(row.tokenHash).not.toBe(token);
        expect(row.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
        expect((await request(app).post('/api/v1/auth/recovery/validate').send({ token })).status).toBe(200);
        const newPass = 'NewFixturePassword!2026';
        const race = await Promise.all([1, 2].map(() => request(app).post('/api/v1/auth/recovery/confirm').send({ token, password: newPass })));
        expect(race.map(r => r.status).sort()).toEqual([200, 400]);
        expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer ' + tokenBefore)).status).toBe(401);
        expect(await bcrypt.compare(newPass, (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).passwordHash)).toBe(true);
        expect((await request(app).post('/api/v1/auth/recovery/validate').send({ token })).status).toBe(400);
        const expired = crypto.randomBytes(32).toString('base64url');
        await prisma.passwordReset.create({ data: { userId: u.id, tokenHash: crypto.createHash('sha256').update(expired).digest('hex'), expiresAt: new Date(Date.now() - 1000) } });
        expect((await request(app).post('/api/v1/auth/recovery/confirm').send({ token: expired, password: newPass })).status).toBe(400);
        const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: u.id } }));
        expect(audit).not.toContain(token);
        expect(audit).not.toContain(newPass);
    });
});
describe('manual reception incidents and tested SQLite restoration', () => {
    it('opens one incident for retries, restricts review, resolves atomically and never alters attendance or payments', async () => {
        const key = crypto.randomUUID(), payload = { requestKey: key, participantLabel: 'Persona QA', category: 'QR', description: 'Necesita asistencia administrativa' };
        const before = await prisma.registration.count({ where: { eventId: event.id, attended: true } });
        const sent = await Promise.all([1, 2].map(() => request(app).post('/api/v1/attendance/incidents').set(headers('OPERATOR')).send(payload)));
        expect(sent.every(r => r.status === 201)).toBe(true);
        expect(sent[0].body.data.id).toBe(sent[1].body.data.id);
        const id = sent[0].body.data.id;
        expect((await request(app).patch('/api/v1/attendance/incidents/' + id).set(headers('OPERATOR')).send({ status: 'RESOLVED', resolution: 'Revisado' })).status).toBe(403);
        expect((await request(app).post('/api/v1/attendance/incidents').set(headers('VIEWER')).send(payload)).status).toBe(403);
        const race = await Promise.all(['RESOLVED', 'CANCELLED'].map(status => request(app).patch('/api/v1/attendance/incidents/' + id).set(headers()).send({ status, resolution: 'Caso revisado' })));
        expect(race.map(r => r.status).sort()).toEqual([200, 409]);
        expect(await prisma.registration.count({ where: { eventId: event.id, attended: true } })).toBe(before);
        const otherRows = await request(app).get('/api/v1/attendance/incidents').set(headers('ADMIN', other.id));
        expect(otherRows.body.data).toEqual([]);
    });
    it('restores a consistent temporary SQLite snapshot and reconciles counts and payment totals', async () => {
        const { PrismaClient } = await import('@prisma/client');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const { mkdtempSync } = await import('node:fs');
        const folder = mkdtempSync(join(tmpdir(), 'eventgrid-restore-')), target = join(folder, 'restore.db').replaceAll('\\', '/');
        const before = { users: await prisma.user.count(), registrations: await prisma.registration.count(), requests: await prisma.courtesyRequest.count(), incidents: await prisma.receptionIncident.count(), ledger: await prisma.payment.aggregate({ _sum: { amount: true } }) };
        await prisma.$executeRawUnsafe("VACUUM INTO '" + target.replaceAll("'", "''") + "'");
        const restored = new PrismaClient({ datasourceUrl: 'file:' + target });
        try {
            const after = { users: await restored.user.count(), registrations: await restored.registration.count(), requests: await restored.courtesyRequest.count(), incidents: await restored.receptionIncident.count(), ledger: await restored.payment.aggregate({ _sum: { amount: true } }) };
            expect(after).toEqual(before);
        }
        finally {
            await restored.$disconnect();
        }
    });
    it('refuses a local-user database and upgrades a legacy SQLite snapshot without changing historical prices', async () => {
        const { PrismaClient } = await import('@prisma/client');
        expect(() => new PrismaClient({ datasourceUrl: 'file:./dev.db' })).toThrow('QA refused');
        const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path'), { fileURLToPath } = await import('node:url'), { execFileSync } = await import('node:child_process');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'eventgrid-upgrade-'));
        const db = path.join(directory, 'legacy.db');
        fs.writeFileSync(db, '');
        const root = fileURLToPath(new URL('../../', import.meta.url)), oldSchema = path.join(directory, 'legacy.prisma');
        fs.writeFileSync(oldSchema, execFileSync('git', ['show', '6688939:backend/prisma/schema.sqlite.prisma'], { cwd: root }));
        const url = 'file:' + db.replaceAll('\\', '/'), cli = fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url));
        execFileSync(process.execPath, [cli, 'db', 'push', '--schema', oldSchema, '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
        const before = new PrismaClient({ datasourceUrl: url });
        const now = Date.now(), uid = crypto.randomUUID(), eid = crypto.randomUUID(), tid = crypto.randomUUID(), pid = crypto.randomUUID(), rid = crypto.randomUUID();
        await before.$executeRawUnsafe('INSERT INTO users (id,email,passwordHash,fullName,role,updatedAt) VALUES (?,?,?,?,?,?)', uid, 'legacy@qa.invalid', 'unused', 'Legacy Admin', 'ADMIN', now);
        await before.$executeRawUnsafe('INSERT INTO events (id,slug,name,year,startDate,endDate,updatedAt) VALUES (?,?,?,?,?,?,?)', eid, 'legacy-upgrade', 'Legacy Event', 2026, now, now, now);
        await before.$executeRawUnsafe('INSERT INTO ticket_types (id,eventId,name,price,updatedAt) VALUES (?,?,?,?,?)', tid, eid, 'Unambiguous legacy label', 1750, now);
        await before.$executeRawUnsafe('INSERT INTO participants (id,firstName,lastName,fullName,email,updatedAt) VALUES (?,?,?,?,?,?)', pid, 'Legacy', 'Person', 'Legacy Person', 'legacy-person@qa.invalid', now);
        await before.$executeRawUnsafe('INSERT INTO registrations (id,eventId,participantId,registrationNumber,ticketPrice,amountPaid,totalAmount,balanceDue,updatedAt) VALUES (?,?,?,?,?,?,?,?,?)', rid, eid, pid, 'LEGACY', 1600, 900, 900, 700, now);
        await before.$disconnect();
        execFileSync(process.execPath, [cli, 'db', 'push', '--schema', fileURLToPath(new URL('../prisma/schema.sqlite.prisma', import.meta.url)), '--skip-generate'], { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
        const upgraded = new PrismaClient({ datasourceUrl: url });
        try {
            const { backfillDefaultTickets } = await import('../src/modules/events/defaultTicketMigration.js');
            await backfillDefaultTickets(upgraded);
            const row = await upgraded.registration.findUniqueOrThrow({ where: { id: rid } });
            expect(Number(row.ticketPrice)).toBe(1600);
            expect(Number(row.amountPaid)).toBe(900);
            expect(Number(row.balanceDue)).toBe(700);
            expect((await upgraded.event.findUniqueOrThrow({ where: { id: eid } })).defaultTicketTypeId).toBe(tid);
            expect((await upgraded.user.findUniqueOrThrow({ where: { id: uid } })).sessionVersion).toBe(0);
            expect(await upgraded.passwordReset.count()).toBe(0);
            expect(await upgraded.receptionIncident.count()).toBe(0);
        }
        finally {
            await upgraded.$disconnect();
        }
    }, 30000);
});
