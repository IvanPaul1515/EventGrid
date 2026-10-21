import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { recordFailedLogin } from '../src/middleware/rateLimiter';

describe('EventGrid Fase 6: QA-27 a QA-32 — Estabilidad, SMTP Concurrencia y Resiliencia', () => {
  let testEvent: any;
  let adminUser: any;
  let baseTemplate: any;
  let sampleRegistrations: any[] = [];
  const runId = Math.random().toString(36).substring(2, 7);

  beforeAll(async () => {
    // 1. Obtener o crear usuario administrador
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: `admin_fase6_${runId}@eventgrid.io`,
          fullName: 'Admin Fase 6 Test',
          passwordHash: 'fakehash',
          role: 'ADMIN',
        },
      });
    }

    // 2. Crear edición de prueba
    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 6 ${runId}`,
        slug: `fase6-${runId}`,
        year: 2086,
        startDate: new Date('2086-10-20T09:00:00Z'),
        endDate: new Date('2086-10-20T18:00:00Z'),
        venue: 'Centro de Convenciones Fase 6',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'F6-',
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(['M', 'L', 'XL']),
      },
    });

    const ticket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'General Fase 6',
        price: 1500,
        totalCapacity: 200,
      },
    });

    // 3. Crear plantilla base de correos
    baseTemplate = await prisma.emailTemplate.create({
      data: {
        eventId: testEvent.id,
        code: `REGISTRATION_CONFIRMATION`,
        name: `Plantilla Confirmación ${runId}`,
        subject: 'Confirmación de Inscripción {{eventName}}',
        bodyHtml: '<p>Hola {{fullName}}, tu registro {{registrationNumber}} está confirmado.</p>',
        bodyText: 'Hola {{fullName}}, tu registro {{registrationNumber}} está confirmado.',
        variables: JSON.stringify(['fullName', 'eventName', 'registrationNumber']),
        isSystem: true,
      },
    });

    // 4. Crear 4 participantes de prueba
    for (let i = 1; i <= 4; i++) {
      const part = await prisma.participant.create({
        data: {
          email: `participant_f6_${i}_${runId}@eventgrid.io`,
          firstName: `Participante ${i}`,
          lastName: `Fase6`,
          fullName: `Participante ${i} Fase6`,
          phone: `809555000${i}`,
          institution: 'EventGrid Testing Org',
        },
      });

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: part.id,
          ticketTypeId: ticket.id,
          registrationNumber: `F6-${runId}-${1000 + i}`,
          qrCode: `QR-F6-${runId}-${1000 + i}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
        include: { participant: true },
      });
      sampleRegistrations.push(reg);
    }
  });

  afterAll(async () => {
    // Restaurar fábrica de transporte
    EmailQueueWorker.setTransporterFactory(null);

    // Limpieza de datos de prueba
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
    } catch (e) {
      // Ignorar errores de orden de borrado
    }
  });

  // =========================================================================
  // QA-27: IMPEDIR FALSOS ENVÍOS EXITOSOS (STRICT REAL VS SIMULATION)
  // =========================================================================
  describe('QA-27: Separación Estricta de Modos REAL vs SIMULATION y Validación SMTP', () => {
    it('27.1: Campaña en modo REAL sin transporte SMTP configurado falla explícitamente y NUNCA se convierte en SIMULATED', async () => {
      // 1. Eliminar cualquier configuración SMTP existente
      await prisma.emailConfig.deleteMany({ where: { eventId: testEvent.id } });

      // sendBulkEmail en modo REAL sin SMTP activo debe rechazar inmediatamente en la solicitud
      await expect(
        CommunicationsService.sendBulkEmail(
          {
            eventId: testEvent.id,
            templateCode: baseTemplate.code,
            targetGroup: 'ALL',
            simulateOnly: false, // Envío REAL solicitado
          },
          adminUser.id
        )
      ).rejects.toThrow(/El servidor SMTP no está configurado/);

      // Si existiese un lote ya encolado como REAL pero la configuración se desactivó:
      const fakeBatchId = `BATCH-REAL-NO-SMTP-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: fakeBatchId,
          eventId: testEvent.id,
          subject: 'Prueba Modo REAL Sin SMTP',
          mode: 'REAL',
          status: 'PENDING',
          totalCount: 1,
          bodyHtml: '<p>Cuerpo</p>',
        },
      });

      await prisma.emailBatchItem.create({
        data: {
          jobId: fakeBatchId,
          recipientEmail: `nosmtp_${runId}@eventgrid.io`,
          status: 'PENDING',
          renderedSubject: 'Prueba Modo REAL Sin SMTP',
          renderedHtml: '<p>Cuerpo</p>',
        },
      });

      // Procesar el lote mediante el worker
      await EmailQueueWorker.processBatch(fakeBatchId);

      const job = await prisma.emailBatchJob.findUnique({
        where: { id: fakeBatchId },
      });

      expect(job!.mode).toBe('REAL');
      expect(job!.status).toBe('FAILED');
      expect(job!.errorMessage).toContain('El servicio SMTP no está configurado');

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId: fakeBatchId },
      });

      expect(items[0].status).toBe('FAILED');
      expect(items[0].status).not.toBe('SIMULATED');
      expect(items[0].status).not.toBe('ACCEPTED_BY_SMTP');
    });

    it('27.2: Campaña en modo REAL con transporte que responde 250 OK registra ACCEPTED_BY_SMTP y SENT en logs', async () => {
      // Configuramos SMTP en emailConfig
      await prisma.emailConfig.upsert({
        where: { eventId: testEvent.id },
        create: {
          eventId: testEvent.id,
          host: 'smtp.testserver.local',
          port: 587,
          user: 'test@eventgrid.io',
          password: 'encrypted_fake_pass',
          fromEmail: 'no-reply@eventgrid.io',
          fromName: 'EventGrid Testing',
          isEnabled: true,
        },
        update: {
          host: 'smtp.testserver.local',
          port: 587,
          user: 'test@eventgrid.io',
          password: 'encrypted_fake_pass',
          fromEmail: 'no-reply@eventgrid.io',
          fromName: 'EventGrid Testing',
          isEnabled: true,
        },
      });

      // Inyectamos un Transporter mock que ejecuta sendMail genuinamente
      let sendMailCalls = 0;
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (mailOptions: any) => {
          sendMailCalls++;
          return {
            messageId: `<mock-${Date.now()}-${sendMailCalls}@eventgrid.io>`,
            response: '250 2.0.0 OK Message accepted for delivery',
            accepted: [mailOptions.to],
            rejected: [],
          };
        },
      }));

      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: baseTemplate.code,
          targetGroup: 'ALL',
          simulateOnly: false,
          customSubject: 'Prueba Modo REAL Con Éxito Verificado',
          customBodyHtml: '<p>Mensaje verificado</p>',
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      await EmailQueueWorker.processBatch(jobId);

      const job = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
      });

      expect(job!.status).toBe('COMPLETED');
      expect(job!.sentCount).toBe(sampleRegistrations.length);
      expect(sendMailCalls).toBe(sampleRegistrations.length);

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId },
      });

      expect(items.length).toBe(sampleRegistrations.length);
      for (const item of items) {
        expect(item.status).toBe('ACCEPTED_BY_SMTP');
      }

      const logs = await prisma.emailLog.findMany({
        where: { batchId: jobId },
      });

      expect(logs.length).toBe(sampleRegistrations.length);
      for (const log of logs) {
        expect(log.status).toBe('SENT');
      }
    });
  });

  // =========================================================================
  // QA-28: EVITAR REENVÍOS DUPLICADOS POR FALLOS SMTP AMBIGUOS
  // =========================================================================
  describe('QA-28: Clasificación de Errores SMTP y Cero Auto-Reintentos en Incertidumbre', () => {
    it('28.1: Caída de conexión durante o tras DATA resulta en UNKNOWN_DELIVERY_STATUS y CERO auto-reintentos', async () => {
      // Inyectamos transport que simula caída de conexión durante DATA
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (_mailOptions: any) => {
          const err: any = new Error('read ECONNRESET after DATA transmission');
          err.code = 'ECONNRESET';
          err.command = 'DATA';
          throw err;
        },
      }));

      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: baseTemplate.code,
          targetGroup: 'ALL',
          simulateOnly: false,
          customSubject: 'Prueba Error Ambiguo DATA',
          customBodyHtml: '<p>Error incierto</p>',
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      await EmailQueueWorker.processBatch(jobId);

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId },
      });

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        // En incertidumbre SMTP, se debe marcar como UNKNOWN_DELIVERY_STATUS
        expect(item.status).toBe('UNKNOWN_DELIVERY_STATUS');
        // Debe tener CERO auto-reintentos (leaseUntil null, sin programación de cola)
        expect(item.leaseUntil).toBeNull();
        expect(item.errorMessage).toContain('incierto');
      }

      const logs = await prisma.emailLog.findMany({
        where: { batchId: jobId },
      });
      for (const log of logs) {
        expect(log.status).toBe('FAILED');
        expect(log.errorMessage).toContain('incierto');
      }
    });

    it('28.2: Rechazo confirmado 5xx se marca como FAILED permanente sin reintentos automáticos', async () => {
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (_mailOptions: any) => {
          const err: any = new Error('550 5.1.1 User unknown');
          err.responseCode = 550;
          throw err;
        },
      }));

      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: baseTemplate.code,
          targetGroup: 'ALL',
          simulateOnly: false,
          customSubject: 'Prueba 550 Rechazo Confirmado',
          customBodyHtml: '<p>Rechazo permanente</p>',
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      await EmailQueueWorker.processBatch(jobId);

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId },
      });

      for (const item of items) {
        expect(item.status).toBe('FAILED');
        expect(item.leaseUntil).toBeNull();
        expect(item.errorMessage).toContain('Rechazo permanente');
      }
    });

    it('28.3: Error transitorio 4xx o fallo de conexión pre-DATA se programa para reintento con backoff', async () => {
      EmailQueueWorker.setTransporterFactory((_config) => ({
        verify: async () => true,
        sendMail: async (_mailOptions: any) => {
          const err: any = new Error('421 4.4.2 Timeout connecting to server');
          err.responseCode = 421;
          throw err;
        },
      }));

      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: baseTemplate.code,
          targetGroup: 'ALL',
          simulateOnly: false,
          customSubject: 'Prueba 421 Reintento Transitorio',
          customBodyHtml: '<p>Fallo transitorio</p>',
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      await EmailQueueWorker.processBatch(jobId);

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId },
      });

      for (const item of items) {
        // En primer intento transitorio, permanece PENDING para ser reintentado
        expect(item.status).toBe('PENDING');
        expect(item.attempts).toBe(1);
        expect(item.errorMessage).toContain('Reintento programado por rechazo temporal');
      }
    });
  });

  // =========================================================================
  // QA-29: CANCELACIÓN ATÓMICA DE LOTES
  // =========================================================================
  describe('QA-29: Cancelación Atómica de Lotes e Invalidez de Reclamo Posterior', () => {
    it('29.1: Cancelar un lote cancela atómicamente todos los items pendientes y detiene el lote', async () => {
      const testJobId = `BATCH-CANCEL-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: testJobId,
          eventId: testEvent.id,
          subject: 'Lote Para Cancelar',
          mode: 'SIMULATION',
          status: 'PENDING',
          totalCount: sampleRegistrations.length,
        },
      });

      for (const reg of sampleRegistrations) {
        await prisma.emailBatchItem.create({
          data: {
            jobId: testJobId,
            recipientEmail: reg.participant.email,
            status: 'PENDING',
          },
        });
      }

      // Cancelar antes de procesar
      const cancelledJob = await CommunicationsService.cancelBatchJob(testJobId, testEvent.id);
      expect(cancelledJob.status).toBe('CANCELLED');

      // Intentar procesar después de cancelar no debe procesar ningún item
      await EmailQueueWorker.processBatch(testJobId);

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId: testJobId },
      });

      for (const item of items) {
        expect(item.status).toBe('CANCELLED');
      }

      const job = await prisma.emailBatchJob.findUnique({
        where: { id: testJobId },
      });
      expect(job!.status).toBe('CANCELLED');
      expect(job!.sentCount).toBe(0);
    });
  });

  // =========================================================================
  // QA-30: PRIORIDAD ESTRICTA DE CONTENIDO INMUTABLE
  // =========================================================================
  describe('QA-30: Prioridad Estricta de Contenido Inmutable', () => {
    it('30.1: El worker utiliza el snapshot inmutable del lote ignorando cambios posteriores a templates en BD', async () => {
      // 1. Crear plantilla en BD
      const template = await prisma.emailTemplate.create({
        data: {
          eventId: testEvent.id,
          code: `TPL_INMUTABLE_${runId}`,
          name: `Template Inmutable ${runId}`,
          subject: 'Asunto Original Inmutable',
          bodyHtml: '<p>Cuerpo Original Inmutable para {{fullName}}</p>',
          variables: JSON.stringify(['fullName']),
        },
      });

      // 2. Encolar campaña usando dicha plantilla
      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: template.code,
          targetGroup: 'ALL',
          simulateOnly: true,
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;

      // 3. Modificar la plantilla en la base de datos
      await prisma.emailTemplate.update({
        where: { id: template.id },
        data: {
          subject: 'Asunto MODIFICADO A POSTERIORI QUE NO DEBE APARECER',
          bodyHtml: '<p>Cuerpo MODIFICADO</p>',
        },
      });

      // 4. Procesar el lote
      await EmailQueueWorker.processBatch(jobId);

      // 5. Verificar que el contenido enviado preserva el snapshot inmutable
      const logs = await prisma.emailLog.findMany({
        where: { batchId: jobId },
      });

      expect(logs.length).toBe(sampleRegistrations.length);
      for (const log of logs) {
        expect(log.subject).toBe('Asunto Original Inmutable');
        expect(log.status).toBe('SIMULATED');
      }

      // Limpieza
      await prisma.emailTemplate.delete({ where: { id: template.id } });
    });
  });

  // =========================================================================
  // QA-31: SEPARACIÓN DE REINTENTOS: RETRY-FAILED VS RETRY-UNCERTAIN
  // =========================================================================
  describe('QA-31: Separación de Reintentos retry-failed y retry-uncertain', () => {
    it('31.1: retry-failed solo reinicia items con status FAILED que NO sean UNKNOWN_DELIVERY_STATUS', async () => {
      const testJobId = `BATCH-RETRY-${Date.now()}`;
      await prisma.emailBatchJob.create({
        data: {
          id: testJobId,
          eventId: testEvent.id,
          subject: 'Asunto Batch Reintentos',
          mode: 'REAL',
          status: 'FAILED',
          totalCount: 4,
          failedCount: 4,
          customSubject: 'Asunto Batch Reintentos',
          customBodyHtml: '<p>Prueba</p>',
          createdById: adminUser.id,
        },
      });

      // 2 items con FAILED estándar
      const itemF1 = await prisma.emailBatchItem.create({
        data: {
          jobId: testJobId,
          recipientEmail: `failed_std_1_${runId}@eventgrid.io`,
          status: 'FAILED',
          errorMessage: '550 User unknown',
          attempts: 3,
        },
      });

      const itemF2 = await prisma.emailBatchItem.create({
        data: {
          jobId: testJobId,
          recipientEmail: `failed_std_2_${runId}@eventgrid.io`,
          status: 'FAILED',
          errorMessage: '550 User unknown',
          attempts: 3,
        },
      });

      // 1 item con UNKNOWN_DELIVERY_STATUS
      const itemU1 = await prisma.emailBatchItem.create({
        data: {
          jobId: testJobId,
          recipientEmail: `uncertain_1_${runId}@eventgrid.io`,
          status: 'UNKNOWN_DELIVERY_STATUS',
          errorMessage: 'ECONNRESET during DATA',
          attempts: 1,
        },
      });

      // Ejecutar retryFailedBatchJob
      await CommunicationsService.retryFailedBatchJob(testJobId, testEvent.id);

      // Verificar que los fallidos estándar volvieron a PENDING
      const refetchedF1 = await prisma.emailBatchItem.findUnique({ where: { id: itemF1.id } });
      const refetchedF2 = await prisma.emailBatchItem.findUnique({ where: { id: itemF2.id } });
      expect(refetchedF1!.status).toBe('PENDING');
      expect(refetchedF2!.status).toBe('PENDING');

      // Verificar que el item incierto QUEDÓ INTACTO en UNKNOWN_DELIVERY_STATUS
      const refetchedU1 = await prisma.emailBatchItem.findUnique({ where: { id: itemU1.id } });
      expect(refetchedU1!.status).toBe('UNKNOWN_DELIVERY_STATUS');
    });

    it('31.2: retry-uncertain RECHAZA la petición si confirmedDuplicateRisk no es true o falta razón', async () => {
      const testJob = await prisma.emailBatchJob.findFirst({
        where: { eventId: testEvent.id, subject: 'Asunto Batch Reintentos' },
      });

      // Intento sin confirmedDuplicateRisk
      await expect(
        CommunicationsService.retryUncertainBatchJob(
          testJob!.id,
          testEvent.id,
          { confirmedDuplicateRisk: false, reason: 'Razón válida pero sin confirmación' },
          adminUser.id
        )
      ).rejects.toThrow(/riesgo de enviar correos duplicados/);

      // Intento con confirmedDuplicateRisk pero con razón vacía
      await expect(
        CommunicationsService.retryUncertainBatchJob(
          testJob!.id,
          testEvent.id,
          { confirmedDuplicateRisk: true, reason: '   ' },
          adminUser.id
        )
      ).rejects.toThrow(/motivo justificado/);
    });

    it('31.3: retry-uncertain con confirmación explícita reintenta UNKNOWN_DELIVERY_STATUS y registra auditoría', async () => {
      const testJob = await prisma.emailBatchJob.findFirst({
        where: { eventId: testEvent.id, subject: 'Asunto Batch Reintentos' },
      });

      await CommunicationsService.retryUncertainBatchJob(
        testJob!.id,
        testEvent.id,
        {
          confirmedDuplicateRisk: true,
          reason: 'Verificado con el proveedor SMTP: el mensaje no fue despachado al buzón destino.',
        },
        adminUser.id
      );

      // Verificar que el item incierto ahora fue reactivado para reprocesamiento
      const uncertainItem = await prisma.emailBatchItem.findFirst({
        where: { jobId: testJob!.id, recipientEmail: { contains: 'uncertain_1' } },
      });
      expect(uncertainItem!.status).not.toBe('UNKNOWN_DELIVERY_STATUS');
      expect(['PENDING', 'PROCESSING', 'ACCEPTED_BY_SMTP']).toContain(uncertainItem!.status);

      // Verificar que se registró la auditoría
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: 'RETRY_UNCERTAIN_BATCH',
          entityId: testJob!.id,
        },
      });
      expect(audit).toBeDefined();
      expect(audit!.userId).toBe(adminUser.id);
      expect(audit!.changes).toContain('Verificado con el proveedor SMTP');
    });
  });

  // =========================================================================
  // QA-32: REINICIO ATÓMICO DE LA VENTANA DE RATE LIMITING EN CONCURRENCIA
  // =========================================================================
  describe('QA-32: Reinicio Atómico de la Ventana del Rate Limiter sin Pérdida de Intentos', () => {
    it(
      '32.1: Maneja 20 solicitudes concurrentes cuando la ventana previa expiró, reseteando atómicamente',
      { timeout: 20000 },
      async () => {
      const testIp = `10.99.32.${Math.floor(Math.random() * 200) + 10}`;
      const email = `victim_qa32_${runId}@eventgrid.io`;
      const key = `ip:${testIp}`;
      const mockReq = { ip: testIp, headers: {}, socket: { remoteAddress: testIp } } as any;

      // 1. Simular un registro previo cuya ventana ya expiró hace 20 minutos (WINDOW_MS = 15m)
      const expiredDate = new Date(Date.now() - 20 * 60 * 1000);
      await prisma.loginAttempt.create({
        data: {
          key,
          count: 3,
          firstAttemptAt: expiredDate,
        },
      });

      // 2. Lanzar 20 intentos simultáneos
      const promises = Array.from({ length: 20 }, () => recordFailedLogin(mockReq, email));
      await Promise.all(promises);

      // 3. Verificar el registro final
      const record = await prisma.loginAttempt.findUnique({ where: { key } });
      expect(record).toBeDefined();
      // Debido al reseteo y a los 20 incrementos concurrentes exactos
      expect(record!.count).toBe(20);
      expect(record!.blockedUntil).toBeDefined();
      expect(record!.firstAttemptAt.getTime()).toBeGreaterThan(Date.now() - 15000);

      // Limpieza
      await prisma.loginAttempt.deleteMany({
        where: { key: { in: [key, `email:${email}`] } },
      });
    });
  });
});
