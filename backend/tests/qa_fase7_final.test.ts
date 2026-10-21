import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { UsersService } from '../src/modules/users/users.service';

describe('EventGrid Fase 7: QA-33 a QA-37 y Administración Segura de Usuarios', () => {
  let testEvent: any;
  let adminUser: any;
  let operatorUser: any;
  let sampleRegistrations: any[] = [];
  const runId = Math.random().toString(36).substring(2, 7);

  beforeAll(async () => {
    // 1. Obtener o crear usuarios de prueba
    adminUser = await prisma.user.create({
      data: {
        email: `admin_fase7_${runId}@eventgrid.io`,
        fullName: 'Admin Fase 7 RBAC',
        passwordHash: 'fake_hash',
        role: 'ADMIN',
        isActive: true,
      },
    });

    operatorUser = await prisma.user.create({
      data: {
        email: `operator_fase7_${runId}@eventgrid.io`,
        fullName: 'Operador Fase 7 RBAC',
        passwordHash: 'fake_hash',
        role: 'OPERATOR',
        isActive: true,
      },
    });

    // 2. Crear edición de prueba para Fase 7
    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 7 QA-33 a QA-37 ${runId}`,
        slug: `fase7-${runId}`,
        year: 2087,
        startDate: new Date('2087-05-10T09:00:00Z'),
        endDate: new Date('2087-05-10T18:00:00Z'),
        venue: 'Centro de Convenciones Fase 7',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'F7-',
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(['M', 'L', 'XL']),
      },
    });

    const ticket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'General Fase 7',
        price: 1200,
        totalCapacity: 150,
      },
    });

    // 3. Crear 4 participantes de prueba
    for (let i = 1; i <= 4; i++) {
      const part = await prisma.participant.create({
        data: {
          email: `part_f7_${i}_${runId}@eventgrid.io`,
          firstName: `Participante ${i}`,
          lastName: `Fase7`,
          fullName: `Participante ${i} Fase7`,
          phone: `80955500${i}`,
          institution: 'Instituto de Pruebas QA-F7',
        },
      });

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: part.id,
          ticketTypeId: ticket.id,
          registrationNumber: `F7-${runId}-${1000 + i}`,
          qrCode: `QR-F7-${runId}-${1000 + i}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
        include: { participant: true },
      });
      sampleRegistrations.push(reg);
    }
  });

  afterAll(async () => {
    EmailQueueWorker.setTransporterFactory(null);

    try {
      await prisma.emailBatchItem.deleteMany({
        where: { recipientEmail: { contains: runId } },
      });
      await prisma.emailBatchJob.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.emailLog.deleteMany({
        where: { recipientEmail: { contains: runId } },
      });
      await prisma.emailTemplate.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.emailConfig.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.registration.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.ticketType.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.eventSettings.deleteMany({
        where: { eventId: testEvent?.id },
      });
      await prisma.event.delete({
        where: { id: testEvent?.id },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminUser?.id, operatorUser?.id] } },
      });
    } catch (e) {
      // Ignorar errores en limpieza de tests
    }
  });

  // =========================================================================
  // QA-33: ELIMINAR REINTENTOS INCIERTOS SIN AUTORIZACIÓN EXPLÍCITA
  // =========================================================================
  describe('QA-33: Impedir el reintento de envíos inciertos mediante rutas/métodos antiguos', () => {
    it('33.1: retryBatchJob() genérico NUNCA reintenta items UNKNOWN_DELIVERY_STATUS', async () => {
      const jobId = `BATCH-QA33-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Prueba QA-33 Sin Bypass',
          status: 'FAILED',
          mode: 'REAL',
          totalCount: 2,
          failedCount: 2,
        },
      });

      // 1 item con FAILED confirmado
      const itemF = await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `failed_item_${runId}@eventgrid.io`,
          status: 'FAILED',
          errorMessage: '550 User unknown',
          attempts: 3,
        },
      });

      // 1 item con UNKNOWN_DELIVERY_STATUS
      const itemU = await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `uncertain_item_${runId}@eventgrid.io`,
          status: 'UNKNOWN_DELIVERY_STATUS',
          errorMessage: 'read ECONNRESET after DATA',
          attempts: 1,
        },
      });

      // Ejecutar el método genérico antiguo retryBatchJob
      await CommunicationsService.retryBatchJob(jobId, testEvent.id);

      // El ítem fallido debe haber sido reiniciado a PENDING (o reprocesado a FAILED por el worker)
      const refetchedF = await prisma.emailBatchItem.findUnique({ where: { id: itemF.id } });
      expect(['PENDING', 'PROCESSING', 'FAILED']).toContain(refetchedF!.status);

      // El ítem incierto DEBE PERMANECER estrictamente en UNKNOWN_DELIVERY_STATUS
      const refetchedU = await prisma.emailBatchItem.findUnique({ where: { id: itemU.id } });
      expect(refetchedU!.status).toBe('UNKNOWN_DELIVERY_STATUS');
    });

    it('33.2: Lote que solo tiene UNKNOWN_DELIVERY_STATUS es ignorado por retryBatchJob genérico', async () => {
      const jobId = `BATCH-QA33-ONLY-UNCERTAIN-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Lote Solo Incierto',
          status: 'FAILED',
          mode: 'REAL',
          totalCount: 1,
          failedCount: 1,
        },
      });

      const itemU = await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `only_uncertain_${runId}@eventgrid.io`,
          status: 'UNKNOWN_DELIVERY_STATUS',
          errorMessage: 'ETIMEDOUT during DATA transmission',
          attempts: 1,
        },
      });

      // Ejecutar reintento genérico
      await CommunicationsService.retryBatchJob(jobId, testEvent.id);

      // Sigue sin ser modificado
      const checkItem = await prisma.emailBatchItem.findUnique({ where: { id: itemU.id } });
      expect(checkItem!.status).toBe('UNKNOWN_DELIVERY_STATUS');
    });
  });

  // =========================================================================
  // QA-34: ACEPTACIÓN SMTP VERIFICABLE (EXCLUSIÓN DE MESSAGEID COMO PRUEBA)
  // =========================================================================
  describe('QA-34: Aceptación SMTP Verificable y Clasificación Rigurosa', () => {
    it('34.1: Si sendMail devuelve messageId pero NO código 250 ni recipient en accepted, se marca como UNKNOWN_DELIVERY_STATUS', async () => {
      // Simular transporte que devuelve messageId local sin confirmación del servidor SMTP
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (_mailOptions: any) => ({
          messageId: '<generated-locally-without-remote-ack@eventgrid.io>',
          accepted: [], // Vacío: servidor no confirmó
          rejected: [],
          response: '', // Sin código 250
        }),
      }));

      const jobId = `BATCH-QA34-UNVERIFIED-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Prueba QA-34 Sin 250',
          mode: 'REAL',
          status: 'PENDING',
          totalCount: 1,
          bodyHtml: '<p>Cuerpo</p>',
        },
      });

      const item = await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `unverified_ack_${runId}@eventgrid.io`,
          status: 'PENDING',
          renderedSubject: 'Prueba QA-34 Sin 250',
          renderedHtml: '<p>Cuerpo</p>',
        },
      });

      // Activar SMTP ficticio en emailConfig
      await prisma.emailConfig.upsert({
        where: { eventId: testEvent.id },
        create: {
          eventId: testEvent.id,
          host: 'smtp.qa34.local',
          port: 587,
          isEnabled: true,
        },
        update: {
          host: 'smtp.qa34.local',
          port: 587,
          isEnabled: true,
        },
      });

      await EmailQueueWorker.processBatch(jobId);

      const refetchedItem = await prisma.emailBatchItem.findUnique({ where: { id: item.id } });
      expect(refetchedItem!.status).toBe('UNKNOWN_DELIVERY_STATUS');
      expect(refetchedItem!.errorMessage).toContain('Sin confirmación 250');
    });

    it('34.2: Si sendMail incluye recipient en accepted o respuesta 250, registra ACCEPTED_BY_SMTP', async () => {
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (mailOptions: any) => ({
          messageId: '<ack-confirmed@eventgrid.io>',
          accepted: [mailOptions.to],
          response: '250 2.1.5 Ok recipient accepted',
        }),
      }));

      const jobId = `BATCH-QA34-VERIFIED-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Prueba QA-34 Con 250',
          mode: 'REAL',
          status: 'PENDING',
          totalCount: 1,
          bodyHtml: '<p>Cuerpo</p>',
        },
      });

      const item = await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `verified_ack_${runId}@eventgrid.io`,
          status: 'PENDING',
          renderedSubject: 'Prueba QA-34 Con 250',
          renderedHtml: '<p>Cuerpo</p>',
        },
      });

      await EmailQueueWorker.processBatch(jobId);

      const refetchedItem = await prisma.emailBatchItem.findUnique({ where: { id: item.id } });
      expect(refetchedItem!.status).toBe('ACCEPTED_BY_SMTP');
      expect(refetchedItem!.sentAt).toBeDefined();
    });
  });

  // =========================================================================
  // QA-35: RECLAMACIÓN Y CANCELACIÓN CONCURRENTES
  // =========================================================================
  describe('QA-35: Coordinación Atómica entre Trabajadores y Cancelaciones', () => {
    it('35.1: Dos reclamos simultáneos sobre el mismo lote nunca reclaman el mismo ítem', async () => {
      const jobId = `BATCH-QA35-CONCURRENT-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Prueba QA-35 Concurrencia',
          mode: 'SIMULATION',
          status: 'PENDING',
          totalCount: 4,
          bodyHtml: '<p>Cuerpo</p>',
        },
      });

      for (let i = 1; i <= 4; i++) {
        await prisma.emailBatchItem.create({
          data: {
            jobId,
            recipientEmail: `conc_${i}_${runId}@eventgrid.io`,
            status: 'PENDING',
            renderedSubject: 'Prueba QA-35 Concurrencia',
            renderedHtml: '<p>Cuerpo</p>',
          },
        });
      }

      // Procesar con dos workers en paralelo
      await Promise.all([
        EmailQueueWorker.processBatch(jobId),
        EmailQueueWorker.processBatch(jobId),
      ]);

      const items = await prisma.emailBatchItem.findMany({ where: { jobId } });
      expect(items.length).toBe(4);

      // Todos deben estar simulados sin intentos duplicados
      for (const item of items) {
        expect(item.status).toBe('SIMULATED');
        expect(item.attempts).toBe(1);
      }
    });
  });

  // =========================================================================
  // QA-37: AUDITORÍA OBLIGATORIA Y TRANSACCIONAL EN REINTENTOS INCIERTOS
  // =========================================================================
  describe('QA-37: Auditoría Obligatoria y Transaccional de Reintentos Inciertos', () => {
    it('37.1: El reintento de envíos inciertos registra la auditoría con detalles de edición, admin y motivo', async () => {
      const jobId = `BATCH-QA37-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: jobId,
          eventId: testEvent.id,
          subject: 'Prueba QA-37 Auditoría',
          mode: 'REAL',
          status: 'FAILED',
          totalCount: 2,
          failedCount: 2,
        },
      });

      await prisma.emailBatchItem.create({
        data: {
          jobId,
          recipientEmail: `qa37_item_${runId}@eventgrid.io`,
          status: 'UNKNOWN_DELIVERY_STATUS',
          errorMessage: 'Timeout ambiguo en DATA',
        },
      });

      const auditReason = 'Proveedor SMTP confirmó que la cola local no entregó el mensaje.';

      await CommunicationsService.retryUncertainBatchJob(
        jobId,
        testEvent.id,
        { confirmedDuplicateRisk: true, reason: auditReason },
        adminUser.id
      );

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'RETRY_UNCERTAIN_BATCH',
          entityId: jobId,
        },
      });

      expect(audit).toBeDefined();
      expect(audit!.userId).toBe(adminUser.id);
      expect(audit!.changes).toContain(auditReason);
      expect(audit!.changes).toContain('confirmedRisk":true');
    });
  });

  // =========================================================================
  // BLOQUE 2: ADMINISTRACIÓN SEGURA DE USUARIOS (RBAC & SEGURIDAD)
  // =========================================================================
  describe('Bloque 2: Administración de Usuarios', () => {
    it('2.1: Crea usuario con contraseña temporal segura y valida duplicidad de email', async () => {
      const testEmail = `new_operator_${runId}@eventgrid.io`;

      const result = await UsersService.createUser(
        {
          email: testEmail,
          fullName: 'Nuevo Operador Asignado',
          role: 'OPERATOR',
        },
        adminUser.id
      );

      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(testEmail);
      expect(result.user.role).toBe('OPERATOR');
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword!.length).toBeGreaterThanOrEqual(10);

      // Intento de crear duplicado debe fallar con 400
      await expect(
        UsersService.createUser(
          {
            email: testEmail,
            fullName: 'Duplicado Inválido',
            role: 'OPERATOR',
          },
          adminUser.id
        )
      ).rejects.toThrow(/ya existe/i);

      // Limpieza
      await prisma.user.delete({ where: { id: result.user.id } });
    });

    it('2.2: Impide desactivar o demotar al último administrador activo del sistema', async () => {
      // Intentar desactivar al adminUser cuando sea el único activo (o verificar conteo)
      const admins = await prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });

      if (admins.length === 1) {
        await expect(
          UsersService.updateUser(admins[0].id, { isActive: false }, adminUser.id)
        ).rejects.toThrow(/último administrador activo/);

        await expect(
          UsersService.updateUser(admins[0].id, { role: 'OPERATOR' }, adminUser.id)
        ).rejects.toThrow(/último administrador activo/);

        await expect(
          UsersService.toggleUserStatus(admins[0].id, adminUser.id)
        ).rejects.toThrow(/último administrador activo/);
      }
    });

    it('2.3: Restablece acceso generando una nueva credencial temporal y registra auditoría', async () => {
      const result = await UsersService.resetPassword(operatorUser.id, undefined, adminUser.id);
      expect(result.temporaryPassword).toBeDefined();
      expect(result.temporaryPassword!.length).toBeGreaterThanOrEqual(10);

      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'USER_PASSWORD_RESET',
          entityId: operatorUser.id,
        },
      });
      expect(audit).toBeDefined();
      expect(audit!.userId).toBe(adminUser.id);
    });

    it('2.4: Impide que un usuario elimine su propia cuenta activa', async () => {
      await expect(
        UsersService.deleteUser(adminUser.id, adminUser.id)
      ).rejects.toThrow(/No puedes eliminar tu propia cuenta/);
    });
  });
});
