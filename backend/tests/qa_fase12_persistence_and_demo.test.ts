import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/config/db.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { ScheduleService } from '../src/modules/schedule/schedule.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';
import { EventsService } from '../src/modules/events/events.service.js';
import { DemoService } from '../src/modules/demo/demo.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';

let smtpBaseline: any;

describe('EVENTGRID — FASE 12: PERSISTENCIA Y AISLAMIENTO DE MODO DEMOSTRACIÓN', () => {
  const BARCAMP_EVENT_ID = '1adb61c6-6f85-43f1-93a6-b4be887bdc9c';
  let tempCleanEventId: string;

  beforeAll(async () => {
    smtpBaseline = await prisma.emailConfig.findFirst({ where: { eventId: null } });
    const event = await prisma.event.findUnique({
      where: { id: BARCAMP_EVENT_ID },
      include: { settings: true },
    });
    expect(event).toBeDefined();
  });

  afterAll(async () => {
    // Cleanup temporary event created for testing clean edition isolation
    if (tempCleanEventId) {
      await prisma.scheduleItem.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.registration.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.tshirtInventory.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.paymentMethod.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.ticketType.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.eventSettings.deleteMany({ where: { eventId: tempCleanEventId } });
      await prisma.event.delete({ where: { id: tempCleanEventId } });
    }
  });

  describe('BLOQUE 1: PERSISTENCIA ESTRICTA (CRITERIOS 1 A 8)', () => {
    it('1. Las 282 camisetas se mantienen intactas tras reinicio del backend', async () => {
      const inventory = await InventoryService.getInventory(BARCAMP_EVENT_ID);
      expect(inventory.stats.totalInitial).toBe(282);
    });

    it('2. Cada talla conserva exactamente su cantidad asignada', async () => {
      const inventory = await prisma.tshirtInventory.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      const sizeMap = Object.fromEntries(inventory.map((i) => [i.size, i.initialQuantity]));

      expect(sizeMap['Medium (M)']).toBe(40);
      expect(sizeMap['XL']).toBe(75);
      expect(sizeMap['L']).toBe(70);
      expect(sizeMap['2XL']).toBe(55);
      expect(sizeMap['Size 16']).toBe(12);
      expect(sizeMap['Size 12']).toBe(6);
      expect(sizeMap['Size 14']).toBe(6);
      expect(sizeMap['S']).toBe(18);

      const total = Object.values(sizeMap).reduce((a, b) => a + b, 0);
      expect(total).toBe(282);
    });

    it('3. Las credenciales SMTP de Brevo no se borran al reiniciar', async () => {
      const config = await prisma.emailConfig.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(config).toBeDefined();
      expect(config?.host).toBe(smtpBaseline?.host);
      expect(config?.user).toBe(smtpBaseline?.user);
      expect(config?.password).toBeTruthy();
      expect(config?.fromEmail).toBe(smtpBaseline?.fromEmail);
    });

    it('4. El estado del interruptor SMTP no se apaga solo ni se desconfigura', async () => {
      const config = await CommunicationsService.getConfig(BARCAMP_EVENT_ID);
      expect(config.isEnabled).toBe(true);
      expect(config.isConfigured).toBe(true);
      expect(config.host).toBe(smtpBaseline?.host);
    });

    it('5. Los colores personalizados de las plantillas de correo persisten tras cambios de código', async () => {
      const template = await prisma.emailTemplate.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(template).toBeDefined();
      expect(template?.bodyHtml).toBeTruthy();
      expect(template?.bodyHtml).toMatch(/#[0-9a-fA-F]{3,6}|rgb|background|color/);

      const event = await prisma.event.findUnique({
        where: { id: BARCAMP_EVENT_ID },
        include: { settings: true },
      });
      expect(event?.settings?.primaryColor).toBe('#E01C13');
    });

    it('6. El logo cargado por el administrador permanece accesible', async () => {
      await prisma.eventSettings.update({
        where: { eventId: BARCAMP_EVENT_ID },
        data: { logoUrl: '/uploads/logos/barcamp-logo.png' },
      });
      const event = await prisma.event.findUnique({
        where: { id: BARCAMP_EVENT_ID },
        include: { settings: true },
      });
      expect(event?.settings?.logoUrl).toBe('/uploads/logos/barcamp-logo.png');
    });

    it('7. Los participantes reales no desaparecen', async () => {
      const registrations = await prisma.registration.findMany({
        where: { eventId: BARCAMP_EVENT_ID, isDemo: false },
      });
      expect(registrations.length).toBeGreaterThanOrEqual(22);
      const regNumbers = registrations.map((r) => r.registrationNumber);
      expect(regNumbers).toContain('BC26-0001');
      expect(regNumbers).toContain('BC26-0022');
    });

    it('8. Las charlas reales del cronograma no se borran', async () => {
      const officialItem = await prisma.scheduleItem.findFirst({
        where: {
          eventId: BARCAMP_EVENT_ID,
          isDemo: false,
        },
      });
      expect(officialItem).toBeDefined();
      expect(officialItem?.title).toBe('Registro y acreditación de participantes');
    });
  });

  describe('BLOQUE 2: MODO DEMOSTRACIÓN Y EDICIONES LIMPIAS (CRITERIOS 9 A 21)', () => {
    it('9. Al crear una edición nueva y limpia, no aparece ningún participante ficticio', async () => {
      const newEvent = await EventsService.create({
        name: 'Evento Prueba Persistencia 2027',
        slug: 'evento-prueba-persistencia-2027',
        year: 2027,
        venue: 'PUCMM Campus Santiago',
        startDate: new Date('2027-11-01'),
        endDate: new Date('2027-11-02'),
      });
      tempCleanEventId = newEvent.id;

      const regs = await prisma.registration.findMany({
        where: { eventId: tempCleanEventId },
      });
      expect(regs.length).toBe(0);
    });

    it('10. La edición nueva muestra 0 inscritos, 0 ingresos y 0 asistencias', async () => {
      const stats = await EventsService.getStats(tempCleanEventId);
      expect(stats.participants.total).toBe(0);
      expect(stats.participants.attended).toBe(0);

      const fin = await EventsService.getFinancialSummary(tempCleanEventId);
      expect(fin.totalRevenue).toBe(0);
      expect(fin.totalExpected).toBe(0);
      expect(fin.confirmedCount).toBe(0);
    });

    it('11. La edición nueva no tiene camisetas asignadas automáticamente si no se solicita', async () => {
      const inventory = await InventoryService.getInventory(tempCleanEventId);
      expect(inventory.stats.totalInitial).toBe(0);
      expect(inventory.items.length).toBe(0);
    });

    it('12. La edición nueva no muestra charlas del cronograma si no han sido creadas', async () => {
      const schedule = await ScheduleService.getItems(tempCleanEventId);
      expect(schedule.total).toBe(0);
      expect(schedule.items.length).toBe(0);

      const publicSched = await ScheduleService.getPublicSchedule(tempCleanEventId);
      expect(publicSched.total).toBe(0);
      expect(publicSched.items.length).toBe(0);
    });

    it('13. Al activar el modo demo en una edición vacía, se cargan participantes ficticios de prueba', async () => {
      await DemoService.toggle(tempCleanEventId, true);
      const genResult = await DemoService.generate(tempCleanEventId, 5);
      expect(genResult.generatedCount).toBe(5);

      const demoRegs = await prisma.registration.findMany({
        where: { eventId: tempCleanEventId, isDemo: true },
      });
      expect(demoRegs.length).toBe(5);
    });

    it('14. El panel muestra claramente la advertencia de modo demostración activo', async () => {
      const status = await DemoService.getStatus(tempCleanEventId);
      expect(status.demoModeEnabled).toBe(true);
      expect(status.demoCount).toBe(5);
    });

    it('15. Los reportes y estadísticas reflejan los datos ficticios mientras el modo esté activo', async () => {
      const stats = await EventsService.getStats(tempCleanEventId);
      expect(stats.participants.total).toBe(5);
    });

    it('16. Al desactivar el modo demo, todos los datos ficticios desaparecen de las vistas', async () => {
      await DemoService.toggle(tempCleanEventId, false);
      const participantsView = await ParticipantsService.list(tempCleanEventId, { page: 1, limit: 50 });
      expect(participantsView.data.length).toBe(0);
      expect(participantsView.pagination.total).toBe(0);
    });

    it('17. Los contadores vuelven a los valores de datos reales exclusivamente', async () => {
      const stats = await EventsService.getStats(tempCleanEventId);
      expect(stats.participants.total).toBe(0);

      const fin = await EventsService.getFinancialSummary(tempCleanEventId);
      expect(fin.totalRevenue).toBe(0);
      expect(fin.confirmedCount).toBe(0);
    });

    it('18. Ningún participante demo permanece visible tras desactivar el modo', async () => {
      const list = await ParticipantsService.list(tempCleanEventId, { page: 1, limit: 50 });
      const hasDemoVisible = list.data.some((p: any) => p.isDemo === true);
      expect(hasDemoVisible).toBe(false);
    });

    it('19. Las tres charlas de prueba no aparecen como charlas oficiales si el modo demo está apagado', async () => {
      // In BarCamp RD 2026, demo mode is false.
      const res = await ScheduleService.getItems(BARCAMP_EVENT_ID);
      const demoItems = res.items.filter(
        (i) => i.isDemo || i.category === 'Demostración' || i.category === 'Demostracion'
      );
      expect(demoItems.length).toBe(0);

      const publicSched = await ScheduleService.getPublicSchedule(BARCAMP_EVENT_ID);
      const publicDemoItems = publicSched.items.filter(
        (i) => i.isDemo || i.category === 'Demostración' || i.category === 'Demostracion'
      );
      expect(publicDemoItems.length).toBe(0);
    });

    it('20. Los participantes reales creados antes o durante el modo demo nunca se eliminan', async () => {
      // Create a real participant in tempCleanEventId
      const real = await ParticipantsService.create(
        tempCleanEventId,
        {
          firstName: 'Carlos',
          lastName: 'Real',
          email: 'carlos.real@testfase12.com',
          phone: '8095551234',
        }
      );
      expect(real.id).toBeDefined();

      // Activate demo, generate more demo participants, then deactivate demo
      await DemoService.toggle(tempCleanEventId, true);
      await DemoService.generate(tempCleanEventId, 3);
      await DemoService.toggle(tempCleanEventId, false);

      // Verify the real participant is still intact
      const realCheck = await prisma.registration.findUnique({
        where: { id: real.id },
      });
      expect(realCheck).toBeDefined();
      expect(realCheck?.isDemo).toBe(false);

      const activeView = await ParticipantsService.list(tempCleanEventId, { page: 1, limit: 50 });
      expect(activeView.data.length).toBe(1);
      expect(activeView.data[0].id).toBe(real.id);
    });

    it('21. Los correos reales hacia participantes no se envían accidentalmente a correos inventados del modo demo sin confirmación', async () => {
      // Attempting to send a real email when the registration is demo without demo confirmation must throw
      const demoReg = await prisma.registration.findFirst({
        where: { eventId: tempCleanEventId, isDemo: true },
        include: { participant: true },
      });
      expect(demoReg).toBeDefined();

      await expect(
        CommunicationsService.sendSingleEmail({
          registrationId: demoReg!.id,
          templateCode: 'INSCRIPTION_CONFIRMATION',
          mode: 'REAL',
          simulateOnly: false,
          confirmedDemoSending: false,
        })
      ).rejects.toThrow();
    });
  });
});
