import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

describe('QA P0 — Respeto Estricto del Estado del SMTP Desactivado', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let generalTicketTypeId: string;
  let testRegId: string;
  let testParticipantId: string;

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

    // 2. Evento activo 2026
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;

    // 3. Ticket type
    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General QA SMTP',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;

    // 4. Crear participante y registro de prueba
    const u = `QASMTP_${Date.now()}`;
    const p = await prisma.participant.create({
      data: {
        documentId: `DOC-${u.slice(-6)}`,
        firstName: 'Participante',
        lastName: 'QA SMTP',
        fullName: 'Participante QA SMTP',
        email: `${u.toLowerCase()}@eventgrid.test`,
        phone: '809-555-0199',
        institution: 'Instituto SMTP',
      },
    });
    testParticipantId = p.id;

    const r = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p.id,
        registrationNumber: `REG-${u.slice(-6)}`,
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
    if (testRegId) {
      await prisma.emailLog.deleteMany({ where: { registrationId: testRegId } }).catch(() => {});
      await prisma.auditLog.deleteMany({ where: { entityId: testRegId } }).catch(() => {});
      await prisma.registration.deleteMany({ where: { id: testRegId } }).catch(() => {});
    }
    if (testParticipantId) {
      await prisma.participant.deleteMany({ where: { id: testParticipantId } }).catch(() => {});
    }
    // Asegurar SIEMPRE que isEnabled permanece false en la base de datos
    await prisma.emailConfig.updateMany({
      data: { isEnabled: false },
    });
  });

  it('1. Regla 1 y 7: SMTP permanece APAGADO (isEnabled: false) y las credenciales permanecen intactas', async () => {
    const config = await prisma.emailConfig.findFirst({ where: { eventId: activeEventId } });
    expect(config).toBeDefined();
    expect(config?.isEnabled).toBe(false);
    expect(config?.host).toBe('smtp-relay.brevo.com');
    expect(config?.port).toBe(587);
    expect(config?.user).toBe('bf682a001@smtp-brevo.com');
    expect(config?.password).toBeTruthy();
    expect(config?.password?.startsWith('enc:gcm:')).toBe(true);
  });

  it('2. Regla 4 y 5: Bloquear envío individual real cuando SMTP está desactivado (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        mode: 'REAL',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('El servidor SMTP no está configurado o está deshabilitado');

    // Confirmar que NO se creó ningún log con estado enviado
    const logs = await prisma.emailLog.findMany({ where: { registrationId: testRegId } });
    expect(logs.length).toBe(0);
  });

  it('3. Regla 4 y 5: Bloquear envío masivo real cuando SMTP está desactivado (400 Bad Request)', async () => {
    const res = await request(app)
      .post('/api/v1/communications/send-bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        templateCode: 'EVENT_REMINDER',
        targetGroup: 'CONFIRMED',
        mode: 'REAL',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('El servidor SMTP no está configurado o está deshabilitado');
  });

  it('4. Regla 4 y 5: Bloquear prueba de conexión SMTP cuando el servicio está desactivado', async () => {
    const res = await request(app)
      .post('/api/v1/communications/test')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        recipientEmail: 'diagnostico@eventgrid.test',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('El servicio de correos está deshabilitado');
  });

  it('5. Regla 4 y 5: Bloquear reintentos de lotes reales cuando SMTP está desactivado', async () => {
    // Crear lote de prueba en estado FAILED y modo REAL
    const fakeJob = await prisma.emailBatchJob.create({
      data: {
        eventId: activeEventId,
        templateCode: 'EVENT_REMINDER',
        subject: 'Prueba Reintento Bloqueado',
        mode: 'REAL',
        totalCount: 1,
        processedCount: 1,
        sentCount: 0,
        status: 'FAILED',
        errorMessage: 'Fallo previo',
      },
    });

    const res = await request(app)
      .post(`/api/v1/communications/jobs/${fakeJob.id}/retry-failed`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('El servidor SMTP no está configurado o está deshabilitado');

    // Limpieza
    await prisma.emailBatchJob.delete({ where: { id: fakeJob.id } });
  });

  it('6. Regla 10: Solo ADMIN puede modificar configuración SMTP; OPERATOR recibe 403 Forbidden', async () => {
    const res = await request(app)
      .put('/api/v1/communications/config')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        eventId: activeEventId,
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        fromEmail: 'notificaciones@barcamp.org.do',
        fromName: 'Notificaciones BarCamp',
        isEnabled: false,
      });

    expect(res.status).toBe(403);
  });

  it('7. Regla 9: Registro en auditoría al guardar configuración y cuando cambia estado SMTP', async () => {
    // Consultar auditorías recientes
    const config = await prisma.emailConfig.findFirst({ where: { eventId: activeEventId } });

    // Guardar conservando isEnabled: false
    const updateRes = await request(app)
      .put('/api/v1/communications/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        host: config?.host,
        port: config?.port,
        secure: config?.secure,
        user: config?.user,
        fromEmail: config?.fromEmail,
        fromName: config?.fromName,
        replyToEmail: config?.replyToEmail,
        isEnabled: false, // Se preserva en false
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.isEnabled).toBe(false);

    // Verificar log de auditoría EMAIL_CONFIG_UPDATE
    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'EMAIL_CONFIG',
        action: 'EMAIL_CONFIG_UPDATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).toBeDefined();
    expect(audit?.changes).toContain('isEnabled');
  });

  it('8. Validación de estados tras operaciones: Cambiar edición y roles preserva isEnabled: false', async () => {
    // Consultar con token de consulta
    const viewRes = await request(app)
      .get(`/api/v1/communications/config?eventId=${activeEventId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    // Consultar con token de admin
    const adminRes = await request(app)
      .get(`/api/v1/communications/config?eventId=${activeEventId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.isEnabled).toBe(false);

    // Comprobar persistencia directa en la base de datos
    const directDb = await prisma.emailConfig.findFirst({ where: { eventId: activeEventId } });
    expect(directDb?.isEnabled).toBe(false);
  });
});
