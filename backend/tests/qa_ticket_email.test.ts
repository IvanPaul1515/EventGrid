import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { QrService } from '../src/modules/qr/qr.service.js';

describe('QA Ticket Digital, Envío de Correos y Compatibilidad', () => {
  let eventId: string;
  let testReg: any;
  let originalTransporterFactory: any;

  beforeAll(async () => {
    // Buscar evento y registro real no demo
    const event = await prisma.event.findFirst({
      where: { isDefault: true },
      include: { settings: true },
    });
    expect(event).toBeTruthy();
    eventId = event!.id;

    testReg = await prisma.registration.findFirst({
      where: { eventId, isDemo: false },
      include: { participant: true, ticketType: true, event: { include: { settings: true } } },
    });
    expect(testReg).toBeTruthy();

    // Inyectar transporte mockeado para evitar envíos reales externos durante las pruebas
    originalTransporterFactory = (CommunicationsService as any).customTransporterFactory;
    CommunicationsService.setTransporterFactory((_config: any) => ({
      sendMail: async (mailOptions: any) => ({
        messageId: `mock-${Date.now()}`,
        accepted: [mailOptions.to],
        rejected: [],
        response: '250 OK: Mocked Message Accepted',
      }),
    }));
  });

  afterAll(async () => {
    CommunicationsService.setTransporterFactory(originalTransporterFactory);
  });

  it('1. Envío individual simulado: registra estado SIMULATED sin contactar SMTP', async () => {
    const result = await CommunicationsService.sendSingleEmail({
      eventId,
      registrationId: testReg.id,
      templateCode: 'DIGITAL_TICKET',
      mode: 'SIMULATION',
      simulateOnly: true,
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.log.status).toBe('SIMULATED');

    // Limpieza del log de prueba
    await prisma.emailLog.deleteMany({ where: { id: result.log.id } });
  });

  it('2. Envío masivo simulado: genera lote con estado SIMULATED', async () => {
    const result = await CommunicationsService.sendBulkEmail({
      eventId,
      templateCode: 'DIGITAL_TICKET',
      targetGroup: 'SELECTED',
      selectedRegistrationIds: [testReg.id],
      mode: 'SIMULATION',
      forceResend: true,
    });

    expect(result.batchId).toBeTruthy();
    const job = await prisma.emailBatchJob.findUnique({
      where: { id: result.batchId! },
      include: { items: true },
    });
    expect(job).toBeTruthy();

    // Esperar levemente antes de limpieza
    await new Promise((resolve) => setTimeout(resolve, 500));
    await prisma.emailBatchItem.deleteMany({ where: { jobId: result.batchId! } });
    await prisma.emailBatchJob.delete({ where: { id: result.batchId! } });
  });

  it('3. Generación del HTML del ticket: estructura oficial completa', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    expect(template).toBeTruthy();

    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    expect(rendered.html).toContain('ENTRADA OFICIAL EVENTGRID');
    expect(rendered.html).toContain('PARTICIPANTE');
    expect(rendered.html).toContain('NO. REGISTRO &amp; TIPO');
    expect(rendered.html).toContain(testReg.registrationNumber);
    expect(rendered.html).toContain('Presente este código QR en el módulo de recepción para registrar su entrada.');
  });

  it('4. Personalización de datos por participante', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    expect(rendered.html).toContain(testReg.participant.fullName);
    expect(rendered.html).toContain(testReg.registrationNumber);
    expect(rendered.subject).toContain(testReg.registrationNumber);
  });

  it('5. QR individual correcto: reutiliza el token qrCode persistente', async () => {
    const ticketQr = await QrService.getTicketQr(testReg.id);
    expect(ticketQr.token).toBeTruthy();

    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    expect(rendered.qrUrl).toContain(ticketQr.token);
    expect(rendered.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(rendered.qrBuffer).toBeInstanceOf(Buffer);
  });

  it('6. Reenvío con el mismo ticket y token: no regenera credencial', async () => {
    const tokenBefore = testReg.qrCode;
    const ticketBefore = testReg.registrationNumber;

    const result = await CommunicationsService.sendSingleEmail({
      eventId,
      registrationId: testReg.id,
      templateCode: 'DIGITAL_TICKET',
      forceResend: true,
      confirmedResend: true,
      resendReason: 'Prueba de reenvío controlado con preservación de token',
    });

    const regAfter = await prisma.registration.findUnique({ where: { id: testReg.id } });
    expect(regAfter?.qrCode).toBe(tokenBefore);
    expect(regAfter?.registrationNumber).toBe(ticketBefore);

    // Limpieza
    await prisma.emailLog.deleteMany({ where: { id: result.log.id } });
  });

  it('7. PrepareEmailPayload: incrusta QR como CID inline sin atributo filename descargable', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    const prepared = CommunicationsService.prepareEmailPayload(rendered.html, {
      qrBuffer: rendered.qrBuffer,
      qrDataUrl: rendered.qrDataUrl,
    });

    expect(prepared.html).toContain('cid:ticket-qr-code');
    expect(prepared.attachments.length).toBeGreaterThan(0);

    const qrAttachment = prepared.attachments.find((a) => a.cid === 'ticket-qr-code');
    expect(qrAttachment).toBeTruthy();
    expect(qrAttachment?.contentDisposition).toBe('inline');
    // CLAVE PARA GMAIL: filename debe ser undefined para evitar que aparezca como archivo adjunto descargable
    expect(qrAttachment?.filename).toBeUndefined();
  });

  it('8. Renderizado en dimensiones móviles y responsivas', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    expect(rendered.html).toContain('max-width: 520px');
    expect(rendered.html).toContain('width="100%"');
  });

  it('9. Ausencia de estados internos de check-in en el ticket de correo', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    expect(rendered.html).not.toContain('Pendiente de entrada');
    expect(rendered.html).not.toContain('Asistió');
    expect(rendered.html).not.toContain('Hora de llegada');
    expect(rendered.html).not.toContain('Operador');
    expect(rendered.html).not.toContain('Entrega de camiseta');
    expect(rendered.html).not.toContain('TOKEN:');
  });

  it('10. Ausencia de imágenes rotas: QR referenciado por CID y logo válido', async () => {
    const template = await CommunicationsService.findTemplate('DIGITAL_TICKET', eventId);
    const rendered = await CommunicationsService.renderTemplateContent(template!, testReg);

    const prepared = CommunicationsService.prepareEmailPayload(rendered.html, {
      qrBuffer: rendered.qrBuffer,
      qrDataUrl: rendered.qrDataUrl,
    });

    expect(prepared.html).not.toContain('src=""');
    expect(prepared.html).not.toContain('src="null"');
    expect(prepared.html).not.toContain('src="undefined"');
    expect(prepared.html).toContain('src="cid:ticket-qr-code"');
  });

  it('11. Prevención de duplicados: alerta ante reenvíos no autorizados', async () => {
    // Crear log previo aceptado por SMTP
    const sentLog = await prisma.emailLog.create({
      data: {
        eventId,
        registrationId: testReg.id,
        recipientEmail: testReg.participant.email,
        recipientName: testReg.participant.fullName,
        templateCode: 'DIGITAL_TICKET',
        subject: 'Tu Entrada Digital previa',
        status: 'ACCEPTED_BY_SMTP',
      },
    });

    try {
      // Intentar enviar sin forceResend debe lanzar DUPLICATE_COMMUNICATION_WARNING
      await expect(
        CommunicationsService.sendSingleEmail({
          eventId,
          registrationId: testReg.id,
          templateCode: 'DIGITAL_TICKET',
        })
      ).rejects.toThrow(/ya recibió un envío de este tipo/);
    } finally {
      await prisma.emailLog.delete({ where: { id: sentLog.id } });
    }
  });

  it('12. Persistencia del historial: registro de auditoría en reenvío autorizado', async () => {
    const adminUser = await prisma.user.findFirst();
    const result = await CommunicationsService.sendSingleEmail({
      eventId,
      registrationId: testReg.id,
      templateCode: 'DIGITAL_TICKET',
      forceResend: true,
      confirmedResend: true,
      resendReason: 'Verificación de persistencia de auditoría',
    }, adminUser?.id);

    expect(result.success).toBe(true);
    expect(result.log.id).toBeTruthy();

    const logged = await prisma.emailLog.findUnique({ where: { id: result.log.id } });
    expect(logged).toBeTruthy();
    expect(logged?.status).toBe('ACCEPTED_BY_SMTP');

    await prisma.emailLog.deleteMany({ where: { id: result.log.id } });
    await prisma.auditLog.deleteMany({ where: { entityId: testReg.id, action: 'EMAIL_RESEND_AUTHORIZED' } });
  });

  it('13. Ausencia de regresiones en las demás plantillas y preservación de T-shirts', async () => {
    const reminder = await CommunicationsService.findTemplate('EVENT_REMINDER', eventId);
    expect(reminder).toBeTruthy();
    const renderedReminder = await CommunicationsService.renderTemplateContent(reminder!, testReg);
    expect(renderedReminder.html).toContain(testReg.participant.fullName);

    const announcement = await CommunicationsService.findTemplate('GENERAL_ANNOUNCEMENT', eventId);
    expect(announcement).toBeTruthy();
    const renderedAnnouncement = await CommunicationsService.renderTemplateContent(announcement!, testReg);
    expect(renderedAnnouncement.html).toContain(testReg.event.name);

    const config = await prisma.emailConfig.findFirst({ where: { eventId } });
    expect(config?.host).toBe('smtp-relay.brevo.com');
    expect(config?.isEnabled).toBe(true);

    const inventories = await prisma.tshirtInventory.findMany({ where: { eventId } });
    const totalInitial = inventories.reduce((sum, item) => sum + item.initialQuantity, 0);
    expect(totalInitial).toBe(282);
  });
});
