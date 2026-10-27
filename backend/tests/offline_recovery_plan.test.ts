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
import { RecoveryService } from '../src/modules/auth/recovery.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
let userId: string, eventId: string, provider: any;
beforeAll(async () => {
 eventId=(await prisma.event.create({data:{slug:'offline-recovery-fixture',name:'Synthetic',year:2026,startDate:new Date(),endDate:new Date()}})).id;
 userId=(await prisma.user.create({data:{email:'offline-recovery@example.invalid',fullName:'Synthetic Recovery',role:'OPERATOR',assignedEventId:eventId,passwordHash:'UNRECOVERABLE_DISABLED',sessionVersion:80}})).id;
 provider=vi.spyOn(CommunicationsService,'createTransporter').mockImplementation(()=>{throw Error('Mail forbidden');});
});
afterAll(async()=>{expect(provider).not.toHaveBeenCalled();provider.mockRestore();await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
// Simulates a privileged offline issuance after identity verification; no public
// creation endpoint is added, no token is printed or sent, and no SMTP is enabled.
async function issue(expiresAt=new Date(Date.now()+900000)) {
 const token=crypto.randomBytes(32).toString('base64url');
 await prisma.passwordReset.create({data:{userId,tokenHash:crypto.createHash('sha256').update(token).digest('hex'),expiresAt}});
 return token;
}
describe('reconstruction access recovery, temporary fixture only',()=>{
 it('uses a private one-use token without default passwords, email or changing the user identity and role',async()=>{
  await expect(AuthService.login('offline-recovery@example.invalid','any-default')).rejects.toThrow();
  const token=await issue();const record=await prisma.passwordReset.findFirstOrThrow({where:{userId,usedAt:null}});expect(record.tokenHash).not.toBe(token);
  const results=await Promise.allSettled([RecoveryService.confirm(token,'NewSynthetic-Password-2026!'),RecoveryService.confirm(token,'NewSynthetic-Password-2026!')]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  const user=await prisma.user.findUniqueOrThrow({where:{id:userId}});expect(user.role).toBe('OPERATOR');expect(user.assignedEventId).toBe(eventId);expect(user.sessionVersion).toBe(81);
  expect((await AuthService.login(user.email,'NewSynthetic-Password-2026!')).user.id).toBe(userId);
  await expect(RecoveryService.confirm(token,'AnotherSynthetic-Password!')).rejects.toThrow();
 });
 it('rejects expired tokens and never reactivates a disabled account',async()=>{
  const expired=await issue(new Date(0));await expect(RecoveryService.confirm(expired,'NewSynthetic-Password-2026!')).rejects.toThrow();
  const token=await issue();await prisma.user.update({where:{id:userId},data:{isActive:false}});
  await expect(RecoveryService.confirm(token,'NewSynthetic-Password-2026!')).rejects.toThrow();
  expect((await prisma.user.findUniqueOrThrow({where:{id:userId}})).isActive).toBe(false);
 });
});
