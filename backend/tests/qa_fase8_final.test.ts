import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db';
import { CommunicationsService } from '../src/modules/communications/communications.service';
import { EmailQueueWorker } from '../src/modules/communications/communications.queue';
import { ParticipantsService } from '../src/modules/participants/participants.service';
import { encryptSecret, decryptSecret } from '../src/utils/crypto';

let smtpBaseline: any;

describe('EventGrid Fase 8: SMTP Real, Modo Demostración, Cortesías y Modo Claro', () => {
  let testEvent: any;
  let adminUser: any;
  let sampleRegistration: any;
  let demoRegistration: any;
  const runId = Math.random().toString(36).substring(2, 7);

  // Spies / mocks para transporte SMTP
  const sentEmails: any[] = [];
  const mockTransporter = {
    sendMail: async (mailOptions: any) => {
      sentEmails.push(mailOptions);
      return { messageId: `mock-msg-${Date.now()}` };
    },
    verify: async () => true,
  };

  beforeAll(async () => {
    smtpBaseline = await prisma.emailConfig.findFirst({ where: { eventId: null } });
    // Configurar fábrica de transporte mock para evitar llamadas SMTP externas
    CommunicationsService.setTransporterFactory(() => mockTransporter);

    // Crear usuario admin para auditoría
    adminUser = await prisma.user.create({
      data: {
        email: `admin_fase8_${runId}@eventgrid.io`,
        fullName: 'Admin Fase 8 QA',
        passwordHash: 'fake_hash',
        role: 'ADMIN',
        isActive: true,
      },
    });

    // Crear evento de prueba (inicialmente sin demoMode)
    testEvent = await prisma.event.create({
      data: {
        name: `Edición Fase 8 QA ${runId}`,
        slug: `fase8-${runId}`,
        year: 2088,
        startDate: new Date('2088-06-15T09:00:00Z'),
        endDate: new Date('2088-06-15T18:00:00Z'),
        venue: 'Campus Tecnológico Fase 8',
        status: 'ACTIVE',
      },
    });

    await prisma.eventSettings.create({
      data: {
        eventId: testEvent.id,
        registrationPrefix: 'F8-',
        demoModeEnabled: false,
      },
    });

    const ticketType = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'Entrada General F8',
        price: 2500,
        totalCapacity: 100,
      },
    });

    const courtesyTicketType = await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'Cortesía Fase 8',
        price: 0,
        totalCapacity: 50,
      },
    });

    // Participante normal
    const partNormal = await prisma.participant.create({
      data: {
        email: `normal_${runId}@testdomain.org`,
        firstName: 'Juan',
        lastName: 'Pérez',
        fullName: 'Juan Pérez',
      },
    });

    sampleRegistration = await prisma.registration.create({
      data: {
        eventId: testEvent.id,
        participantId: partNormal.id,
        registrationNumber: `F8-001-${runId}`,
        ticketTypeId: ticketType.id,
        ticketPrice: 2500,
        amountPaid: 2500,
        totalAmount: 2500,
        balanceDue: 0,
        isCourtesy: false,
        isDemo: false,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });

    // Participante demo
    const partDemo = await prisma.participant.create({
      data: {
        email: `demo_${runId}@testdomain.org`,
        firstName: 'María',
        lastName: 'Demo',
        fullName: 'María Demo',
      },
    });

    demoRegistration = await prisma.registration.create({
      data: {
        eventId: testEvent.id,
        participantId: partDemo.id,
        registrationNumber: `F8-DEMO-${runId}`,
        ticketTypeId: ticketType.id,
        ticketPrice: 2500,
        amountPaid: 2500,
        totalAmount: 2500,
        balanceDue: 0,
        isCourtesy: false,
        isDemo: true,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
      },
    });
  });

  afterAll(async () => {
    // Restaurar fábrica
    CommunicationsService.setTransporterFactory(null);

    // Limpieza de datos de prueba creados
    await prisma.emailLog.deleteMany({ where: { eventId: testEvent.id } });
    await prisma.emailBatchItem.deleteMany({ where: { job: { eventId: testEvent.id } } });
    await prisma.emailBatchJob.deleteMany({ where: { eventId: testEvent.id } });
    await prisma.registration.deleteMany({ where: { eventId: testEvent.id } });
    await prisma.participant.deleteMany({
      where: { email: { in: [`normal_${runId}@testdomain.org`, `demo_${runId}@testdomain.org`] } },
    });
    await prisma.ticketType.deleteMany({ where: { eventId: testEvent.id } });
    await prisma.eventSettings.deleteMany({ where: { eventId: testEvent.id } });
    await prisma.event.deleteMany({ where: { id: testEvent.id } });
    await prisma.user.deleteMany({ where: { id: adminUser.id } });
  });

  // =========================================================================
  // BLOQUE 1: PRESERVACIÓN DE CONFIGURACIONES EXISTENTES Y DATOS
  // =========================================================================
  describe('1. Preservación de Configuraciones SMTP y Plantillas Existentes', () => {
    it('1.1 Debe preservar intacta la configuración global de Brevo con contraseña cifrada', async () => {
      const globalConfig = await prisma.emailConfig.findFirst({
        where: { eventId: null },
      });

      expect(globalConfig).toBeDefined();
      expect(globalConfig?.host).toBe(smtpBaseline?.host);
      expect(globalConfig?.user).toBe(smtpBaseline?.user);
      expect(globalConfig?.password).toBeDefined();
      expect(globalConfig!.password!.length).toBeGreaterThan(50);
      expect(globalConfig?.fromEmail).toBe(smtpBaseline?.fromEmail);
    });

    it('1.2 Debe preservar las plantillas y colores existentes en base de datos', async () => {
      const templates = await prisma.emailTemplate.findMany();
      expect(templates.length).toBeGreaterThanOrEqual(7);

      const ticketTemplate = templates.find((t) => t.code === 'DIGITAL_TICKET');
      expect(ticketTemplate).toBeDefined();
      expect(ticketTemplate?.bodyHtml).toBeDefined();
      expect(ticketTemplate?.bodyHtml.length).toBeGreaterThan(50);
    });
  });

  // =========================================================================
  // BLOQUE 2: DESACOPLE DE MODO DEMOSTRACIÓN Y ENVÍO REAL VS SIMULADO
  // =========================================================================
  describe('2. Modo Demostración vs Modo de Envío Real/Simulado', () => {
    it('2.1 Simulación explícita: sendSingleEmail con mode="SIMULATION" debe registrar SIMULATED sin enviar correo real', async () => {
      const initialCount = sentEmails.length;

      const result = await CommunicationsService.sendSingleEmail(
        {
          eventId: testEvent.id,
          registrationId: sampleRegistration.id,
          templateCode: 'DIGITAL_TICKET',
          mode: 'SIMULATION',
        },
        adminUser.id
      );

      expect(result.success).toBe(true);
      expect(result.simulated).toBe(true);
      expect(result.log.status).toBe('SIMULATED');
      // No debe haber invocado el transporte real
      expect(sentEmails.length).toBe(initialCount);
    });

    it('2.2 Envío Real: si SMTP no está habilitado, debe rechazar con BadRequestError y NO simular silenciosamente', async () => {
      // Creamos una configuración de edición deshabilitada
      const editionConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.servidor-deshabilitado.com',
          port: 587,
          user: 'user',
          password: encryptSecret('secret'),
          fromEmail: 'noreply@test.com',
          fromName: 'Test',
          isEnabled: false, // Deshabilitado
        },
      });

      try {
        await expect(
          CommunicationsService.sendSingleEmail(
            {
              eventId: testEvent.id,
              registrationId: sampleRegistration.id,
              templateCode: 'DIGITAL_TICKET',
              mode: 'REAL',
            },
            adminUser.id
          )
        ).rejects.toThrow(/El servidor SMTP no está configurado o está deshabilitado/);
      } finally {
        await prisma.emailConfig.delete({ where: { id: editionConfig.id } });
      }
    });

    it('2.3 Envío Real en modo Demo: si el evento o inscripción está en demo y NO confirma, debe rechazar con BadRequestError', async () => {
      // Habilitar temporalmente SMTP de edición para esta prueba
      const activeConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.servidor-activo.com',
          port: 587,
          user: 'active_user',
          password: encryptSecret('active_secret'),
          fromEmail: 'notifications@test.com',
          fromName: 'EventGrid Notificaciones',
          isEnabled: true,
        },
      });

      try {
        // Intento de envío real a inscripción demo sin confirmedDemoSending
        await expect(
          CommunicationsService.sendSingleEmail(
            {
              eventId: testEvent.id,
              registrationId: demoRegistration.id,
              templateCode: 'DIGITAL_TICKET',
              mode: 'REAL',
              confirmedDemoSending: false,
            },
            adminUser.id
          )
        ).rejects.toThrow(/se encuentra en modo demostración/);
      } finally {
        await prisma.emailConfig.delete({ where: { id: activeConfig.id } });
      }
    });

    it('2.4 Envío Real en modo Demo con confirmación: debe realizar la entrega y registrar SENT', async () => {
      const activeConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.servidor-activo.com',
          port: 587,
          user: 'active_user',
          password: encryptSecret('active_secret'),
          fromEmail: 'notifications@test.com',
          fromName: 'EventGrid Notificaciones',
          isEnabled: true,
        },
      });

      try {
        const initialCount = sentEmails.length;

        const result = await CommunicationsService.sendSingleEmail(
          {
            eventId: testEvent.id,
            registrationId: demoRegistration.id,
            templateCode: 'DIGITAL_TICKET',
            mode: 'REAL',
            confirmedDemoSending: true,
          },
          adminUser.id
        );

        expect(result.success).toBe(true);
        expect(result.simulated).toBe(false);
        expect(result.log.status).toBe('SENT');
        expect(sentEmails.length).toBe(initialCount + 1);
        expect(sentEmails[sentEmails.length - 1].to).toContain(runId);
      } finally {
        await prisma.emailConfig.delete({ where: { id: activeConfig.id } });
      }
    });

    it('2.5 Fallback de Configuración: getRawConfig debe usar la global si la de la edición no está habilitada', async () => {
      // Si la edición no tiene config, o está deshabilitada, pero existe la global Brevo
      const resolved = await CommunicationsService.getRawConfig(testEvent.id);
      expect(resolved).toBeDefined();
      expect(resolved?.host).toBeDefined();
    });
  });

  // =========================================================================
  // BLOQUE 3: CORTESÍAS FINANCIERAS EN REGISTRO Y VENTAS
  // =========================================================================
  describe('3. Normalización Estricta de Cortesías en Registro y Ventas', () => {
    it('3.1 createRegistration con entrada de cortesía: precio, pago y saldo deben ser 0.00 y no requerir forma de pago', async () => {
      const courtesyReg = await ParticipantsService.create(testEvent.id, {
        firstName: 'Elena',
        lastName: 'Beca',
        email: `elena_beca_${runId}@eventgrid.io`,
        isCourtesy: true,
        courtesyAuthorizedBy: 'Comité de Becas BarCamp',
        courtesyReason: 'Mérito Académico',
        paymentMethodId: undefined,
        salesResponsibleId: undefined,
      });

      expect(courtesyReg.isCourtesy).toBe(true);
      expect(Number(courtesyReg.ticketPrice)).toBe(0);
      expect(Number(courtesyReg.amountPaid)).toBe(0);
      expect(Number(courtesyReg.balanceDue)).toBe(0);
      expect(Number(courtesyReg.totalAmount)).toBe(0);
      expect(courtesyReg.paymentStatus).toBe('COURTESY');
      expect(courtesyReg.paymentMethodId).toBeNull();
      expect(courtesyReg.salesResponsibleId).toBeNull();
      expect(courtesyReg.courtesyAuthorizedBy).toBe('Comité de Becas BarCamp');

      // Limpieza
      await prisma.registration.delete({ where: { id: courtesyReg.id } });
      await prisma.participant.delete({ where: { id: courtesyReg.participantId } });
    });

    it('3.2 onsiteSale con tarifa de cortesía: monto recibido y cobrado en 0.00 y status COURTESY', async () => {
      const courtesyTicket = await prisma.ticketType.findFirst({
        where: { eventId: testEvent.id, price: 0 },
      });

      const onsiteRes = await ParticipantsService.onsiteSale(
        testEvent.id,
        {
          firstName: 'Marcos',
          lastName: 'Ponente',
          email: `marcos_ponente_${runId}@eventgrid.io`,
          ticketTypeId: courtesyTicket!.id,
          amountReceived: 0,
          amountPaid: 0,
          courtesyAuthorizedBy: 'Dirección Técnica',
        },
        adminUser.id
      );

      expect(onsiteRes.registration.isCourtesy).toBe(true);
      expect(Number(onsiteRes.registration.ticketPrice)).toBe(0);
      expect(Number(onsiteRes.registration.amountPaid)).toBe(0);
      expect(Number(onsiteRes.registration.balanceDue)).toBe(0);
      expect(onsiteRes.registration.paymentStatus).toBe('COURTESY');
      expect(onsiteRes.registration.paymentMethodId).toBeNull();

      // Limpieza
      await prisma.registration.delete({ where: { id: onsiteRes.registration.id } });
      await prisma.participant.delete({ where: { id: onsiteRes.registration.participantId } });
    });

    it('3.3 Transición de cortesía a entrada pagada: updateRegistration debe restaurar balance y habilitar pago', async () => {
      // 1. Crear inscripción inicial como cortesía
      const initialCourtesy = await ParticipantsService.create(testEvent.id, {
        firstName: 'Pedro',
        lastName: 'Transicion',
        email: `pedro_trans_${runId}@eventgrid.io`,
        isCourtesy: true,
        courtesyAuthorizedBy: 'Invitación VIP',
      });

      expect(initialCourtesy.isCourtesy).toBe(true);
      expect(Number(initialCourtesy.balanceDue)).toBe(0);

      // 2. Cambiar a boleto de pago
      const paidTicket = await prisma.ticketType.findFirst({
        where: { eventId: testEvent.id, price: { gt: 0 } },
      });

      const updated = await ParticipantsService.update(
        testEvent.id,
        initialCourtesy.id,
        {
          isCourtesy: false,
          ticketTypeId: paidTicket!.id,
          amountPaid: 500, // Abono parcial de 500
        },
        adminUser.id
      );

      expect(updated.isCourtesy).toBe(false);
      expect(Number(updated.ticketPrice)).toBe(2500);
      expect(Number(updated.amountPaid)).toBe(500);
      expect(Number(updated.balanceDue)).toBe(2000); // 2500 - 500
      expect(updated.paymentStatus).toBe('PARTIAL');

      // Limpieza
      await prisma.registration.delete({ where: { id: initialCourtesy.id } });
      await prisma.participant.delete({ where: { id: initialCourtesy.participantId } });
    });
  });

  // =========================================================================
  // BLOQUE 4: CAMPAÑAS MASIVAS REALES VS SIMULADAS
  // =========================================================================
  describe('4. Campañas Masivas: Separación de Modos y Control de Demo', () => {
    it('4.1 sendBulkEmail en modo REAL sobre evento demo debe exigir confirmación', async () => {
      // Poner evento en modo demo
      await prisma.eventSettings.update({
        where: { eventId: testEvent.id },
        data: { demoModeEnabled: true },
      });

      // Crear config activa temporal para la prueba
      const activeConfig = await prisma.emailConfig.create({
        data: {
          eventId: testEvent.id,
          host: 'smtp.servidor-activo.com',
          port: 587,
          user: 'user',
          password: encryptSecret('pass'),
          fromEmail: 'bulk@test.com',
          fromName: 'EventGrid Bulk',
          isEnabled: true,
        },
      });

      try {
        await expect(
          CommunicationsService.sendBulkEmail(
            {
              eventId: testEvent.id,
              templateCode: 'EVENT_REMINDER',
              targetGroup: 'ALL',
              mode: 'REAL',
              confirmedDemoSending: false,
            },
            adminUser.id
          )
        ).rejects.toThrow(/El evento está en modo demostración/);
      } finally {
        await prisma.emailConfig.delete({ where: { id: activeConfig.id } });
        await prisma.eventSettings.update({
          where: { eventId: testEvent.id },
          data: { demoModeEnabled: false },
        });
      }
    });

    it('4.2 sendBulkEmail en modo SIMULATION debe crear EmailBatchJob con mode="SIMULATION"', async () => {
      const result = await CommunicationsService.sendBulkEmail(
        {
          eventId: testEvent.id,
          templateCode: 'EVENT_REMINDER',
          targetGroup: 'ALL',
          mode: 'SIMULATION',
        },
        adminUser.id
      );

      expect(result.batchId).toBeDefined();

      const batchJob = await prisma.emailBatchJob.findUnique({
        where: { id: result.batchId! },
      });

      expect(batchJob).toBeDefined();
      expect(batchJob?.mode).toBe('SIMULATION');

      // Limpieza
      await prisma.emailBatchItem.deleteMany({ where: { jobId: result.batchId! } });
      await prisma.emailBatchJob.delete({ where: { id: result.batchId! } });
    });
  });
});
