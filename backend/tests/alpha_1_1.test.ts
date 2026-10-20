import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('EventGrid Alpha 1.1 — Validación Integral de Mejoras Operativas', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let createdTicketTypeId: string;
  let testParticipantRegistrationId: string;

  beforeAll(async () => {
    // 1. Obtener tokens para los tres roles del sistema
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

    // Limpiar tipos de entrada de pruebas previas
    await prisma.ticketType.deleteMany({
      where: {
        eventId: activeEventId,
        name: { contains: 'Alpha Test' },
      },
    });
  });

  afterAll(async () => {
    await prisma.ticketType.deleteMany({
      where: {
        eventId: activeEventId,
        name: { contains: 'Alpha Test' },
      },
    });
  });

  describe('1. Configuración de eventos, tarifas e identidad visual', () => {
    it('Debe crear y configurar un tipo de entrada con preventa, capacidad y estado activo', async () => {
      const now = new Date();
      const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/ticket-types`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Entrada VIP Alpha Test',
          price: 2500.0,
          description: 'Acceso VIP con camiseta y networking exclusivo',
          isActive: true,
          presaleStartDate: now.toISOString(),
          presaleEndDate: nextMonth.toISOString(),
          totalCapacity: 100,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Entrada VIP Alpha Test');
      expect(Number(res.body.data.price)).toBe(2500);
      expect(res.body.data.totalCapacity).toBe(100);
      expect(res.body.data.isActive).toBe(true);

      createdTicketTypeId = res.body.data.id;
    });

    it('El operador NO debe tener permiso para modificar tarifas (PRICE_MODIFY -> 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/ticket-types`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          name: 'Entrada No Permitida',
          price: 999.0,
        });

      expect(res.status).toBe(403);
    });

    it('Debe permitir subir logotipo en base64 y guardarlo localmente en uploads/logos', async () => {
      // 1x1 transparent PNG en base64
      const sampleBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          base64Data: sampleBase64,
          fileName: 'logo_barcamp_test.png',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.logoUrl).toContain('/uploads/logos/logo_');

      // Verificar que se guardó en settings de la edición
      const eventRes = await request(app)
        .get(`/api/v1/events/${activeEventId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(eventRes.body.data.settings.logoUrl).toBe(res.body.data.logoUrl);
    });

    it('Debe permitir eliminar el logotipo del evento de forma segura', async () => {
      const res = await request(app)
        .delete(`/api/v1/events/${activeEventId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.logoUrl).toBeNull();
    });
  });

  describe('2. Separación estricta de estados y control de asistencia', () => {
    it('Debe crear una inscripción con status CONFIRMED y paymentStatus PAID/PENDING independiente de asistencia', async () => {
      const uniqueSuffix = Date.now();
      const res = await request(app)
        .post(`/api/v1/events/${activeEventId}/participants`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          firstName: 'Carlos',
          lastName: 'Santana',
          email: `carlos.santana.${uniqueSuffix}@gmail.com`,
          phone: '809-555-1234',
          ticketTypeId: createdTicketTypeId,
          amountPaid: 2500,
          ticketPrice: 2500,
          paymentMethodId: null,
          status: 'CONFIRMED',
        });

      expect(res.status).toBe(201);
      const reg = res.body.data;
      expect(reg.status).toBe('CONFIRMED');
      expect(reg.paymentStatus).toBe('PAID');
      expect(reg.attended).toBe(false);
      expect(reg.attendedAt).toBeNull();

      testParticipantRegistrationId = reg.id;
    });

    it('El check-in marca attended = true manteniendo status = CONFIRMED (nunca ATTENDED)', async () => {
      const checkInRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/attendance/check-in`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          registrationId: testParticipantRegistrationId,
        });

      expect(checkInRes.status).toBe(200);
      expect(checkInRes.body.data.attended).toBe(true);
      expect(checkInRes.body.data.attendedAt).not.toBeNull();
      expect(checkInRes.body.data.status).toBe('CONFIRMED'); // NO debe ser ATTENDED
    });

    it('La reversión de asistencia requiere permiso ATTENDANCE_REVERT (ADMIN) y preserva el estado de inscripción', async () => {
      // Intento con OPERADOR debe fallar con 403
      const failRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/attendance/revert`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          registrationId: testParticipantRegistrationId,
          reason: 'Error de prueba',
        });
      expect(failRes.status).toBe(403);

      // Intento con ADMIN con motivo válido
      const successRes = await request(app)
        .post(`/api/v1/events/${activeEventId}/attendance/revert`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          registrationId: testParticipantRegistrationId,
          reason: 'Reversión administrativa autorizada por prueba técnica Alpha 1.1',
        });

      expect(successRes.status).toBe(200);
      expect(successRes.body.data.attended).toBe(false);
      expect(successRes.body.data.status).toBe('CONFIRMED');
    });

    it('Si una inscripción está cancelada, no debe permitir check-in', async () => {
      // Cancelar inscripción
      await request(app)
        .post(`/api/v1/events/${activeEventId}/participants/${testParticipantRegistrationId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Cancelación temporal para prueba' });

      // Intentar check-in en registro cancelado -> debe rechazar con 400
      const checkInCancelled = await request(app)
        .post(`/api/v1/events/${activeEventId}/attendance/check-in`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ registrationId: testParticipantRegistrationId });

      expect(checkInCancelled.status).toBe(400);
      expect(checkInCancelled.body.message).toMatch(/cancelad/i);

      // Reactivar inscripción
      await request(app)
        .post(`/api/v1/events/${activeEventId}/participants/${testParticipantRegistrationId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Reactivación para continuar pruebas' });
    });
  });

  describe('3. Edición directa en ficha lateral y auditoría', () => {
    it('Debe actualizar datos de participante y registro registrando updatedByUserId', async () => {
      const res = await request(app)
        .put(`/api/v1/events/${activeEventId}/participants/${testParticipantRegistrationId}`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          firstName: 'Carlos Andrés',
          institution: 'Pontificia Universidad Católica Madre y Maestra',
          notes: 'Participante VIP confirmado y verificado.',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.participant.firstName).toBe('Carlos Andrés');
      expect(res.body.data.participant.institution).toBe('Pontificia Universidad Católica Madre y Maestra');
      expect(res.body.data.notes).toBe('Participante VIP confirmado y verificado.');
      expect(res.body.data.updatedByUserId).not.toBeNull();
    });

    it('Ficha completa (getById) debe incluir datos de auditoría e historial multiedición', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${activeEventId}/participants/${testParticipantRegistrationId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      const data = res.body.data;
      expect(data.participant.fullName).toBe('Carlos Andrés Santana');
      expect(data.updatedByUser).toBeDefined();
      expect(Array.isArray(data.editionHistory)).toBe(true);
    });
  });

  describe('4. Recepción y resumen de ventas diarias', () => {
    it('Debe obtener el resumen diario de ventas y cobros en recepción', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${activeEventId}/attendance/daily-sales`)
        .set('Authorization', `Bearer ${operatorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalSalesCount');
      expect(res.body.data).toHaveProperty('totalAmount');
      expect(res.body.data).toHaveProperty('byMethod');
      expect(res.body.data).toHaveProperty('recentPayments');
    });
  });

  describe('5. Módulo de actividad y auditoría (/activity)', () => {
    it('Debe consultar el registro de auditoría con paginación y filtros', async () => {
      const res = await request(app)
        .get('/api/v1/activity')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBeGreaterThan(0);
      expect(res.body.filters).toHaveProperty('users');
      expect(res.body.filters).toHaveProperty('actions');
    });
  });
});
