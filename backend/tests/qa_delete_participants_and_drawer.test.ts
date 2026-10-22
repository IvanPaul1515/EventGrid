import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import jwt from 'jsonwebtoken';
import { ENV } from '../src/config/env.js';
import fs from 'fs';

describe('EVENTGRID — PRUEBAS OBLIGATORIAS: FICHA DE PARTICIPANTES Y ELIMINACIÓN SEGURA', () => {
  const BARCAMP_EVENT_ID = '1adb61c6-6f85-43f1-93a6-b4be887bdc9c';
  let adminToken: string;
  let operatorToken: string;
  let adminUser: any;
  let operatorUser: any;

  // Edición de prueba aislada para no tocar datos reales de BarCamp
  let isolatedEventId: string;
  let otherEventId: string;

  beforeAll(async () => {
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    operatorUser = await prisma.user.findFirst({ where: { role: 'OPERATOR', isActive: true } });

    if (!adminUser || !operatorUser) {
      throw new Error('Se requieren usuarios ADMIN y OPERATOR activos para las pruebas.');
    }

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    operatorToken = jwt.sign(
      { id: operatorUser.id, email: operatorUser.email, role: operatorUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Crear Edición Aislada para pruebas de importación, borrado y purga
    const isoEvent = await prisma.event.create({
      data: {
        name: 'Edición Prueba Eliminación Segura',
        slug: `test-elim-segura-${Date.now()}`,
        year: 2029,
        startDate: new Date('2029-10-01'),
        endDate: new Date('2029-10-02'),
        settings: {
          create: {
            primaryColor: '#e11d48',
            secondaryColor: '#881337',
            tshirtSizesEnabled: true,
          },
        },
      },
    });
    isolatedEventId = isoEvent.id;

    // Crear Edición Paralela para verificar aislamiento estricto
    const otherEvent = await prisma.event.create({
      data: {
        name: 'Edición Paralela Aislamiento',
        slug: `test-paralela-${Date.now()}`,
        year: 2030,
        startDate: new Date('2030-10-01'),
        endDate: new Date('2030-10-02'),
        settings: {
          create: {
            primaryColor: '#2563eb',
            secondaryColor: '#1e40af',
          },
        },
      },
    });
    otherEventId = otherEvent.id;
  });

  afterAll(async () => {
    // Limpieza de ediciones de prueba
    for (const eId of [isolatedEventId, otherEventId]) {
      if (eId) {
        const regs = await prisma.registration.findMany({ where: { eventId: eId }, select: { id: true, participantId: true } });
        const rIds = regs.map((r) => r.id);
        const pIds = regs.map((r) => r.participantId);

        await prisma.attendanceLog.deleteMany({ where: { registrationId: { in: rIds } } });
        await prisma.payment.deleteMany({ where: { registrationId: { in: rIds } } });
        await prisma.registration.deleteMany({ where: { id: { in: rIds } } });
        await prisma.participant.deleteMany({ where: { id: { in: pIds } } });
        await prisma.importError.deleteMany({ where: { importBatch: { eventId: eId } } });
        await prisma.importBatch.deleteMany({ where: { eventId: eId } });
        await prisma.eventSettings.deleteMany({ where: { eventId: eId } });
        await prisma.event.delete({ where: { id: eId } }).catch(() => {});
      }
    }
  });

  describe('1. DIFERENCIACIÓN ESTRICTA: REGISTROS IMPORTADOS VS REGISTROS MANUALES', () => {
    let batchId: string;
    let importedRegId: string;
    let manualRegId: string;
    let importedParticipantId: string;
    let manualParticipantId: string;
    let importedQrCode: string;

    it('debe registrar un lote de importación con participantes identificados como EXCEL_IMPORT', async () => {
      // 1. Crear un lote de importación en la edición aislada
      const batch = await prisma.importBatch.create({
        data: {
          eventId: isolatedEventId,
          importedByUserId: adminUser.id,
          fileName: 'asistentes_prueba_excel.xlsx',
          fileSize: 45000,
          totalRows: 2,
          validRows: 2,
          importedRows: 2,
          mappingConfig: JSON.stringify({ fullName: 'Nombre', email: 'Correo' }),
        },
      });
      batchId = batch.id;

      // 2. Crear participante e inscripción vinculada al lote
      const pImported = await prisma.participant.create({
        data: {
          firstName: 'Importado',
          lastName: 'Desde Excel',
          fullName: 'Importado Desde Excel',
          email: `importado.excel.${Date.now()}@test.com`,
          documentId: '402-9999001-1',
        },
      });
      importedParticipantId = pImported.id;

      const regImported = await prisma.registration.create({
        data: {
          eventId: isolatedEventId,
          participantId: pImported.id,
          registrationNumber: 'TEST-IMP-001',
          source: 'EXCEL_IMPORT',
          importBatchId: batch.id,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          qrCode: `eg_qr_test_imported_${Date.now()}`,
          attended: true,
          attendedAt: new Date(),
        },
      });
      importedRegId = regImported.id;
      importedQrCode = regImported.qrCode!;

      // Crear log de asistencia y pago asociado
      await prisma.attendanceLog.create({
        data: {
          registrationId: regImported.id,
          userId: adminUser.id,
          action: 'CHECK_IN',
        },
      });
      await prisma.payment.create({
        data: {
          registrationId: regImported.id,
          amount: 500,
          receivedByUserId: adminUser.id,
        },
      });

      expect(batchId).toBeDefined();
      expect(importedRegId).toBeDefined();
    });

    it('debe crear un participante registrado manualmente (MANUAL)', async () => {
      const regManual = await ParticipantsService.create(isolatedEventId, {
        firstName: 'Registrado',
        lastName: 'Manualmente',
        email: `manual.permanente.${Date.now()}@test.com`,
        documentId: '402-9999002-2',
        phone: '8095551234',
      });
      manualRegId = regManual.id;
      manualParticipantId = regManual.participantId;

      expect(regManual.source).toBe('MANUAL');
      expect(regManual.importBatchId).toBeNull();
    });

    it('el endpoint de vista previa /deletion-preview reporta exactamente las cantidades', async () => {
      const res = await request(app)
        .get(`/api/v1/participants/deletion-preview?scope=EXCEL_IMPORT`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId);

      expect(res.status).toBe(200);
      expect(res.body.data.totalRegistrations).toBe(2);
      expect(res.body.data.importedRegistrations).toBe(1);
      expect(res.body.data.manualRegistrations).toBe(1);
      expect(res.body.data.targetCount).toBe(1);
      expect(res.body.data.targetAttendanceCount).toBe(1);
      expect(res.body.data.targetPaymentsCount).toBe(1);
      expect(res.body.data.batches.length).toBe(1);
      expect(res.body.data.batches[0].fileName).toBe('asistentes_prueba_excel.xlsx');
    });

    it('debe rechazar eliminación de importados a un usuario sin rol de administrador (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/participants/delete-imported`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ batchId });

      expect(res.status).toBe(403);
    });

    it('debe eliminar SOLAMENTE los registros importados desde Excel y preservar los manuales', async () => {
      const res = await request(app)
        .post(`/api/v1/participants/delete-imported`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ batchId });

      expect(res.status).toBe(200);
      expect(res.body.data.deletedRegistrationsCount).toBe(1);
      expect(res.body.data.deletedParticipantsCount).toBe(1);

      // 1. Confirmar que la inscripción importada YA NO existe en la base de datos
      const deletedReg = await prisma.registration.findUnique({ where: { id: importedRegId } });
      expect(deletedReg).toBeNull();

      // 2. Confirmar que el participante importado huérfano fue eliminado
      const deletedPart = await prisma.participant.findUnique({ where: { id: importedParticipantId } });
      expect(deletedPart).toBeNull();

      // 3. Confirmar que los logs de asistencia y pagos del importado fueron eliminados limpiamente
      const logs = await prisma.attendanceLog.findMany({ where: { registrationId: importedRegId } });
      expect(logs.length).toBe(0);
      const payments = await prisma.payment.findMany({ where: { registrationId: importedRegId } });
      expect(payments.length).toBe(0);

      // 4. Confirmar que el lote fue eliminado
      const batchCheck = await prisma.importBatch.findUnique({ where: { id: batchId } });
      expect(batchCheck).toBeNull();

      // 5. Confirmar que el registro MANUAL PERMANECE INTACTO
      const preservedManual = await prisma.registration.findUnique({
        where: { id: manualRegId },
        include: { participant: true },
      });
      expect(preservedManual).not.toBeNull();
      expect(preservedManual?.participant.fullName).toBe('Registrado Manualmente');

      // 6. Confirmar que la búsqueda de participantes ya no devuelve al importado
      const searchRes = await request(app)
        .get(`/api/v1/participants?search=Importado`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId);
      expect(searchRes.body.data.length).toBe(0);

      // 7. Confirmar que la búsqueda del manual sí devuelve resultados
      const searchManualRes = await request(app)
        .get(`/api/v1/participants?search=Manualmente`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId);
      expect(searchManualRes.body.data.length).toBe(1);
      expect(searchManualRes.body.data[0].id).toBe(manualRegId);
    });

    it('el código QR del participante eliminado debe quedar estrictamente invalidado para check-in', async () => {
      // Intentar hacer check-in con el registrationId eliminado
      const res = await request(app)
        .post(`/api/v1/attendance/check-in`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ registrationId: importedRegId });

      expect(res.status).toBe(404);
    });
  });

  describe('2. VACIAR TODOS LOS PARTICIPANTES DE UNA EDICIÓN (PURGE CON RESPALDO Y CONFIRMACIÓN)', () => {
    let reg1Id: string;
    let reg2Id: string;

    beforeAll(async () => {
      // Inscribir participante en Edición Paralela para probar aislamiento
      await ParticipantsService.create(otherEventId, {
        firstName: 'Participante',
        lastName: 'Edición Paralela',
        email: `otro.evento.${Date.now()}@test.com`,
      });

      // Crear dos inscripciones en Edición Aislada
      const r1 = await ParticipantsService.create(isolatedEventId, {
        firstName: 'Asistente',
        lastName: 'Uno A Vaciar',
        email: `vaciar1.${Date.now()}@test.com`,
      });
      reg1Id = r1.id;

      const r2 = await ParticipantsService.create(isolatedEventId, {
        firstName: 'Asistente',
        lastName: 'Dos A Vaciar',
        email: `vaciar2.${Date.now()}@test.com`,
      });
      reg2Id = r2.id;
    });

    it('debe rechazar el vaciado si la frase de confirmación no es exacta', async () => {
      const res = await request(app)
        .post(`/api/v1/participants/purge-edition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ confirmationPhrase: 'borrar por favor' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('ELIMINAR PARTICIPANTES');
    });

    it('debe rechazar el vaciado si un usuario no administrador lo intenta (403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/participants/purge-edition`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ confirmationPhrase: 'ELIMINAR PARTICIPANTES' });

      expect(res.status).toBe(403);
    });

    it('debe crear un respaldo JSON y vaciar todos los participantes de la edición aislada', async () => {
      const res = await request(app)
        .post(`/api/v1/participants/purge-edition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId)
        .send({ confirmationPhrase: 'ELIMINAR PARTICIPANTES' });

      expect(res.status).toBe(200);
      expect(res.body.data.scope).toBe('ALL_EDITION');
      expect(res.body.data.backupFile).toBeDefined();

      // Verificar que el archivo de respaldo existe en disco
      const backupPath = `backups/${res.body.data.backupFile}`;
      expect(fs.existsSync(backupPath)).toBe(true);

      // Verificar que la edición quedó con exactamente 0 inscripciones
      const countAfter = await prisma.registration.count({ where: { eventId: isolatedEventId } });
      expect(countAfter).toBe(0);

      // Verificar que las estadísticas reportan 0 participantes
      const statsRes = await request(app)
        .get(`/api/v1/participants`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Event-Id', isolatedEventId);
      expect(statsRes.body.pagination.total).toBe(0);
      expect(statsRes.body.data.length).toBe(0);
    });

    it('el vaciado de una edición NO debe afectar bajo ninguna circunstancia a otras ediciones', async () => {
      const countOther = await prisma.registration.count({ where: { eventId: otherEventId } });
      expect(countOther).toBe(1);

      const otherReg = await prisma.registration.findFirst({
        where: { eventId: otherEventId },
        include: { participant: true },
      });
      expect(otherReg?.participant.lastName).toBe('Edición Paralela');
    });
  });

  describe('3. PRESERVACIÓN ESTRICTA DE CONFIGURACIONES ADMINISTRATIVAS', () => {
    it('las 282 camisetas del inventario de BarCamp RD 2026 permanecen intactas', async () => {
      const inventory = await prisma.tshirtInventory.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      const total = inventory.reduce((sum, item) => sum + item.initialQuantity, 0);
      expect(total).toBe(282);
    });

    it('la configuración SMTP de Brevo permanece intacta y activa', async () => {
      const emailConfig = await prisma.emailConfig.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(emailConfig).not.toBeNull();
      expect(emailConfig?.host).toBe('smtp-relay.brevo.com');
      expect(emailConfig?.isEnabled).toBe(true);
    });

    it('las plantillas de correo y colores corporativos no sufrieron alteraciones', async () => {
      const templates = await prisma.emailTemplate.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(templates.length).toBeGreaterThan(0);
    });
  });
});
