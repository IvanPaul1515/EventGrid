import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

describe('QA Communications — Resend Confirmation, Mock Safeguard, Brevo Webhooks & Status Tracking', () => {
  let adminToken: string;
  let activeEventId: string;
  let generalTicketTypeId: string;
  let testRegId: string;
  let testParticipantId: string;
  let testParticipantEmail: string;
  let originalConfig: any = null;

  beforeAll(async () => {
    // 1. Login admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;

    // 2. Active event
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;

    // Mock en memoria del servicio para pruebas de reenvío sin tocar dev.db
    originalConfig = await prisma.emailConfig.findFirst({ where: { eventId: activeEventId } });
    vi.spyOn(CommunicationsService, 'getRawConfig').mockImplementation(async (eventId?: string | null) => {
      const targetId = eventId || activeEventId;
      const cfg = await prisma.emailConfig.findFirst({ where: { eventId: targetId } });
      if (!cfg) return null;
      return { ...cfg, isEnabled: true };
    });

    // 3. Ticket type
    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General QA Track',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;

    // 4. Create dedicated test participant and registration
    const unique = `SAFEGUARD_${Date.now()}`;
    testParticipantEmail = `${unique.toLowerCase()}@eventgrid.test`;
    const p = await prisma.participant.create({
      data: {
        documentId: `DOC-${unique.slice(-6)}`,
        firstName: 'Seguridad',
        lastName: 'Prueba Resend',
        fullName: 'Seguridad Prueba Resend',
        email: testParticipantEmail,
        phone: '809-555-0999',
        institution: 'QA Lab Security',
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
    vi.restoreAllMocks();
    if (testRegId) {
      await prisma.emailLog.deleteMany({ where: { registrationId: testRegId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { entityId: testRegId } }).catch(() => {});
      await prisma.registration.deleteMany({ where: { id: testRegId } }).catch(() => {});
    }
    if (testParticipantId) {
      await prisma.participant.deleteMany({ where: { id: testParticipantId } }).catch(() => {});
    }
    await prisma.emailConfig.updateMany({ data: { isEnabled: false } });
  });

  describe('1. Salvaguarda Absoluta contra Envíos Reales Externos (Mock Guard)', () => {
    it('Debe devolver un mock seguro sin llamadas SMTP de red cuando BLOCK_REAL_EMAIL=true o en entorno de test', async () => {
      const config = {
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        user: 'real_brevo_user@example.com',
        password: 'encrypted_pass',
      };

      const transporter = CommunicationsService.createTransporter(config);
      expect(transporter).toBeDefined();

      const sendRes = await transporter.sendMail({
        from: 'notificaciones@barcamp.org.do',
        to: testParticipantEmail,
        subject: 'Prueba Mock Guard',
        text: 'Contenido seguro de prueba',
      });

      expect(sendRes.response).toContain('SAFEGUARD');
      expect(sendRes.messageId).toContain('mock-safeguard');
      expect(sendRes.accepted).toContain(testParticipantEmail);
    });

    it('El endpoint /test de conexión SMTP debe bloquear la prueba si SMTP está desactivado', async () => {
      const res = await request(app)
        .post('/api/v1/communications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          recipientEmail: testParticipantEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('deshabilitado');
    });
  });

  describe('2. Control de Duplicados y Confirmación de Reenvío Individual', () => {
    it('Primer envío individual debe completarse y registrarse como ACCEPTED_BY_SMTP o SIMULATED', async () => {
      const res = await request(app)
        .post('/api/v1/communications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          registrationId: testRegId,
          templateCode: 'DIGITAL_TICKET',
          mode: 'REAL',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACCEPTED_BY_SMTP');

      const log = await prisma.emailLog.findUnique({
        where: { id: res.body.data.logId },
      });
      expect(log).not.toBeNull();
      expect(log?.recipientEmail).toBe(testParticipantEmail);
    });

    it('Segundo envío sin confirmación debe ser rechazado con DUPLICATE_COMMUNICATION_WARNING y detalles completos', async () => {
      const res = await request(app)
        .post('/api/v1/communications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          registrationId: testRegId,
          templateCode: 'DIGITAL_TICKET',
          mode: 'REAL',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Este correo ya fue enviado anteriormente');
      expect(res.body.details).toBeDefined();
      expect(res.body.details.code).toBe('DUPLICATE_COMMUNICATION_WARNING');
      expect(res.body.details.participantName).toBe('Seguridad Prueba Resend');
      expect(res.body.details.previousRecipient).toBe(testParticipantEmail);
      expect(res.body.details.templateCode).toBe('DIGITAL_TICKET');
      expect(res.body.details.previousStatus).toBe('ACCEPTED_BY_SMTP');
    });

    it('Reenvío con confirmación explícita (forceResend: true) debe autorizarse y registrar auditoría', async () => {
      const res = await request(app)
        .post('/api/v1/communications/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          registrationId: testRegId,
          templateCode: 'DIGITAL_TICKET',
          mode: 'REAL',
          forceResend: true,
          confirmedResend: true,
          resendReason: 'Solicitud explícita del participante en mesa de registro',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ACCEPTED_BY_SMTP');

      // Verificar registro en AuditLog
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'EMAIL_RESEND_AUTHORIZED',
          entityId: testRegId,
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.changes).toContain('Solicitud explícita del participante en mesa de registro');

      // Verificar que el ticket original y su número no cambiaron
      const currentReg = await prisma.registration.findUnique({
        where: { id: testRegId },
      });
      expect(currentReg?.registrationNumber).toContain('REG-');
    });
  });

  describe('3. Webhook Transaccional de Brevo (Actualización a Entregado o Rechazado)', () => {
    it('Debe actualizar el estado a DELIVERED al recibir evento delivered de Brevo', async () => {
      const preLog = await prisma.emailLog.create({
        data: {
          eventId: activeEventId,
          registrationId: testRegId,
          recipientEmail: testParticipantEmail,
          recipientName: 'Seguridad Prueba Resend',
          templateCode: 'DIGITAL_TICKET',
          subject: 'Entrada Digital Brevo Test',
          status: 'ACCEPTED_BY_SMTP',
        },
      });

      const webhookPayload = {
        event: 'delivered',
        email: testParticipantEmail,
        'message-id': `<brevo-${Date.now()}@smtp-relay.mailin.fr>`,
        date: '2026-10-22 07:15:00',
        ts_event: 1792653300,
      };

      const res = await request(app)
        .post('/api/v1/communications/webhooks/brevo')
        .set('x-brevo-webhook-secret', 'eventgrid_brevo_webhook_secret_2026')
        .send(webhookPayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const updatedLog = await prisma.emailLog.findUnique({
        where: { id: preLog.id },
      });
      expect(updatedLog?.status).toBe('DELIVERED');
    });

    it('Debe actualizar el estado a REJECTED o FAILED al recibir evento de rebote de Brevo', async () => {
      const bounceEmail = `bounce_${Date.now()}@eventgrid.test`;
      const preLog = await prisma.emailLog.create({
        data: {
          eventId: activeEventId,
          registrationId: testRegId,
          recipientEmail: bounceEmail,
          recipientName: 'Destinatario Rebote',
          templateCode: 'GENERAL_ANNOUNCEMENT',
          subject: 'Aviso Importante',
          status: 'ACCEPTED_BY_SMTP',
        },
      });

      const webhookPayload = {
        event: 'hard_bounce',
        email: bounceEmail,
        'message-id': `<brevo-bounce-${Date.now()}@smtp-relay.mailin.fr>`,
        reason: '550 5.1.1 User unknown',
      };

      const res = await request(app)
        .post('/api/v1/communications/webhooks/brevo')
        .set('x-brevo-webhook-secret', 'eventgrid_brevo_webhook_secret_2026')
        .send(webhookPayload);

      expect(res.status).toBe(200);

      const updatedLog = await prisma.emailLog.findUnique({
        where: { id: preLog.id },
      });
      expect(updatedLog?.status).toBe('REJECTED');
      expect(updatedLog?.errorMessage).toContain('hard_bounce');
      expect(updatedLog?.errorMessage).toContain('User unknown');
    });

    it('Debe ser idempotente y no fallar si se reenvía el mismo evento webhook', async () => {
      const webhookPayload = {
        event: 'delivered',
        email: testParticipantEmail,
        'message-id': '<repeated-msg-id@brevo.com>',
      };

      const res1 = await request(app)
        .post('/api/v1/communications/webhooks/brevo')
        .set('x-brevo-webhook-secret', 'eventgrid_brevo_webhook_secret_2026')
        .send(webhookPayload);
      expect(res1.status).toBe(200);

      const res2 = await request(app)
        .post('/api/v1/communications/webhooks/brevo')
        .set('x-brevo-webhook-secret', 'eventgrid_brevo_webhook_secret_2026')
        .send(webhookPayload);
      expect(res2.status).toBe(200);
    });
  });

  describe('4. Resumen Operativo SMTP (/smtp-summary)', () => {
    it('Debe retornar métricas operativas de envíos de hoy y último intento', async () => {
      const res = await request(app)
        .get('/api/v1/communications/smtp-summary')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ eventId: activeEventId });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();
      expect(typeof res.body.data.acceptedToday).toBe('number');
      expect(typeof res.body.data.deliveredToday).toBe('number');
      expect(typeof res.body.data.failedToday).toBe('number');
      expect(typeof res.body.data.pendingCount).toBe('number');
      expect(res.body.data.lastAttempt).toBeDefined();
    });
  });
});
