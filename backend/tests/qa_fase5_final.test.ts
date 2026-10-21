import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { recordFailedLogin } from '../src/middleware/rateLimiter';

describe('EventGrid Fase 5: QA-20 a QA-26 — Estabilización Final y Resiliencia', () => {
  let testEvent: any;
  let adminUser: any;
  let sampleRegistrations: any[] = [];
  const runId = Math.random().toString(36).substring(2, 7);

  beforeAll(async () => {
    // 1. Obtener o crear usuario administrador para pruebas
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!adminUser) {
      adminUser = await prisma.user.create({
        data: {
          email: `admin_fase5_${runId}@eventgrid.io`,
          fullName: 'Admin Fase 5 Test',
          passwordHash: 'fakehash',
          role: 'ADMIN',
        },
      });
    }

    // 2. Crear edición aislada en año 2085 para evitar colisiones con BarCamp RD 2026
    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 5 ${runId}`,
        slug: `fase5-${runId}`,
        year: 2085,
        startDate: new Date('2085-11-20T09:00:00Z'),
        endDate: new Date('2085-11-20T18:00:00Z'),
        venue: 'Centro de Convenciones Fase 5',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'F5-',
        tshirtSizesEnabled: true,
        tshirtSizes: JSON.stringify(['M', 'L', 'XL']),
      },
    });

    const ticket = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'General Fase 5',
        price: 1800,
        totalCapacity: 300,
      },
    });

    // 3. Crear 6 participantes de prueba
    for (let i = 1; i <= 6; i++) {
      const part = await prisma.participant.create({
        data: {
          firstName: `Participante${i}`,
          lastName: `Fase5_${runId}`,
          fullName: `Participante${i} Fase5_${runId}`,
          email: `user${i}_${runId}@eventgrid-test5.org`,
          documentId: `DOC-F5-${runId}-${i}`,
        },
      });

      const reg = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: part.id,
          ticketTypeId: ticket.id,
          registrationNumber: `F5-${String(i).padStart(4, '0')}`,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
        },
        include: { participant: true },
      });
      sampleRegistrations.push(reg);
    }
  });

  afterAll(async () => {
    if (testEvent) {
      await prisma.staffTshirtDelivery.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailBatchItem.deleteMany({
        where: { job: { eventId: testEvent.id } },
      });
      await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailLog.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailConfig.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailTemplate.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registration.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.tshirtInventory.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.ticketType.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registrationSequence.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.event.delete({ where: { id: testEvent.id } });
    }
  });

  // =========================================================================
  // QA-20: PERSISTENCIA INMUTABLE DEL CONTENIDO DE CORREOS MASIVOS
  // =========================================================================
  describe('QA-20: Persistencia Inmutable del Contenido de Campañas Masivas', () => {
    it('20.1 Guarda versión inmutable de plantilla, snapshot y contenido pre-renderizado por destinatario', async () => {
      // 1. Crear plantilla original
      const originalTemplate = await prisma.emailTemplate.create({
        data: {
          code: `QA20_TMPL_${runId}`,
          name: 'Plantilla Base QA20',
          subject: 'Asunto Original {{fullName}}',
          bodyHtml: '<p>Cuerpo Original {{eventName}} para {{fullName}}</p>',
          eventId: testEvent.id,
        },
      });

      // 2. Encolar envío masivo con personalización
      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: originalTemplate.code,
          targetGroup: 'ALL',
          customSubject: 'Asunto Aprobado Personalizado',
          customBodyHtml: '<p>Contenido Aprobado Inmutable para {{fullName}}</p>',
          customMessage: 'Mensaje adicional aprobado',
          simulateOnly: true,
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      const job = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
        include: { items: true },
      });

      expect(job).toBeDefined();
      expect(job!.subject).toBe('Asunto Aprobado Personalizado');
      expect(job!.customBodyHtml).toContain('Contenido Aprobado Inmutable');
      expect(job!.templateSnapshot).toBeDefined();
      expect(job!.mode).toBe('SIMULATION');

      // Verificar que los ítems contienen contenido pre-renderizado
      expect(job!.items.length).toBeGreaterThanOrEqual(1);
      const firstItem = job!.items[0];
      expect(firstItem.renderedSubject).toBe('Asunto Aprobado Personalizado');
      expect(firstItem.renderedHtml).toContain('Contenido Aprobado Inmutable');
      expect(firstItem.messageId).toMatch(/^<batch-.*@eventgrid\.io>$/);

      // 3. Modificar destructivamente la plantilla original en la base de datos
      await prisma.emailTemplate.update({
        where: { id: originalTemplate.id },
        data: {
          subject: 'TEXTO MODIFICADO DESPUES DE ENCOLAR',
          bodyHtml: '<p>CONTENIDO ALTERADO QUE NO DEBE SER ENVIADO</p>',
        },
      });

      // 4. Procesar el lote mediante el worker
      await EmailQueueWorker.processBatch(jobId);

      const updatedJob = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
        include: { items: true },
      });

      expect(['SIMULATED', 'COMPLETED']).toContain(updatedJob!.status);

      // 5. Comprobar que los logs y los ítems conservan el contenido aprobado originalmente
      const itemAfterProcess = updatedJob!.items.find((i) => i.id === firstItem.id);
      expect(itemAfterProcess!.renderedSubject).toBe('Asunto Aprobado Personalizado');
      expect(itemAfterProcess!.renderedHtml).toContain('Contenido Aprobado Inmutable');
      expect(itemAfterProcess!.renderedHtml).not.toContain('CONTENIDO ALTERADO');
    });
  });

  // =========================================================================
  // QA-21: CANCELACIÓN SEGURA DE LOTES
  // =========================================================================
  describe('QA-21: Cancelación Segura de Lotes y Máquina de Estados Consistente', () => {
    it('21.1 Cancela únicamente los ítems PENDING y respeta los ítems en curso o completados', async () => {
      const cancelJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote Prueba Cancelación Segura',
          status: 'PROCESSING',
          totalCount: 3,
          createdById: adminUser.id,
        },
      });

      // Item 1: ACCEPTED_BY_SMTP (ya enviado)
      await prisma.emailBatchItem.create({
        data: {
          jobId: cancelJob.id,
          registrationId: sampleRegistrations[0].id,
          recipientEmail: sampleRegistrations[0].participant.email,
          recipientName: sampleRegistrations[0].participant.fullName,
          status: 'ACCEPTED_BY_SMTP',
          sentAt: new Date(),
          idempotencyKey: `${cancelJob.id}:1`,
        },
      });

      // Item 2: PROCESSING (en vuelo hacia SMTP)
      await prisma.emailBatchItem.create({
        data: {
          jobId: cancelJob.id,
          registrationId: sampleRegistrations[1].id,
          recipientEmail: sampleRegistrations[1].participant.email,
          recipientName: sampleRegistrations[1].participant.fullName,
          status: 'PROCESSING',
          leaseUntil: new Date(Date.now() + 60000),
          attempts: 1,
          idempotencyKey: `${cancelJob.id}:2`,
        },
      });

      // Item 3: PENDING (aún no iniciado)
      await prisma.emailBatchItem.create({
        data: {
          jobId: cancelJob.id,
          registrationId: sampleRegistrations[2].id,
          recipientEmail: sampleRegistrations[2].participant.email,
          recipientName: sampleRegistrations[2].participant.fullName,
          status: 'PENDING',
          idempotencyKey: `${cancelJob.id}:3`,
        },
      });

      // Solicitar cancelación
      const res = await CommunicationsService.cancelBatchJob(cancelJob.id, testEvent.id);

      // Dado que el ítem 2 está en vuelo, el lote pasa a CANCELLATION_REQUESTED
      expect(res.status).toBe('CANCELLATION_REQUESTED');

      const items = await prisma.emailBatchItem.findMany({
        where: { jobId: cancelJob.id },
      });

      const item1 = items.find((i) => i.idempotencyKey === `${cancelJob.id}:1`);
      const item2 = items.find((i) => i.idempotencyKey === `${cancelJob.id}:2`);
      const item3 = items.find((i) => i.idempotencyKey === `${cancelJob.id}:3`);

      // El ítem ya enviado conserva su estado
      expect(item1!.status).toBe('ACCEPTED_BY_SMTP');
      // El ítem en vuelo NO es sobrescrito prematuramente
      expect(item2!.status).toBe('PROCESSING');
      // El ítem pendiente es cancelado de inmediato
      expect(item3!.status).toBe('CANCELLED');

      // Simular que el ítem 2 finaliza su envío
      await prisma.emailBatchItem.update({
        where: { id: item2!.id },
        data: { status: 'ACCEPTED_BY_SMTP', sentAt: new Date() },
      });

      // Finalizar estado del lote
      await EmailQueueWorker.finalizeBatchStatus(cancelJob.id);

      const finalJob = await prisma.emailBatchJob.findUnique({
        where: { id: cancelJob.id },
      });

      // Como 2 correos fueron aceptados por SMTP, el estado final es PARTIALLY_COMPLETED
      expect(finalJob!.status).toBe('PARTIALLY_COMPLETED');
      expect(finalJob!.sentCount).toBe(2);
      expect(finalJob!.cancelledCount).toBe(1);
    });

    it('21.2 Soporta dos solicitudes de cancelación simultáneas sin inconsistencias', async () => {
      const dualJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote Doble Cancelación',
          status: 'PENDING',
          totalCount: 2,
          createdById: adminUser.id,
        },
      });

      for (let i = 0; i < 2; i++) {
        await prisma.emailBatchItem.create({
          data: {
            jobId: dualJob.id,
            registrationId: sampleRegistrations[i].id,
            recipientEmail: sampleRegistrations[i].participant.email,
            recipientName: sampleRegistrations[i].participant.fullName,
            status: 'PENDING',
            idempotencyKey: `${dualJob.id}:${i}`,
          },
        });
      }

      // Dos cancelaciones concurrentes
      const [r1, r2] = await Promise.all([
        CommunicationsService.cancelBatchJob(dualJob.id, testEvent.id),
        CommunicationsService.cancelBatchJob(dualJob.id, testEvent.id),
      ]);

      expect(r1.status).toBe('CANCELLED');
      expect(r2.status).toBe('CANCELLED');
    });
  });

  // =========================================================================
  // QA-22: EVITAR REENVÍOS DUPLICADOS TRAS REINICIOS
  // =========================================================================
  describe('QA-22: Evitar Reenvíos Duplicados tras Reinicios (Incertidumbre SMTP)', () => {
    it('22.1 Marca ítems interrumpidos tras intento SMTP como UNKNOWN_DELIVERY_STATUS en lugar de reenviar automáticamente', async () => {
      const staleJob = await prisma.emailBatchJob.create({
        data: {
          eventId: testEvent.id,
          subject: 'Lote con Caída Servidor en Pleno SMTP',
          status: 'PROCESSING',
          totalCount: 2,
          createdById: adminUser.id,
        },
      });

      // Item 1: attempts = 1, lease expirado (se cayó la app mientras SMTP procesaba)
      const itemWithAttempt = await prisma.emailBatchItem.create({
        data: {
          jobId: staleJob.id,
          registrationId: sampleRegistrations[0].id,
          recipientEmail: sampleRegistrations[0].participant.email,
          recipientName: sampleRegistrations[0].participant.fullName,
          status: 'PROCESSING',
          attempts: 1, // Hubo un intento real
          leaseUntil: new Date(Date.now() - 30000), // Expiró hace 30s
          idempotencyKey: `${staleJob.id}:interrupted1`,
        },
      });

      // Item 2: attempts = 0, lease expirado (se reclamó pero el proceso murió antes de iniciar transporte)
      const itemNoAttempt = await prisma.emailBatchItem.create({
        data: {
          jobId: staleJob.id,
          registrationId: sampleRegistrations[1].id,
          recipientEmail: sampleRegistrations[1].participant.email,
          recipientName: sampleRegistrations[1].participant.fullName,
          status: 'PROCESSING',
          attempts: 0, // Nunca se inició transporte
          leaseUntil: new Date(Date.now() - 30000),
          idempotencyKey: `${staleJob.id}:interrupted2`,
        },
      });

      // Simular reinicio y recuperación de trabajos huérfanos
      await EmailQueueWorker.recoverStaleJobs();

      const refreshed1 = await prisma.emailBatchItem.findUnique({
        where: { id: itemWithAttempt.id },
      });
      const refreshed2 = await prisma.emailBatchItem.findUnique({
        where: { id: itemNoAttempt.id },
      });

      // El ítem con intento SMTP NO debe volver a PENDING (evita duplicar el correo al participante)
      expect(refreshed1!.status).toBe('UNKNOWN_DELIVERY_STATUS');
      expect(refreshed1!.errorMessage).toContain('Resultado de entrega incierto');

      // El ítem sin intentos puede volver con seguridad a PENDING
      expect(refreshed2!.status).toBe('PENDING');

      // Probar reintento manual explícito por el administrador (retryFailed)
      const retried = await CommunicationsService.retryBatchJob(staleJob.id, testEvent.id);
      expect(retried.status).toBe('PENDING');

      const rechecked1 = await prisma.emailBatchItem.findUnique({
        where: { id: itemWithAttempt.id },
      });
      expect(rechecked1!.status).toBe('PENDING');
    });
  });

  // =========================================================================
  // QA-23: EVITAR SIMULACIÓN SILENCIOSA
  // =========================================================================
  describe('QA-23: Evitar Simulación Silenciosa', () => {
    it('23.1 Si un lote es REAL y SMTP deja de estar disponible, detiene el envío y marca FAILED sin simular', async () => {
      // 1. Limpiar configs previas
      await prisma.emailConfig.deleteMany({
        where: { OR: [{ eventId: testEvent.id }, { eventId: null }] },
      });

      // 2. Crear configuración SMTP activa
      const smtpConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.mailgun.org',
          port: 587,
          secure: false,
          user: 'postmaster@eventgrid.io',
          password: 'encrypted_test_pwd',
          fromEmail: 'notificaciones@eventgrid.io',
          fromName: 'EventGrid Real',
          isEnabled: true,
        },
      });

      // 3. Encolar campaña en modo REAL
      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'REGISTRATION_CONFIRMATION',
          targetGroup: 'ALL',
          simulateOnly: false, // Envío REAL solicitado
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      const jobBefore = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
      expect(jobBefore!.mode).toBe('REAL');

      // 4. Deshabilitar el servicio SMTP antes de que el worker procese
      await prisma.emailConfig.update({
        where: { id: smtpConfig.id },
        data: { isEnabled: false },
      });

      // 5. Ejecutar el worker
      await EmailQueueWorker.processBatch(jobId);

      const jobAfter = await prisma.emailBatchJob.findUnique({
        where: { id: jobId },
        include: { items: true },
      });

      // El lote DEBE marcarse como FAILED y NUNCA convertirse silenciosamente en SIMULATED
      expect(jobAfter!.status).toBe('FAILED');
      expect(jobAfter!.errorMessage).toContain('El servicio SMTP no está configurado o está deshabilitado');
      expect(jobAfter!.simulatedCount).toBe(0);

      // Limpiar configuración de prueba
      await prisma.emailConfig.delete({ where: { id: smtpConfig.id } });
    });

    it('23.2 Si un lote fue creado como SIMULATION, se mantiene en SIMULATION aunque SMTP esté activo', async () => {
      // Encolar campaña en modo SIMULATED
      const bulkResult = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'REGISTRATION_CONFIRMATION',
          targetGroup: 'ALL',
          simulateOnly: true,
        },
        adminUser.id
      );

      const jobId = bulkResult.batchId!;
      await EmailQueueWorker.processBatch(jobId);

      const jobAfter = await prisma.emailBatchJob.findUnique({ where: { id: jobId } });
      expect(jobAfter!.status).toBe('SIMULATED');
      expect(jobAfter!.mode).toBe('SIMULATION');
    });
  });

  // =========================================================================
  // QA-24: PRIORIZAR CONFIGURACIÓN SMTP Y PLANTILLAS POR EDICIÓN
  // =========================================================================
  describe('QA-24: Prioridad Estricta de Configuración SMTP y Plantillas por Edición', () => {
    it('24.1 getRawConfig prioriza la configuración de la edición sobre la global', async () => {
      // Limpiar configs existentes para aislamiento
      await prisma.emailConfig.deleteMany({
        where: { OR: [{ eventId: testEvent.id }, { eventId: null }] },
      });

      // Configuración global (eventId: null)
      const globalConfig = await prisma.emailConfig.create({
        data: {
          eventId: null,
          host: 'smtp.global.org',
          port: 587,
          fromName: 'Global Sender',
          fromEmail: 'global@eventgrid.io',
          isEnabled: true,
        },
      });

      // Configuración propia de la edición testEvent
      const editionConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.edition.org',
          port: 465,
          fromName: 'Edition Sender',
          fromEmail: 'edition@eventgrid.io',
          isEnabled: true,
        },
      });

      // Consulta para la edición específica -> debe devolver editionConfig
      const resolvedConfig = await CommunicationsService.getRawConfig(testEvent.id);
      expect(resolvedConfig).toBeDefined();
      expect(resolvedConfig!.id).toBe(editionConfig.id);
      expect(resolvedConfig!.host).toBe('smtp.edition.org');

      // Consulta para otra edición sin configuración -> debe hacer fallback a globalConfig
      const fallbackConfig = await CommunicationsService.getRawConfig('otro-id-sin-config');
      expect(fallbackConfig).toBeDefined();
      expect(fallbackConfig!.id).toBe(globalConfig.id);
      expect(fallbackConfig!.host).toBe('smtp.global.org');

      // Limpieza
      await prisma.emailConfig.deleteMany({
        where: { id: { in: [globalConfig.id, editionConfig.id] } },
      });
    });

    it('24.2 findTemplate prioriza la plantilla propia de la edición sobre la global con el mismo código', async () => {
      const templateCode = `QA24_CODE_${runId}`;

      // Plantilla global
      const globalTemplate = await prisma.emailTemplate.create({
        data: {
          code: templateCode,
          name: 'Plantilla Global',
          subject: 'Asunto Global',
          bodyHtml: '<p>HTML Global</p>',
          eventId: null,
        },
      });

      // Plantilla específica de la edición con el mismo código
      const editionTemplate = await prisma.emailTemplate.create({
        data: {
          code: templateCode,
          name: 'Plantilla de Edición',
          subject: 'Asunto de Edición Específica',
          bodyHtml: '<p>HTML de Edición Específica</p>',
          eventId: testEvent.id,
        },
      });

      // Búsqueda para testEvent -> debe devolver la de la edición
      const resolved = await CommunicationsService.findTemplate(templateCode, testEvent.id);
      expect(resolved).toBeDefined();
      expect(resolved!.id).toBe(editionTemplate.id);
      expect(resolved!.subject).toBe('Asunto de Edición Específica');

      // Búsqueda para otra edición sin plantilla propia -> debe hacer fallback a la global
      const fallback = await CommunicationsService.findTemplate(templateCode, 'otra-edicion');
      expect(fallback).toBeDefined();
      expect(fallback!.id).toBe(globalTemplate.id);
      expect(fallback!.subject).toBe('Asunto Global');

      // Limpieza
      await prisma.emailTemplate.deleteMany({
        where: { id: { in: [globalTemplate.id, editionTemplate.id] } },
      });
    });
  });

  // =========================================================================
  // QA-25: REINICIO ATÓMICO DE LA VENTANA DE LOGIN
  // =========================================================================
  describe('QA-25: Reinicio Atómico de la Ventana de Rate Limiting en Login', () => {
    it('25.1 Maneja 20 intentos simultáneos de login registrando el incremento atómico exacto', async () => {
      const testIp = `10.50.25.${Math.floor(Math.random() * 200) + 10}`;
      const email = `victim_qa25_${runId}@eventgrid.io`;
      const key = `ip:${testIp}`;
      const mockReq = { ip: testIp, headers: {}, socket: { remoteAddress: testIp } } as any;

      // Crear registro inicial dentro de la ventana
      await recordFailedLogin(mockReq, email);

      // 19 solicitudes concurrentes adicionales
      const promises = Array.from({ length: 19 }, () => recordFailedLogin(mockReq, email));
      await Promise.all(promises);

      const record = await prisma.loginAttempt.findUnique({ where: { key } });
      expect(record).toBeDefined();
      expect(record!.count).toBe(20);
      expect(record!.blockedUntil).toBeDefined();

      // Limpieza
      await prisma.loginAttempt.deleteMany({
        where: { key: { in: [key, `email:${email}`] } },
      });
    });
  });
});
