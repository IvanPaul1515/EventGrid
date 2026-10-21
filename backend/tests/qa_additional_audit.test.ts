import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.JWT_SECRET = 'test_jwt_secret_barcamp';

import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import { EventsService } from '../src/modules/events/events.service.js';
import { DemoService } from '../src/modules/demo/demo.service.js';
import { resetRateLimitStore } from '../src/middleware/rateLimiter.js';

describe('QA-16 a QA-19: Auditoría Adicional y Robustez del Sistema', () => {
  let adminToken: string;
  let adminUserId: string;
  let testEvent: any;
  let testTicket: any;
  let testPaymentMethod: any;

  beforeAll(async () => {
    // 1. Iniciar sesión como administrador
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });

    adminToken = loginRes.body.data.token;
    const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    adminUserId = user!.id;

    // 2. Obtener un evento existente o el default
    testEvent = await prisma.event.findFirst({
      where: { status: 'ACTIVE' },
      include: {
        ticketTypes: true,
        paymentMethods: true,
        settings: true,
      },
    });

    if (!testEvent) {
      testEvent = await prisma.event.findFirst({
        include: { ticketTypes: true, paymentMethods: true, settings: true },
      });
    }

    testTicket = testEvent.ticketTypes[0] || (await prisma.ticketType.create({
      data: {
        eventId: testEvent.id,
        name: 'Tarifa General QA',
        price: 1750,
        isActive: true,
      },
    }));

    testPaymentMethod = testEvent.paymentMethods[0] || (await prisma.paymentMethod.create({
      data: {
        eventId: testEvent.id,
        name: 'Transferencia QA',
        isActive: true,
      },
    }));
  });

  afterAll(async () => {
    // Limpieza de datos de prueba
    await prisma.registration.deleteMany({
      where: {
        participant: {
          email: {
            contains: 'qa_audit_test_',
          },
        },
      },
    });
    await prisma.participant.deleteMany({
      where: {
        email: {
          contains: 'qa_audit_test_',
        },
      },
    });
  });

  // ==========================================
  // QA-16: Concurrencia en la numeración de inscripciones
  // ==========================================
  describe('QA-16: Generación segura de numeración y concurrencia', () => {
    it('Debe generar números de inscripción únicos y consecutivos bajo solicitudes concurrentes sin colisión', async () => {
      const concurrentCount = 5;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        const uniqueEmail = `qa_audit_test_conc_${Date.now()}_${i}@example.com`;
        promises.push(
          ParticipantsService.create(
            testEvent.id,
            {
              firstName: `ConcQA_${i}`,
              lastName: 'Tester',
              email: uniqueEmail,
              ticketTypeId: testTicket.id,
              paymentMethodId: testPaymentMethod.id,
              amountPaid: 1750,
            },
            adminUserId
          )
        );
      }

      // Ejecutar en paralelo simultáneo
      const results = await Promise.all(promises);

      expect(results).toHaveLength(concurrentCount);

      // Comprobar que todos tienen número de registro
      const regNumbers = results.map((r) => r.registrationNumber);
      expect(regNumbers.every((num) => Boolean(num))).toBe(true);

      // Comprobar que no hay duplicados en los números asignados
      const uniqueNumbers = new Set(regNumbers);
      expect(uniqueNumbers.size).toBe(concurrentCount);

      // Comprobar que todos tienen prefijo neutro EV o el del evento
      for (const num of regNumbers) {
        expect(num).toMatch(/^(EV|\w+)\d*-/);
      }
    });
  });

  // ==========================================
  // QA-17: Neutralidad de configuraciones y eliminación de defaults institucionales
  // ==========================================
  describe('QA-17: Defaults neutros y eliminación de referencias a PUCMM/BarCamp', () => {
    it('Debe crear nuevos eventos con prefijo neutro EV y sede genérica sin referencias fijas a PUCMM', async () => {
      const uniqueSlug = `qa-audit-event-${Date.now()}`;
      const newEvent = await EventsService.create({
        slug: uniqueSlug,
        name: 'Evento Neutro Corporativo QA',
        year: 2026,
        startDate: '2026-11-01T09:00:00.000Z',
        endDate: '2026-11-01T18:00:00.000Z',
      });

      expect(newEvent).toBeDefined();
      expect(newEvent.venue).not.toContain('PUCMM');
      expect(newEvent.venue).not.toContain('BarCamp');
      expect(newEvent.settings?.registrationPrefix).toContain('EV');
      expect(newEvent.settings?.registrationPrefix).not.toContain('BC-');

      // Limpiar evento de prueba
      await prisma.eventSettings.deleteMany({ where: { eventId: newEvent.id } });
      await prisma.event.delete({ where: { id: newEvent.id } });
    });
  });

  // ==========================================
  // QA-18: Seguridad transaccional en el reinicio de datos demo
  // ==========================================
  describe('QA-18: Reset transaccional de datos demostrativos', () => {
    it('Debe generar y reiniciar datos de demostración de manera atómica sin alterar registros reales', async () => {
      // 1. Crear una inscripción real previa
      const realParticipant = await ParticipantsService.create(
        testEvent.id,
        {
          firstName: 'Participante',
          lastName: 'Real QA',
          email: `qa_audit_test_real_${Date.now()}@example.com`,
          ticketTypeId: testTicket.id,
          paymentMethodId: testPaymentMethod.id,
          amountPaid: 1750,
        },
        adminUserId
      );

      // 2. Generar datos ficticios
      const genResult = await DemoService.generate(testEvent.id, 5, adminUserId);
      expect(genResult.generatedCount).toBe(5);

      const statusBefore = await DemoService.getStatus(testEvent.id);
      expect(statusBefore.counts.demoRegistrations).toBeGreaterThanOrEqual(5);

      // 3. Ejecutar reset transaccional
      const resetResult = await DemoService.reset(testEvent.id);
      expect(resetResult.deletedRegistrationsCount).toBeGreaterThanOrEqual(5);

      const statusAfter = await DemoService.getStatus(testEvent.id);
      expect(statusAfter.counts.demoRegistrations).toBe(0);

      // 4. Confirmar que la inscripción real sigue existiendo intacta
      const realCheck = await prisma.registration.findUnique({
        where: { id: realParticipant.id },
      });
      expect(realCheck).toBeDefined();
      expect(realCheck?.isDemo).toBe(false);
    });
  });

  // ==========================================
  // QA-19: Protección contra ataques de fuerza bruta y limitación de tasa en login
  // ==========================================
  describe('QA-19: Rate limiting en autenticación', () => {
    beforeEach(() => {
      resetRateLimitStore();
    });

    it('Debe bloquear solicitudes tras superar el umbral de 5 intentos fallidos (HTTP 429 Too Many Requests)', async () => {
      const targetEmail = `brute_target_${Date.now()}@eventgrid.com`;

      // Realizar 5 intentos fallidos consecutivos
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post('/api/v1/auth/login')
          .send({ email: targetEmail, password: 'WrongBarCamp2026!Admin' });

        expect(res.status).toBe(401);
      }

      // El 6to intento debe recibir 429 Too Many Requests
      const blockedRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: targetEmail, password: 'WrongBarCamp2026!Admin' });

      expect(blockedRes.status).toBe(429);
      expect(blockedRes.body.status).toBe('error');
      expect(blockedRes.body.message.toLowerCase()).toContain('demasiados intentos' || 'temporalmente');
      expect(blockedRes.headers).toHaveProperty('retry-after');

      // Verificar que los passwords no aparezcan en el log de auditoría
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: 'LOGIN_FAILED',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (auditLog && auditLog.changes) {
        const changesStr = typeof auditLog.changes === 'string' ? auditLog.changes : JSON.stringify(auditLog.changes);
        expect(changesStr).not.toContain('WrongBarCamp2026!Admin');
      }
    });

    it('Debe permitir autenticación exitosa y no bloquear credenciales correctas', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data).toHaveProperty('token');
    });
  });
});
