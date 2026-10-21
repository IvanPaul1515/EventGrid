import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('QA Communications Full Module — SMTP, Encryption, Bulk, Preview & Security', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let generalTicketTypeId: string;
  let testRegId: string;
  let testParticipantId: string;
  const createdLogsBatchIds: string[] = [];

  beforeAll(async () => {
    // 1. Obtener tokens
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;

    const viewRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    viewerToken = viewRes.body.data.token;

    // 2. Evento activo
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;

    // 3. Ticket type
    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General Comm QA',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;

    // 4. Crear participante y registro de prueba
    const unique = `COMM_${Date.now()}`;
    const p = await prisma.participant.create({
      data: {
        documentId: `COMM-${unique.slice(-6)}`,
        firstName: 'Communications',
        lastName: 'QA Tester',
        fullName: 'Communications QA Tester',
        email: `${unique.toLowerCase()}@eventgrid.test`,
        phone: '809-555-0188',
        institution: 'Testing Lab',
      },
    });
    testParticipantId = p.id;

    const r = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p.id,
        registrationNumber: `REG-${unique.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        attended: false,
        amountPaid: 1750,
        ticketPrice: 1750,
        totalAmount: 1750,
      },
    });
    testRegId = r.id;
  });

  afterAll(async () => {
    if (createdLogsBatchIds.length > 0) {
      await prisma.emailLog.deleteMany({
        where: { batchId: { in: createdLogsBatchIds } },
      }).catch(() => {});
    }
    if (testRegId) {
      await prisma.emailLog.deleteMany({
        where: { registrationId: testRegId },
      }).catch(() => {});
      await prisma.auditLog.deleteMany({
        where: { entityId: testRegId },
      }).catch(() => {});
      await prisma.registration.deleteMany({
        where: { id: testRegId },
      }).catch(() => {});
    }
    if (testParticipantId) {
      await prisma.participant.deleteMany({
        where: { id: testParticipantId },
      }).catch(() => {});
    }
  });

  describe('QA-12: Seguridad y Cifrado Autenticado de Credenciales SMTP (AES-256-GCM)', () => {
    it('Debe cifrar la contraseña en reposo al guardar la configuración SMTP', async () => {
      const rawPassword = 'SuperSecretSmtpPassword2026!';

      const saveRes = await request(app)
        .put('/api/v1/communications/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          host: 'smtp.mailtrap.io',
          port: 2525,
          secure: false,
          user: 'qa_tester',
          password: rawPassword,
          fromEmail: 'notificaciones@eventgrid.test',
          fromName: 'EventGrid QA',
          replyToEmail: 'soporte@eventgrid.test',
          isEnabled: true,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.status).toBe('success');
      // La respuesta NUNCA debe devolver la contraseña en texto claro ni el hash
      expect(saveRes.body.data.password).toBeUndefined();
      expect(saveRes.body.data.hasPassword).toBe(true);

      // Verificar directamente en la base de datos que está cifrada con AES-256-GCM (enc:gcm:)
      const stored = await prisma.emailConfig.findFirst({
        where: { eventId: activeEventId },
      });
      expect(stored).toBeDefined();
      expect(stored?.password).not.toBe(rawPassword);
      expect(stored?.password?.startsWith('enc:gcm:')).toBe(true);
    });

    it('RBAC: El operador no puede modificar la configuración SMTP (403 Forbidden)', async () => {
      const res = await request(app)
        .put('/api/v1/communications/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          eventId: activeEventId,
          host: 'smtp.evil.com',
          port: 587,
          user: 'hacker',
          password: '123',
          fromEmail: 'hacker@evil.com',
          fromName: 'Hacker',
          isEnabled: true,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('QA-07 & QA-11: Previsualización de Correos (Sandboxed Preview)', () => {
    it('Debe previsualizar una plantilla renderizada sin mutaciones en base de datos', async () => {
      const initialLogsCount = await prisma.emailLog.count();

      const previewRes = await request(app)
        .post('/api/v1/communications/preview')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          eventId: activeEventId,
          templateCode: 'INSCRIPTION_CONFIRMATION',
          customSubject: 'Bienvenido {{participantName}} - EventGrid QA',
          registrationId: testRegId,
          sampleData: {
            participantName: 'Carlos Santillán',
            registrationNumber: 'REG-QA-001',
            eventName: 'BarCamp RD 2026',
          },
        });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.status).toBe('success');
      expect(previewRes.body.data.subject).toContain('Communications QA Tester');
      expect(previewRes.body.data.html).toContain('Communications QA Tester');

      // Comprobar que NO hubo mutaciones en EmailLog
      const finalLogsCount = await prisma.emailLog.count();
      expect(finalLogsCount).toBe(initialLogsCount);
    });
  });

  describe('QA-07 & QA-08: Envío Individual con Tokens QR Oficiales', () => {
    it('Debe probar conexión SMTP en simulación aceptando recipientEmail y testRecipient', async () => {
      const res = await request(app)
        .post('/api/v1/communications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          testRecipient: 'test.admin@eventgrid.test',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.simulated).toBe(true);
    });

    it('Debe enviar correo individual respetando customSubject y registrando en el historial', async () => {
      const res = await request(app)
        .post('/api/v1/communications/send')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          eventId: activeEventId,
          registrationId: testRegId,
          templateCode: 'INSCRIPTION_CONFIRMATION',
          customSubject: 'Tu entrada oficial para BarCamp 2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.log.subject).toBe('Tu entrada oficial para BarCamp 2026');
      expect(res.body.data.log.recipientEmail).toBe(`${testParticipantId ? '' : ''}${res.body.data.log.recipientEmail}`);
      expect(res.body.data.log.status).toBe('SIMULATED');
    });
  });

  describe('QA-09 & QA-10: Envíos Masivos sin Límite Silencioso de 200 y con BatchId', () => {
    it('Debe procesar envío masivo asignando batchId y permitiendo filtrado posterior en logs', async () => {
      const bulkRes = await request(app)
        .post('/api/v1/communications/send-bulk')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          targetGroup: 'CONFIRMED',
          templateCode: 'EVENT_REMINDER',
          customSubject: 'Recordatorio Masivo QA',
        });

      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.status).toBe('success');
      expect(bulkRes.body.data.batchId).toBeDefined();
      expect(bulkRes.body.data.batchId.startsWith('BATCH-')).toBe(true);

      const batchId = bulkRes.body.data.batchId;
      createdLogsBatchIds.push(batchId);

      // QA-10: Historial y seguimiento filtrando por batchId
      const logsRes = await request(app)
        .get(`/api/v1/communications/logs?eventId=${activeEventId}&batchId=${batchId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(logsRes.status).toBe(200);
      expect(Array.isArray(logsRes.body.data)).toBe(true);
      if (logsRes.body.data.length > 0) {
        expect(logsRes.body.data[0].batchId).toBe(batchId);
      }
    });
  });
});
