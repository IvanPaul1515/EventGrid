import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../src/app';
import { prisma } from '../src/config/db';
import { ENV } from '../src/config/env';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { ParticipantsService } from '../src/modules/participants/participants.service';
import { QrService } from '../src/modules/qr/qr.service';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { EventsService } from '../src/modules/events/events.service';

describe('EventGrid Bloque 4: Simulación Integral del Sistema (20 Pasos en Edición Aislada)', () => {
  const runId = Math.random().toString(36).substring(2, 7);
  let testEvent: any;
  let generalTicket: any;
  let vipTicket: any;
  let courtesyTicket: any;
  let paymentMethodCash: any;

  let adminUser: any;
  let operatorUser: any;
  let adminToken: string;
  let operatorToken: string;

  const createdParticipants: any[] = [];
  const createdRegistrations: any[] = [];

  beforeAll(async () => {
    // 0. Preparar método de pago para pruebas
    paymentMethodCash = await prisma.paymentMethod.findFirst({ where: { code: 'CASH' } });
    if (!paymentMethodCash) {
      paymentMethodCash = await prisma.paymentMethod.create({
        data: {
          name: 'Efectivo en Caja',
          code: 'CASH',
          isActive: true,
        },
      });
    }
  });

  afterAll(async () => {
    // Limpieza de simulación para mantener base de datos limpia
    try {
      if (testEvent?.id) {
        await prisma.emailBatchItem.deleteMany({ where: { job: { eventId: testEvent.id } } }).catch(() => {});
        await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.emailTemplate.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.staffTshirtDelivery.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.tshirtInventory.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { registration: { eventId: testEvent.id } } }).catch(() => {});
        await prisma.registration.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.ticketType.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } }).catch(() => {});
        await prisma.event.delete({ where: { id: testEvent.id } }).catch(() => {});
      }
    } catch {
      // Ignorar errores de cleanup
    }
  });

  it('Paso 1: Creación de la edición de prueba ("EventGrid QA — Prueba Integral")', async () => {
    testEvent = await prisma.event.create({
      data: {
        name: 'EventGrid QA — Prueba Integral',
        slug: `eventgrid-qa-integral-${runId}`,
        year: 2088,
        startDate: new Date('2088-06-15T08:00:00Z'),
        endDate: new Date('2088-06-15T19:00:00Z'),
        venue: 'Centro de Convenciones & Auditorio Metropolitano',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'INT-',
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(['S', 'M', 'L', 'XL']),
      },
    });

    expect(testEvent.id).toBeDefined();
    expect(testEvent.name).toBe('EventGrid QA — Prueba Integral');
  });

  it('Paso 2: Configuración de tipos de entrada (general, VIP, cortesía)', async () => {
    generalTicket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'General Integral',
        price: 1500,
        totalCapacity: 100,
      },
    });

    vipTicket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'VIP Integral',
        price: 3500,
        totalCapacity: 50,
      },
    });

    courtesyTicket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'Cortesía Integral',
        price: 0,
        totalCapacity: 30,
      },
    });

    expect(generalTicket.id).toBeDefined();
    expect(vipTicket.id).toBeDefined();
    expect(courtesyTicket.id).toBeDefined();
  });

  it('Paso 3: Configuración de inventario de camisetas (tallas S, M, L, XL con cantidades iniciales)', async () => {
    const sizes = [
      { size: 'S', quantity: 30 },
      { size: 'M', quantity: 50 },
      { size: 'L', quantity: 50 },
      { size: 'XL', quantity: 30 },
    ];

    for (const item of sizes) {
      await prisma.tshirtInventory.create({
        data: {
          eventId: testEvent.id,
          size: item.size,
          initialQuantity: item.quantity,
          deliveredQuantity: 0,
          staffReservedQuantity: 0,
          staffDeliveredQuantity: 0,
          isActive: true,
        },
      });
    }

    const inventoryData = await InventoryService.getInventory(testEvent.id);
    expect(inventoryData.items).toHaveLength(4);
    expect(inventoryData.stats.totalInitial).toBe(160);
  });

  it('Paso 4: Creación de usuarios (administrador y operador de check-in con tokens JWT)', async () => {
    adminUser = await prisma.user.create({
      data: {
        email: `admin_integral_${runId}@eventgrid.io`,
        fullName: 'Administrador Integral',
        passwordHash: 'fake_hash',
        role: 'ADMIN',
        isActive: true,
      },
    });

    operatorUser = await prisma.user.create({
      data: {
        email: `operator_integral_${runId}@eventgrid.io`,
        fullName: 'Operador Check-in Integral',
        passwordHash: 'fake_hash',
        role: 'OPERATOR',
        isActive: true,
      },
    });

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, fullName: adminUser.fullName, role: adminUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    operatorToken = jwt.sign(
      { id: operatorUser.id, email: operatorUser.email, fullName: operatorUser.fullName, role: operatorUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    expect(adminToken).toBeDefined();
    expect(operatorToken).toBeDefined();
  });

  it('Paso 5: Registro de 50 participantes simulados con perfiles diversos', async () => {
    const tshirtSizesCycle = ['M', 'L', 'XL', 'S', null];

    // Subgrupo A: 25 confirmados pagados (15 General, 10 VIP)
    for (let i = 1; i <= 25; i++) {
      const isVip = i > 15;
      const ticket = isVip ? vipTicket : generalTicket;
      const size = tshirtSizesCycle[i % tshirtSizesCycle.length];
      const hasPhone = i % 2 === 0;
      const hasInst = i % 3 === 0;

      const p = await prisma.participant.create({
        data: {
          email: `participant_paid_${i}_${runId}@eventgrid.io`,
          firstName: `Participante${i}`,
          lastName: `Confirmado`,
          fullName: `Participante${i} Confirmado`,
          phone: hasPhone ? `80955510${i}` : null,
          institution: hasInst ? `Empresa ${i}` : null,
        },
      });
      createdParticipants.push(p);

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: p.id,
          ticketTypeId: ticket.id,
          paymentMethodId: paymentMethodCash.id,
          registrationNumber: `INT-PAID-${String(i).padStart(3, '0')}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          totalAmount: ticket.price,
          amountPaid: ticket.price,
          balanceDue: 0,
          attended: false,
          isCourtesy: false,
          tshirtSize: size,
          saleTimestamp: new Date(),
        },
      });
      createdRegistrations.push(reg);
    }

    // Subgrupo B: 15 pendientes de pago (10 General, 5 VIP)
    for (let i = 26; i <= 40; i++) {
      const isVip = i > 35;
      const ticket = isVip ? vipTicket : generalTicket;
      const size = tshirtSizesCycle[i % tshirtSizesCycle.length];
      const hasPhone = i % 2 !== 0;

      const p = await prisma.participant.create({
        data: {
          email: `participant_pending_${i}_${runId}@eventgrid.io`,
          firstName: `Participante${i}`,
          lastName: `Pendiente`,
          fullName: `Participante${i} Pendiente`,
          phone: hasPhone ? `80955520${i}` : null,
        },
      });
      createdParticipants.push(p);

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: p.id,
          ticketTypeId: ticket.id,
          paymentMethodId: paymentMethodCash.id,
          registrationNumber: `INT-PEND-${String(i).padStart(3, '0')}`,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          totalAmount: ticket.price,
          amountPaid: 0,
          balanceDue: ticket.price,
          attended: false,
          isCourtesy: false,
          tshirtSize: size,
          saleTimestamp: new Date(),
        },
      });
      createdRegistrations.push(reg);
    }

    // Subgrupo C: 10 cortesías autorizadas
    for (let i = 41; i <= 50; i++) {
      const size = tshirtSizesCycle[i % tshirtSizesCycle.length];

      const p = await prisma.participant.create({
        data: {
          email: `participant_courtesy_${i}_${runId}@eventgrid.io`,
          firstName: `Participante${i}`,
          lastName: `Cortesia`,
          fullName: `Participante${i} Cortesia`,
          phone: `80955530${i}`,
          institution: 'Comunidad Tech Libre',
        },
      });
      createdParticipants.push(p);

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: p.id,
          ticketTypeId: courtesyTicket.id,
          registrationNumber: `INT-COURT-${String(i).padStart(3, '0')}`,
          status: 'CONFIRMED',
          paymentStatus: 'COMPLETED',
          totalAmount: 0,
          amountPaid: 0,
          balanceDue: 0,
          attended: false,
          isCourtesy: true,
          courtesyAuthorizedBy: 'Director QA',
          courtesyReason: 'Ponente Invitado',
          tshirtSize: size,
          saleTimestamp: new Date(),
        },
      });
      createdRegistrations.push(reg);
    }

    expect(createdParticipants).toHaveLength(50);
    expect(createdRegistrations).toHaveLength(50);
  });

  it('Paso 6: Confirmación de inscripciones pendientes mediante registro de pago', async () => {
    // Tomar 5 de las 15 inscripciones pendientes
    const pendingToPay = createdRegistrations.filter((r) => r.status === 'PENDING').slice(0, 5);
    expect(pendingToPay).toHaveLength(5);

    for (const reg of pendingToPay) {
      const result = await ParticipantsService.recordPayment(
        testEvent.id,
        reg.id,
        {
          amount: reg.balanceDue,
          paymentMethodId: paymentMethodCash.id,
          notes: 'Pago en taquilla previo al evento',
        },
        operatorUser.id
      );

      expect(result.registration.status).toBe('CONFIRMED');
      expect(result.registration.paymentStatus).toBe('PAID');
      expect(Number(result.registration.balanceDue)).toBe(0);
    }

    // Verificar en DB que quedan exactamente 10 pendientes
    const remainingPending = await prisma.registration.count({
      where: { eventId: testEvent.id, status: 'PENDING' },
    });
    expect(remainingPending).toBe(10);
  });

  it('Paso 7: Generación de códigos QR para los participantes confirmados', async () => {
    const confirmedRegs = await prisma.registration.findMany({
      where: { eventId: testEvent.id, status: 'CONFIRMED' },
      take: 10,
    });
    expect(confirmedRegs.length).toBeGreaterThanOrEqual(10);

    for (const reg of confirmedRegs) {
      const qrData = await QrService.getTicketQr(reg.id);
      expect(qrData.qrToken).toBeDefined();
      expect(qrData.qrToken.length).toBeGreaterThan(10);
      expect(qrData.qrDataUrl).toContain('data:image/png;base64');
    }
  });

  it('Paso 8: Simulación del día del evento — Check-in mediante QR', async () => {
    const reg = await prisma.registration.findFirst({
      where: { eventId: testEvent.id, status: 'CONFIRMED', attended: false },
    });
    expect(reg).not.toBeNull();

    const qrData = await QrService.getTicketQr(reg!.id);
    const scanResult = await QrService.validateAndScan(qrData.qrToken, testEvent.id);
    expect(scanResult.valid).toBe(true);
    expect(scanResult.registration.id).toBe(reg!.id);

    const checkInRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-event-id', testEvent.id)
      .send({
        registrationId: reg!.id,
      });

    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.status).toBe('success');
    expect(checkInRes.body.data.attended).toBe(true);
    expect(checkInRes.body.data.attendedByUserId).toBe(operatorUser.id);
  });

  it('Paso 9: Intento de check-in duplicado (debe ser rechazado con mensaje claro)', async () => {
    const attendedReg = await prisma.registration.findFirst({
      where: { eventId: testEvent.id, attended: true },
      include: { participant: true },
    });
    expect(attendedReg).not.toBeNull();

    const dupRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .set('x-event-id', testEvent.id)
      .send({
        registrationId: attendedReg!.id,
      });

    expect(dupRes.status).toBe(400);
    expect(dupRes.body.status).toBe('error');
    expect(dupRes.body.message).toContain('ASISTENCIA YA REGISTRADA');
    expect(dupRes.body.message).toContain(attendedReg!.participant.fullName);
  });

  it('Paso 10: Búsqueda manual y check-in por número de inscripción, nombre y correo', async () => {
    const targetReg = await prisma.registration.findFirst({
      where: { eventId: testEvent.id, status: 'CONFIRMED', attended: false },
      include: { participant: true },
    });
    expect(targetReg).not.toBeNull();

    // 10a. Búsqueda por número de registro
    const searchByNum = await AttendanceService.searchAndList(testEvent.id, {
      search: targetReg!.registrationNumber,
      status: 'ALL',
      page: 1,
      limit: 50,
    });
    expect(searchByNum.data.some((r: any) => r.id === targetReg!.id)).toBe(true);

    // 10b. Búsqueda por nombre
    const searchByName = await AttendanceService.searchAndList(testEvent.id, {
      search: targetReg!.participant.fullName,
      status: 'ALL',
      page: 1,
      limit: 50,
    });
    expect(searchByName.data.some((r: any) => r.id === targetReg!.id)).toBe(true);

    // 10c. Búsqueda por correo
    const searchByEmail = await AttendanceService.searchAndList(testEvent.id, {
      search: targetReg!.participant.email,
      status: 'ALL',
      page: 1,
      limit: 50,
    });
    expect(searchByEmail.data.some((r: any) => r.id === targetReg!.id)).toBe(true);

    // Ejecutar check-in manual
    const checkInRes = await AttendanceService.checkIn(
      testEvent.id,
      targetReg!.id,
      operatorUser.id
    );
    expect(checkInRes.registration.attended).toBe(true);
  });

  it('Paso 11: Registro de entrega de camisetas durante check-in con decremento de inventario', async () => {
    const inventoryBefore = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEvent.id, size: 'M' } },
    });
    const deliveredBefore = inventoryBefore!.deliveredQuantity;

    const candidateReg = await prisma.registration.findFirst({
      where: {
        eventId: testEvent.id,
        status: 'CONFIRMED',
        attended: false,
      },
    });
    expect(candidateReg).not.toBeNull();

    const checkInResult = await AttendanceService.checkIn(
      testEvent.id,
      candidateReg!.id,
      operatorUser.id,
      'M',
      true // tshirtDelivered: true
    );

    expect(checkInResult.registration.attended).toBe(true);
    expect(checkInResult.registration.tshirtSize).toBe('M');

    const inventoryAfter = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEvent.id, size: 'M' } },
    });
    expect(inventoryAfter!.deliveredQuantity).toBe(deliveredBefore + 1);
  });

  it('Paso 12: Reserva de camisetas para staff', async () => {
    const inventoryLBefore = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEvent.id, size: 'L' } },
    });
    expect(inventoryLBefore!.staffReservedQuantity).toBe(0);

    const reserveResult = await InventoryService.reserveStaffTshirts(
      testEvent.id,
      'L',
      5,
      adminUser.id
    );

    expect(reserveResult.staffReserved).toBe(5);

    const inventoryLAfter = await prisma.tshirtInventory.findUnique({
      where: { eventId_size: { eventId: testEvent.id, size: 'L' } },
    });
    expect(inventoryLAfter!.staffReservedQuantity).toBe(5);
  });

  it('Paso 13: Entrega de camisetas reservadas para staff', async () => {
    const deliveryResult = await InventoryService.deliverStaffTshirts(
      testEvent.id,
      {
        size: 'L',
        quantity: 3,
        recipientName: 'Mariana Coordinadora',
        notes: 'Entrega previa de 3 camisetas L',
      },
      adminUser.id
    );

    expect(deliveryResult.inventory.staffDelivered).toBe(3);
    expect(deliveryResult.inventory.staffReserved).toBe(5);

    const deliveries = await InventoryService.getStaffDeliveries(testEvent.id);
    expect(deliveries.some((d: any) => d.recipientName === 'Mariana Coordinadora')).toBe(true);
  });

  it('Paso 14: Verificación de que el inventario no permita entregas por encima de las existencias disponibles', async () => {
    // Intento de reservar 9999 camisetas
    await expect(
      InventoryService.reserveStaffTshirts(
        testEvent.id,
        'S',
        9999,
        adminUser.id
      )
    ).rejects.toThrow();

    // Intento de entregar más allá de las existencias
    await expect(
      InventoryService.deliverStaffTshirts(
        testEvent.id,
        {
          size: 'S',
          quantity: 9999,
          recipientName: 'Staff Fantasma',
        },
        adminUser.id
      )
    ).rejects.toThrow();
  });

  it('Paso 15: Envío de comunicación masiva simulada a participantes confirmados', async () => {
    await prisma.emailTemplate.create({
      data: {
        eventId: testEvent.id,
        code: `BULK_CONFIRMED_ANNOUNCE`,
        name: `Aviso General Confirmados ${runId}`,
        subject: 'Información Logística Importante - {{eventName}}',
        bodyHtml: '<p>Hola {{fullName}}, te esperamos en el evento. Tu registro: {{registrationNumber}}.</p>',
        bodyText: 'Hola {{fullName}}, te esperamos en el evento. Tu registro: {{registrationNumber}}.',
        variables: JSON.stringify(['fullName', 'eventName', 'registrationNumber']),
        isSystem: true,
      },
    });

    const sendResult = await CommunicationsService.sendBulkEmail(
      {
        eventId: testEvent.id,
        templateCode: `BULK_CONFIRMED_ANNOUNCE`,
        targetGroup: 'CONFIRMED',
        simulateOnly: true,
      },
      adminUser.id
    );

    expect(sendResult.batchId).toBeDefined();
    expect(sendResult.totalTargeted).toBeGreaterThan(0);

    // Procesar con el worker
    await EmailQueueWorker.processBatch(sendResult.batchId!);

    const processedJob = await prisma.emailBatchJob.findUnique({
      where: { id: sendResult.batchId! },
    });
    expect(['COMPLETED', 'PARTIALLY_FAILED', 'SIMULATED']).toContain(processedJob!.status);

    const items = await prisma.emailBatchItem.findMany({
      where: { jobId: sendResult.batchId! },
    });
    expect(items.every((it: any) => it.status === 'SIMULATED')).toBe(true);
  });

  it('Paso 16: Cancelación de un lote de correos en progreso', async () => {
    // Crear lote para cancelar
    const cancelBatch = await CommunicationsService.sendBulkEmail(
      {
        eventId: testEvent.id,
        templateCode: `BULK_CONFIRMED_ANNOUNCE`,
        targetGroup: 'ALL',
        simulateOnly: true,
      },
      adminUser.id
    );

    expect(cancelBatch.batchId).toBeDefined();

    const cancelledJob = await CommunicationsService.cancelBatchJob(cancelBatch.batchId!, testEvent.id);
    expect(cancelledJob.status).toBe('CANCELLED');

    const pendingAfter = await prisma.emailBatchItem.count({
      where: { jobId: cancelBatch.batchId!, status: 'PENDING' },
    });
    expect(pendingAfter).toBe(0);
  });

  it('Paso 17: Recuperación de lote abandonado tras caída simulada', async () => {
    // Simular un lote que quedó colgado con lease vencido
    const staleJob = await prisma.emailBatchJob.create({
      data: {
        eventId: testEvent.id,
        createdById: adminUser.id,
        subject: 'Subject Crash',
        status: 'PROCESSING',
        mode: 'SIMULATION',
        totalCount: 1,
        processedCount: 0,
        sentCount: 0,
        failedCount: 0,
      },
    });

    await prisma.emailBatchItem.create({
      data: {
        jobId: staleJob.id,
        recipientEmail: `stale_item_${runId}@eventgrid.io`,
        recipientName: 'Stale Recipient',
        status: 'PROCESSING',
        attempts: 0,
        leaseUntil: new Date(Date.now() - 3600 * 1000), // Venció hace 1 hora
      },
    });

    await EmailQueueWorker.recoverStaleJobs();

    const reloadedItem = await prisma.emailBatchItem.findFirst({
      where: { jobId: staleJob.id },
    });
    // Con attempts === 0, debe haber sido recuperado (reanudado a PENDING o completado en SIMULATED)
    expect(['PENDING', 'SIMULATED']).toContain(reloadedItem!.status);
    expect(reloadedItem!.leaseUntil).toBeNull();
  });

  it('Paso 18: Consulta del dashboard con estadísticas completas', async () => {
    const stats = await EventsService.getStats(testEvent.id);

    // Participantes
    expect(stats.participants.total).toBe(50);
    expect(stats.participants.confirmed).toBeGreaterThanOrEqual(30);
    expect(stats.participants.attended).toBeGreaterThanOrEqual(3);
    expect(stats.participants.attendanceRate).toBeGreaterThan(0);

    // Tipos de entrada
    expect(stats.tickets).toBeDefined();
    expect(stats.tickets.length).toBeGreaterThanOrEqual(3);

    // Finanzas
    expect(stats.finances).toBeDefined();
    expect(stats.finances.confirmedRevenue).toBeGreaterThan(0);

    // Inventario
    expect(stats.inventory).toBeDefined();
    expect(stats.inventory.totalCapacity).toBe(160);
    expect(stats.inventory.deliveredParticipants).toBeGreaterThanOrEqual(1);
    expect(stats.inventory.deliveredStaff).toBe(3);
    expect(stats.inventory.reservedStaff).toBe(5);

    // Comunicaciones
    expect(stats.communications).toBeDefined();
    expect(stats.communications.totalBatches).toBeGreaterThanOrEqual(2);
  });

  it('Paso 19: Exportación de datos de asistencia e inventario', async () => {
    // 19a. Exportar asistencia (genera archivo Excel)
    const attendanceExportBuffer = await AttendanceService.exportAttendance(testEvent.id);
    expect(Buffer.isBuffer(attendanceExportBuffer)).toBe(true);
    expect(attendanceExportBuffer.length).toBeGreaterThan(500);

    // 19b. Exportar participantes
    const participantsExport = await ParticipantsService.exportData(testEvent.id, {} as any, 'xlsx');
    expect(participantsExport.filename).toBeDefined();
    expect(participantsExport.buffer.length).toBeGreaterThan(500);

    // 19c. Estado de inventario
    const inventorySummary = await InventoryService.getInventory(testEvent.id);
    expect(inventorySummary.items.length).toBe(4);
  });

  it('Paso 20: Verificación de permisos RBAC (Operador restringido vs Administrador total)', async () => {
    // 20a. Operador intenta consultar administración de usuarios -> 403 Forbidden
    const opUsersRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${operatorToken}`);
    expect(opUsersRes.status).toBe(403);

    // 20b. Operador intenta cancelar lote de correos -> 403 Forbidden
    const dummyJob = await prisma.emailBatchJob.findFirst({ where: { eventId: testEvent.id } });
    if (dummyJob) {
      const opCancelRes = await request(app)
        .post(`/api/v1/communications/batches/${dummyJob.id}/cancel`)
        .set('Authorization', `Bearer ${operatorToken}`);
      expect(opCancelRes.status).toBe(403);
    }

    // 20c. Operador intenta reintentar envíos inciertos -> 403 Forbidden
    if (dummyJob) {
      const opRetryUncertainRes = await request(app)
        .post(`/api/v1/communications/batches/${dummyJob.id}/retry-uncertain`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          confirmedDuplicateRisk: true,
          reason: 'Operador no autorizado',
        });
      expect(opRetryUncertainRes.status).toBe(403);
    }

    // 20d. Administrador consulta administración de usuarios -> 200 OK
    const adminUsersRes = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminUsersRes.status).toBe(200);
    expect(adminUsersRes.body.status).toBe('success');
    expect(adminUsersRes.body.data.length).toBeGreaterThan(0);
  });
});
