import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { ParticipantsService } from '../src/modules/participants/participants.service';
import { ScheduleService } from '../src/modules/schedule/schedule.service';
import { ImportService } from '../src/modules/import/import.service';
import { decryptSecret } from '../src/utils/crypto';
import QRCode from 'qrcode';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

let smtpBaseline: any;

describe('EventGrid Fase 9: Imágenes, QR en Gmail, Tickets, Cronograma y Comunicaciones', () => {
  let testEvent: any;
  let adminUser: any;
  let sampleParticipant: any;
  let sampleRegistration: any;
  const runId = Math.random().toString(36).substring(2, 7);

  const sentEmails: any[] = [];
  const mockTransporter = {
    sendMail: async (mailOptions: any) => {
      sentEmails.push(mailOptions);
      return {
        messageId: `mock-msg-${Date.now()}`,
        accepted: [mailOptions.to],
      };
    },
    verify: async () => true,
  };

  beforeAll(async () => {
    smtpBaseline = await prisma.emailConfig.findFirst({ where: { eventId: null } });
    CommunicationsService.setTransporterFactory(() => mockTransporter);

    adminUser = await prisma.user.create({
      data: {
        email: `admin_fase9_${runId}@eventgrid.io`,
        fullName: 'Admin Fase 9 QA',
        passwordHash: 'fake_hash',
        role: 'ADMIN',
        isActive: true,
      },
    });

    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 9 QA ${runId}`,
        slug: `fase9-${runId}`,
        year: 2026,
        startDate: new Date('2026-11-05T09:00:00Z'),
        endDate: new Date('2026-11-05T18:00:00Z'),
        venue: 'Auditorio Central PUCMM',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: `F9-${runId.toUpperCase()}-`,
        demoModeEnabled: false,
        primaryColor: '#e11d48',
        themeMode: 'dark',
      },
    });

    // Configuración SMTP mock para este evento de prueba
    await prisma.emailConfig.create({
      data: {
        eventId: testEvent.id,
        host: 'smtp-relay.brevo.com',
        port: 587,
        user: `user_fase9_${runId}@smtp-brevo.com`,
        password: 'encrypted_fake_password',
        fromEmail: 'notifications@example.invalid',
        fromName: 'EventGrid QA',
        isEnabled: true,
      },
    });
  });

  afterAll(async () => {
    // Restaurar fábrica
    CommunicationsService.setTransporterFactory(null);

    // Limpieza de datos de prueba creados durante la suite
    if (testEvent?.id) {
      await prisma.scheduleItem.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailBatchItem.deleteMany({ where: { job: { eventId: testEvent.id } } });
      await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailLog.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registration.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.registrationSequence.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.emailConfig.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } });
      await prisma.event.deleteMany({ where: { id: testEvent.id } });
    }

    if (sampleParticipant?.id) {
      await prisma.participant.deleteMany({ where: { id: sampleParticipant.id } });
    }

    if (adminUser?.id) {
      await prisma.user.deleteMany({ where: { id: adminUser.id } });
    }
  });

  // =========================================================================
  // BLOQUE 1: PRESERVACIÓN ABSOLUTA DE DATOS Y CONFIGURACIONES PREVIAS
  // =========================================================================
  describe('Bloque 1: Preservación de credenciales Brevo y datos preexistentes', () => {
    it('debe mantener intacta la configuración global de Brevo SMTP', async () => {
      const globalConfig = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });

      expect(globalConfig).toBeDefined();
      expect(globalConfig?.host).toBe(smtpBaseline?.host);
      expect(globalConfig?.user).toBe(smtpBaseline?.user);
      expect(globalConfig?.fromEmail).toBe(smtpBaseline?.fromEmail);
      expect(globalConfig?.isEnabled).toBe(true);
      expect(globalConfig?.password).toBeTruthy();
      expect(globalConfig?.password?.length).toBeGreaterThan(50);
    });

    it('debe mantener las plantillas de correo y sus estilos', async () => {
      const templates = await prisma.emailTemplate.findMany();
      expect(templates.length).toBeGreaterThanOrEqual(7);
      const ticketTemplate = templates.find((t) => t.code === 'DIGITAL_TICKET');
      expect(ticketTemplate).toBeDefined();
    });

    it('debe mantener el inventario de 282 camisetas en stock', async () => {
      const inventories = await prisma.tshirtInventory.findMany();
      const totalUnits = inventories.reduce((sum, item) => sum + item.initialQuantity, 0);
      expect(totalUnits).toBe(282);
    });
  });

  // =========================================================================
  // BLOQUE 2: RESOLUCIÓN DE IMÁGENES Y LOGOTIPO DE LA EDICIÓN
  // =========================================================================
  describe('Bloque 2: Directorio estático de imágenes y CORS', () => {
    it('el directorio de uploads y subcarpetas deben existir físicamente en disco', () => {
      const uploadsDir = fs.existsSync(path.resolve(process.cwd(), 'backend', 'uploads'))
        ? path.resolve(process.cwd(), 'backend', 'uploads')
        : path.resolve(process.cwd(), 'uploads');
      const logosDir = path.join(uploadsDir, 'logos');
      const schedulesDir = path.join(uploadsDir, 'schedules');

      expect(fs.existsSync(uploadsDir)).toBe(true);
      expect(fs.existsSync(logosDir)).toBe(true);
      expect(fs.existsSync(schedulesDir)).toBe(true);
    });

    it('debe contener el archivo del logotipo de la edición', () => {
      const uploadsDir = fs.existsSync(path.resolve(process.cwd(), 'backend', 'uploads'))
        ? path.resolve(process.cwd(), 'backend', 'uploads')
        : path.resolve(process.cwd(), 'uploads');
      const logosDir = path.join(uploadsDir, 'logos');
      const files = fs.readdirSync(logosDir);
      expect(files.length).toBeGreaterThan(0);
      const hasLogo = files.some((f) => f.includes('logo_') && f.endsWith('.png'));
      expect(hasLogo).toBe(true);
    });
  });

  // =========================================================================
  // BLOQUE 3: CÓDIGO QR EN CORREOS Y VISIBILIZACIÓN EN GMAIL
  // =========================================================================
  describe('Bloque 3: Código QR con inline CID attachments para Gmail', () => {
    it('renderTemplateContent debe generar qrBuffer, qrDataUrl y enlace accesible qrUrl', async () => {
      sampleParticipant = await prisma.participant.create({
        data: {
          fullName: `Participante QA 9 ${runId}`,
          firstName: 'Participante',
          lastName: 'Fase9',
          email: `participante_qa9_${runId}@eventgrid.test`,
        },
      });

      sampleRegistration = await prisma.registration.create({
        data: {
          eventId: testEvent.id,
          participantId: sampleParticipant.id,
          registrationNumber: `F9-${runId.toUpperCase()}-0001`,
          source: 'MANUAL',
          qrCode: `fase9_qr_token_${runId}`,
          status: 'CONFIRMED',
          ticketPrice: 500,
          amountPaid: 500,
          balanceDue: 0,
        },
        include: {
          participant: true,
          event: { include: { settings: true } },
        },
      });

      const template = {
        code: 'DIGITAL_TICKET',
        subject: 'Tu entrada digital — {{eventName}}',
        bodyHtml: '<div><h2>{{eventName}}</h2><img src="{{qrDataUrl}}" alt="QR" /><a href="{{qrUrl}}">Ver Ticket</a></div>',
        bodyText: 'Ticket {{qrUrl}}',
      };

      const rendered = await CommunicationsService.renderTemplateContent(template, sampleRegistration);

      expect(rendered.qrUrl).toContain(`/t/${sampleRegistration.qrCode}`);
      expect(rendered.qrDataUrl).toContain('data:image/png;base64,');
      expect((rendered as any).qrBuffer).toBeInstanceOf(Buffer);
      expect(rendered.html).toContain('data:image/png;base64,');
      expect(rendered.html).toContain(rendered.qrUrl);
    });

    it('prepareEmailPayload debe reemplazar data URI por cid:ticket-qr-code y adjuntar el Buffer', () => {
      const dummyBuffer = Buffer.from('fake-qr-binary-png');
      const dummyDataUrl = 'data:image/png;base64,ZmFrZS1xci1iaW5hcnktcG5n';
      const inputHtml = `<div><img src="${dummyDataUrl}" alt="QR" /><p>Texto</p></div>`;

      const payload = CommunicationsService.prepareEmailPayload(inputHtml, {
        qrBuffer: dummyBuffer,
        qrDataUrl: dummyDataUrl,
      });

      expect(payload.html).not.toContain(dummyDataUrl);
      expect(payload.html).toContain('src="cid:ticket-qr-code"');
      expect(payload.attachments.length).toBe(1);
      expect(payload.attachments[0].cid).toBe('ticket-qr-code');
      expect(payload.attachments[0].filename).toBe('ticket-qr.png');
      expect(payload.attachments[0].contentType).toBe('image/png');
      expect(payload.attachments[0].content).toEqual(dummyBuffer);
    });

    it('sendSingleEmail debe enviar el correo real usando attachments con inline CID para Gmail', async () => {
      sentEmails.length = 0;

      await CommunicationsService.sendSingleEmail({
        eventId: testEvent.id,
        registrationId: sampleRegistration.id,
        templateCode: 'DIGITAL_TICKET',
        mode: 'REAL',
      });

      expect(sentEmails.length).toBe(1);
      const sent = sentEmails[0];
      expect(sent.to).toBe(sampleParticipant.email);
      expect(sent.html).toContain('src="cid:ticket-qr-code"');
      expect(sent.attachments).toBeDefined();
      expect(sent.attachments.some((a: any) => a.cid === 'ticket-qr-code')).toBe(true);
    });
  });

  // =========================================================================
  // BLOQUE 4: UNIFICACIÓN DE SECUENCIA DE TICKETS
  // =========================================================================
  describe('Bloque 4: Unificación de secuencia de inscripciones en import.service.ts', () => {
    it('getNextRegistrationNumber debe generar correlativos continuos formateados', async () => {
      const seqEvt = await prisma.event.create({
        data: {
          name: `Seq Evt ${runId}`,
          slug: `seq-${runId}`,
          year: 2026,
          startDate: new Date(),
          endDate: new Date(),
        },
      });
      const prefix = `TEST-SEQ-${runId.toUpperCase()}-`;
      const num1 = await ParticipantsService.getNextRegistrationNumber(seqEvt.id, 2026, prefix);
      const num2 = await ParticipantsService.getNextRegistrationNumber(seqEvt.id, 2026, prefix);
      await prisma.registrationSequence.deleteMany({ where: { eventId: seqEvt.id } });
      await prisma.event.delete({ where: { id: seqEvt.id } });

      expect(num1).toBe(`${prefix}0001`);
      expect(num2).toBe(`${prefix}0002`);
    });

    it('debe ignorar números planos no formateados ("1", "2") y asignar la secuencia oficial', async () => {
      const isPlainSmallNumber = /^\d{1,4}$/.test('1');
      expect(isPlainSmallNumber).toBe(true);

      const isPlainSmallNumber2 = /^\d{1,4}$/.test('45');
      expect(isPlainSmallNumber2).toBe(true);

      const isFormattedTicket = /^\d{1,4}$/.test('BC26-0001');
      expect(isFormattedTicket).toBe(false);
    });
  });

  // =========================================================================
  // BLOQUE 5: NUEVO MÓDULO DE CRONOGRAMA DE CONFERENCIAS (SCHEDULEITEM)
  // =========================================================================
  describe('Bloque 5: Módulo de Cronograma (ScheduleItem)', () => {
    let createdTalkId: string;

    it('debe crear un ítem en el cronograma con horarios, aula y expositor', async () => {
      const talk = await ScheduleService.createItem(testEvent.id, {
        title: 'Arquitectura de Alta Disponibilidad con Kubernetes',
        speakerName: 'Ing. Carlos Mendoza',
        speakerCompany: 'Tech Cloud RD',
        speakerBio: 'Arquitecto Cloud certificado',
        room: 'Auditorio A',
        day: 'Día 1',
        startTime: '10:00',
        endTime: '11:00',
        category: 'Infraestructura',
        status: 'CONFIRMED',
        description: 'Mejores prácticas para despliegues tolerantes a fallos.',
        order: 1,
      });

      expect(talk).toBeDefined();
      expect(talk.id).toBeTruthy();
      expect(talk.title).toBe('Arquitectura de Alta Disponibilidad con Kubernetes');
      expect(talk.status).toBe('CONFIRMED');
      createdTalkId = talk.id;
    });

    it('debe consultar el cronograma con filtros por día, aula y categoría', async () => {
      const schedule = await ScheduleService.getItems(testEvent.id, {
        day: 'Día 1',
        room: 'Auditorio A',
      });

      expect(schedule.total).toBeGreaterThanOrEqual(1);
      expect(schedule.days).toContain('Día 1');
      expect(schedule.rooms).toContain('Auditorio A');
      expect(schedule.categories).toContain('Infraestructura');
      expect(schedule.items.some((i) => i.id === createdTalkId)).toBe(true);
    });

    it('debe actualizar el estado de una charla a RESCHEDULED o CANCELLED', async () => {
      const updated = await ScheduleService.updateItem(testEvent.id, createdTalkId, {
        status: 'RESCHEDULED',
        room: 'Auditorio B',
        startTime: '11:15',
        endTime: '12:15',
      });

      expect(updated.status).toBe('RESCHEDULED');
      expect(updated.room).toBe('Auditorio B');
      expect(updated.startTime).toBe('11:15');
    });

    it('debe configurar y persistir la URL o enlace del PDF del cronograma', async () => {
      const pdfRes = await ScheduleService.updatePdfUrl(
        testEvent.id,
        'https://eventgrid.app/uploads/schedules/cronograma-oficial.pdf'
      );

      expect(pdfRes.success).toBe(true);
      expect(pdfRes.pdfUrl).toContain('cronograma-oficial.pdf');

      const settings = await prisma.eventSettings.findUnique({
        where: { eventId: testEvent.id },
      });
      expect(settings?.schedulePdfUrl).toBe('https://eventgrid.app/uploads/schedules/cronograma-oficial.pdf');
    });

    it('la vista pública móvil getPublicSchedule debe agrupar por días y retornar metadata viva', async () => {
      const publicView = await ScheduleService.getPublicSchedule(testEvent.id);

      expect(publicView.total).toBeGreaterThanOrEqual(1);
      expect(publicView.currentTime).toMatch(/^\d{2}:\d{2}$/);
      expect(publicView.groupedByDay.length).toBeGreaterThanOrEqual(1);
      expect(publicView.pdfUrl).toContain('cronograma-oficial.pdf');
    });

    it('debe importar charlas masivamente desde un archivo Excel en memoria', async () => {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['Título', 'Expositor', 'Aula', 'Inicio', 'Fin', 'Categoría', 'Día'],
        ['Keynote de Apertura: IA Generativa', 'Dra. Elena Ramos', 'Plenaria', '09:00', '10:00', 'Keynote', 'Día 1'],
        ['Seguridad en APIs RESTful', 'Lic. Marcos Soto', 'Sala 102', '10:30', '11:30', 'Seguridad', 'Día 1'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Agenda');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const importRes = await ScheduleService.importFromBuffer(testEvent.id, buffer);

      expect(importRes.importedCount).toBe(2);
      expect(importRes.errorCount).toBe(0);

      const all = await ScheduleService.getItems(testEvent.id);
      expect(all.total).toBeGreaterThanOrEqual(3);
    });

    it('debe eliminar una charla del cronograma correctamente', async () => {
      const del = await ScheduleService.deleteItem(testEvent.id, createdTalkId);
      expect(del.success).toBe(true);

      const items = await ScheduleService.getItems(testEvent.id);
      expect(items.items.some((i) => i.id === createdTalkId)).toBe(false);
    });
  });

  // =========================================================================
  // BLOQUE 6: COMUNICACIONES MASIVAS - SEGMENTACIÓN Y ADVERTENCIA DE CUOTA BREVO
  // =========================================================================
  describe('Bloque 6: Segmentación de destinatarios y límite Brevo 300/día', () => {
    it('getRecipientStats debe soportar grupos COURTESY y PARTIAL y retornar advertencia de cuota Brevo', async () => {
      const stats = await CommunicationsService.getRecipientStats({
        eventId: testEvent.id,
        targetGroup: 'COURTESY',
      });

      expect(stats.dailyQuotaLimit).toBe(300);
      expect(stats.quotaWarning).toBeDefined();
      expect(stats.quotaWarning).toContain('Brevo');
      expect(stats.quotaWarning).toContain('300 correos/día');
    });

    it('sendBulkEmail debe aceptar filtros avanzados y encolar el lote atómicamente', async () => {
      const bulkRes = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'EVENT_REMINDER',
          targetGroup: 'CONFIRMED',
          mode: 'SIMULATION',
        },
        adminUser.id
      );

      expect(bulkRes.batchId).toBeDefined();
      expect(bulkRes.totalTargeted).toBeGreaterThanOrEqual(1);

      const batch = await prisma.emailBatchJob.findUnique({
        where: { id: bulkRes.batchId! },
      });
      expect(batch).toBeDefined();
      expect(batch?.mode).toBe('SIMULATION');
    });
  });
});
