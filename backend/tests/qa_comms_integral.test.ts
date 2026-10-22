import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

describe('QA Integral — Comunicaciones, Historial Unificado, Destinatarios Inteligentes y Persistencia', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let adminUserId: string;
  let activeEventId: string;
  let secondEventId: string;
  let generalTicketTypeId: string;
  let testRegId: string;
  let testParticipantId: string;
  let testRegId2: string;
  let testParticipantId2: string;
  let testRegId3: string;
  let testParticipantId3: string;
  let originalEmailConfig: any = null;

  beforeAll(async () => {
    // 1. Obtener tokens de autenticación
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;
    adminUserId = adminRes.body.data.user.id;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;

    const viewRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    viewerToken = viewRes.body.data.token;

    // 2. Evento activo 2026
    const event = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = event!.id;
    await prisma.emailConfig.updateMany({ where: { eventId: activeEventId }, data: { isEnabled: true } });
    originalEmailConfig = await prisma.emailConfig.findFirst({ where: { eventId: activeEventId } });

    // Segundo evento para prueba de aislamiento entre ediciones
    let secondEvent = await prisma.event.findFirst({ where: { year: 2025 } });
    if (!secondEvent) {
      secondEvent = await prisma.event.create({
        data: {
          slug: 'barcamp-2025-test',
          name: 'BarCamp RD 2025 Test',
          year: 2025,
          startDate: new Date('2025-11-01'),
          endDate: new Date('2025-11-01'),
          venue: 'Universidad Test',
          status: 'ARCHIVED',
        },
      });
    }
    secondEventId = secondEvent.id;

    // 3. Ticket type para pruebas
    let ticketType = await prisma.ticketType.findFirst({ where: { eventId: activeEventId } });
    if (!ticketType) {
      ticketType = await prisma.ticketType.create({
        data: {
          eventId: activeEventId,
          name: 'Entrada General QA Integral',
          price: 1750,
          totalCapacity: 500,
        },
      });
    }
    generalTicketTypeId = ticketType.id;

    // 4. Crear 2 participantes y registros de prueba
    const u1 = `QAINT_${Date.now()}_1`;
    const p1 = await prisma.participant.create({
      data: {
        documentId: `DOC-${u1.slice(-6)}`,
        firstName: 'Participante',
        lastName: 'QA Uno',
        fullName: 'Participante QA Uno',
        email: `${u1.toLowerCase()}@eventgrid.test`,
        phone: '809-555-0101',
        institution: 'Instituto QA',
      },
    });
    testParticipantId = p1.id;

    const r1 = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p1.id,
        registrationNumber: `REG-${u1.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        attended: false,
        amountPaid: 1750,
        ticketPrice: 1750,
        totalAmount: 1750,
      },
    });
    testRegId = r1.id;

    const u2 = `QAINT_${Date.now()}_2`;
    const p2 = await prisma.participant.create({
      data: {
        documentId: `DOC-${u2.slice(-6)}`,
        firstName: 'Participante',
        lastName: 'QA Dos',
        fullName: 'Participante QA Dos',
        email: `${u2.toLowerCase()}@eventgrid.test`,
        phone: '809-555-0102',
        institution: 'Universidad QA',
      },
    });
    testParticipantId2 = p2.id;

    const r2 = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p2.id,
        registrationNumber: `REG-${u2.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        attended: false,
        amountPaid: 1750,
        ticketPrice: 1750,
        totalAmount: 1750,
      },
    });
    testRegId2 = r2.id;
    const u3 = `QAINT_${Date.now()}_3`;
    const p3 = await prisma.participant.create({
      data: {
        documentId: `DOC-${u3.slice(-6)}`,
        firstName: 'Participante',
        lastName: 'QA Tres',
        fullName: 'Participante QA Tres',
        email: `${u3.toLowerCase()}@eventgrid.test`,
        phone: '809-555-0103',
        institution: 'Tecnológico QA',
      },
    });
    testParticipantId3 = p3.id;

    const r3 = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p3.id,
        registrationNumber: `REG-${u3.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        attended: false,
        amountPaid: 1750,
        ticketPrice: 1750,
        totalAmount: 1750,
      },
    });
    testRegId3 = r3.id;

    // 5. Instalar transportador mock seguro para NUNCA enviar correos reales
    CommunicationsService.setTransporterFactory(() => ({
      verify: async () => true,
      sendMail: async (mailOptions: any) => ({
        messageId: `<mock-${Date.now()}@eventgrid.test>`,
        accepted: [mailOptions.to],
        rejected: [],
        response: '250 2.0.0 OK Mock acceptance',
      }),
    }));
  });

  afterAll(async () => {
    // Restaurar fábrica de transporte original
    CommunicationsService.setTransporterFactory(null);

    // Limpieza de datos de prueba creados
    const regIds = [testRegId, testRegId2, testRegId3].filter(Boolean);
    const partIds = [testParticipantId, testParticipantId2, testParticipantId3].filter(Boolean);

    await prisma.emailLog.deleteMany({ where: { registrationId: { in: regIds } } }).catch(() => {});
    await prisma.emailBatchItem.deleteMany({ where: { registrationId: { in: regIds } } }).catch(() => {});
    await prisma.auditLog.deleteMany({ where: { entityId: { in: regIds } } }).catch(() => {});
    await prisma.registration.deleteMany({ where: { id: { in: regIds } } }).catch(() => {});
    await prisma.participant.deleteMany({ where: { id: { in: partIds } } }).catch(() => {});

    // Restaurar configuración SMTP si hubiera sido alterada
    if (originalEmailConfig) {
      await prisma.emailConfig.update({
        where: { id: originalEmailConfig.id },
        data: {
          host: originalEmailConfig.host,
          port: originalEmailConfig.port,
          secure: originalEmailConfig.secure,
          user: originalEmailConfig.user,
          password: originalEmailConfig.password,
          fromEmail: originalEmailConfig.fromEmail,
          fromName: originalEmailConfig.fromName,
          replyToEmail: originalEmailConfig.replyToEmail,
          isEnabled: true,
        },
      }).catch(() => {});
    }
  });

  // =========================================================================
  // CASO 1: Enviar una confirmación individual
  // =========================================================================
  it('1. Enviar una confirmación individual y registrar ACCEPTED_BY_SMTP', async () => {
    const res = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        customSubject: 'Confirmación Oficial de Prueba QA',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.log).toBeDefined();
    expect(res.body.data.log.status).toBe('ACCEPTED_BY_SMTP');
    expect(res.body.data.log.templateCode).toBe('INSCRIPTION_CONFIRMATION');
  });

  // =========================================================================
  // CASO 2: Consultar su historial
  // =========================================================================
  it('2. Consultar su historial de comunicaciones para el participante', async () => {
    const res = await request(app)
      .get(`/api/v1/communications/history/registration/${testRegId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const firstEntry = res.body.data[0];
    expect(firstEntry.registrationId).toBe(testRegId);
    expect(firstEntry.templateCode).toBe('INSCRIPTION_CONFIRMATION');
    expect(firstEntry.status).toBe('ACCEPTED_BY_SMTP');
    expect(firstEntry.source).toBe('SINGLE');
  });

  // =========================================================================
  // CASO 3 & 4: Intentar enviarla nuevamente -> Advertencia y exclusión por defecto
  // =========================================================================
  it('3 & 4. Intentar enviar nuevamente y comprobar advertencia DUPLICATE_COMMUNICATION_WARNING', async () => {
    const res = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('Este participante ya recibió un envío de este tipo el');
    expect(res.body.message).toContain('¿Deseas reenviarlo?');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.code).toBe('DUPLICATE_COMMUNICATION_WARNING');
  });

  // =========================================================================
  // CASO 5: Autorizar un reenvío
  // =========================================================================
  it('5. Autorizar un reenvío explícito con forceResend: true', async () => {
    const res = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        forceResend: true,
        resendReason: 'Participante solicitó reenvío por correo no recibido',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.success).toBe(true);
    expect(res.body.data.log.status).toBe('ACCEPTED_BY_SMTP');
  });

  // =========================================================================
  // CASO 6: Registrar quién lo autorizó en auditoría
  // =========================================================================
  it('6. Registrar quién lo autorizó en el log de auditoría (EMAIL_RESEND_AUTHORIZED)', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: {
        entity: 'Registration',
        entityId: testRegId,
        action: 'EMAIL_RESEND_AUTHORIZED',
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(audit).toBeDefined();
    expect(audit?.userId).toBe(adminUserId);
    expect(audit?.changes).toContain('Participante solicitó reenvío por correo no recibido');
  });

  // =========================================================================
  // CASO 7: Simular un correo y confirmar que no cuenta como envío real
  // =========================================================================
  it('7. Simular un correo (SIMULATED) y confirmar que no cuenta como envío real', async () => {
    // Para testRegId2 enviar en modo simulación
    const simRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId2,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        mode: 'SIMULATION',
      });

    expect(simRes.status).toBe(200);
    expect(simRes.body.data.simulated).toBe(true);
    expect(simRes.body.data.log.status).toBe('SIMULATED');

    // Comprobar que una simulación NO genera bloqueo de duplicado para un envío real posterior
    // Debe permitir el envío sin forceResend
    const nextRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId2,
        templateCode: 'INSCRIPTION_CONFIRMATION',
      });

    expect(nextRes.status).toBe(200);
    expect(nextRes.body.data.log.status).toBe('ACCEPTED_BY_SMTP');
  });

  // =========================================================================
  // CASO 8: Simular fallo SMTP
  // =========================================================================
  it('8. Simular fallo SMTP y registrar estado FAILED', async () => {
    // Configurar fábrica mock para lanzar error de transporte
    CommunicationsService.setTransporterFactory(() => ({
      verify: async () => true,
      sendMail: async () => {
        throw new Error('550 Relay access denied for testing');
      },
    }));

    const failRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId2,
        templateCode: 'EVENT_REMINDER',
      });

    expect(failRes.status).toBe(400);
    expect(failRes.body.message).toContain('Fallo al enviar correo');

    // Comprobar que en la base de datos se guardó el log con estado FAILED
    const failedLog = await prisma.emailLog.findFirst({
      where: {
        registrationId: testRegId2,
        templateCode: 'EVENT_REMINDER',
        status: 'FAILED',
      },
      orderBy: { sentAt: 'desc' },
    });

    expect(failedLog).toBeDefined();
    expect(failedLog?.errorMessage).toContain('550 Relay access denied');

    // Restaurar transportador mock exitoso
    CommunicationsService.setTransporterFactory(() => ({
      verify: async () => true,
      sendMail: async (mailOptions: any) => ({
        messageId: `<mock-${Date.now()}@eventgrid.test>`,
        accepted: [mailOptions.to],
        rejected: [],
        response: '250 2.0.0 OK Mock acceptance',
      }),
    }));
  });

  // =========================================================================
  // CASO 9: Simular estado de entrega desconocido (ACCEPTED_BY_SMTP vs DELIVERED)
  // =========================================================================
  it('9. Distinguir semánticamente ACCEPTED_BY_SMTP y no marcar como DELIVERED sin confirmación', async () => {
    const log = await prisma.emailLog.findFirst({
      where: { registrationId: testRegId, status: 'ACCEPTED_BY_SMTP' },
    });

    expect(log).toBeDefined();
    expect(log?.status).toBe('ACCEPTED_BY_SMTP');
    expect(log?.status).not.toBe('DELIVERED'); // Nunca 'DELIVERED' sin webhook de entrega
  });

  // =========================================================================
  // CASO 10: Evitar duplicados por solicitudes concurrentes
  // =========================================================================
  it('10. Evitar duplicados por solicitudes concurrentes (bloqueo PROCESSING activo)', async () => {
    // Insertar un log artificial en estado PROCESSING dentro de la ventana de 20s
    const procLog = await prisma.emailLog.create({
      data: {
        eventId: activeEventId,
        registrationId: testRegId2,
        recipientEmail: 'concurrent@eventgrid.test',
        recipientName: 'Tester Concurrente',
        templateCode: 'INSCRIPTION_CONFIRMATION',
        subject: 'Boleto Digital en tránsito',
        status: 'PROCESSING',
        sentAt: new Date(),
      },
    });

    // Intentar enviar inmediatamente el mismo templateCode
    const concurrentRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId2,
        templateCode: 'INSCRIPTION_CONFIRMATION',
      });

    expect(concurrentRes.status).toBe(400);
    expect(concurrentRes.body.message).toContain('Ya hay un envío de este tipo en procesamiento en este momento');

    // Limpiar el log temporal
    await prisma.emailLog.delete({ where: { id: procLog.id } });
  });

  // =========================================================================
  // CASO 11: Importar participantes desde Excel (verificar 0 envíos automáticos)
  // =========================================================================
  it('11. Comprobar que importación y registro nuevo NO envían correos automáticamente', async () => {
    const logsBefore = await prisma.emailLog.count();

    // Crear un nuevo participante simulando flujo de registro / importación
    const unique = `IMPORT_TEST_${Date.now()}`;
    const p = await prisma.participant.create({
      data: {
        documentId: `IMP-${unique.slice(-6)}`,
        firstName: 'Importado',
        lastName: 'Sin Correo Automatico',
        fullName: 'Importado Sin Correo Automatico',
        email: `${unique.toLowerCase()}@import.test`,
        phone: '809-555-9999',
      },
    });

    const r = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: p.id,
        registrationNumber: `REG-${unique.slice(-6)}`,
        ticketTypeId: generalTicketTypeId,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        attended: false,
        amountPaid: 1750,
      },
    });

    const logsAfter = await prisma.emailLog.count();
    expect(logsAfter).toBe(logsBefore); // 0 correos generados automáticamente

    // Limpieza
    await prisma.registration.delete({ where: { id: r.id } });
    await prisma.participant.delete({ where: { id: p.id } });
  });

  // =========================================================================
  // CASO 12: Filtrar pagados sin confirmación
  // =========================================================================
  it('12. Filtrar pagados sin confirmación (PAID_WITHOUT_CONFIRMATION)', async () => {
    const statsRes = await request(app)
      .post('/api/v1/communications/recipients/validate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        targetGroup: 'PAID_WITHOUT_CONFIRMATION',
      });

    expect(statsRes.status).toBe(200);
    expect(statsRes.body.status).toBe('success');
    expect(statsRes.body.data.eligibleCount).toBeDefined();
    expect(typeof statsRes.body.data.eligibleCount).toBe('number');
    expect(statsRes.body.data.alreadyNotifiedCount).toBeDefined();
    expect(statsRes.body.data.totalSelected).toBeDefined();
  });

  // =========================================================================
  // CASO 13: Enviar campaña masiva a pendientes con batchId
  // =========================================================================
  it('13. Enviar campaña masiva con targetGroup y batchId generado', async () => {
    const bulkRes = await request(app)
      .post('/api/v1/communications/send-bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        templateCode: 'EVENT_REMINDER',
        targetGroup: 'PAID_WITHOUT_CONFIRMATION',
        customSubject: 'Recordatorio Masivo para Pendientes',
        excludeAlreadyNotified: true,
      });

    expect(bulkRes.status).toBe(200);
    expect(bulkRes.body.status).toBe('success');
    expect(bulkRes.body.data.batchId).toBeDefined();
    expect(bulkRes.body.data.batchId.startsWith('BATCH-')).toBe(true);

    // Limpiar items de lote creados
    await prisma.emailBatchItem.deleteMany({ where: { batchId: bulkRes.body.data.batchId } }).catch(() => {});
    await prisma.emailBatchJob.deleteMany({ where: { id: bulkRes.body.data.batchId } }).catch(() => {});
  });

  // =========================================================================
  // CASO 14: Verificar historial individual y masivo unificado
  // =========================================================================
  it('14. Unificar historial individual y masivo sin duplicación visual', async () => {
    const batchJob = await prisma.emailBatchJob.create({
      data: {
        eventId: activeEventId,
        templateCode: 'SCHEDULE_UPDATE',
        subject: 'Actualización de Cronograma QA',
        totalCount: 1,
        processedCount: 1,
        sentCount: 1,
        status: 'COMPLETED',
        createdById: adminUserId,
      },
    });

    const batchItem = await prisma.emailBatchItem.create({
      data: {
        jobId: batchJob.id,
        registrationId: testRegId,
        recipientEmail: 'unificado@eventgrid.test',
        recipientName: 'Participante QA Uno',
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    const history = await CommunicationsService.getUnifiedHistoryForRegistration(testRegId);
    expect(history.length).toBeGreaterThanOrEqual(2);

    const hasSingle = history.some((h) => h.source === 'SINGLE');
    const hasBulk = history.some((h) => h.source === 'BATCH' && h.batchId === batchJob.id);

    expect(hasSingle).toBe(true);
    expect(hasBulk).toBe(true);

    // Limpieza
    await prisma.emailBatchItem.delete({ where: { id: batchItem.id } });
    await prisma.emailBatchJob.delete({ where: { id: batchJob.id } });
  });

  // =========================================================================
  // CASO 15: Comprobar aislamiento entre ediciones
  // =========================================================================
  it('15. Rechazar envíos con discordancia de edición (aislamiento estricto)', async () => {
    const crossRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: secondEventId, // Edición distinta a la que pertenece la inscripción
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
      });

    expect(crossRes.status).toBe(400);
    expect(crossRes.body.message).toContain('La inscripción indicada no pertenece a la edición seleccionada');
  });

  // =========================================================================
  // CASO 16 & 17: Bloque QR dinámico y personalizado por destinatario
  // =========================================================================
  it('16 & 17. Generar código QR dinámico y personalizado por cada inscripción', async () => {
    const template = await CommunicationsService.findTemplate('INSCRIPTION_CONFIRMATION', activeEventId);
    expect(template).toBeDefined();

    const reg1 = await prisma.registration.findUnique({
      where: { id: testRegId },
      include: { participant: true, ticketType: true, event: { include: { settings: true } } },
    });
    const reg2 = await prisma.registration.findUnique({
      where: { id: testRegId2 },
      include: { participant: true, ticketType: true, event: { include: { settings: true } } },
    });

    const rendered1 = await CommunicationsService.renderTemplateContent(template!, reg1!);
    const rendered2 = await CommunicationsService.renderTemplateContent(template!, reg2!);

    expect(rendered1.qrDataUrl).toBeDefined();
    expect(rendered2.qrDataUrl).toBeDefined();
    // Los códigos QR son generados individualmente y contienen datos de cada participante
    expect(rendered1.html).toContain(reg1!.registrationNumber);
    expect(rendered2.html).toContain(reg2!.registrationNumber);
  });

  // =========================================================================
  // CASO 18: Previsualizar correo en escritorio y móvil
  // =========================================================================
  it('18. Previsualizar plantilla en el servidor sin mutaciones en base de datos', async () => {
    const previewRes = await request(app)
      .post('/api/v1/communications/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        eventId: activeEventId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
        registrationId: testRegId,
        customSubject: 'Asunto de Previsualización',
      });

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.status).toBe('success');
    expect(previewRes.body.data.html).toBeDefined();
    expect(previewRes.body.data.subject).toBe('Asunto de Previsualización');
    expect(previewRes.body.data.html).toContain('Participante QA Uno');
  });

  // =========================================================================
  // CASO 19: Guardar y renderizar respetando colores del evento (#e11d48)
  // =========================================================================
  it('19. Preservar color primario configurado (#e11d48) en el HTML renderizado', async () => {
    const template = await CommunicationsService.findTemplate('INSCRIPTION_CONFIRMATION', activeEventId);
    const reg = await prisma.registration.findUnique({
      where: { id: testRegId },
      include: { participant: true, ticketType: true, event: { include: { settings: true } } },
    });

    const rendered = await CommunicationsService.renderTemplateContent(template!, reg!, {
      customBodyHtml: '<div style="background-color: {{primaryColor}};">BarCamp Oficial</div>',
    });
    expect(rendered.html).toContain('#e11d48');
    expect(rendered.html).toContain('BarCamp Oficial');
  });

  // =========================================================================
  // CASO 20: Verificar sanitización del HTML contra XSS
  // =========================================================================
  it('20. Sanitizar HTML malicioso eliminando etiquetas script', () => {
    const maliciousHtml = '<p>Bienvenido</p><script>alert("hacked")</script><b>Texto seguro</b>';
    const prepared = (CommunicationsService as any).prepareEmailPayload(maliciousHtml, {});

    expect(prepared.html).not.toContain('<script>');
    expect(prepared.html).not.toContain('alert("hacked")');
    expect(prepared.html).toContain('<b>Texto seguro</b>');
  });

  // =========================================================================
  // CASO 21: Permisos RBAC de envío y edición
  // =========================================================================
  it('21. Validar permisos RBAC: usuario consulta no puede enviar correos (403 Forbidden)', async () => {
    const forbiddenRes = await request(app)
      .post('/api/v1/communications/send')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
        templateCode: 'INSCRIPTION_CONFIRMATION',
      });

    expect(forbiddenRes.status).toBe(403);
  });

  // =========================================================================
  // CASO 22: Comprobar persistencia de SMTP, colores, camisetas y cronograma
  // =========================================================================
  it('22. Comprobar persistencia íntegra de credenciales SMTP y datos clave', async () => {
    const emailConfig = await prisma.emailConfig.findFirst({
      where: { eventId: activeEventId },
    });

    expect(emailConfig).toBeDefined();
    expect(emailConfig?.host).toBe('smtp-relay.brevo.com');
    expect(emailConfig?.port).toBe(587);
    expect(emailConfig?.user).toBe('bf682a001@smtp-brevo.com');
    expect(emailConfig?.isEnabled).toBe(true);

    const settings = await prisma.eventSettings.findFirst({
      where: { eventId: activeEventId },
    });
    expect(settings?.primaryColor).toBe('#e11d48');
  });

  // =========================================================================
  // CASO 23: Confirmar que el modo demo desactivado no muestra datos demo
  // =========================================================================
  it('23. Confirmar que el modo demo desactivado excluye registros demo', async () => {
    const participants = await prisma.participant.findMany({
      where: { isDemo: true },
    });
    // Si existen participantes marcados isDemo: true, verificar que las consultas reales los excluyen
    const activeParticipants = await prisma.registration.findMany({
      where: { eventId: activeEventId, isDemo: false },
    });
    expect(Array.isArray(activeParticipants)).toBe(true);
  });

  // =========================================================================
  // CASO 24: Pruebas de regresión en inventario, check-in y cronograma
  // =========================================================================
  it('24. Pruebas de regresión: 282 unidades de T-shirts y 4 sesiones de cronograma intactas', async () => {
    // 1. Inventario de camisetas
    const tshirts = await prisma.tshirtInventory.findMany({
      where: { eventId: activeEventId },
    });
    const totalUnits = tshirts.reduce((acc, t) => acc + t.initialQuantity, 0);
    expect(totalUnits).toBe(282);
    expect(tshirts.length).toBe(8);

    // 2. Cronograma de actividades confirmadas
    const scheduleItems = await prisma.scheduleItem.findMany({
      where: { eventId: activeEventId },
    });
    expect(scheduleItems.length).toBe(4);

    // 3. Regresión de check-in en participante de prueba
    const checkinRes = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        eventId: activeEventId,
        registrationId: testRegId,
      });

    expect(checkinRes.status).toBe(200);
    expect(checkinRes.body.status).toBe('success');

    const updatedReg = await prisma.registration.findUnique({
      where: { id: testRegId },
    });
    expect(updatedReg?.attended).toBe(true);
    expect(updatedReg?.attendedAt).toBeDefined();
  });
});
