import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('QA Concurrency, State Independence and T-shirt Inventory', () => {
  let adminToken: string;
  let operatorToken: string;
  let activeEventId: string;
  let generalTicketTypeId: string;
  const createdRegistrationIds: string[] = [];
  const createdParticipantIds: string[] = [];
  const createdInventoryIds: string[] = [];

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

    // 2. Evento activo
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;

    // 3. Ticket type
    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General QA',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;
  });

  afterAll(async () => {
    if (createdRegistrationIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: createdRegistrationIds } },
      }).catch(() => {});
      await prisma.registration.deleteMany({
        where: { id: { in: createdRegistrationIds } },
      }).catch(() => {});
    }
    if (createdParticipantIds.length > 0) {
      await prisma.participant.deleteMany({
        where: { id: { in: createdParticipantIds } },
      }).catch(() => {});
    }
    if (createdInventoryIds.length > 0) {
      await prisma.tshirtInventory.deleteMany({
        where: { id: { in: createdInventoryIds } },
      }).catch(() => {});
    }
  });

  // Helper para crear participante de prueba
  async function createTestRegistration(initialStatus: 'PENDING' | 'CONFIRMED' = 'PENDING') {
    const unique = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const participant = await prisma.participant.create({
      data: {
        documentId: `QA-${unique.slice(-8)}`,
        firstName: 'Test',
        lastName: `QA_${unique}`,
        fullName: `Test QA_${unique}`,
        email: `qa_${unique}@eventgrid.test`,
        phone: '809-555-0199',
        institution: 'QA Institute',
      },
    });
    createdParticipantIds.push(participant.id);

    const reg = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: participant.id,
        registrationNumber: `REG-QA-${unique.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: initialStatus,
        paymentStatus: initialStatus === 'CONFIRMED' ? 'PAID' : 'PENDING',
        attended: false,
        amountPaid: initialStatus === 'CONFIRMED' ? 1750 : 0,
        ticketPrice: 1750,
        totalAmount: 1750,
      },
    });
    createdRegistrationIds.push(reg.id);
    return reg;
  }

  describe('QA-01 & QA-05: Concurrencia en Check-in e Independencia de Estados', () => {
    it('QA-01: Dos solicitudes concurrentes de check-in para el mismo participante: solo una debe tener éxito', async () => {
      const reg = await createTestRegistration('PENDING');

      // Disparar dos check-ins simultáneos
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/attendance/check-in')
          .set('Authorization', `Bearer ${operatorToken}`)
          .set('x-event-id', activeEventId)
          .send({ registrationId: reg.id }),
        request(app)
          .post('/api/v1/attendance/check-in')
          .set('Authorization', `Bearer ${operatorToken}`)
          .set('x-event-id', activeEventId)
          .send({ registrationId: reg.id }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Exactamente uno 200 y el otro 400 (o 409 si duplicado)
      expect(statuses).toEqual([200, 400]);

      const successRes = res1.status === 200 ? res1 : res2;
      const failedRes = res1.status === 400 ? res1 : res2;

      expect(successRes.body.status).toBe('success');
      expect(successRes.body.data.attended).toBe(true);
      expect(failedRes.body.message).toMatch(/asistencia ya registrada|ya ingresó al evento|ya fue registrada/i);

      // QA-05: El estado de inscripción PENDING NO debe mutar a CONFIRMED
      const updatedReg = await prisma.registration.findUnique({ where: { id: reg.id } });
      expect(updatedReg?.attended).toBe(true);
      expect(updatedReg?.status).toBe('PENDING'); // No mutó a CONFIRMED
    });
  });

  describe('QA-03 & QA-06: Validaciones de T-shirt e Inventario', () => {
    it('QA-06: Debe rechazar una talla no permitida o inexistente en el inventario', async () => {
      const reg = await createTestRegistration('CONFIRMED');

      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-event-id', activeEventId)
        .send({
          registrationId: reg.id,
          tshirtSize: 'TALLA_INEXISTENTE_999',
          tshirtDelivered: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/talla/i);
    });

    it('QA-03: No debe permitir marcar tshirtDelivered=true si la talla no existe en inventario', async () => {
      const reg = await createTestRegistration('CONFIRMED');

      // Intentar marcar entrega con una talla que no esté registrada en el inventario
      const res = await request(app)
        .post('/api/v1/attendance/check-in')
        .set('Authorization', `Bearer ${operatorToken}`)
        .set('x-event-id', activeEventId)
        .send({
          registrationId: reg.id,
          tshirtSize: 'INVALID_NO_STOCK',
          tshirtDelivered: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/talla/i);
    });
  });

  describe('QA-02: Concurrencia en Inventario de T-shirts', () => {
    it('QA-02: Concurrencia de entrega: solo 1 unidad disponible, 2 check-ins simultáneos con entrega: no debe haber inventario negativo', async () => {
      const uniqueSize = `QA_SIZE_${Date.now().toString().slice(-4)}`;

      // Crear inventario con exactamente 1 unidad
      const inv = await prisma.tshirtInventory.create({
        data: {
          eventId: activeEventId,
          size: uniqueSize,
          initialQuantity: 1,
          deliveredQuantity: 0,
          isActive: true,
        },
      });
      createdInventoryIds.push(inv.id);

      // Crear 2 participantes
      const reg1 = await createTestRegistration('CONFIRMED');
      const reg2 = await createTestRegistration('CONFIRMED');

      // Ejecutar dos check-in simultáneos solicitando entrega de la última camiseta
      const [res1, res2] = await Promise.all([
        request(app)
          .post('/api/v1/attendance/check-in')
          .set('Authorization', `Bearer ${operatorToken}`)
          .set('x-event-id', activeEventId)
          .send({
            registrationId: reg1.id,
            tshirtSize: uniqueSize,
            tshirtDelivered: true,
          }),
        request(app)
          .post('/api/v1/attendance/check-in')
          .set('Authorization', `Bearer ${operatorToken}`)
          .set('x-event-id', activeEventId)
          .send({
            registrationId: reg2.id,
            tshirtSize: uniqueSize,
            tshirtDelivered: true,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // Uno debe tener éxito (200), y el otro debe fallar (400) por falta de stock
      expect(statuses).toEqual([200, 400]);

      const failedRes = res1.status === 400 ? res1 : res2;
      expect(failedRes.body.message).toMatch(/No hay camisetas disponibles|agotada/i);

      // Verificar que el inventario entregado no supere 1 (sin sobregiro / no negativo)
      const finalInv = await prisma.tshirtInventory.findUnique({ where: { id: inv.id } });
      expect(finalInv?.deliveredQuantity).toBe(1);
      expect(finalInv?.initialQuantity).toBe(1);
    });
  });
});
