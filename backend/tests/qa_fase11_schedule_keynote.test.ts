import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db.js';
import { ScheduleService } from '../src/modules/schedule/schedule.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { ScheduledNotificationsWorker } from '../src/modules/schedule/scheduled-notifications.worker.js';

describe('FASE 11 — NOTIFICACIONES DEL CRONOGRAMA, ANUNCIOS DE KEYNOTE Y SALVAGUARDAS', () => {
  const BARCAMP_EVENT_ID = '1adb61c6-6f85-43f1-93a6-b4be887bdc9c';
  const TEST_USER_ID = 'test-admin-fase11';
  let createdItemIds: string[] = [];
  let createdScheduledNotificationIds: string[] = [];

  beforeAll(async () => {
    const event = await prisma.event.findUnique({
      where: { id: BARCAMP_EVENT_ID },
    });
    expect(event).toBeDefined();
  });

  afterAll(async () => {
    // Limpieza de datos de prueba creados durante la suite
    if (createdScheduledNotificationIds.length > 0) {
      await prisma.scheduledNotification.deleteMany({
        where: { id: { in: createdScheduledNotificationIds } },
      });
    }
    if (createdItemIds.length > 0) {
      await prisma.scheduleChangeLog.deleteMany({
        where: { scheduleItemId: { in: createdItemIds } },
      });
      await prisma.scheduleItem.deleteMany({
        where: { id: { in: createdItemIds } },
      });
    }
  });

  describe('1. PRESERVACIÓN ESTRICTA DE DATOS Y CONFIGURACIONES', () => {
    it('debe mantener intactos los 22 participantes y registros originales de BarCamp RD 2026', async () => {
      const registrations = await prisma.registration.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(registrations.length).toBeGreaterThanOrEqual(22);
      const numbers = registrations.map((r) => r.registrationNumber);
      expect(numbers).toContain('BC26-0001');
      expect(numbers).toContain('BC26-0022');
    });

    it('debe preservar la configuración SMTP de Brevo intacta con remitente oficial', async () => {
      const config = await prisma.emailConfig.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(config).toBeDefined();
      expect(config?.isEnabled).toBe(true);
      expect(config?.host).toBe('smtp-relay.brevo.com');
      expect(config?.user).toBe('bf682a001@smtp-brevo.com');
      expect(config?.fromEmail).toBe('cicc-csti@ce.pucmm.edu.do');
    });

    it('debe preservar las 282 camisetas en el inventario con el desglose exacto', async () => {
      const inventory = await prisma.tshirtInventory.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      const totalQuantity = inventory.reduce((sum, item) => sum + item.initialQuantity, 0);
      expect(totalQuantity).toBe(282);
    });
  });

  describe('2. DETECCIÓN AUTOMÁTICA DE CAMBIOS EN EL CRONOGRAMA', () => {
    let testItem: any;

    it('debe crear una actividad base para pruebas de cambios', async () => {
      testItem = await ScheduleService.createItem(BARCAMP_EVENT_ID, {
        title: 'Taller de Arquitectura Limpia',
        speakerName: 'Ing. Carlos Mendoza',
        speakerCompany: 'TechSoft RD',
        room: 'Aula 101',
        day: 'Día 1',
        startTime: '09:00',
        endTime: '10:00',
        category: 'Desarrollo',
        status: 'CONFIRMED',
        visibility: 'PUBLISHED',
      });

      expect(testItem).toBeDefined();
      expect(testItem.id).toBeTruthy();
      createdItemIds.push(testItem.id);
    });

    it('debe detectar cambio en el horario (startTime / endTime) y registrar ScheduleChangeLog', async () => {
      const updateResult = await ScheduleService.updateItem(
        BARCAMP_EVENT_ID,
        testItem.id,
        {
          startTime: '09:30',
          endTime: '10:30',
        },
        TEST_USER_ID
      );

      expect(updateResult.hasRelevantChanges).toBe(true);
      expect(updateResult.diffs.length).toBe(2);
      expect(updateResult.changeLog).toBeDefined();

      const timeFields = updateResult.diffs.map((d: any) => d.field);
      expect(timeFields).toContain('startTime');
      expect(timeFields).toContain('endTime');

      // Verificar persistencia en base de datos
      const logInDb = await prisma.scheduleChangeLog.findUnique({
        where: { id: updateResult.changeLog.id },
      });
      expect(logInDb).toBeDefined();
      expect(logInDb?.notified).toBe(false);
    });

    it('debe detectar cambio en el salón (room)', async () => {
      const updateResult = await ScheduleService.updateItem(
        BARCAMP_EVENT_ID,
        testItem.id,
        {
          room: 'Auditorio Principal',
        },
        TEST_USER_ID
      );

      expect(updateResult.hasRelevantChanges).toBe(true);
      const roomDiff = updateResult.diffs.find((d: any) => d.field === 'room');
      expect(roomDiff).toBeDefined();
      expect(roomDiff.oldValue).toBe('Aula 101');
      expect(roomDiff.newValue).toBe('Auditorio Principal');
    });

    it('debe detectar cambio en el expositor o empresa', async () => {
      const updateResult = await ScheduleService.updateItem(
        BARCAMP_EVENT_ID,
        testItem.id,
        {
          speakerName: 'Dra. María Fernández',
          speakerCompany: 'Global AI Lab',
        },
        TEST_USER_ID
      );

      expect(updateResult.hasRelevantChanges).toBe(true);
      const speakerDiff = updateResult.diffs.find((d: any) => d.field === 'speakerName');
      expect(speakerDiff).toBeDefined();
      expect(speakerDiff.newValue).toBe('Dra. María Fernández');
    });

    it('debe detectar cambio de estado de CONFIRMED a RESCHEDULED o CANCELLED', async () => {
      const updateResult = await ScheduleService.updateItem(
        BARCAMP_EVENT_ID,
        testItem.id,
        {
          status: 'RESCHEDULED',
        },
        TEST_USER_ID
      );

      expect(updateResult.hasRelevantChanges).toBe(true);
      const statusDiff = updateResult.diffs.find((d: any) => d.field === 'status');
      expect(statusDiff).toBeDefined();
      expect(statusDiff.oldValue).toBe('CONFIRMED');
      expect(statusDiff.newValue).toBe('RESCHEDULED');
    });

    it('no debe marcar hasRelevantChanges si los datos enviados son idénticos o sólo de orden', async () => {
      const updateResult = await ScheduleService.updateItem(
        BARCAMP_EVENT_ID,
        testItem.id,
        {
          order: 99,
        },
        TEST_USER_ID
      );

      expect(updateResult.hasRelevantChanges).toBe(false);
      expect(updateResult.diffs.length).toBe(0);
      expect(updateResult.changeLog).toBeNull();
    });

    it('debe requerir autorización explícita y NO notificar automáticamente al actualizar la charla', async () => {
      const logs = await prisma.scheduleChangeLog.findMany({
        where: { scheduleItemId: testItem.id },
      });
      // Todos los registros recién creados deben estar en notified: false
      for (const log of logs) {
        expect(log.notified).toBe(false);
        expect(log.batchJobId).toBeNull();
      }
    });

    it('debe notificar exitosamente el cambio a los asistentes con notifyScheduleChange', async () => {
      const result = await ScheduleService.notifyScheduleChange(BARCAMP_EVENT_ID, {
        scheduleItemId: testItem.id,
        action: 'SEND_NOW',
        targetGroup: 'ALL',
        customNote: 'Agradecemos su comprensión ante este cambio.',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('SENT_NOW');

      // Verificar que el log quede marcado como notificado
      const updatedLogs = await prisma.scheduleChangeLog.findMany({
        where: { scheduleItemId: testItem.id, notified: true },
      });
      expect(updatedLogs.length).toBeGreaterThan(0);
    });
  });

  describe('3. PLANTILLAS Y GESTIÓN DE KEYNOTE (CONFERENCIA MAGISTRAL)', () => {
    let keynoteItem: any;

    it('debe verificar la existencia de las plantillas SCHEDULE_CHANGE_ALERT y KEYNOTE_ANNOUNCEMENT', async () => {
      const templates = await CommunicationsService.getTemplates(BARCAMP_EVENT_ID);
      const templateCodes = templates.map((t: any) => t.code);

      expect(templateCodes).toContain('SCHEDULE_CHANGE_ALERT');
      expect(templateCodes).toContain('KEYNOTE_ANNOUNCEMENT');
    });

    it('debe permitir crear una actividad Keynote en estado DRAFT (Borrador)', async () => {
      keynoteItem = await ScheduleService.createItem(BARCAMP_EVENT_ID, {
        title: 'Futuro de la Inteligencia Artificial Cuántica',
        speakerName: 'Dr. Alejandro Turing',
        speakerCompany: 'Quantum Research Corp',
        speakerBio: 'Investigador pionero en computación cuántica y LLMs',
        room: 'Gran Salón Magna',
        day: 'Día 1',
        startTime: '16:00',
        endTime: '17:30',
        category: 'Keynote',
        status: 'CONFIRMED',
        isKeynote: true,
        visibility: 'DRAFT',
        announcementText: '¡Una oportunidad única de ver el futuro de la IA!',
      });

      expect(keynoteItem.isKeynote).toBe(true);
      expect(keynoteItem.visibility).toBe('DRAFT');
      createdItemIds.push(keynoteItem.id);
    });

    it('debe ocultar estrictamente el Keynote en estado DRAFT del endpoint público', async () => {
      const publicSchedule = await ScheduleService.getPublicSchedule(BARCAMP_EVENT_ID);
      const publicItems = publicSchedule.items || [];
      const foundDraft = publicItems.find((item: any) => item.id === keynoteItem.id);

      expect(foundDraft).toBeUndefined();
    });

    it('debe procesar publishKeynote en modo PUBLISH_ONLY haciendo la actividad pública sin enviar correos', async () => {
      const result = await ScheduleService.publishKeynote(BARCAMP_EVENT_ID, keynoteItem.id, {
        action: 'PUBLISH_ONLY',
      });

      expect(result.success).toBe(true);
      expect(result.item.visibility).toBe('PUBLISHED');

      // Ahora debe figurar en el endpoint público
      const publicSchedule = await ScheduleService.getPublicSchedule(BARCAMP_EVENT_ID);
      const foundPublished = publicSchedule.items.find((item: any) => item.id === keynoteItem.id);
      expect(foundPublished).toBeDefined();
      expect(foundPublished.title).toBe('Futuro de la Inteligencia Artificial Cuántica');
    });

    it('debe procesar publishKeynote en modo PUBLISH_AND_NOTIFY despachando la campaña de anuncio', async () => {
      const result = await ScheduleService.publishKeynote(BARCAMP_EVENT_ID, keynoteItem.id, {
        action: 'PUBLISH_AND_NOTIFY',
        targetGroup: 'ALL',
        customMessage: 'No se pierdan esta sesión estelar.',
      });

      expect(result.success).toBe(true);
      expect(result.batchJobId).toBeDefined();
      expect(result.totalTargeted).toBeGreaterThanOrEqual(1);
    });

    it('debe permitir programar publicación y anuncio futuro con SCHEDULE_PUBLISH_AND_NOTIFY', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hora en el futuro
      const result = await ScheduleService.publishKeynote(BARCAMP_EVENT_ID, keynoteItem.id, {
        action: 'SCHEDULE_PUBLISH_AND_NOTIFY',
        targetGroup: 'ALL',
        scheduledFor: futureDate,
        customMessage: 'Anuncio programado con antelación.',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledNotification).toBeDefined();
      expect(result.scheduledNotification.status).toBe('SCHEDULED');
      createdScheduledNotificationIds.push(result.scheduledNotification.id);
    });

    it('debe permitir cancelar una notificación programada pendiente', async () => {
      const futureDate = new Date(Date.now() + 7200 * 1000).toISOString();
      const notif = await prisma.scheduledNotification.create({
        data: {
          eventId: BARCAMP_EVENT_ID,
          title: 'Notificación de prueba para cancelar',
          message: 'Contenido de prueba',
          targetGroup: 'ALL',
          templateCode: 'KEYNOTE_ANNOUNCEMENT',
          scheduledFor: new Date(futureDate),
          status: 'SCHEDULED',
        },
      });
      createdScheduledNotificationIds.push(notif.id);

      const cancelResult = await ScheduleService.cancelScheduledNotification(BARCAMP_EVENT_ID, notif.id);
      expect(cancelResult.success).toBe(true);

      const inDb = await prisma.scheduledNotification.findUnique({
        where: { id: notif.id },
      });
      expect(inDb?.status).toBe('CANCELLED');
    });
  });

  describe('4. ANUNCIOS EN VIVO DURANTE PAUSAS Y SEGMENTACIÓN', () => {
    it('debe crear un anuncio en vivo con createAnnouncement para envío inmediato', async () => {
      const result = await ScheduleService.createAnnouncement(BARCAMP_EVENT_ID, {
        subject: '¡Pausa de Café y Sesión de Networking!',
        message: 'Invitamos a todos los participantes al área central para disfrutar de un refrigerio.',
        action: 'SEND_NOW',
        targetGroup: 'ALL',
        priority: 'NORMAL',
      });

      expect(result.success).toBe(true);
      expect(result.batchJobId).toBeDefined();
      expect(result.totalTargeted).toBeGreaterThanOrEqual(1);
    });

    it('debe programar un anuncio para envío diferido', async () => {
      const futureDate = new Date(Date.now() + 1800 * 1000).toISOString(); // 30 minutos
      const result = await ScheduleService.createAnnouncement(BARCAMP_EVENT_ID, {
        subject: 'Cierre del evento en 30 minutos',
        message: 'Agradecemos a todos reunirse en el auditorio para la ceremonia de clausura.',
        action: 'SCHEDULE',
        targetGroup: 'CONFIRMED',
        scheduledFor: futureDate,
        priority: 'URGENT',
      });

      expect(result.success).toBe(true);
      expect(result.scheduledNotification).toBeDefined();
      expect(result.scheduledNotification.status).toBe('SCHEDULED');
      createdScheduledNotificationIds.push(result.scheduledNotification.id);
    });
  });

  describe('5. WORKER DE NOTIFICACIONES PROGRAMADAS (PERSISTENCIA Y EJECUCIÓN)', () => {
    it('debe ejecutar y completar notificaciones maduras cuyo scheduledFor <= now', async () => {
      // Creamos una notificación programada para el pasado reciente (hace 10 segundos)
      const pastDate = new Date(Date.now() - 10000);
      const matureNotif = await prisma.scheduledNotification.create({
        data: {
          eventId: BARCAMP_EVENT_ID,
          title: 'Anuncio procesado por worker programado',
          message: 'Este mensaje fue disparado puntualmente por ScheduledNotificationsWorker.',
          targetGroup: 'ALL',
          templateCode: 'GENERAL_ANNOUNCEMENT',
          scheduledFor: pastDate,
          status: 'SCHEDULED',
        },
      });
      createdScheduledNotificationIds.push(matureNotif.id);

      // Ejecutamos el ciclo del worker
      await ScheduledNotificationsWorker.processPending();

      // Esperar a que el worker complete el procesamiento del lote
      let executed: any = null;
      for (let i = 0; i < 25; i++) {
        executed = await prisma.scheduledNotification.findUnique({
          where: { id: matureNotif.id },
        });
        if (executed?.status === 'COMPLETED') break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      expect(executed?.status).toBe('COMPLETED');
      expect(executed?.executedAt).toBeDefined();
      expect(executed?.error).toBeNull();
    });
  });
});
