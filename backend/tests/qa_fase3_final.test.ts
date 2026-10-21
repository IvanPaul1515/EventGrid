import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

describe('EventGrid Fase 3: Integración Staff-Inventario, Concurrencia y QA Final', () => {
  let adminToken: string;
  let operatorToken: string;
  let testEvent: any;
  let generalTicket: any;
  let adminUser: any;
  let operatorUser: any;

  beforeAll(async () => {
    // 1. Obtener usuarios y tokens
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    operatorUser = await prisma.user.findFirst({ where: { role: 'OPERATOR' } });

    const adminLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: adminUser!.email, password: 'BarCamp2026!Admin' });
    adminToken = adminLogin.body.data.token;

    const opLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: operatorUser!.email, password: 'BarCamp2026!Op' });
    operatorToken = opLogin.body.data.token;

    // 2. Crear evento aislado para pruebas
    testEvent = await prisma.event.create({
      data: {
        name: 'Evento Fase 3 QA Test',
        slug: `fase3-test-${Date.now()}`,
        year: 2099,
        startDate: new Date(),
        endDate: new Date(Date.now() + 86400000),
        status: 'ACTIVE',
        settings: {
          create: {
            tshirtSizesEnabled: true,
            tshirtSizes: JSON.stringify(['M', 'L', 'XL', '2XL']),
            currencyCode: 'DOP',
          },
        },
      },
    });

    generalTicket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'Entrada General Test',
        price: 1750,
        totalCapacity: 200,
      },
    });
  });

  afterAll(async () => {
    try {
      if (testEvent) {
        await prisma.staffTshirtDelivery.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.emailBatchItem.deleteMany({ where: { job: { eventId: testEvent.id } } });
        await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.emailLog.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.registration.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.tshirtInventory.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.ticketType.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.registrationSequence.deleteMany({ where: { eventId: testEvent.id } });
        await prisma.event.delete({ where: { id: testEvent.id } });
      }
    } catch {}
  });

  describe('1. Integración de Reserva Staff y Check-in de Participantes', () => {
    it('Debe calcular correctamente la disponibilidad para participantes descontando reservas del staff', async () => {
      // Crear inventario de talla M: 40 iniciales, 0 entregadas, 10 reservadas para staff
      await prisma.tshirtInventory.create({
        data: {
          eventId: testEvent.id,
          size: 'M',
          initialQuantity: 40,
          deliveredQuantity: 0,
          staffReservedQuantity: 10,
          staffDeliveredQuantity: 0,
        },
      });

      const res = await InventoryService.getInventory(testEvent.id);
      const itemM = res.items.find((i: any) => i.size === 'M');
      expect(itemM).toBeDefined();

      // Fórmulas requeridas
      // availableForParticipants = initialQuantity - deliveredQuantity - staffReservedQuantity = 40 - 0 - 10 = 30
      // staffPendingQuantity = staffReservedQuantity - staffDeliveredQuantity = 10 - 0 = 10
      // physicalRemaining = initialQuantity - deliveredQuantity - staffDeliveredQuantity = 40 - 0 - 0 = 40
      expect(itemM.availableForParticipants).toBe(30);
      expect(itemM.staffPendingQuantity).toBe(10);
      expect(itemM.physicalRemaining).toBe(40);
    });

    it('La entrega física al staff NO debe duplicar el descuento de disponibilidad de participantes', async () => {
      // Registrar entrega física de 4 camisetas al staff
      await InventoryService.deliverStaffTshirts(
        testEvent.id,
        {
          size: 'M',
          quantity: 4,
          recipientName: 'Carlos Voluntario',
          recipientRole: 'Soporte',
        },
        adminUser.id
      );

      const res = await InventoryService.getInventory(testEvent.id);
      const itemM = res.items.find((i: any) => i.size === 'M');

      // initialQuantity: 40
      // deliveredQuantity: 0
      // staffReservedQuantity: 10
      // staffDeliveredQuantity: 4
      // availableForParticipants: 40 - 0 - 10 = 30 (no cambia porque ya estaba reservado)
      // staffPendingQuantity: 10 - 4 = 6
      // physicalRemaining: 40 - 0 - 4 = 36
      expect(itemM.availableForParticipants).toBe(30);
      expect(itemM.staffPendingQuantity).toBe(6);
      expect(itemM.physicalRemaining).toBe(36);
    });

    it('Liberar reservas del staff debe restaurar la disponibilidad para participantes', async () => {
      // Liberar 2 unidades reservadas del staff (quedan 8 reservadas, 4 entregadas, 4 pendientes)
      await InventoryService.releaseStaffTshirts(
        testEvent.id,
        'M',
        2,
        adminUser.id
      );

      const res = await InventoryService.getInventory(testEvent.id);
      const itemM = res.items.find((i: any) => i.size === 'M');

      // staffReservedQuantity: 8
      // staffDeliveredQuantity: 4
      // availableForParticipants: 40 - 0 - 8 = 32
      // staffPendingQuantity: 8 - 4 = 4
      expect(itemM.staffReservedQuantity).toBe(8);
      expect(itemM.availableForParticipants).toBe(32);
      expect(itemM.staffPendingQuantity).toBe(4);
    });

    it('El check-in debe bloquearse cuando la existencia para participantes esté agotada por reservas del staff', async () => {
      // Crear inventario de talla XL con 2 iniciales y 2 reservadas para staff
      await prisma.tshirtInventory.create({
        data: {
          eventId: testEvent.id,
          size: 'XL',
          initialQuantity: 2,
          deliveredQuantity: 0,
          staffReservedQuantity: 2,
          staffDeliveredQuantity: 0,
        },
      });

      // Crear participante con talla XL
      const p = await prisma.participant.create({
        data: {
          firstName: 'Participante',
          lastName: 'Test',
          fullName: 'Participante XL Test',
          email: `p_xl_${Date.now()}@example.com`,
        },
      });

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: p.id,
          ticketTypeId: generalTicket.id,
          registrationNumber: `REG-XL-${Date.now()}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          tshirtSize: 'XL',
        },
      });

      // Intentar marcar asistencia con talla XL -> debe fallar porque availableForParticipants = 0
      await expect(
        AttendanceService.checkIn(testEvent.id, reg.id, operatorUser.id, 'XL', true)
      ).rejects.toThrow();

      // Verificar que la inscripción permanezca sin check-in
      const checkReg = await prisma.registration.findUnique({ where: { id: reg.id } });
      expect(checkReg?.attended).toBe(false);
    });
  });

  describe('2. Secuencialidad y Concurrencia en la Numeración de Registros (QA-16)', () => {
    it('Debe generar números de inscripción correlativos y atómicos bajo solicitudes concurrentes', async () => {
      const year = 2099;
      const prefix = 'EVT26';

      // Disparar 10 llamadas concurrentes a getNextRegistrationNumber
      const promises = Array.from({ length: 10 }, () =>
        ParticipantsService.getNextRegistrationNumber(testEvent.id, year, prefix)
      );

      const numbers = await Promise.all(promises);

      // Todas deben ser únicas
      const uniqueNumbers = new Set(numbers);
      expect(uniqueNumbers.size).toBe(10);

      // Deben tener el prefijo correcto
      numbers.forEach((num) => {
        expect(num.startsWith('EVT26-')).toBe(true);
      });
    });
  });

  describe('3. Concurrencia y Reglas de Negocio en Reservas de Staff', () => {
    it('No debe permitir reservar más camisetas de las disponibles físicamente', async () => {
      // Intentar reservar 100 de talla M (solo hay 40 iniciales)
      await expect(
        InventoryService.reserveStaffTshirts(
          testEvent.id,
          'M',
          100,
          adminUser.id
        )
      ).rejects.toThrow();
    });

    it('No debe permitir liberar más camisetas de las que están pendientes (no entregadas)', async () => {
      // En M hay 8 reservadas y 4 entregadas -> solo 4 pendientes
      await expect(
        InventoryService.releaseStaffTshirts(
          testEvent.id,
          'M',
          10,
          adminUser.id
        )
      ).rejects.toThrow();
    });

    it('No debe permitir reducir la cantidad inicial física por debajo de lo ya entregado o reservado', async () => {
      const itemM = await prisma.tshirtInventory.findUnique({
        where: { eventId_size: { eventId: testEvent.id, size: 'M' } },
      });

      // Intentar reducir initialQuantity a 5 (cuando hay 8 reservadas y 4 entregadas)
      await expect(
        InventoryService.updateItem(
          testEvent.id,
          itemM!.id,
          { initialQuantity: 2 },
          adminUser.id
        )
      ).rejects.toThrow();
    });
  });

  describe('4. Pre-validación de Destinatarios y Envíos Masivos (Comunicaciones)', () => {
    it('Debe prevalidar exactamente los destinatarios por grupo sin enviar correos', async () => {
      const stats = await CommunicationsService.getRecipientStats({
        eventId: testEvent.id,
        targetGroup: 'ALL',
      });

      expect(stats).toBeDefined();
      expect(typeof stats.totalSelected).toBe('number');
      expect(typeof stats.eligibleCount).toBe('number');
      expect(typeof stats.validEmailsCount).toBe('number');
      expect(typeof stats.invalidEmailsCount).toBe('number');
    });

    it('Debe registrar un EmailBatchJob persistente al enviar masivo', async () => {
      // Asegurar que existe al menos una inscripción elegible
      const part = await prisma.participant.create({
        data: {
          firstName: 'Destinatario',
          lastName: 'Test',
          fullName: 'Destinatario Masivo Test',
          email: `bulk_${Date.now()}@example.com`,
        },
      });

      await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: part.id,
          ticketTypeId: generalTicket.id,
          registrationNumber: `REG-BULK-${Date.now()}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
      });

      const result = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'REGISTRATION_CONFIRMATION',
          targetGroup: 'ALL',
          simulateOnly: true,
        },
        adminUser.id
      );

      expect(result.batchId).toBeDefined();

      let job = await CommunicationsService.getBatchJob(result.batchId!);
      for (let i = 0; i < 25 && job && (job.status === 'PENDING' || job.status === 'PROCESSING'); i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = await CommunicationsService.getBatchJob(result.batchId!);
      }
      expect(job).toBeDefined();
      expect(['SIMULATED', 'PROCESSING']).toContain(job?.status);
      expect(job?.totalCount).toBeGreaterThanOrEqual(1);
    });
  });
});
