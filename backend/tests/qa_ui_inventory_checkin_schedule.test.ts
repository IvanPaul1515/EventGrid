import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('QA Test Suite — Interfaz, Inventario T-shirts, Check-in y Cronograma', () => {
  let adminToken: string;
  let operatorToken: string;
  let activeEventId: string;
  let testTicketTypeId: string;
  let testPaymentMethodId: string;

  beforeAll(async () => {
    // 1. Autenticar Admin y Operador
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    expect(adminRes.status).toBe(200);
    adminToken = adminRes.body.data.token;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    expect(opRes.status).toBe(200);
    operatorToken = opRes.body.data.token;

    // 2. Obtener edición BarCamp RD 2026
    const event = await prisma.event.findFirst({
      where: { year: 2026 },
      include: { ticketTypes: true, paymentMethods: true },
    });
    expect(event).toBeDefined();
    activeEventId = event!.id;

    testTicketTypeId = event!.ticketTypes[0]?.id;
    testPaymentMethodId = event!.paymentMethods[0]?.id;
  });

  describe('1. Consulta de Inventario de T-shirts por Operador y Admin', () => {
    it('El Operador puede consultar /events/:eventId/inventory sin error 404 ni 403', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${activeEventId}/inventory`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toBeDefined();
      expect(res.body.data.items.length).toBe(8);
      expect(res.body.data.stats.totalInitial).toBe(282);
    });

    it('El endpoint general /inventory también resuelve con X-Edition-Id', async () => {
      const res = await request(app)
        .get('/api/v1/inventory')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Event-Id', activeEventId);

      expect(res.status).toBe(200);
      expect(res.body.data.stats.totalInitial).toBe(282);
    });

    it('Se preservan las cantidades de referencia de las 8 tallas (total 282)', async () => {
      const res = await request(app)
        .get(`/api/v1/events/${activeEventId}/inventory`)
        .set('Authorization', `Bearer ${adminToken}`);

      const items = res.body.data.items;
      const sizeMap = Object.fromEntries(items.map((i: any) => [i.size, i.initialQuantity]));

      expect(sizeMap['Medium (M)']).toBe(40);
      expect(sizeMap['XL']).toBe(75);
      expect(sizeMap['L']).toBe(70);
      expect(sizeMap['2XL']).toBe(55);
      expect(sizeMap['Size 16']).toBe(12);
      expect(sizeMap['Size 12']).toBe(6);
      expect(sizeMap['Size 14']).toBe(6);
      expect(sizeMap['S']).toBe(18);
    });
  });

  describe('2. Registro de Asistencia (Check-in) y Entrega de Camiseta', () => {
    let testParticipantId: string;
    let testRegistrationId: string;

    beforeAll(async () => {
      // Crear participante de prueba aislado
      const part = await prisma.participant.create({
        data: {
          fullName: 'Participante QA CheckIn',
          firstName: 'Participante',
          lastName: 'QA CheckIn',
          email: `qa_checkin_${Date.now()}@test.com`,
          documentId: `001-QA-${Date.now()}`,
        },
      });
      testParticipantId = part.id;

      const reg = await prisma.registration.create({
        data: {
          eventId: activeEventId,
          participantId: part.id,
          registrationNumber: `QA-CK-${Date.now()}`,
          ticketTypeId: testTicketTypeId,
          status: 'CONFIRMED',
          attended: false,
          isDemo: false,
        },
      });
      testRegistrationId = reg.id;
    });

    it('El Operador puede realizar check-in exitosamente con confirmación y asignación de camiseta', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId)
        .send({
          registrationId: testRegistrationId,
          tshirtSize: 'Medium (M)',
          tshirtDelivered: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.attended).toBe(true);
      expect(res.body.data.attendedAt).toBeDefined();

      // Verificar persistencia en base de datos
      const checkDb = await prisma.registration.findUnique({
        where: { id: testRegistrationId },
      });
      expect(checkDb?.attended).toBe(true);
      expect(checkDb?.tshirtDelivered).toBe(true);
      expect(checkDb?.tshirtSize).toBe('Medium (M)');
    });

    it('No duplica la asistencia si ya está registrada', async () => {
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId)
        .send({
          registrationId: testRegistrationId,
        });

      expect([400, 200]).toContain(res.status);
      expect(res.body.message).toMatch(/ya fue confirmada|ya registrada/i);
    });

    afterAll(async () => {
      if (testRegistrationId) {
        await prisma.registration.delete({ where: { id: testRegistrationId } }).catch(() => {});
      }
      if (testParticipantId) {
        await prisma.participant.delete({ where: { id: testParticipantId } }).catch(() => {});
      }
    });
  });

  describe('3. Nueva Venta Presencial y Registro de Participante', () => {
    let createdSaleRegId: string;
    let createdCourtesyRegId: string;

    it('Registrar venta presencial con ticket, participante y pago', async () => {
      const email = `qa_onsite_${Date.now()}@test.com`;
      const res = await request(app)
        .post('/api/v1/participants/onsite-sale')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId)
        .send({
          firstName: 'Juan',
          lastName: 'Pérez Venta',
          email,
          ticketTypeId: testTicketTypeId,
          paymentMethodId: testPaymentMethodId,
          amountReceived: 1750,
          amountPaid: 1750,
          institution: 'Empresa Test',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.registration).toBeDefined();
      expect(res.body.data.registration.participant.email).toBe(email);
      expect(res.body.data.registration.registrationNumber).toBeDefined();
      createdSaleRegId = res.body.data.registration.id;
    });

    it('Registrar participante de cortesía sin método de pago obligatorio (RD$0)', async () => {
      const email = `qa_courtesy_${Date.now()}@test.com`;
      const res = await request(app)
        .post('/api/v1/participants')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId)
        .send({
          firstName: 'María',
          lastName: 'Invitada Especial',
          email,
          ticketTypeId: testTicketTypeId,
          ticketPrice: 0,
          amountPaid: 0,
          totalAmount: 0,
          balanceDue: 0,
          isCourtesy: true,
          courtesyAuthorizedBy: 'Comité Directivo BarCamp RD',
          courtesyReason: 'Ponente Magistral',
          status: 'CONFIRMED',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isCourtesy).toBe(true);
      expect(res.body.data.ticketPrice).toBe(0);
      expect(res.body.data.amountPaid).toBe(0);
      createdCourtesyRegId = res.body.data.id;
    });

    afterAll(async () => {
      if (createdSaleRegId) {
        const reg = await prisma.registration.findUnique({ where: { id: createdSaleRegId } });
        await prisma.registration.delete({ where: { id: createdSaleRegId } }).catch(() => {});
        if (reg?.participantId) {
          await prisma.participant.delete({ where: { id: reg.participantId } }).catch(() => {});
        }
      }
      if (createdCourtesyRegId) {
        const reg = await prisma.registration.findUnique({ where: { id: createdCourtesyRegId } });
        await prisma.registration.delete({ where: { id: createdCourtesyRegId } }).catch(() => {});
        if (reg?.participantId) {
          await prisma.participant.delete({ where: { id: reg.participantId } }).catch(() => {});
        }
      }
    });
  });

  describe('4. Sincronización y Coherencia del Cronograma', () => {
    it('La vista administrativa y la vista pública retornan las 4 actividades reales', async () => {
      // 1. Consulta administrativa autenticada
      const adminRes = await request(app)
        .get(`/api/v1/events/${activeEventId}/schedule`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('X-Edition-Id', activeEventId);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.total).toBe(4);
      expect(adminRes.body.data.items.length).toBe(4);

      // 2. Consulta pública (móvil, PWA) sin token
      const publicRes = await request(app)
        .get(`/api/v1/events/${activeEventId}/schedule/public`);

      expect(publicRes.status).toBe(200);
      expect(publicRes.body.data.total).toBe(4);

      // 3. Comprobar que los títulos coinciden exactamente
      const adminTitles = adminRes.body.data.items.map((i: any) => i.title).sort();
      const publicTitles = publicRes.body.data.groupedByDay[0].items.map((i: any) => i.title).sort();
      expect(adminTitles).toEqual(publicTitles);
    });

    it('Ninguna actividad está inventada en el código y todas están guardadas en la base de datos', async () => {
      const dbItems = await prisma.scheduleItem.findMany({
        where: { eventId: activeEventId, status: { not: 'CANCELLED' } },
      });

      expect(dbItems.length).toBe(4);
      const titles = dbItems.map((i) => i.title);
      expect(titles).toContain('Registro y acreditación de participantes');
      expect(titles).toContain('Inteligencia artificial aplicada al desarrollo de software');
      expect(titles).toContain('Ciberseguridad: amenazas y buenas prácticas');
      expect(titles).toContain('Desarrollo web moderno y aplicaciones progresivas');
    });
  });

  describe('5. Preservación Estricta de Datos y Configuraciones', () => {
    it('Conserva la configuración SMTP de Brevo intacta y habilitada', async () => {
      const emailConfig = await prisma.emailConfig.findFirst({
        where: { eventId: activeEventId },
      });
      expect(emailConfig).toBeDefined();
      expect(emailConfig?.host).toBe('smtp-relay.brevo.com');
      expect(emailConfig?.port).toBe(587);
      expect(emailConfig?.user).toBe('bf682a001@smtp-brevo.com');
      expect(emailConfig?.isEnabled).toBe(true);
      expect(emailConfig?.password).toMatch(/^enc:gcm:/);
    });

    it('Conserva los colores de la edición y las plantillas de correo', async () => {
      const settings = await prisma.eventSettings.findFirst({
        where: { eventId: activeEventId },
      });
      expect(settings).toBeDefined();
      expect(settings?.primaryColor).toBeDefined();

      const templates = await prisma.emailTemplate.findMany();
      expect(templates.length).toBeGreaterThan(0);
      const regTemplate = templates.find((t) => t.code === 'REGISTRATION_CONFIRMATION' || t.code === 'INSCRIPTION_CONFIRMATION');
      expect(regTemplate).toBeDefined();
    });
  });
});
