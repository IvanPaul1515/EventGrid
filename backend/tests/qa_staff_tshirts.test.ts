import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('QA Staff T-shirts — Gestión de Camisetas para Personal y Reglas de Inventario', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let secondEventId: string;
  let testParticipantId: string;
  let testRegId: string;
  let generalTicketTypeId: string;
  const createdInventoryIds: string[] = [];

  beforeAll(async () => {
    // 1. Iniciar sesión con diferentes roles
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

    // 2. Obtener edición activa (2026) y crear/obtener segunda edición para prueba de aislamiento
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;

    let secondEvent = await prisma.event.findFirst({ where: { year: 2025 } });
    if (!secondEvent) {
      secondEvent = await prisma.event.create({
        data: {
          name: 'Edición QA 2025',
          slug: `qa-ed-2025-${Date.now()}`,
          year: 2025,
          startDate: new Date('2025-10-25'),
          endDate: new Date('2025-10-25'),
          venue: 'Centro de Convenciones',
        },
      });
    }
    secondEventId = secondEvent.id;

    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General Staff QA',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;
  });

  afterAll(async () => {
    if (createdInventoryIds.length > 0) {
      await prisma.staffTshirtDelivery.deleteMany({
        where: { eventId: { in: [activeEventId, secondEventId] } },
      }).catch(() => {});
      await prisma.tshirtInventory.deleteMany({
        where: { id: { in: createdInventoryIds } },
      }).catch(() => {});
    }
    if (testRegId) {
      await prisma.auditLog.deleteMany({ where: { entityId: testRegId } }).catch(() => {});
      await prisma.registration.delete({ where: { id: testRegId } }).catch(() => {});
    }
    if (testParticipantId) {
      await prisma.participant.delete({ where: { id: testParticipantId } }).catch(() => {});
    }
  });

  it('Casos 1 al 9: Ciclo completo de reserva, entrega a staff, entrega a participantes y liberación', async () => {
    // Preparar una talla exclusiva con exactamente 40 unidades
    const testSize = `M_STAFF_${Date.now()}`;
    const inv = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: testSize,
        initialQuantity: 40,
        deliveredQuantity: 0,
        staffReservedQuantity: 0,
        staffDeliveredQuantity: 0,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv.id);

    // Caso 1: Reservar 8 camisetas M de un inventario de 40
    const reserveRes = await request(app)
      .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: testSize,
        reservedQuantity: 8,
      });

    expect(reserveRes.status).toBe(200);
    expect(reserveRes.body.data.staffReserved).toBe(8);

    // Caso 2: Comprobar que quedan 32 disponibles para participantes
    expect(reserveRes.body.data.availableForParticipants).toBe(32);

    // Caso 3: Entregar 3 camisetas al staff
    const deliverStaffRes = await request(app)
      .post(`/api/v1/events/${activeEventId}/inventory/staff/deliver`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: testSize,
        quantity: 3,
        recipientName: 'Carlos Coordinador',
        notes: 'Staff de apoyo técnico',
      });

    expect(deliverStaffRes.status).toBe(200);

    // Caso 4: Comprobar que quedan 5 reservadas pendientes y 3 entregadas
    const staffInv = await request(app)
      .get(`/api/v1/events/${activeEventId}/inventory/staff`)
      .set('Authorization', `Bearer ${adminToken}`);

    const itemAfterStaffDeliver = staffInv.body.data.items.find((i: any) => i.size === testSize);
    expect(itemAfterStaffDeliver.staffDelivered).toBe(3);
    expect(itemAfterStaffDeliver.staffPending).toBe(5);

    // Caso 5: Confirmar que la disponibilidad para participantes sigue siendo 32
    expect(itemAfterStaffDeliver.availableForParticipants).toBe(32);

    // Caso 6: Entregar 10 camisetas a participantes
    // Simulamos la entrega atómica a 10 participantes incrementando deliveredQuantity
    await prisma.tshirtInventory.update({
      where: { id: inv.id },
      data: { deliveredQuantity: 10 },
    });

    // Caso 7: Confirmar que quedan 22 disponibles (40 - 10 - 5 - 3 = 22)
    const staffInvAfterPart = await request(app)
      .get(`/api/v1/events/${activeEventId}/inventory/staff`)
      .set('Authorization', `Bearer ${adminToken}`);
    const itemAfterPart = staffInvAfterPart.body.data.items.find((i: any) => i.size === testSize);
    expect(itemAfterPart.deliveredParticipants).toBe(10);
    expect(itemAfterPart.staffPending).toBe(5);
    expect(itemAfterPart.staffDelivered).toBe(3);
    expect(itemAfterPart.availableForParticipants).toBe(22);

    // Caso 8: Liberar 2 camisetas de la reserva pendiente
    const releaseRes = await request(app)
      .post(`/api/v1/events/${activeEventId}/inventory/staff/release`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: testSize,
        quantityToRelease: 2,
      });

    expect(releaseRes.status).toBe(200);
    expect(releaseRes.body.data.releasedQuantity).toBe(2);

    // Caso 9: Confirmar que la disponibilidad aumenta a 24 (40 - 10 - 3 - 3 = 24)
    expect(releaseRes.body.data.availableForParticipants).toBe(24);
    expect(releaseRes.body.data.staffPending).toBe(3); // Eran 5, se liberaron 2 -> quedan 3
    expect(releaseRes.body.data.staffReserved).toBe(6); // Eran 8, se liberaron 2 -> quedan 6
  });

  it('Caso 10: Intentar reservar más camisetas de las disponibles debe fallar (400)', async () => {
    const testSize = `OVER_RESERVE_${Date.now()}`;
    const inv = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: testSize,
        initialQuantity: 10,
        deliveredQuantity: 6, // Quedan 4 libres
        staffReservedQuantity: 0,
        staffDeliveredQuantity: 0,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv.id);

    // Intentar reservar 5 cuando solo quedan 4
    const res = await request(app)
      .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: testSize,
        reservedQuantity: 5,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No hay suficientes camisetas disponibles/i);
  });

  it('Caso 11: Intentar reducir la reserva por debajo de lo ya entregado debe fallar (400)', async () => {
    const testSize = `UNDER_REDUCE_${Date.now()}`;
    const inv = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: testSize,
        initialQuantity: 20,
        deliveredQuantity: 0,
        staffReservedQuantity: 10,
        staffDeliveredQuantity: 5, // Ya se entregaron 5
        isActive: true,
      },
    });
    createdInventoryIds.push(inv.id);

    // Intentar reducir la reserva a 4 (por debajo de las 5 entregadas)
    const res = await request(app)
      .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        size: testSize,
        reservedQuantity: 4,
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/No puede reducir la reserva .* por debajo|No puede reducir la reserva/i);
  });

  it('Caso 12: Dos reservas simultáneas sobre la última camiseta disponible (concurrencia atómica)', async () => {
    const testSize = `CONCURRENT_STAFF_${Date.now()}`;
    const inv = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: testSize,
        initialQuantity: 10,
        deliveredQuantity: 9, // Solo queda 1 disponible
        staffReservedQuantity: 0,
        staffDeliveredQuantity: 0,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv.id);

    // Dos administradores intentan reservar la última camiseta disponible a la vez
    const [res1, res2] = await Promise.all([
      request(app)
        .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ size: testSize, reservedQuantity: 1 }),
      request(app)
        .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ size: testSize, reservedQuantity: 1 }),
    ]);

    // Ambas operaciones intentan setear reservedQuantity a 1, el inventario final debe ser exactamente 1
    expect([res1.status, res2.status]).toContain(200);

    const check = await prisma.tshirtInventory.findUnique({ where: { id: inv.id } });
    expect(check?.staffReservedQuantity).toBe(1);
    expect(check?.initialQuantity).toBe(10);
    expect(check?.deliveredQuantity).toBe(9);
    // Disponibles para participantes = 10 - 9 - 1 = 0
    expect(check!.initialQuantity - check!.deliveredQuantity - check!.staffReservedQuantity).toBe(0);
  });

  it('Caso 13: Verificar aislamiento estricto de inventario y reservas entre ediciones distintas', async () => {
    const commonSize = `CROSS_EDITION_${Date.now()}`;

    // Crear inventario en Edición 1
    const inv1 = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: commonSize,
        initialQuantity: 50,
        deliveredQuantity: 0,
        staffReservedQuantity: 10,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv1.id);

    // Crear inventario con el mismo nombre de talla en Edición 2
    const inv2 = await prisma.tshirtInventory.create({
      data: {
        eventId: secondEventId,
        size: commonSize,
        initialQuantity: 30,
        deliveredQuantity: 0,
        staffReservedQuantity: 2,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv2.id);

    // Consultar staff en Edición 1
    const resEd1 = await request(app)
      .get(`/api/v1/events/${activeEventId}/inventory/staff`)
      .set('Authorization', `Bearer ${adminToken}`);
    const itemEd1 = resEd1.body.data.items.find((i: any) => i.size === commonSize);
    expect(itemEd1.total).toBe(50);
    expect(itemEd1.staffReserved).toBe(10);
    expect(itemEd1.availableForParticipants).toBe(40);

    // Consultar staff en Edición 2
    const resEd2 = await request(app)
      .get(`/api/v1/events/${secondEventId}/inventory/staff`)
      .set('Authorization', `Bearer ${adminToken}`);
    const itemEd2 = resEd2.body.data.items.find((i: any) => i.size === commonSize);
    expect(itemEd2.total).toBe(30);
    expect(itemEd2.staffReserved).toBe(2);
    expect(itemEd2.availableForParticipants).toBe(28);
  });

  it('Caso 14: Control de permisos RBAC: Solo ADMIN puede reservar o entregar; OPERATOR y VIEWER son rechazados (403)', async () => {
    const testSize = `RBAC_STAFF_${Date.now()}`;
    const inv = await prisma.tshirtInventory.create({
      data: {
        eventId: activeEventId,
        size: testSize,
        initialQuantity: 25,
        deliveredQuantity: 0,
        staffReservedQuantity: 5,
        isActive: true,
      },
    });
    createdInventoryIds.push(inv.id);

    // Operador intenta modificar reserva de staff
    const opReserveRes = await request(app)
      .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ size: testSize, reservedQuantity: 10 });
    expect(opReserveRes.status).toBe(403);

    // Operador intenta registrar entrega a staff
    const opDeliverRes = await request(app)
      .post(`/api/v1/events/${activeEventId}/inventory/staff/deliver`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ size: testSize, quantity: 1 });
    expect(opDeliverRes.status).toBe(403);

    // Consulta (Viewer) intenta modificar reserva de staff
    const viewReserveRes = await request(app)
      .put(`/api/v1/events/${activeEventId}/inventory/staff/reserve`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ size: testSize, reservedQuantity: 10 });
    expect(viewReserveRes.status).toBe(403);
  });

  it('Caso 15: Comprobar que los inventarios existentes conservan sus datos intactos', async () => {
    const defaultInventory = await request(app)
      .get(`/api/v1/events/${activeEventId}/inventory`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(defaultInventory.status).toBe(200);
    expect(defaultInventory.body.data.items.length).toBeGreaterThanOrEqual(1);
    const firstItem = defaultInventory.body.data.items[0];
    expect(firstItem).toHaveProperty('staffReservedQuantity');
    expect(firstItem).toHaveProperty('staffDeliveredQuantity');
    expect(firstItem).toHaveProperty('availableForParticipants');
  });
});
