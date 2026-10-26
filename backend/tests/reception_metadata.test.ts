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


import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { ImportService } from '../src/modules/import/import.service.js';
import { seedBarcamp2026 } from '../prisma/barcamp2026.js';
import { CreateRegistrationSchema } from '../src/modules/participants/participants.dto.js';
let eventId: string, adminId: string, operatorId: string;
beforeAll(async()=>{
 eventId=(await seedBarcamp2026(prisma)).id;
 for(const role of ['ADMIN','OPERATOR']){const u=await prisma.user.create({data:{email:role+'@metadata.invalid',fullName:role,role,assignedEventId:eventId,passwordHash:'unused'}});if(role==='ADMIN')adminId=u.id;else operatorId=u.id;}
});
afterAll(async()=>{await prisma.$disconnect();if(fixture.previous===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=fixture.previous;});
const input=(suffix:string)=>CreateRegistrationSchema.parse({firstName:'Safe',lastName:'Metadata '+suffix,email:suffix+'@metadata.invalid',registrationNumber:'UNTRUSTED',amountPaid:0});
describe('numbering and import commercial provenance',()=>{
 it('generates numbers on the server, accepts missing institution, distinguishes creator from commercial owner',async()=>{
  const rows=await Promise.all(Array.from({length:5},(_,i)=>ParticipantsService.create(eventId,input('seq'+i),operatorId)));
  expect(new Set(rows.map(r=>r.registrationNumber)).size).toBe(5);
  expect(rows.every(r=>r.registrationNumber!=='UNTRUSTED'&&!r.attended&&r.createdByUserId===operatorId&&r.commercialUserId===operatorId&&r.originLabel==='Venta presencial')).toBe(true);
 });
 it('requires admin and reason for an exceptional internal-number correction and audits it',async()=>{
  const row=await ParticipantsService.create(eventId,input('renumber'),operatorId);
  await expect(ParticipantsService.update(eventId,row.id,{registrationNumber:'EXCEPTION'},operatorId)).rejects.toThrow();
  await expect(ParticipantsService.update(eventId,row.id,{registrationNumber:'EXCEPTION'},adminId)).rejects.toThrow();
  const changed=await ParticipantsService.update(eventId,row.id,{registrationNumber:'EXCEPTION',numberChangeReason:'Corrección aprobada'},adminId);
  expect(changed.registrationNumber).toBe('EXCEPTION');
  const audit=await prisma.auditLog.findFirst({where:{entityId:row.id,action:'UPDATE'}});expect(JSON.stringify(audit?.changes)).toContain('Corrección aprobada');
 });
 it('prevents operator commercial reassignment and audits administrative reassignment',async()=>{
  const row=await ParticipantsService.create(eventId,input('owner'),operatorId);
  await expect(ParticipantsService.update(eventId,row.id,{commercialUserId:adminId,responsibleChangeReason:'Motivo válido'},operatorId)).rejects.toThrow();
  const changed=await ParticipantsService.update(eventId,row.id,{commercialUserId:adminId,responsibleChangeReason:'Venta del administrador'},adminId);
  expect(changed.commercialUserId).toBe(adminId);expect(changed.createdByUserId).toBe(operatorId);
 });
 it('keeps Excel references, platform, buyer and seller separate from importer and internal number',async()=>{
  const mapping={name:'firstName',last:'lastName',email:'email',ref:'externalReference'};
  const rows=[{name:'Excel',last:'Safe',email:'excel@metadata.invalid',ref:'EXTERNAL-123'}];
  const defaults={externalPlatform:'Plataforma QA',salesResponsible:'Vendedor externo',buyerName:'Comprador QA'};
  const result=await ImportService.executeImport(eventId,adminId,'safe.xlsx',1,rows,mapping,'SKIP',defaults);
  expect(result.importedCount,JSON.stringify(result.errors)).toBe(1);
  const row=await prisma.registration.findFirstOrThrow({where:{externalReference:'EXTERNAL-123'}});
  expect(row.registrationNumber).not.toBe('EXTERNAL-123');expect(row.externalPlatform).toBe('Plataforma QA');expect(row.buyerName).toBe('Comprador QA');expect(row.createdByUserId).toBe(adminId);expect(row.commercialUserId).toBeNull();expect(row.salesResponsibleId).not.toBeNull();expect(row.attended).toBe(false);
  const duplicate=await ImportService.validateRows(eventId,[{...rows[0],email:'another@metadata.invalid'}],mapping,defaults);expect(duplicate.duplicateRows).toBe(1);
  const again=await ImportService.executeImport(eventId,adminId,'safe.xlsx',1,rows,mapping,'SKIP',defaults);expect(again.importedCount).toBe(0);
  const previousNumber=row.registrationNumber,previousPrice=Number(row.ticketPrice);
  await ImportService.executeImport(eventId,adminId,'safe.xlsx',1,[{...rows[0],paid:99999}],{...mapping,paid:'totalAmount'},'UPDATE',defaults);
  const unchanged=await prisma.registration.findUniqueOrThrow({where:{id:row.id}});expect(unchanged.registrationNumber).toBe(previousNumber);expect(Number(unchanged.ticketPrice)).toBe(previousPrice);expect(Number(unchanged.totalAmount)).toBe(Number(row.totalAmount));
 });
 it('finds repeated external references in the same file even when participant emails differ',async()=>{
  const validation=await ImportService.validateRows(eventId,[{name:'First',email:'first@metadata.invalid',ref:'SAME'},{name:'Second',email:'second@metadata.invalid',ref:'SAME'}],{name:'firstName',email:'email',ref:'externalReference'},{externalPlatform:'QA'});
  expect(validation.rowsSummary[1].status).toBe('ERROR');
 });
});
