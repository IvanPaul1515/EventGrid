import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { InventoryService, INITIAL_TSHIRT_INVENTORY } from '../src/modules/inventory/inventory.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';

describe('EventGrid — Registro de T-shirts durante el Check-in e Inventario Administrativo', () => {
  let adminToken: string;
  let operatorToken: string;
  let testEventId: string;
  let adminUserId: string;
  let operatorUserId: string;

  beforeAll(async () => {
    // Autenticar Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;
    adminUserId = adminRes.body.data.user.id;

    // Autenticar Operador
    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;
    operatorUserId = opRes.body.data.user.id;

    // Crear edición aislada de prueba para T-shirts
    const event = await prisma.event.create({
      data: {
        slug: 'tshirt-test-edition-2026',
        name: 'T-Shirt Test Edition 2026',
        year: 2026,
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-02'),
        status: 'ACTIVE',
      },
    });
    testEventId = event.id;
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (testEventId) {
      await prisma.tshirtInventory.deleteMany({ where: { eventId: testEventId } }).catch(() => {});
      await prisma.registration.deleteMany({ where: { eventId: testEventId } }).catch(() => {});
      await prisma.eventSettings.deleteMany({ where: { eventId: testEventId } }).catch(() => {});
      await prisma.event.delete({ where: { id: testEventId } }).catch(() => {});
    }
  });

  it('1. Debe inicializar el inventario con exactamente 282 unidades y 8 tallas independientes', async () => {
    await InventoryService.initDefaultInventory(testEventId, adminUserId);

    const inv = await InventoryService.getInventory(testEventId);
    expect(inv.stats.totalInitial).toBe(282);
    expect(inv.stats.totalDelivered).toBe(0);
    expect(inv.stats.totalAvailable).toBe(282);
    expect(inv.items.length).toBe(8);

    // Verificar las tallas solicitadas explícitamente
    const sizes = inv.items.map((i) => ({ size: i.size, qty: i.initialQuantity }));
    expect(sizes).toContainEqual({ size: 'Medium (M)', qty: 40 });
    expect(sizes).toContainEqual({ size: 'XL', qty: 75 });
    expect(sizes).toContainEqual({ size: 'L', qty: 70 });
    expect(sizes).toContainEqual({ size: '2XL', qty: 55 });
    expect(sizes).toContainEqual({ size: 'Size 16', qty: 12 });
    expect(sizes).toContainEqual({ size: 'Size 12', qty: 6 });
    expect(sizes).toContainEqual({ size: 'Size 14', qty: 6 });
    expect(sizes).toContainEqual({ size: 'S', qty: 18 });
  });

  it('2. La inicialización debe ser idempotente y evitar duplicar el inventario', async () => {
    await InventoryService.initDefaultInventory(testEventId, adminUserId);
    const inv = await InventoryService.getInventory(testEventId);

    expect(inv.stats.totalInitial).toBe(282);
    expect(inv.items.length).toBe(8);
  });

  it('3. Registrar la talla en check-in SIN entrega física no debe descontar inventario', async () => {
    // Crear participante e inscripción de prueba
    const participant = await prisma.participant.create({
      data: {
        firstName: 'Carlos',
        lastName: 'Prueba',
        fullName: 'Carlos Prueba',
        email: 'carlos.prueba@tshirt.test',
      },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: testEventId,
        participantId: participant.id,
        registrationNumber: 'BC26-TSHIRT-01',
        status: 'CONFIRMED',
        attended: false,
      },
    });

    // Check-in con talla "Size 12", pero tshirtDelivered = false
    const checkInResult = await AttendanceService.checkIn(
      testEventId,
      reg.id,
      operatorUserId,
      'Size 12',
      false
    );

    expect(checkInResult.registration.attended).toBe(true);
    expect((checkInResult.registration as any).tshirtSize).toBe('Size 12');
    expect((checkInResult.registration as any).tshirtDelivered).toBe(false);

    // Verificar que el inventario de Size 12 sigue intacto (6 iniciales, 0 entregadas, 6 disponibles)
    const inv = await InventoryService.getInventory(testEventId);
    const size12 = inv.items.find((i) => i.size === 'Size 12');
    expect(size12?.deliveredQuantity).toBe(0);
    expect(size12?.availableQuantity).toBe(6);
    expect(size12?.pendingDelivery).toBe(1);
    expect(inv.stats.totalDelivered).toBe(0);
    expect(inv.stats.totalPendingDelivery).toBe(1);

    // Limpieza
    await prisma.registration.delete({ where: { id: reg.id } });
    await prisma.participant.delete({ where: { id: participant.id } });
  });

  it('4. Confirmar check-in CON entrega física debe descontar exactamente 1 unidad del inventario', async () => {
    const participant = await prisma.participant.create({
      data: {
        firstName: 'Elena',
        lastName: 'Reyes',
        fullName: 'Elena Reyes',
        email: 'elena.reyes@tshirt.test',
      },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: testEventId,
        participantId: participant.id,
        registrationNumber: 'BC26-TSHIRT-02',
        status: 'CONFIRMED',
        attended: false,
      },
    });

    // Check-in con talla "XL" y entrega física confirmada
    const checkInResult = await AttendanceService.checkIn(
      testEventId,
      reg.id,
      operatorUserId,
      'XL',
      true
    );

    expect(checkInResult.registration.attended).toBe(true);
    expect((checkInResult.registration as any).tshirtSize).toBe('XL');
    expect((checkInResult.registration as any).tshirtDelivered).toBe(true);

    // Verificar que el inventario de XL descontó exactamente 1 unidad (75 -> 74 disponibles, 1 entregada)
    const inv = await InventoryService.getInventory(testEventId);
    const xl = inv.items.find((i) => i.size === 'XL');
    expect(xl?.deliveredQuantity).toBe(1);
    expect(xl?.availableQuantity).toBe(74);
    expect(xl?.pendingDelivery).toBe(0);
    expect(inv.stats.totalDelivered).toBe(1);
    expect(inv.stats.totalAvailable).toBe(281);

    // Limpieza
    await prisma.registration.delete({ where: { id: reg.id } });
    await prisma.participant.delete({ where: { id: participant.id } });
  });

  it('5. No debe permitir entregar una talla agotada, pero sí debe permitir asistir con entrega pendiente', async () => {
    // Agotar artificialmente la talla "Size 14" fijando initialQuantity = 0
    const size14 = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEventId, size: 'Size 14' } },
    });
    await prisma.tshirtInventory.update({
      where: { id: size14!.id },
      data: { initialQuantity: 0, deliveredQuantity: 0 },
    });

    const participant = await prisma.participant.create({
      data: {
        firstName: 'Marcos',
        lastName: 'Díaz',
        fullName: 'Marcos Díaz',
        email: 'marcos.diaz@tshirt.test',
      },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: testEventId,
        participantId: participant.id,
        registrationNumber: 'BC26-TSHIRT-03',
        status: 'CONFIRMED',
        attended: false,
      },
    });

    // Intentar check-in CON entrega de talla agotada debe ser rechazado
    await expect(
      AttendanceService.checkIn(testEventId, reg.id, operatorUserId, 'Size 14', true)
    ).rejects.toThrow(/TALLA AGOTADA/);

    // Pero si se marca la asistencia dejando la entrega pendiente (tshirtDelivered = false), debe permitirlo
    const successCheckIn = await AttendanceService.checkIn(
      testEventId,
      reg.id,
      operatorUserId,
      'Size 14',
      false
    );
    expect(successCheckIn.registration.attended).toBe(true);
    expect((successCheckIn.registration as any).tshirtDelivered).toBe(false);

    // Restaurar cantidad inicial de Size 14 a 6
    await prisma.tshirtInventory.update({
      where: { id: size14!.id },
      data: { initialQuantity: 6 },
    });

    // Limpieza
    await prisma.registration.delete({ where: { id: reg.id } });
    await prisma.participant.delete({ where: { id: participant.id } });
  });

  it('6. Revertir check-in NO debe devolver automáticamente una camiseta ya entregada', async () => {
    const participant = await prisma.participant.create({
      data: {
        firstName: 'Laura',
        lastName: 'Gómez',
        fullName: 'Laura Gómez',
        email: 'laura.gomez@tshirt.test',
      },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: testEventId,
        participantId: participant.id,
        registrationNumber: 'BC26-TSHIRT-04',
        status: 'CONFIRMED',
        attended: false,
      },
    });

    // Check-in con entrega física de Medium (M)
    await AttendanceService.checkIn(testEventId, reg.id, operatorUserId, 'Medium (M)', true);

    const invBefore = await InventoryService.getInventory(testEventId);
    const mBefore = invBefore.items.find((i) => i.size === 'Medium (M)');
    expect(mBefore?.deliveredQuantity).toBe(1);

    // Revertir asistencia
    await AttendanceService.revertAttendance(
      testEventId,
      reg.id,
      adminUserId,
      'Participante tuvo que salir temporalmente'
    );

    // La camiseta física entregada DEBE mantenerse descontada
    const invAfter = await InventoryService.getInventory(testEventId);
    const mAfter = invAfter.items.find((i) => i.size === 'Medium (M)');
    expect(mAfter?.deliveredQuantity).toBe(1);

    // Limpieza
    await prisma.registration.delete({ where: { id: reg.id } });
    await prisma.participant.delete({ where: { id: participant.id } });
  });

  it('7. La devolución de camiseta al inventario debe ser una operación explícita y auditada', async () => {
    const participant = await prisma.participant.create({
      data: {
        firstName: 'Pedro',
        lastName: 'Almonte',
        fullName: 'Pedro Almonte',
        email: 'pedro.almonte@tshirt.test',
      },
    });

    const reg = await prisma.registration.create({
      data: {
        eventId: testEventId,
        participantId: participant.id,
        registrationNumber: 'BC26-TSHIRT-05',
        status: 'CONFIRMED',
        attended: true,
        tshirtSize: '2XL',
        tshirtDelivered: true,
      },
    });

    // Fijar 1 entregada en 2XL
    const invItem2XL = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEventId, size: '2XL' } },
    });
    await prisma.tshirtInventory.update({
      where: { id: invItem2XL!.id },
      data: { deliveredQuantity: 1 },
    });

    // Devolución explícita
    const returned = await ParticipantsService.returnTshirt(
      testEventId,
      reg.id,
      adminUserId,
      'Participante devolvió la camiseta sin usar por error de talla'
    );

    expect(returned.tshirtDelivered).toBe(false);

    // Inventario repone la unidad
    const inv = await InventoryService.getInventory(testEventId);
    const item2XL = inv.items.find((i) => i.size === '2XL');
    expect(item2XL?.deliveredQuantity).toBe(0);

    // Verificar registro en bitácora de auditoría
    const auditLogs = await prisma.auditLog.findMany({
      where: { entityId: reg.id, action: 'TSHIRT_RETURN' },
    });
    expect(auditLogs.length).toBeGreaterThan(0);

    // Limpieza
    await prisma.registration.delete({ where: { id: reg.id } });
    await prisma.participant.delete({ where: { id: participant.id } });
  });

  it('8. Endpoint administrativo de inventario responde correctamente con estadísticas completas', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${testEventId}/inventory`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.stats).toHaveProperty('totalInitial');
    expect(res.body.data.stats).toHaveProperty('totalDelivered');
    expect(res.body.data.stats).toHaveProperty('totalAvailable');
    expect(res.body.data.stats).toHaveProperty('totalPendingDelivery');
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(8);
  });
});
