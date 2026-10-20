import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('Actualización de Tarifas, Fechas Previas y Saldo a Favor', () => {
  let adminToken: string;
  let eventId: string;
  let testTicketTypeId: string;
  let registrationPaidMoreId: string;
  let registrationPartialId: string;

  beforeAll(async () => {
    // Iniciar sesión como Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = loginRes.body.data.token;

    // Obtener edición predeterminada (BarCamp RD 2026)
    const eventsRes = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`);
    const active = eventsRes.body.data.find((e: any) => e.isDefault);
    eventId = active.id;

    // Crear un tipo de entrada de prueba con tarifa inicial de RD$ 2,000
    const tt = await prisma.ticketType.create({
      data: {
        eventId,
        name: 'Tarifa Test General',
        price: 2000,
        description: 'Boleto general para prueba de cambio de tarifa',
      },
    });
    testTicketTypeId = tt.id;

    // Crear un participante que pagó la tarifa anterior completa (RD$ 2,000)
    const p1 = await prisma.participant.create({
      data: {
        firstName: 'Carlos',
        lastName: 'Prueba Tarifa',
        fullName: 'Carlos Prueba Tarifa',
        email: `carlos.tarifa.${Date.now()}@test.com`,
      },
    });

    const reg1 = await prisma.registration.create({
      data: {
        eventId,
        participantId: p1.id,
        registrationNumber: `TEST-TF-${Date.now().toString().slice(-4)}A`,
        source: 'MANUAL',
        ticketTypeId: testTicketTypeId,
        ticketPrice: 2000,
        amountPaid: 2000,
        totalAmount: 2000,
        balanceDue: 0,
        paymentStatus: 'PAID',
        qrCode: `eg_qr_test_tf_${Date.now()}`,
      },
    });
    registrationPaidMoreId = reg1.id;

    // Crear un participante con pago parcial (pagó RD$ 1,000 de los 2,000 iniciales)
    const p2 = await prisma.participant.create({
      data: {
        firstName: 'Laura',
        lastName: 'Prueba Parcial',
        fullName: 'Laura Prueba Parcial',
        email: `laura.tarifa.${Date.now()}@test.com`,
      },
    });

    const reg2 = await prisma.registration.create({
      data: {
        eventId,
        participantId: p2.id,
        registrationNumber: `TEST-TF-${Date.now().toString().slice(-4)}B`,
        source: 'MANUAL',
        ticketTypeId: testTicketTypeId,
        ticketPrice: 2000,
        amountPaid: 1000,
        totalAmount: 1000,
        balanceDue: 1000,
        paymentStatus: 'PARTIAL',
        qrCode: `eg_qr_test_tf2_${Date.now()}`,
      },
    });
    registrationPartialId = reg2.id;
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (registrationPaidMoreId) {
      await prisma.registration.delete({ where: { id: registrationPaidMoreId } }).catch(() => {});
    }
    if (registrationPartialId) {
      await prisma.registration.delete({ where: { id: registrationPartialId } }).catch(() => {});
    }
    if (testTicketTypeId) {
      await prisma.ticketType.delete({ where: { id: testTicketTypeId } }).catch(() => {});
    }
    await prisma.participant.deleteMany({
      where: { email: { contains: '@test.com' } },
    }).catch(() => {});
  });

  it('1. Debe actualizar la tarifa de RD$ 2,000 a RD$ 1,750 y propagarla a los participantes', async () => {
    const updateRes = await request(app)
      .put(`/api/v1/events/${eventId}/ticket-types/${testTicketTypeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Tarifa Test General (Ajustada)',
        price: 1750,
      });

    expect(updateRes.status).toBe(200);
    expect(Number(updateRes.body.data.price)).toBe(1750);

    // Verificar participante que pagó 2,000:
    // Su tarifa ahora es 1,750, pagó 2,000, balanceDue es 0 (pagó RD$ 250 de más)
    const check1 = await prisma.registration.findUnique({
      where: { id: registrationPaidMoreId },
    });
    expect(Number(check1?.ticketPrice)).toBe(1750);
    expect(Number(check1?.amountPaid)).toBe(2000);
    expect(Number(check1?.balanceDue)).toBe(0);
    expect(check1?.paymentStatus).toBe('PAID');

    // Verificar participante que pagó parcial 1,000:
    // Su tarifa ahora es 1,750, pagó 1,000, balanceDue ahora es 750 (en vez de 1,000)
    const check2 = await prisma.registration.findUnique({
      where: { id: registrationPartialId },
    });
    expect(Number(check2?.ticketPrice)).toBe(1750);
    expect(Number(check2?.amountPaid)).toBe(1000);
    expect(Number(check2?.balanceDue)).toBe(750);
    expect(check2?.paymentStatus).toBe('PARTIAL');
  });

  it('2. Debe permitir ajustar el monto pagado de quien pagó de más a la nueva tarifa exacta (1,750)', async () => {
    const updateRegRes = await request(app)
      .put(`/api/v1/participants/${registrationPaidMoreId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        amountPaid: 1750,
        totalAmount: 1750,
      });

    expect(updateRegRes.status).toBe(200);
    expect(Number(updateRegRes.body.data.amountPaid)).toBe(1750);
    expect(Number(updateRegRes.body.data.ticketPrice)).toBe(1750);
    expect(Number(updateRegRes.body.data.balanceDue)).toBe(0);
  });

  it('3. Debe registrar y persistir que una boleta fue comprada con fecha previa (saleTimestamp)', async () => {
    const pastDate = new Date('2026-08-15T14:30:00.000Z');
    const updateDateRes = await request(app)
      .put(`/api/v1/participants/${registrationPaidMoreId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        saleTimestamp: pastDate.toISOString(),
      });

    expect(updateDateRes.status).toBe(200);
    const updated = await prisma.registration.findUnique({
      where: { id: registrationPaidMoreId },
    });
    expect(new Date(updated!.saleTimestamp!).toISOString()).toBe(pastDate.toISOString());
  });
});
