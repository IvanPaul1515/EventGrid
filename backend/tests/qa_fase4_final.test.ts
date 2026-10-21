import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { InventoryService } from '../src/modules/inventory/inventory.service';
import { ParticipantsService } from '../src/modules/participants/participants.service';
import { recordFailedLogin } from '../src/middleware/rateLimiter';

describe('EventGrid Fase 4: Cola Masiva Asíncrona, Prisma Multi-entorno, Concurrencia y Resiliencia', () => {
  let testEvent: any;
  let adminUser: any;
  let sampleRegistrations: any[] = [];
  const runId = Math.random().toString(36).substring(2, 7);

  beforeAll(async () => {
    // 1. Obtener o crear usuario admin para auditoría
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: `admin_fase4_${runId}@eventgrid.io`,
          fullName: 'Admin Fase 4 Test',
          passwordHash: 'fakehash',
          role: 'ADMIN',
        },
      });
    }

    // 2. Crear evento aislado para la suite
    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 4 ${runId}`,
        slug: `fase4-${runId}`,
        year: 2094,
        startDate: new Date('2094-11-20T09:00:00Z'),
        endDate: new Date('2026-11-20T18:00:00Z'),
        venue: 'Centro de Convenciones Fase 4',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'F4-',
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(['M', 'L', 'XL']),
      },
    });

    const ticket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'General Fase 4',
        price: 1500,
        totalCapacity: 200,
      },
    });

    // 3. Crear 5 participantes de prueba
    for (let i = 1; i <= 5; i++) {
      const part = await prisma.participant.create({
        data: {
          firstName: `Participante${i}`,
          lastName: `Fase4_${runId}`,
          fullName: `Participante${i} Fase4_${runId}`,
          email: `user${i}_${runId}@eventgrid-test.org`,
          documentId: `DOC-F4-${runId}-${i}`,
        },
      });

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: part.id,
          ticketTypeId: ticket.id,
          registrationNumber: `F4-${String(i).padStart(4, '0')}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
        include: { participant: true },
      });
      sampleRegistrations.push(reg);
    }
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    if (testEvent) {
      await prisma.staffTshirtDelivery.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailBatchItem.deleteMany({
        where: { job: { eventId: testEvent.id } },
      });
      await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailLog.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registration.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.tshirtInventory.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.ticketType.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registrationSequence.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.event.delete({ where: { id: testEvent.id } });
    }
  });

  // =========================================================================
  // 1. COLA ASÍNCRONA RECUPERABLE Y CONTROL DE LOTES
  // =========================================================================
  describe('1. Cola Asíncrona Recuperable para Envíos Masivos', () => {
    let bulkJobId: string;

    it('1.1 sendBulkEmail responde de inmediato con status PENDING o inicial sin bloquear la petición HTTP', async () => {
      const startTime = Date.now();
      const result = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'REGISTRATION_CONFIRMATION',
          targetGroup: 'ALL',
          simulateOnly: true,
        },
        adminUser.id
      );

      const elapsedMs = Date.now() - startTime;
      expect(result.batchId).toBeDefined();
      expect(result.totalTargeted).toBe(sampleRegistrations.length);
      expect(elapsedMs).toBeLessThan(1500); // Respuesta casi instantánea

      bulkJobId = result.batchId;
      const job = await CommunicationsService.getBatchJob(bulkJobId, testEvent.id);
      expect(job).toBeDefined();
      expect(['PENDING', 'PROCESSING', 'SIMULATED']).toContain(job!.status);
    });

    it('1.2 El worker en segundo plano procesa el lote y sus ítems de forma atómica y persistente', async () => {
      // Esperar a que el worker complete la simulación
      let job = await CommunicationsService.getBatchJob(bulkJobId, testEvent.id);
      for (let i = 0; i < 30 && job && (job.status === 'PENDING' || job.status === 'PROCESSING'); i++) {
        await new Promise((r) => setTimeout(r, 100));
        job = await CommunicationsService.getBatchJob(bulkJobId, testEvent.id);
      }

      expect(job).toBeDefined();
      expect(['SIMULATED', 'COMPLETED']).toContain(job!.status);
      expect(job!.processedCount).toBe(sampleRegistrations.length);
      expect(job!.simulatedCount).toBe(sampleRegistrations.length);

      // Verificar ítems persistidos con sus idempotencyKeys
      expect(job!.items).toHaveLength(sampleRegistrations.length);
      for (const item of job!.items) {
        expect(item.status).toBe('SIMULATED');
        expect(item.idempotencyKey).toBe(`${bulkJobId}:${item.registrationId}`);
      }
    });

    it('1.3 Permite cancelar envíos masivos pendientes', async () => {
      // Crear un lote manual en PENDING
      const manualJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote a cancelar',
          filterCriteria: JSON.stringify({ targetGroup: 'ALL' }),
          status: 'PENDING',
          totalCount: 3,
          createdById: adminUser.id,
        },
      });

      for (let i = 0; i < 3; i++) {
        await prisma.emailBatchItem.create({
          data: {
            jobId: manualJob.id,
            registrationId: sampleRegistrations[i].id,
            recipientEmail: sampleRegistrations[i].participant.email,
            recipientName: sampleRegistrations[i].participant.fullName,
            status: 'PENDING',
            idempotencyKey: `${manualJob.id}:${sampleRegistrations[i].id}`,
          },
        });
      }

      // Cancelar el lote
      const cancelResult = await CommunicationsService.cancelBatchJob(manualJob.id, testEvent.id);
      expect(cancelResult.status).toBe('CANCELLED');

      const updatedJob = await CommunicationsService.getBatchJob(manualJob.id, testEvent.id);
      expect(updatedJob!.status).toBe('CANCELLED');
      expect(updatedJob!.cancelledCount).toBe(3);
      for (const item of updatedJob!.items) {
        expect(item.status).toBe('CANCELLED');
      }
    });

    it('1.4 Permite reintentar ítems fallidos en un lote (retryBatchJob)', async () => {
      // Crear un lote con 2 ítems fallidos
      const failedJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote con fallos para reintentar',
          filterCriteria: JSON.stringify({ targetGroup: 'ALL' }),
          status: 'FAILED',
          mode: 'SIMULATION',
          totalCount: 2,
          processedCount: 2,
          failedCount: 2,
          createdById: adminUser.id,
        },
      });

      for (let i = 0; i < 2; i++) {
        await prisma.emailBatchItem.create({
          data: {
            jobId: failedJob.id,
            registrationId: sampleRegistrations[i].id,
            recipientEmail: sampleRegistrations[i].participant.email,
            recipientName: sampleRegistrations[i].participant.fullName,
            status: 'FAILED',
            attempts: 1,
            errorMessage: 'Simulated network timeout',
            idempotencyKey: `${failedJob.id}:${sampleRegistrations[i].id}`,
          },
        });
      }

      const retryResult = await CommunicationsService.retryBatchJob(failedJob.id, testEvent.id);
      expect(['PENDING', 'PROCESSING', 'SIMULATED', 'COMPLETED']).toContain(retryResult.status);

      // Esperar brevemente a que el worker procese los reintentos
      let updated = await CommunicationsService.getBatchJob(failedJob.id, testEvent.id);
      for (let i = 0; i < 25 && updated && (updated.status === 'PENDING' || updated.status === 'PROCESSING'); i++) {
        await new Promise((r) => setTimeout(r, 100));
        updated = await CommunicationsService.getBatchJob(failedJob.id, testEvent.id);
      }
      expect(['SIMULATED', 'COMPLETED', 'PROCESSING', 'PENDING']).toContain(updated!.status);
    });

    it('1.5 Worker Lease Recovery: recupera ítems bloqueados con lease expirado', async () => {
      const staleJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote con item zombi',
          filterCriteria: JSON.stringify({ targetGroup: 'ALL' }),
          status: 'PROCESSING',
          totalCount: 1,
          processedCount: 0,
          createdById: adminUser.id,
        },
      });

      // Ítem en PROCESSING con lease vencido en el pasado
      await prisma.emailBatchItem.create({
        data: {
          jobId: staleJob.id,
          registrationId: sampleRegistrations[0].id,
          recipientEmail: sampleRegistrations[0].participant.email,
          recipientName: sampleRegistrations[0].participant.fullName,
          status: 'PROCESSING',
          leaseUntil: new Date(Date.now() - 60000), // Expirado hace 1 minuto
          attempts: 0,
          idempotencyKey: `${staleJob.id}:${sampleRegistrations[0].id}`,
        },
      });

      // Ejecutar recuperación de ítems huérfanos
      const recoveredCount = await EmailQueueWorker.recoverStaleJobs();
      expect(recoveredCount).toBeGreaterThanOrEqual(1);

      // El ítem debe haber vuelto a PENDING
      const item = await prisma.emailBatchItem.findFirst({
        where: { jobId: staleJob.id },
      });
      expect(item!.status).toBe('PENDING');
      expect(item!.leaseUntil).toBeNull();
    });

    it('1.6 Rechazo estricto si se intenta enviar masivo real sin SMTP configurado y habilitado', async () => {
      // Nos aseguramos de que no hay SMTP activo
      await prisma.emailConfig.deleteMany({ where: { eventId: testEvent.id } });

      await expect(
        CommunicationsService.sendBulkEmail(
          {
            eventId: testEvent.id,
            templateCode: 'REGISTRATION_CONFIRMATION',
            targetGroup: 'ALL',
            simulateOnly: false, // Envío real solicitado
          },
          adminUser.id
        )
      ).rejects.toThrow(/SMTP/i);
    });
  });

  // =========================================================================
  // 2. CONCURRENCIA ATÓMICA EN INVENTARIO Y STAFF
  // =========================================================================
  describe('2. Concurrencia Atómica en Inventario y Gestión de Staff', () => {
    let inventoryItem: any;

    beforeAll(async () => {
      inventoryItem = await prisma.tshirtInventory.create({
        data: {
          eventId: testEvent.id,
          size: 'M',
          initialQuantity: 50,
          deliveredQuantity: 10,
          staffReservedQuantity: 5,
          staffDeliveredQuantity: 2,
          isActive: true,
        },
      });
    });

    it('2.1 Reserva atómica de staff respeta existencias disponibles para participantes', async () => {
      // Disponibles = 50 - 10 = 40 max reservable para staff. Intentar reservar 45 debe fallar
      await expect(
        InventoryService.reserveStaffTshirts(
          testEvent.id,
          'M',
          45,
          adminUser.id
        )
      ).rejects.toThrow(/suficientes camisetas disponibles/i);

      // Reservar 15 válidas (era 5, nueva meta 15)
      const updated = await InventoryService.reserveStaffTshirts(
        testEvent.id,
        'M',
        15,
        adminUser.id
      );

      expect(updated.staffReserved).toBe(15);
    });

    it('2.2 Entrega atómica de staff no excede la cantidad reservada para staff', async () => {
      // Actualmente: staffReserved = 15, staffDelivered = 2. Pendientes de entregar a staff = 13.
      // Intentar entregar 20 a staff debe fallar
      await expect(
        InventoryService.deliverStaffTshirts(
          testEvent.id,
          {
            size: 'M',
            quantity: 20,
            recipientName: 'Operador Test',
          },
          adminUser.id
        )
      ).rejects.toThrow(/superaría la reserva/i);

      // Entregar 5 válidas a staff
      const delivery = await InventoryService.deliverStaffTshirts(
        testEvent.id,
        {
          size: 'M',
          quantity: 5,
          recipientName: 'Operador Test',
        },
        adminUser.id
      );

      expect(delivery).toBeDefined();
      const updatedInv = await prisma.tshirtInventory.findUnique({
        where: { id: inventoryItem.id },
      });
      expect(updatedInv!.staffDeliveredQuantity).toBe(7); // 2 previo + 5
    });

    it('2.3 Liberación atómica de reservas staff no permite liberar más de lo reservado no entregado', async () => {
      // staffReserved = 15, staffDelivered = 7. Reservas no entregadas = 8.
      // Intentar liberar 12 debe fallar (> 8 pendientes)
      await expect(
        InventoryService.releaseStaffTshirts(
          testEvent.id,
          'M',
          12,
          adminUser.id
        )
      ).rejects.toThrow(/No se pueden liberar/i);

      // Liberar 5 válidas (de las 8 pendientes)
      const result = await InventoryService.releaseStaffTshirts(
        testEvent.id,
        'M',
        5,
        adminUser.id
      );

      expect(result.staffReserved).toBe(10); // 15 - 5
    });
  });

  // =========================================================================
  // 3. SEGURIDAD: RATE LIMITER ATÓMICO Y RESOLUCIÓN DE IPs
  // =========================================================================
  describe('3. Rate Limiter Atómico y Resolución de IPs', () => {
    it('3.1 Incremento atómico en fallos de login concurrentes registra el conteo exacto', async () => {
      const testIp = `192.168.100.${Math.floor(Math.random() * 200) + 10}`;
      const email = `victim_${runId}@eventgrid.io`;
      const key = `ip:${testIp}`;
      const mockReq = { ip: testIp, headers: {}, socket: { remoteAddress: testIp } } as any;

      // Simular 5 fallos concurrentes a través de recordFailedLogin
      const promises = Array.from({ length: 5 }, () => recordFailedLogin(mockReq, email));
      await Promise.all(promises);

      const record = await prisma.loginAttempt.findUnique({ where: { key } });
      expect(record).toBeDefined();
      expect(record!.count).toBe(5);

      // Limpiar registro de prueba
      await prisma.loginAttempt.deleteMany({ where: { key: { in: [key, `email:${email}`] } } });
    });
  });

  // =========================================================================
  // 4. NUMERACIÓN SECUENCIAL ROBUSTA ANTE IMPORTACIONES PREVIAS
  // =========================================================================
  describe('4. Generación Robusta de Números de Inscripción', () => {
    it('4.1 Inicializa secuencia respetando el sufijo numérico más alto importado', async () => {
      const seqEvent = await prisma.event.create({
        data: {
          name: `Edición Secuencia ${runId}`,
          slug: `sec-${runId}`,
          year: 2095,
          startDate: new Date('2095-11-20T09:00:00Z'),
          endDate: new Date('2026-11-20T18:00:00Z'),
          status: 'ACTIVE',
        },
      });

      await prisma.eventSettings.create({
        data: {
          eventId: seqEvent.id,
          registrationPrefix: 'EVT26-',
        },
      });

      const ticket = await prisma.ticketType.create({
        data: {
          eventId: seqEvent.id,
          name: 'Regular',
          price: 1000,
          totalCapacity: 500,
        },
      });

      const participant = await prisma.participant.create({
        data: {
          firstName: 'Importado',
          lastName: 'Previo',
          fullName: 'Importado Previo',
          email: `importado_${runId}@test.com`,
          documentId: `DOC-IMP-${runId}`,
        },
      });

      // Crear un participante previamente importado con número alto EVT26-0450
      await prisma.registration.create({
        data: {
          eventId: seqEvent.id,
          participantId: participant.id,
          ticketTypeId: ticket.id,
          registrationNumber: 'EVT26-0450',
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
      });

      // El siguiente número generado automáticamente debe ser EVT26-0451 (no EVT26-0001)
      const nextNum = await ParticipantsService.getNextRegistrationNumber(seqEvent.id);
      expect(nextNum).toBe('EVT26-0451');

      // Limpieza del evento de prueba
      await prisma.registration.deleteMany({ where: { eventId: seqEvent.id } });
      await prisma.registrationSequence.deleteMany({ where: { eventId: seqEvent.id } });
      await prisma.ticketType.deleteMany({ where: { eventId: seqEvent.id } });
      await prisma.eventSettings.deleteMany({ where: { eventId: seqEvent.id } });
      await prisma.event.delete({ where: { id: seqEvent.id } });
    });
  });
});
