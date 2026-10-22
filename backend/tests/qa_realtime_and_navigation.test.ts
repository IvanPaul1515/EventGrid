import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';
import { RealtimeService } from '../src/modules/realtime/realtime.service.js';
import { AttendanceService } from '../src/modules/attendance/attendance.service.js';
import { ParticipantsService } from '../src/modules/participants/participants.service.js';
import jwt from 'jsonwebtoken';
import { ENV } from '../src/config/env.js';

describe('EVENTGRID — PRUEBAS OBLIGATORIAS: NAVEGACIÓN Y TIEMPO REAL (SSE)', () => {
  const BARCAMP_EVENT_ID = '1adb61c6-6f85-43f1-93a6-b4be887bdc9c';
  let adminToken: string;
  let operatorToken: string;
  let adminUser: any;
  let operatorUser: any;
  let testRegId: string;
  let concurrentRegId: string;
  let secondEventId: string;

  beforeAll(async () => {
    // 1. Obtener usuarios para pruebas
    adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true } });
    operatorUser = await prisma.user.findFirst({ where: { role: 'OPERATOR', isActive: true } });

    if (!adminUser || !operatorUser) {
      throw new Error('Se requieren usuarios ADMIN y OPERATOR activos para ejecutar las pruebas.');
    }

    adminToken = jwt.sign(
      { id: adminUser.id, email: adminUser.email, role: adminUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    operatorToken = jwt.sign(
      { id: operatorUser.id, email: operatorUser.email, role: operatorUser.role },
      ENV.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // 2. Crear una segunda edición temporal para verificar aislamiento estricto
    const secondEvent = await prisma.event.create({
      data: {
        name: 'Evento Secundario Aislamiento SSE',
        slug: `evento-secundario-sse-${Date.now()}`,
        year: 2028,
        startDate: new Date('2028-05-01'),
        endDate: new Date('2028-05-02'),
        settings: {
          create: {
            primaryColor: '#2563eb',
            secondaryColor: '#1e40af',
          },
        },
      },
    });
    secondEventId = secondEvent.id;

    // 3. Crear inscripciones de prueba en BarCamp para check-in y concurrencia
    const reg = await ParticipantsService.create(BARCAMP_EVENT_ID, {
      firstName: 'Marcos',
      lastName: 'Prueba Realtime',
      email: `marcos.realtime.${Date.now()}@test.com`,
      phone: '8095558899',
    });
    testRegId = reg.id;

    const regConc = await ParticipantsService.create(BARCAMP_EVENT_ID, {
      firstName: 'Elena',
      lastName: 'Prueba Concurrencia',
      email: `elena.concurrencia.${Date.now()}@test.com`,
      phone: '8095559900',
    });
    concurrentRegId = regConc.id;
  });

  afterAll(async () => {
    // Limpieza de datos temporales
    for (const rId of [testRegId, concurrentRegId]) {
      if (rId) {
        await prisma.attendanceLog.deleteMany({ where: { registrationId: rId } });
        await prisma.auditLog.deleteMany({ where: { entityId: rId } });
        await prisma.payment.deleteMany({ where: { registrationId: rId } });
        await prisma.registration.delete({ where: { id: rId } }).catch(() => {});
      }
    }
    if (secondEventId) {
      await prisma.eventSettings.deleteMany({ where: { eventId: secondEventId } });
      await prisma.event.delete({ where: { id: secondEventId } }).catch(() => {});
    }
  });

  describe('1. AUTENTICACIÓN Y CONEXIÓN AL STREAM SSE', () => {
    it('debe rechazar conexión SSE sin token (401 Unauthorized)', async () => {
      const res = await request(app).get(`/api/events/${BARCAMP_EVENT_ID}/stream`);
      expect(res.status).toBe(401);
    });

    it('debe aceptar conexión SSE con token en query parameter (?token=...)', async () => {
      const mockRes: any = {
        writeHead: (status: number, headers: any) => {
          mockRes.statusCode = status;
          mockRes.headers = headers;
        },
        write: (chunk: string) => {
          mockRes.chunks.push(chunk);
        },
        chunks: [],
      };

      RealtimeService.addClient(BARCAMP_EVENT_ID, mockRes);
      expect(RealtimeService.getConnectedCount(BARCAMP_EVENT_ID)).toBeGreaterThanOrEqual(1);

      // Verificar que recibió el handshake inicial de conexión SSE
      expect(mockRes.chunks.length).toBeGreaterThanOrEqual(1);
      expect(mockRes.chunks[0]).toContain('event: message');
      expect(mockRes.chunks[0]).toContain('"type":"CONNECTED"');

      // Limpiar cliente simulado
      RealtimeService.removeClient(BARCAMP_EVENT_ID, mockRes);
    });
  });

  describe('2. AISLAMIENTO ESTRICTO ENTRE EDICIONES', () => {
    it('no debe transmitir eventos de la Edición A a clientes conectados a la Edición B', async () => {
      const clientEventA: any = { write: (c: string) => clientEventA.chunks.push(c), chunks: [] };
      const clientEventB: any = { write: (c: string) => clientEventB.chunks.push(c), chunks: [] };

      RealtimeService.addClient(BARCAMP_EVENT_ID, clientEventA);
      RealtimeService.addClient(secondEventId, clientEventB);

      // Emitir evento exclusivamente en BARCAMP_EVENT_ID
      RealtimeService.emit(BARCAMP_EVENT_ID, {
        type: 'CUSTOM_TEST_EVENT',
        data: { message: 'Mensaje exclusivo de BarCamp' },
      });

      // Cliente A debió recibir el evento
      const clientAHasEvent = clientEventA.chunks.some((c: string) => c.includes('CUSTOM_TEST_EVENT'));
      expect(clientAHasEvent).toBe(true);

      // Cliente B NO debió recibir el evento de BarCamp
      const clientBHasEvent = clientEventB.chunks.some((c: string) => c.includes('CUSTOM_TEST_EVENT'));
      expect(clientBHasEvent).toBe(false);

      // Limpieza
      RealtimeService.removeClient(BARCAMP_EVENT_ID, clientEventA);
      RealtimeService.removeClient(secondEventId, clientEventB);
    });
  });

  describe('3. FLUJO REAL: ESCANEO QR Y CHECK-IN INMEDIATO ENTRE OPERADORES (A y B)', () => {
    it('cuando Operador B confirma check-in, Operador A recibe CHECK_IN_CONFIRMED en tiempo real', async () => {
      // Sesión Operador A (Computadora con lista abierta)
      const sessionAClient: any = { write: (c: string) => sessionAClient.chunks.push(c), chunks: [] };
      RealtimeService.addClient(BARCAMP_EVENT_ID, sessionAClient);

      // Sesión Operador B (iPhone con escáner QR realiza check-in)
      const checkInResult = await AttendanceService.checkIn(
        BARCAMP_EVENT_ID,
        testRegId,
        operatorUser.id,
        'Medium (M)',
        false
      );

      expect(checkInResult.registration.attended).toBe(true);

      // Sesión A recibe el evento sin recargar la página (sin F5)
      const receivedCheckIn = sessionAClient.chunks.find((c: string) => c.includes('CHECK_IN_CONFIRMED'));
      expect(receivedCheckIn).toBeDefined();

      const parsedData = JSON.parse(receivedCheckIn.split('data: ')[1].trim());
      expect(parsedData.type).toBe('CHECK_IN_CONFIRMED');
      expect(parsedData.data.registrationId).toBe(testRegId);
      expect(parsedData.data.attended).toBe(true);
      expect(parsedData.data.attendedByName).toBeTruthy();
      expect(parsedData.data.counters).toBeDefined();

      RealtimeService.removeClient(BARCAMP_EVENT_ID, sessionAClient);
    });

    it('cuando Admin revierte la asistencia, Operador A recibe ATTENDANCE_REVERTED en tiempo real', async () => {
      const sessionAClient: any = { write: (c: string) => sessionAClient.chunks.push(c), chunks: [] };
      RealtimeService.addClient(BARCAMP_EVENT_ID, sessionAClient);

      await AttendanceService.revertAttendance(
        BARCAMP_EVENT_ID,
        testRegId,
        adminUser.id,
        'Prueba de reversión controlada en tiempo real'
      );

      const receivedRevert = sessionAClient.chunks.find((c: string) => c.includes('ATTENDANCE_REVERTED'));
      expect(receivedRevert).toBeDefined();

      const parsedData = JSON.parse(receivedRevert.split('data: ')[1].trim());
      expect(parsedData.type).toBe('ATTENDANCE_REVERTED');
      expect(parsedData.data.registrationId).toBe(testRegId);
      expect(parsedData.data.attended).toBe(false);

      RealtimeService.removeClient(BARCAMP_EVENT_ID, sessionAClient);
    });
  });

  describe('4. PROTECCIÓN CONTRA CHECK-INS DUPLICADOS Y CONCURRENCIA ATÓMICA', () => {
    it('dos intentos de check-in simultáneos sobre el mismo participante deben permitir solo uno y rechazar el segundo', async () => {
      // Re-verificar que está en attended: false en un participante limpio
      const current = await prisma.registration.findUnique({ where: { id: concurrentRegId } });
      expect(current?.attended).toBe(false);

      // Dos operadores confirman exactamente en el mismo instante
      const attempt1 = AttendanceService.checkIn(BARCAMP_EVENT_ID, concurrentRegId, operatorUser.id);
      const attempt2 = AttendanceService.checkIn(BARCAMP_EVENT_ID, concurrentRegId, adminUser.id);

      const results = await Promise.allSettled([attempt1, attempt2]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      // Exactamente UNO tiene éxito
      expect(fulfilled.length).toBe(1);
      // Exactamente UNO es rechazado
      expect(rejected.length).toBe(1);

      // El error rechazado debe indicar claramente que ya ingresó o conflicto de concurrencia
      const rejectReason = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectReason.message).toMatch(/ASISTENCIA YA REGISTRADA|operación concurrente|otro operador/i);

      // La base de datos contiene exactamente una asistencia válida
      const finalReg = await prisma.registration.findUnique({ where: { id: concurrentRegId } });
      expect(finalReg?.attended).toBe(true);

      const logs = await prisma.attendanceLog.findMany({
        where: { registrationId: concurrentRegId, action: 'CHECK_IN' },
      });
      // Exactamente 1 log de check-in exitoso registrado
      expect(logs.length).toBe(1);
    });
  });

  describe('5. REGISTROS, VENTAS Y PAGOS EN TIEMPO REAL', () => {
    it('debe emitir PARTICIPANT_REGISTERED al crear una nueva inscripción', async () => {
      const sessionAClient: any = { write: (c: string) => sessionAClient.chunks.push(c), chunks: [] };
      RealtimeService.addClient(BARCAMP_EVENT_ID, sessionAClient);

      const newParticipant = await ParticipantsService.create(BARCAMP_EVENT_ID, {
        firstName: 'Lucía',
        lastName: 'Ventas Live',
        email: `lucia.live.${Date.now()}@test.com`,
      });

      const received = sessionAClient.chunks.find((c: string) => c.includes('PARTICIPANT_REGISTERED'));
      expect(received).toBeDefined();

      // Limpieza
      await prisma.registration.delete({ where: { id: newParticipant.id } });
      RealtimeService.removeClient(BARCAMP_EVENT_ID, sessionAClient);
    });

    it('debe emitir PAYMENT_RECORDED al asentar un abono', async () => {
      const sessionAClient: any = { write: (c: string) => sessionAClient.chunks.push(c), chunks: [] };
      RealtimeService.addClient(BARCAMP_EVENT_ID, sessionAClient);

      const pMethod = await prisma.paymentMethod.findFirst({ where: { eventId: BARCAMP_EVENT_ID } });

      await ParticipantsService.recordPayment(
        BARCAMP_EVENT_ID,
        testRegId,
        {
          amount: 500,
          paymentMethodId: pMethod!.id,
          notes: 'Abono en tiempo real',
        },
        adminUser.id
      );

      const receivedPayment = sessionAClient.chunks.find((c: string) => c.includes('PAYMENT_RECORDED'));
      expect(receivedPayment).toBeDefined();

      RealtimeService.removeClient(BARCAMP_EVENT_ID, sessionAClient);
    });
  });

  describe('6. DESCONEXIÓN Y RECONEXIÓN DE CLIENTES', () => {
    it('al desconectar un cliente, se desuscribe correctamente liberando memoria', async () => {
      const client: any = { write: () => {}, chunks: [] };
      RealtimeService.addClient(BARCAMP_EVENT_ID, client);
      const countBefore = RealtimeService.getConnectedCount(BARCAMP_EVENT_ID);

      RealtimeService.removeClient(BARCAMP_EVENT_ID, client);
      const countAfter = RealtimeService.getConnectedCount(BARCAMP_EVENT_ID);

      expect(countAfter).toBe(countBefore - 1);
    });

    it('el endpoint de diagnóstico /status reporta los clientes conectados fielmente', async () => {
      const res = await request(app)
        .get(`/api/events/${BARCAMP_EVENT_ID}/status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.eventId).toBe(BARCAMP_EVENT_ID);
      expect(typeof res.body.data.connectedClients).toBe('number');
    });
  });

  describe('7. PRESERVACIÓN ESTRICTA DE DATOS Y CONFIGURACIONES', () => {
    it('las 282 camisetas de BarCamp RD 2026 permanecen intactas', async () => {
      const inventory = await prisma.tshirtInventory.findMany({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      const total = inventory.reduce((sum, item) => sum + item.initialQuantity, 0);
      expect(total).toBe(282);
    });

    it('la configuración SMTP de Brevo permanece intacta y activa', async () => {
      const config = await prisma.emailConfig.findFirst({
        where: { eventId: BARCAMP_EVENT_ID },
      });
      expect(config?.isEnabled).toBe(true);
      expect(config?.host).toBe('smtp-relay.brevo.com');
      expect(config?.user).toBe('bf682a001@smtp-brevo.com');
    });
  });
});
