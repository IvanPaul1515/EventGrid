import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/config/db.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { EventsService } from '../src/modules/events/events.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';

describe('Mejoras Alpha: Recepción, Ventas, Fichas y Tipos de Entrada', () => {
  let eventId: string;
  let adminUserId: string;
  let operatorUserId: string;
  let generalTicketTypeId: string;
  let courtesyTicketTypeId: string;
  let cashPaymentMethodId: string;

  beforeAll(async () => {
    // 1. Obtener edición BarCamp RD 2026
    const event = await prisma.event.findFirst({
      where: { year: 2026 },
      include: { ticketTypes: true, paymentMethods: true },
    });
    if (!event) throw new Error('No se encontró BarCamp RD 2026 en la base de datos');
    eventId = event.id;

    // 2. Obtener usuarios Admin y Operador
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    const operator = await prisma.user.findFirst({ where: { role: 'OPERATOR' } });
    adminUserId = admin?.id || 'admin-test-id';
    operatorUserId = operator?.id || 'operator-test-id';

    // 3. Obtener o crear tipos de entrada
    let genTicket = event.ticketTypes.find((t) => t.price > 0 && !t.name.toLowerCase().includes('preventa'));
    if (!genTicket) {
      genTicket = await prisma.ticketType.create({
        data: {
          eventId,
          name: 'Entrada General',
          price: 2000,
          description: 'Acceso completo al evento BarCamp RD 2026',
        },
      });
    }
    generalTicketTypeId = genTicket.id;

    let courtTicket = event.ticketTypes.find((t) => t.price === 0);
    if (!courtTicket) {
      courtTicket = await prisma.ticketType.create({
        data: {
          eventId,
          name: 'Cortesía Institucional',
          price: 0,
          description: 'Cortesía autorizada',
        },
      });
    }
    courtesyTicketTypeId = courtTicket.id;

    // 4. Obtener método de pago efectivo
    let cashMethod = event.paymentMethods.find((p) => p.name.toLowerCase().includes('efectivo'));
    if (!cashMethod) {
      cashMethod = await prisma.paymentMethod.create({
        data: { eventId, name: 'Efectivo RD$' },
      });
    }
    cashPaymentMethodId = cashMethod.id;
  });

  it('1. Debe listar los tipos de entrada configurados en la edición', async () => {
    const ticketTypes = await EventsService.getTicketTypes(eventId);
    expect(ticketTypes.length).toBeGreaterThanOrEqual(2);
    const names = ticketTypes.map((t) => t.name);
    expect(names.some((n) => n.includes('General'))).toBe(true);
  });

  it('2. Venta presencial con pago completo y cálculo de cambio', async () => {
    const saleResult = await ParticipantsService.onsiteSale(
      eventId,
      {
        firstName: 'Marcos',
        lastName: 'Alvarado',
        email: `marcos.alvarado.${Date.now()}@pucmm.edu.do`,
        documentId: `031-${Date.now().toString().slice(-7)}-1`,
        phone: '809-555-1234',
        institution: 'PUCMM Santiago',
        ticketTypeId: generalTicketTypeId,
        paymentMethodId: cashPaymentMethodId,
        amountReceived: 2500, // Pagó con RD$ 2,500
        amountPaid: 2000,     // Tarifa es RD$ 2,000
        notes: 'Venta presencial en mesa de recepción',
      },
      operatorUserId
    );

    expect(saleResult.registration).toBeDefined();
    expect(saleResult.registration.source).toBe('ONSITE_SALE');
    expect(saleResult.registration.participant.institution).toBe('PUCMM Santiago');
    expect(saleResult.financials.ticketPrice).toBe(2000);
    expect(saleResult.financials.amountPaid).toBe(2000);
    expect(saleResult.financials.changeDue).toBe(500); // RD$ 500 de cambio
    expect(saleResult.financials.balanceDue).toBe(0);
    expect(saleResult.registration.status).toBe('CONFIRMED');

    // Verificar registro contable del pago
    expect(saleResult.payment).toBeDefined();
    expect(saleResult.payment?.amount).toBe(2000);
  });

  it('3. Venta presencial con abono parcial y posterior saldo de balance', async () => {
    const salePartial = await ParticipantsService.onsiteSale(
      eventId,
      {
        firstName: 'Diana',
        lastName: 'Méndez',
        email: `diana.mendez.${Date.now()}@intec.edu.do`,
        institution: 'INTEC Santo Domingo',
        ticketTypeId: generalTicketTypeId,
        paymentMethodId: cashPaymentMethodId,
        amountReceived: 1000,
        amountPaid: 1000,
      },
      operatorUserId
    );

    expect(salePartial.financials.ticketPrice).toBe(2000);
    expect(salePartial.financials.amountPaid).toBe(1000);
    expect(salePartial.financials.balanceDue).toBe(1000);
    expect(salePartial.financials.changeDue).toBe(0);
    expect(salePartial.registration.status).toBe('PENDING');

    // Registrar abono final que liquida el balance
    const payResult = await ParticipantsService.recordPayment(
      eventId,
      salePartial.registration.id,
      {
        amount: 1000,
        paymentMethodId: cashPaymentMethodId,
        notes: 'Segundo abono para completar boleto',
      },
      operatorUserId
    );

    expect(Number(payResult.registration.amountPaid)).toBe(2000);
    expect(Number(payResult.registration.balanceDue)).toBe(0);
    expect(payResult.registration.status).toBe('CONFIRMED');

    // Comprobar historial del participante
    const history = await ParticipantsService.getHistory(eventId, salePartial.registration.id);
    expect(history.payments.length).toBe(2);
  });

  it('4. Asignación de cortesía con motivo y autorizador', async () => {
    // Crear participante sin pagar
    const reg = await ParticipantsService.create(eventId, {
      firstName: 'Profesor',
      lastName: 'Invitado',
      email: `profesor.invitado.${Date.now()}@pucmm.edu.do`,
      institution: 'Facultad de Ingeniería PUCMM',
      ticketTypeId: generalTicketTypeId,
      totalAmount: 2000,
      status: 'PENDING',
    });

    // Asignar cortesía por parte del ADMIN
    const courtesyReg = await ParticipantsService.assignCourtesy(
      eventId,
      reg.id,
      {
        authorizedBy: 'Comité Organizador BarCamp RD',
        reason: 'Ponente de Inteligencia Artificial',
      },
      adminUserId
    );

    expect(courtesyReg.isCourtesy).toBe(true);
    expect(courtesyReg.courtesyAuthorizedBy).toBe('Comité Organizador BarCamp RD');
    expect(courtesyReg.courtesyReason).toBe('Ponente de Inteligencia Artificial');
    expect(Number(courtesyReg.ticketPrice)).toBe(0);
    expect(Number(courtesyReg.balanceDue)).toBe(0);
    expect(courtesyReg.status).toBe('CONFIRMED');
  });

  it('5. Cancelación de inscripción sin borrar datos ni pagos, y reactivación', async () => {
    const saleResult = await ParticipantsService.onsiteSale(
      eventId,
      {
        firstName: 'Roberto',
        lastName: 'Peña',
        email: `roberto.pena.${Date.now()}@gmail.com`,
        ticketTypeId: generalTicketTypeId,
        paymentMethodId: cashPaymentMethodId,
        amountReceived: 2000,
        amountPaid: 2000,
      },
      operatorUserId
    );

    // Cancelar
    const cancelled = await ParticipantsService.cancelRegistration(
      eventId,
      saleResult.registration.id,
      'Solicitó anulación por viaje imprevisto',
      adminUserId
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.notes).toContain('Solicitó anulación por viaje imprevisto');

    // Reactivar
    const reactivated = await ParticipantsService.reactivateRegistration(
      eventId,
      saleResult.registration.id,
      'Decidió asistir finalmente',
      adminUserId
    );

    expect(reactivated.status).toBe('CONFIRMED');
    expect(reactivated.notes).toContain('Decidió asistir finalmente');
  });

  it('6. Búsqueda en recepción incluye institución y check-in desde Ficha', async () => {
    const uniqueEmail = `test.recepcion.${Date.now()}@empresa-tech.com`;
    const uniqueInst = `Fintech Solutions ${Date.now()}`;
    const sale = await ParticipantsService.onsiteSale(
      eventId,
      {
        firstName: 'Federico',
        lastName: 'Troncoso',
        email: uniqueEmail,
        institution: uniqueInst,
        ticketTypeId: generalTicketTypeId,
        paymentMethodId: cashPaymentMethodId,
        amountReceived: 2000,
        amountPaid: 2000,
      },
      operatorUserId
    );

    // Buscar por nombre de institución
    const searchRes = await AttendanceService.searchAndList(eventId, {
      search: uniqueInst,
      status: 'ALL',
      page: 1,
      limit: 10,
    });

    expect(searchRes.data.length).toBeGreaterThanOrEqual(1);
    const found = searchRes.data.find((r) => r.id === sale.registration.id);
    expect(found).toBeDefined();
    expect(found?.attended).toBe(false);

    // Ejecutar check-in (simulando pulsar "Marcar asistencia" en la Ficha del participante)
    const checkInResult = await AttendanceService.checkIn(eventId, sale.registration.id, operatorUserId);
    expect(checkInResult.registration.attended).toBe(true);
    expect(checkInResult.registration.attendedByUserId).toBe(operatorUserId);
    expect(checkInResult.registration.status).toBe('CONFIRMED');

    // Intentar marcar asistencia de nuevo debe fallar
    await expect(
      AttendanceService.checkIn(eventId, sale.registration.id, operatorUserId)
    ).rejects.toThrow(/ASISTENCIA YA REGISTRADA/i);
  });
});
