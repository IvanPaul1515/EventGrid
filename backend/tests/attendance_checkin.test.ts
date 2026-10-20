import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/config/db.js';

describe('Control de Asistencia (Check-in) — BarCamp RD', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let activeEventId: string;
  let otherEventId: string;
  let testRegPendingId: string;
  let testRegAttendedId: string;
  let testRegOtherEditionId: string;

  beforeAll(async () => {
    // 1. Obtener tokens de autenticación
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@barcamp.org.do', password: 'BarCamp2026!Admin' });
    adminToken = adminRes.body.data.token;

    const opRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'operador@barcamp.org.do', password: 'BarCamp2026!Op' });
    operatorToken = opRes.body.data.token;

    const viewRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'consulta@barcamp.org.do', password: 'BarCamp2026!View' });
    viewerToken = viewRes.body.data.token;

    // 2. Obtener edición activa (BarCamp RD 2026) y otra edición (2025)
    const activeEvent = await prisma.event.findFirst({ where: { year: 2026 } });
    activeEventId = activeEvent!.id;

    let otherEvent = await prisma.event.findFirst({ where: { year: 2025 } });
    if (!otherEvent) {
      otherEvent = await prisma.event.create({
        data: {
          name: 'BarCamp RD 2025',
          slug: 'barcamp-rd-2025-test',
          year: 2025,
          startDate: new Date('2025-10-25'),
          endDate: new Date('2025-10-25'),
          venue: 'PUCMM Santiago',
        },
      });
    }
    otherEventId = otherEvent.id;

    // 3. Crear participantes de prueba dedicados para este test
    const participantPending = await prisma.participant.create({
      data: {
        firstName: 'Checkin',
        lastName: 'PendingTest',
        fullName: 'Checkin PendingTest',
        email: `checkin.pending.${Date.now()}@pucmm.edu.do`,
        documentId: '031-9988776-1',
        phone: '809-555-0101',
      },
    });

    const regPending = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: participantPending.id,
        registrationNumber: `BC26-CHK-${Date.now().toString().slice(-4)}`,
        status: 'CONFIRMED',
        attended: false,
        totalAmount: 500,
        isVerified: true,
      },
    });
    testRegPendingId = regPending.id;

    const participantAttended = await prisma.participant.create({
      data: {
        firstName: 'Already',
        lastName: 'AttendedTest',
        fullName: 'Already AttendedTest',
        email: `already.attended.${Date.now()}@pucmm.edu.do`,
        documentId: '031-9988776-2',
        phone: '809-555-0102',
      },
    });

    const regAttended = await prisma.registration.create({
      data: {
        eventId: activeEventId,
        participantId: participantAttended.id,
        registrationNumber: `BC26-ATT-${Date.now().toString().slice(-4)}`,
        status: 'ATTENDED',
        attended: true,
        attendedAt: new Date(),
        totalAmount: 0,
        isCourtesy: true,
      },
    });
    testRegAttendedId = regAttended.id;

    // Participante en OTRA edición (2025)
    const participantOther = await prisma.participant.create({
      data: {
        firstName: 'Other',
        lastName: 'EditionTest',
        fullName: 'Other EditionTest',
        email: `other.edition.${Date.now()}@pucmm.edu.do`,
      },
    });

    const regOther = await prisma.registration.create({
      data: {
        eventId: otherEventId,
        participantId: participantOther.id,
        registrationNumber: `BC25-OTH-${Date.now().toString().slice(-4)}`,
        status: 'CONFIRMED',
        attended: false,
      },
    });
    testRegOtherEditionId = regOther.id;
  });

  it('1. Debe obtener contadores en tiempo real (total, asistidos, pendientes)', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/counters')
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.totalRegistrations).toBeGreaterThanOrEqual(2);
    expect(res.body.data.attendedCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.pendingCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totalRegistrations).toBe(
      res.body.data.attendedCount + res.body.data.pendingCount
    );
  });

  it('2. Búsqueda rápida por nombre, cédula o ticket', async () => {
    const res = await request(app)
      .get('/api/v1/attendance')
      .query({ search: '031-9988776-1' })
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].participant.fullName).toContain('Checkin PendingTest');
  });

  it('3. Debe registrar asistencia física (Check-in) como OPERADOR', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ registrationId: testRegPendingId });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.attended).toBe(true);
    expect(res.body.data.attendedAt).toBeDefined();
    expect(res.body.data.attendedByUser).toBeDefined();
    expect(res.body.data.attendedByUser.email).toBe('operador@barcamp.org.do');
    expect(res.body.message).toContain('Asistencia confirmada');
  });

  it('4. Debe prevenir registros duplicados y mostrar advertencia clara si ya ingresó', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ registrationId: testRegPendingId }); // Mismo ID que ya marcó entrada

    expect(res.status).toBe(400);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toContain('ASISTENCIA YA REGISTRADA');
    expect(res.body.message).toContain('Checkin PendingTest');
  });

  it('5. Debe rechazar reversión si el usuario es OPERADOR (Solo ADMIN puede revertir)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/revert')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        registrationId: testRegPendingId,
        reason: 'Error involuntario de recepción',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Acceso denegado');
  });

  it('6. El ADMINISTRADOR puede revertir una asistencia con motivo justificado', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/revert')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        registrationId: testRegPendingId,
        reason: 'El participante se equivocó de gafete en mesa de entrada',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.attended).toBe(false);
    expect(res.body.data.attendedAt).toBeNull();
    expect(res.body.data.attendedByUserId).toBeNull();

    // Comprobar que se registró en AttendanceLog
    const log = await prisma.attendanceLog.findFirst({
      where: {
        registrationId: testRegPendingId,
        action: 'REVERT',
      },
      orderBy: { timestamp: 'desc' },
    });

    expect(log).toBeDefined();
    expect(log!.reason).toBe('El participante se equivocó de gafete en mesa de entrada');
  });

  it('7. No debe permitir registrar check-in de otra edición (aislamiento estricto)', async () => {
    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ registrationId: testRegOtherEditionId });

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Inscripción no encontrada en la edición activa');
  });

  it('8. Debe exportar la lista de asistencia en formato Excel (.xlsx)', async () => {
    const res = await request(app)
      .get('/api/v1/attendance/export')
      .set('Authorization', `Bearer ${viewerToken}`)
      .buffer()
      .parse((res, callback) => {
        const data: Uint8Array[] = [];
        res.on('data', (chunk) => data.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(data)));
      });

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toContain('openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.header['content-disposition']).toContain('attachment');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(100);
  });
});
