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
vi.mock('../src/config/env.js', () => ({ ENV: { DATABASE_URL: fixture.url, JWT_SECRET: 'isolated-courtesy-test', JWT_EXPIRES_IN: '1h', NODE_ENV: 'test', CORS_ORIGIN: [], API_PREFIX: '/api/v1' } }));
vi.mock('../src/config/db.js', async () => {
  const { PrismaClient } = await import('@prisma/client');
  return { prisma: new PrismaClient({ datasourceUrl: fixture.url }), checkDatabaseConnection: async () => true };
});
import { prisma } from '../src/config/db.js';
import { app } from '../src/app.js';

import { AuthService } from '../src/modules/auth/auth.service.js';
import { DeviceSessionService } from '../src/modules/auth/device-session.service.js';
let userId: string;
const password = 'Only-Mocked-QA-Password-2026!';
const get = (token: string) => request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer ' + token);
beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: 'device@example.invalid', fullName: 'Device QA', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 4) } });
  userId = user.id;
});
afterAll(async () => { await prisma.$disconnect(); if (fixture.previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = fixture.previous; });
describe('independent authenticated device sessions', () => {
  it('creates distinct sessions even when two logins happen in the same second', async () => {
    const [pc, phone] = await Promise.all([AuthService.login('device@example.invalid', password), AuthService.login('device@example.invalid', password)]);
    expect(pc.token).not.toBe(phone.token);
    expect((await get(pc.token)).status).toBe(200);
    expect((await get(phone.token)).status).toBe(200);
    const logout = await request(app).post('/api/v1/auth/logout').set('Authorization', 'Bearer ' + phone.token);
    expect(logout.status).toBe(200);
    expect((await get(phone.token)).status).toBe(401);
    expect((await get(pc.token)).status).toBe(200);
  });
  it('invalidates every device after a password change', async () => {
    const pc = await AuthService.login('device@example.invalid', password);
    const phone = await AuthService.login('device@example.invalid', password);
    await AuthService.changePassword(userId, password, password);
    expect((await get(pc.token)).status).toBe(401);
    expect((await get(phone.token)).status).toBe(401);
  });
  it('rejects disabled accounts, expired sessions and unknown signed session IDs', async () => {
    const login = await AuthService.login('device@example.invalid', password);
    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    expect((await get(login.token)).status).toBe(401);
    await prisma.user.update({ where: { id: userId }, data: { isActive: true } });
    const payload = jwt.decode(login.token) as jwt.JwtPayload;
    await prisma.authSession.update({ where: { id: payload.sid }, data: { expiresAt: new Date(0) } });
    expect((await get(login.token)).status).toBe(401);
    const version = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion;
    const forged = jwt.sign({ id: userId, sid: crypto.randomUUID(), sessionVersion: version }, 'isolated-courtesy-test');
    expect((await get(forged)).status).toBe(401);
  });
  it('adopts legacy tokens once without storing bearer credentials or resurrecting logout', async () => {
    const version = (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).sessionVersion;
    const token = jwt.sign({ id: userId, sessionVersion: version }, 'isolated-courtesy-test', { expiresIn: '10m' });
    expect((await get(token)).status).toBe(200);
    const sid = 'legacy-' + crypto.createHash('sha256').update(token).digest('hex');
    const stored = await prisma.authSession.findUniqueOrThrow({ where: { id: sid } });
    expect(JSON.stringify(stored)).not.toContain(token);
    await DeviceSessionService.revoke(sid, userId);
    expect((await get(token)).status).toBe(401);
  });
  it('lists and revokes only sessions owned by the authenticated account', async () => {
    const pc = await AuthService.login('device@example.invalid', password), phone = await AuthService.login('device@example.invalid', password);
    const phoneId = (jwt.decode(phone.token) as jwt.JwtPayload).sid;
    const other = await prisma.user.create({data:{email:'other-device@example.invalid',fullName:'Other',role:'ADMIN',passwordHash:await bcrypt.hash(password,4)}});
    const foreign = await AuthService.login(other.email,password), foreignId = (jwt.decode(foreign.token) as jwt.JwtPayload).sid;
    const sessions = await request(app).get('/api/v1/auth/sessions').set('Authorization','Bearer '+pc.token);
    expect(sessions.status).toBe(200);expect(sessions.body.data.some((s:any)=>s.id===phoneId)).toBe(true);expect(sessions.body.data.some((s:any)=>s.id===foreignId)).toBe(false);
    await request(app).delete('/api/v1/auth/sessions/'+foreignId).set('Authorization','Bearer '+pc.token);
    expect((await get(foreign.token)).status).toBe(200);
    expect((await request(app).delete('/api/v1/auth/sessions/'+phoneId).set('Authorization','Bearer '+pc.token)).status).toBe(204);
    expect((await get(phone.token)).status).toBe(401);expect((await get(pc.token)).status).toBe(200);
  });
  it('closes only the SSE connection belonging to the revoked device', () => {
    const a = { write: vi.fn(), end: vi.fn() } as any;
    const b = { write: vi.fn(), end: vi.fn() } as any;
    RealtimeService.addClient('qa', a, { userId, role: 'ADMIN', sessionId: 'pc' });
    RealtimeService.addClient('qa', b, { userId, role: 'ADMIN', sessionId: 'phone' });
    RealtimeService.notifySession('phone');
    expect(b.end).toHaveBeenCalledOnce(); expect(a.end).not.toHaveBeenCalled();
    RealtimeService.removeClient('qa', a);
  });
});
