import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('EventGrid Alpha 1.2 — Validación de Modo Demo, Códigos QR y Sistema de Correos', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let realRegistrationId: string;
  let demoRegistrationId: string;
  let realQrToken: string;

  beforeAll(async () => {
    // 1. Iniciar sesión con los 3 usuarios del sistema
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;

    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    viewerToken = viewerRes.body.data.token;

    // 2. Obtener edición activa
    const eventsRes = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`);
    const active = eventsRes.body.data.find((e: any) => e.isDefault) || eventsRes.body.data[0];
    activeEventId = active.id;

    // 3. Crear una inscripción real garantizada para pruebas
    const realPart = await prisma.participant.create({
      data: {
        firstName: 'Elena',
        lastName: 'Montes Test Real',
        fullName: 'Elena Montes Test Real',
        email: `elena.real.${Date.now()}@eventgrid.test`,
        isDemo: false,
      },
    });

    const realReg = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: realPart.id,
        registrationNumber: `TEST-REAL-${Date.now().toString().slice(-4)}`,
        isDemo: false,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        ticketPrice: 2000,
        amountPaid: 2000,
        balanceDue: 0,
        totalAmount: 2000,
        qrCode: `eg_qr_real_${Date.now()}`,
        qrGeneratedAt: new Date(),
      },
    });
    realRegistrationId = realReg.id;
    realQrToken = realReg.qrCode!;
  });

  afterAll(async () => {
    if (realRegistrationId) {
      await prisma.emailLog.deleteMany({ where: { registrationId: realRegistrationId } });
      await prisma.registration.deleteMany({ where: { id: realRegistrationId } });
    }
    // Limpiar cualquier dato generado con marca de prueba
    await prisma.participant.deleteMany({
      where: { email: { contains: 'eventgrid.test' } },
    });
  });

  describe('1. Modo Demostración Administrable', () => {
    it('Debe consultar el estado del modo demo y conteo de registros', async () => {
      const res = await request(app)
        .get(`/api/v1/demo/status?eventId=${activeEventId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('demoModeEnabled');
      expect(res.body.data).toHaveProperty('demoCount');
      expect(res.body.data).toHaveProperty('realCount');
      expect(res.body.data.realCount).toBeGreaterThanOrEqual(1);
    });

    it('El operador NO debe tener permiso para activar o desactivar el modo demo (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/demo/toggle')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ eventId: activeEventId, enabled: true });

      expect(res.status).toBe(403);
    });

    it('El administrador puede activar y desactivar el modo demostración', async () => {
      // Activar
      const resOn = await request(app)
        .post('/api/v1/demo/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventId: activeEventId, enabled: true });

      expect(resOn.status).toBe(200);
      expect(resOn.body.data.demoModeEnabled).toBe(true);

      // Desactivar
      const resOff = await request(app)
        .post('/api/v1/demo/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventId: activeEventId, enabled: false });

      expect(resOff.status).toBe(200);
      expect(resOff.body.data.demoModeEnabled).toBe(false);
    });

    it('Debe generar participantes de demostración con QR, cortesías y estados variados', async () => {
      const res = await request(app)
        .post('/api/v1/demo/generate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventId: activeEventId, count: 5 });

      expect(res.status).toBe(201);
      expect(res.body.data.generatedCount).toBe(5);

      // Verificar que los nuevos registros tienen isDemo: true y qrCode
      const sampleDemo = await prisma.registration.findFirst({
        where: { eventId: activeEventId, isDemo: true },
      });
      expect(sampleDemo).toBeDefined();
      expect(sampleDemo?.qrCode).toBeDefined();
      expect(sampleDemo?.qrCode?.startsWith('eg_qr_')).toBe(true);
      demoRegistrationId = sampleDemo!.id;
    });

    it('Cuando el modo demo está DESACTIVADO, las consultas de participantes y asistencia excluyen datos ficticios', async () => {
      // Asegurar modo demo desactivado
      await request(app)
        .post('/api/v1/demo/toggle')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventId: activeEventId, enabled: false });

      const resList = await request(app)
        .get(`/api/v1/participants?eventId=${activeEventId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resList.status).toBe(200);
      // Todos los registros devueltos deben ser reales
      const hasDemoInList = resList.body.data.some((r: any) => r.isDemo === true);
      expect(hasDemoInList).toBe(false);
    });

    it('Debe restablecer los datos de demostración sin tocar las inscripciones reales', async () => {
      const res = await request(app)
        .post('/api/v1/demo/reset')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ eventId: activeEventId });

      expect(res.status).toBe(200);
      expect(res.body.data.status.demoCount).toBe(0);

      // La inscripción real debe seguir existiendo intacta
      const realCheck = await prisma.registration.findUnique({
        where: { id: realRegistrationId },
      });
      expect(realCheck).toBeDefined();
    });
  });

  describe('2. Generación, Validación y Escaneo de Códigos QR', () => {
    it('Debe consultar la entrada digital y generar código QR en Base64 sin exponer datos sensibles', async () => {
      const res = await request(app)
        .get(`/api/v1/qr/${realRegistrationId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('qrDataUrl');
      expect(res.body.data.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
      expect(res.body.data.qrPayload).not.toContain('cédula');
      expect(res.body.data.qrPayload).not.toContain('email');
      expect(res.body.data.ticket).toHaveProperty('participantName');
      expect(res.body.data.ticket).toHaveProperty('eventName');
      expect(res.body.data.ticket).toHaveProperty('ticketTypeName');
    });

    it('Debe validar código QR existente y devolver la ficha con canCheckIn = true', async () => {
      const res = await request(app)
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          codeOrToken: realQrToken,
          eventId: activeEventId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.canCheckIn).toBe(true);
      expect(res.body.data.alreadyAttended).toBe(false);
      expect(res.body.data.registration.id).toBe(realRegistrationId);
    });

    it('El escaneo NO debe marcar la asistencia automáticamente', async () => {
      const check = await prisma.registration.findUnique({
        where: { id: realRegistrationId },
      });
      expect(check?.attended).toBe(false);
    });

    it('Debe rechazar escaneo de un código inexistente', async () => {
      const res = await request(app)
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          codeOrToken: 'codigo_inexistente_invalido_9999',
          eventId: activeEventId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.error).toBe('TICKET_NOT_FOUND');
    });

    it('Debe advertir si una entrada escaneada pertenece a otra edición', async () => {
      // Crear un evento secundario
      const otherEvent = await prisma.event.create({
        data: {
          name: 'Evento Secundario Test QR',
          slug: `evento-secundario-test-${Date.now()}`,
          year: 2027,
          startDate: new Date(),
          endDate: new Date(),
        },
      });

      const res = await request(app)
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          codeOrToken: realQrToken,
          eventId: otherEvent.id, // Escaneado en otro evento
        });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.error).toBe('EDITION_MISMATCH');

      await prisma.event.delete({ where: { id: otherEvent.id } });
    });

    it('El administrador puede revocar y regenerar un QR, invalidando el anterior', async () => {
      const res = await request(app)
        .post(`/api/v1/qr/${realRegistrationId}/revoke`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Ticket reportado como extraviado' });

      expect(res.status).toBe(200);
      expect(res.body.data.newQrToken).toBeDefined();
      expect(res.body.data.newQrToken).not.toBe(realQrToken);

      // El token anterior ya no debe ser válido
      const oldScan = await request(app)
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          codeOrToken: realQrToken,
          eventId: activeEventId,
        });
      expect(oldScan.body.data.valid).toBe(false);

      // El nuevo token sí es válido
      const newScan = await request(app)
        .post('/api/v1/qr/scan')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          codeOrToken: res.body.data.newQrToken,
          eventId: activeEventId,
        });
      expect(newScan.body.data.valid).toBe(true);
      realQrToken = res.body.data.newQrToken;
    });
  });

  describe('3. Sistema de Correos Integrado (Comunicaciones)', () => {
    it('Debe consultar y guardar configuración SMTP sin exponer contraseñas', async () => {
      const saveRes = await request(app)
        .put('/api/v1/communications/config')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          host: 'smtp.mailtrap.io',
          port: 2525,
          secure: false,
          user: 'test_user_mailtrap',
          password: 'SecretSmtpPassword123!',
          fromEmail: 'notificaciones@barcamp.org.do',
          fromName: 'EventGrid BarCamp',
          isEnabled: true,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.data.hasPassword).toBe(true);
      expect(saveRes.body.data).not.toHaveProperty('password');

      const getRes = await request(app)
        .get(`/api/v1/communications/config?eventId=${activeEventId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.host).toBe('smtp.mailtrap.io');
      expect(getRes.body.data.fromEmail).toBe('notificaciones@barcamp.org.do');
      expect(getRes.body.data.hasPassword).toBe(true);
      expect(getRes.body.data).not.toHaveProperty('password');
    });

    it('El operador NO debe tener acceso a modificar configuración SMTP (403 Forbidden)', async () => {
      const res = await request(app)
        .put('/api/v1/communications/config')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          host: 'smtp.malicious.com',
          port: 587,
          fromEmail: 'fake@eventgrid.com',
          fromName: 'Fake',
          isEnabled: true,
        });

      expect(res.status).toBe(403);
    });

    it('Debe ejecutar prueba de conexión en modo simulación seguro', async () => {
      const res = await request(app)
        .post('/api/v1/communications/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          eventId: activeEventId,
          recipientEmail: 'admin.tester@eventgrid.test',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.simulated).toBe(true);
    });

    it('Debe consultar las plantillas de correo editables con variables dinámicas', async () => {
      const res = await request(app)
        .get(`/api/v1/communications/templates?eventId=${activeEventId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(5);

      const ticketTpl = res.body.data.find((t: any) => t.code === 'DIGITAL_TICKET');
      expect(ticketTpl).toBeDefined();
      expect(ticketTpl.variables).toContain('participantName');
      expect(ticketTpl.variables).toContain('qrDataUrl');
    });

    it('Debe enviar (simular en pruebas) un correo individual con reemplazo de variables', async () => {
      const res = await request(app)
        .post('/api/v1/communications/send')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          eventId: activeEventId,
          registrationId: realRegistrationId,
          templateCode: 'INSCRIPTION_CONFIRMATION',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.simulated).toBe(true);
      expect(res.body.data.log.recipientEmail).toContain('@eventgrid.test');
      expect(res.body.data.log.status).toBe('SIMULATED');
    });

    it('Debe registrar el historial de comunicaciones en /communications/logs con filtros', async () => {
      const res = await request(app)
        .get(`/api/v1/communications/logs?eventId=${activeEventId}`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0]).toHaveProperty('recipientEmail');
      expect(res.body.data[0]).toHaveProperty('status');
      expect(res.body.data[0]).not.toHaveProperty('password');
      expect(res.body.data[0]).not.toHaveProperty('token');
    });
  });
});
