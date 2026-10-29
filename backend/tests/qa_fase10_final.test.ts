import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/config/db.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { ScheduleService } from '../src/modules/schedule/schedule.service.js';
import { CommunicationsService } from '../src/modules/communications/communications.service.js';

let smtpBaseline: any;

describe('FASE 10 — PRESERVACIÓN DE DATOS, CRONOGRAMA DEMO Y CORREOS INTEGRADOS', () => {
  const BARCAMP_EVENT_ID = '1adb61c6-6f85-43f1-93a6-b4be887bdc9c';

  beforeAll(async () => {
    smtpBaseline = await prisma.emailConfig.findFirst({ where: { eventId: null } });
    // Ensure DB connection is alive
    const event = await prisma.event.findUnique({
      where: { id: BARCAMP_EVENT_ID },
    });
    expect(event).toBeDefined();
  });

  describe('1. PRESERVACIÓN ESTRICTA DE DATOS Y CONFIGURACIONES', () => {
    it('debe preservar intactos los 22 participantes y registros reales de BarCamp RD 2026', async () => {
      const registrations = await prisma.registration.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
        orderBy: { registrationNumber: 'asc' },
      });

      expect(registrations.length).toBeGreaterThanOrEqual(22);
      const numbers = registrations.map((r) => r.registrationNumber);
      expect(numbers).toContain('BC26-0001');
      expect(numbers).toContain('BC26-0022');
    });

    it('debe preservar la configuración SMTP de Brevo con usuario y estado activo', async () => {
      const config = await prisma.emailConfig.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });

      expect(config).toBeDefined();
      expect(config?.isEnabled).toBe(true);
      expect(config?.host).toBe(smtpBaseline?.host);
      expect(config?.user).toBe(smtpBaseline?.user);
      expect(config?.password).toBeTruthy();
      expect(config?.fromEmail).toBe(smtpBaseline?.fromEmail);
    });

    it('debe preservar el inventario de 282 camisetas con el desglose exacto', async () => {
      const inventory = await prisma.tshirtInventory.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });

      const totalQuantity = inventory.reduce((sum, item) => sum + item.initialQuantity, 0);
      expect(totalQuantity).toBe(282);

      const sizeMap = Object.fromEntries(inventory.map((i) => [i.size, i.initialQuantity]));
      expect(sizeMap['Medium (M)']).toBe(40);
      expect(sizeMap['XL']).toBe(75);
      expect(sizeMap['L']).toBe(70);
      expect(sizeMap['2XL']).toBe(55);
      expect(sizeMap['Size 16']).toBe(12);
      expect(sizeMap['Size 12']).toBe(6);
      expect(sizeMap['Size 14']).toBe(6);
      expect(sizeMap['S']).toBe(18);
    });
  });

  describe('2. NORMALIZACIÓN Y SALVAGUARDAS DE INVENTARIO DE CAMISETAS', () => {
    it('debe normalizar alias comunes de tallas (M -> Medium (M), 12 -> Size 12, XXL -> 2XL)', () => {
      expect(InventoryService.normalizeSizeAlias('M')).toBe('Medium (M)');
      expect(InventoryService.normalizeSizeAlias('m')).toBe('Medium (M)');
      expect(InventoryService.normalizeSizeAlias('medium')).toBe('Medium (M)');
      expect(InventoryService.normalizeSizeAlias('12')).toBe('Size 12');
      expect(InventoryService.normalizeSizeAlias('Size 12')).toBe('Size 12');
      expect(InventoryService.normalizeSizeAlias('14')).toBe('Size 14');
      expect(InventoryService.normalizeSizeAlias('16')).toBe('Size 16');
      expect(InventoryService.normalizeSizeAlias('XXL')).toBe('2XL');
      expect(InventoryService.normalizeSizeAlias('2XL')).toBe('2XL');
      expect(InventoryService.normalizeSizeAlias('S')).toBe('S');
      expect(InventoryService.normalizeSizeAlias('XL')).toBe('XL');
    });

    it('debe validar y aceptar alias en validateSize sin lanzar error para tallas válidas', async () => {
      const normalizedM = await InventoryService.validateSize(BARCAMP_EVENT_ID, 'M');
      expect(normalizedM).toBe('Medium (M)');

      const normalized12 = await InventoryService.validateSize(BARCAMP_EVENT_ID, '12');
      expect(normalized12).toBe('Size 12');
    });

    it('debe retornar resumen de inventario coherente sin restar unidades si no hay entregas', async () => {
      const stats = await InventoryService.getInventory(BARCAMP_EVENT_ID);
      expect(stats.stats.totalInitial).toBe(282);
      expect(stats.stats.totalAvailable).toBeGreaterThan(0);
      expect(stats.items.length).toBe(8);
    });
  });

  describe('3. CRONOGRAMA: ACTIVIDADES DEMO Y REGISTRO', () => {
    it('debe sembrar de forma idempotente el bloque de registro y 3 charlas demostrativas', async () => {
      const seedResult = await ScheduleService.seedDemoSchedule(BARCAMP_EVENT_ID);
      expect(seedResult.success).toBe(true);

      // Verificación de los 4 elementos en la base de datos
      const items = await prisma.scheduleItem.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
        orderBy: { startTime: 'asc' },
      });

      const titles = items.map((i) => i.title);
      expect(titles).toContain('Registro y acreditación de participantes');
      expect(titles).toContain('Inteligencia artificial aplicada al desarrollo de software');
      expect(titles).toContain('Ciberseguridad: amenazas y buenas prácticas');
      expect(titles).toContain('Desarrollo web moderno y aplicaciones progresivas');

      // Idempotencia: segunda llamada no debe duplicar registros
      const secondSeed = await ScheduleService.seedDemoSchedule(BARCAMP_EVENT_ID);
      expect(secondSeed.createdCount).toBe(0);
    });

    it('debe incluir las horas y ponentes exactos solicitados', async () => {
      const reg = await prisma.scheduleItem.findFirst({
        where: { eventId: BARCAMP_EVENT_ID, title: 'Registro y acreditación de participantes' },
      });
      expect(reg).toBeDefined();
      expect(reg?.startTime).toBe('08:00');
      expect(reg?.endTime).toBe('08:45');
      expect(reg?.category).toBe('Registro');

      const talk1 = await prisma.scheduleItem.findFirst({
        where: { eventId: BARCAMP_EVENT_ID, title: 'Inteligencia artificial aplicada al desarrollo de software' },
      });
      expect(talk1?.startTime).toBe('08:45');
      expect(talk1?.endTime).toBe('09:15');
      expect(talk1?.speakerName).toBe('Dra. Sofía Valerio');

      const talk2 = await prisma.scheduleItem.findFirst({
        where: { eventId: BARCAMP_EVENT_ID, title: 'Ciberseguridad: amenazas y buenas prácticas' },
      });
      expect(talk2?.startTime).toBe('09:15');
      expect(talk2?.endTime).toBe('09:50');
      expect(talk2?.speakerName).toBe('Ing. Alejandro Morales');

      const talk3 = await prisma.scheduleItem.findFirst({
        where: { eventId: BARCAMP_EVENT_ID, title: 'Desarrollo web moderno y aplicaciones progresivas' },
      });
      expect(talk3?.startTime).toBe('09:50');
      expect(talk3?.endTime).toBe('10:30');
      expect(talk3?.speakerName).toBe('Lic. Mariana Reyes');
    });

    it('debe responder en la vista pública móvil agrupada por días', async () => {
      await prisma.eventSettings.update({
        where: { eventId: BARCAMP_EVENT_ID },
        data: { demoModeEnabled: true },
      });
      const pub = await ScheduleService.getPublicSchedule(BARCAMP_EVENT_ID);
      expect(pub.total).toBeGreaterThanOrEqual(4);
      expect(pub.currentTime).toMatch(/^\d{2}:\d{2}$/);
      expect(pub.groupedByDay.length).toBeGreaterThan(0);
      await prisma.eventSettings.update({ where: { eventId: BARCAMP_EVENT_ID }, data: { demoModeEnabled: false } });
    });
  });

  describe('4. PLANTILLA DE CRONOGRAMA E INTEGRACIÓN DE CORREO', () => {
    it('debe incluir SCHEDULE_ANNOUNCEMENT en la lista de plantillas disponibles', async () => {
      const templates = await CommunicationsService.getTemplates(BARCAMP_EVENT_ID);
      const scheduleTpl = templates.find((t) => t.code === 'SCHEDULE_ANNOUNCEMENT');

      expect(scheduleTpl).toBeDefined();
      expect(scheduleTpl?.name).toBe('Cronograma Oficial del Evento');
      expect(scheduleTpl?.variables).toContain('scheduleHtml');
    });

    it('debe renderizar la tabla del cronograma dentro de {{scheduleHtml}}', async () => {
      const reg = await prisma.registration.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
        include: { participant: true, event: { include: { settings: true } } },
      });
      expect(reg).toBeDefined();

      const templates = await CommunicationsService.getTemplates(BARCAMP_EVENT_ID);
      const scheduleTpl = templates.find((t) => t.code === 'SCHEDULE_ANNOUNCEMENT')!;

      const rendered = await CommunicationsService.renderTemplateContent(
        scheduleTpl,
        reg
      );

      expect(rendered.html).toContain('Agenda de Actividades');
      expect(rendered.html).toContain('Registro y acreditación de participantes');
      expect(rendered.html).toContain('08:00 - 08:45');
      expect(rendered.html).toContain('Inteligencia artificial aplicada al desarrollo de software');
    });
  });

  describe('5. SOLUCIÓN ADJUNTOS EN GMAIL (INLINE CID LIMPIO)', () => {
    it('NO debe agregar archivos adjuntos sueltos con filename para evitar cajas de descarga en Gmail', () => {
      const htmlWithQr = '<p>Hola</p><img src="{{qrDataUrl}}" alt="QR" />';
      const dummyBuffer = Buffer.from('FAKE_PNG_BYTES');

      const payload = CommunicationsService.prepareEmailPayload(htmlWithQr, {
        qrBuffer: dummyBuffer,
        qrDataUrl: 'data:image/png;base64,FAKE',
      });

      expect(payload.attachments.length).toBe(1);
      const qrAttachment = payload.attachments[0];
      expect(qrAttachment.cid).toBe('ticket-qr-code');
      // No debe contener filename para evitar chips de descarga en Gmail
      expect((qrAttachment as any).filename).toBeUndefined();
      expect(qrAttachment.contentDisposition).toBe('inline');
    });

    it('NO debe adjuntar código QR cuando la plantilla es de cronograma o comunicado general', () => {
      const htmlWithoutQr = '<p>Estimado participante, adjuntamos el cronograma oficial de conferencias.</p>';
      const dummyBuffer = Buffer.from('FAKE_PNG_BYTES');

      const payload = CommunicationsService.prepareEmailPayload(htmlWithoutQr, {
        qrBuffer: dummyBuffer,
      });

      // No debe existir attachment QR porque el cuerpo no lo usa
      expect(payload.attachments.length).toBe(0);
    });
  });
});
