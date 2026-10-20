import { describe, it, expect, beforeAll } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.JWT_SECRET = 'test_jwt_secret_barcamp';

import request from 'supertest';
import { app } from '../src/app.js';
import * as XLSX from 'xlsx';

describe('Fase 2: Gestión Integral de Participantes y Multiedición', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let event2026Id: string;
  let event2025Id: string;
  let createdReg2026Id: string;
  let createdRegNumber2026: string;

  const testEmail = `juan.perez.${Date.now()}@pucmm.edu.do`;
  const testDoc = `031-${Date.now().toString().slice(-7)}-7`;

  beforeAll(async () => {
    // 1. Iniciar sesión con los 3 roles
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

    // 2. Obtener IDs de las ediciones 2026 y 2025
    const eventsRes = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`);

    const e26 = eventsRes.body.data.find((e: any) => e.year === 2026);
    const e25 = eventsRes.body.data.find((e: any) => e.year === 2025);
    event2026Id = e26.id;
    event2025Id = e25.id;
  });

  it('1. Debe registrar un nuevo participante en BarCamp 2026 con ticket autogenerado', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${event2026Id}/participants`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        firstName: 'Juan',
        lastName: 'Pérez Rosario',
        documentId: testDoc,
        email: testEmail,
        phone: '809-555-1234',
        alternatePhone: '829-555-9876',
        totalAmount: 500.0,
        isVerified: true,
        status: 'CONFIRMED',
        notes: 'Estudiante PUCMM Santiago, conferencia IA',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.registrationNumber).toMatch(/^BC26-\d{4}$/);
    expect(res.body.data.participant.fullName).toBe('Juan Pérez Rosario');
    expect(res.body.data.participant.email).toBe(testEmail);
    expect(Number(res.body.data.totalAmount)).toBe(500);

    createdReg2026Id = res.body.data.id;
    createdRegNumber2026 = res.body.data.registrationNumber;
  });

  it('2. Debe impedir la inscripción duplicada de la misma persona en la misma edición (409 Conflict)', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${event2026Id}/participants`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        firstName: 'Juan',
        lastName: 'Pérez',
        documentId: testDoc,
        email: testEmail,
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('ya se encuentra registrado');
  });

  it('3. Debe permitir inscribir a la misma persona en otra edición (BarCamp 2025) reutilizando su ficha física', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${event2025Id}/participants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Juan',
        lastName: 'Pérez Rosario',
        documentId: testDoc,
        email: testEmail,
        totalAmount: 400.0,
        status: 'ATTENDED',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.registrationNumber).toMatch(/^BC25-\d{4}$/);
    expect(res.body.data.eventId).toBe(event2025Id);
  });

  it('4. La Ficha 360° del participante debe reflejar su historial en ediciones anteriores', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants/${createdReg2026Id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdReg2026Id);
    expect(res.body.data.editionHistory).toBeDefined();
    expect(res.body.data.editionHistory.length).toBeGreaterThanOrEqual(1);

    const hist2025 = res.body.data.editionHistory.find((h: any) => h.year === 2025);
    expect(hist2025).toBeDefined();
    expect(hist2025.editionName).toContain('2025');
  });

  it('5. Debe aislar estrictamente las ediciones: no acceder a un ticket de 2026 usando la edición 2025', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${event2025Id}/participants/${createdReg2026Id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain('no encontrada en la edición');
  });

  it('6. Debe buscar participantes por nombre, cédula o ticket y paginar desde el servidor', async () => {
    // Búsqueda por coincidencia
    const searchRes = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants?search=Pérez&page=1&limit=10`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(searchRes.body.pagination).toHaveProperty('total');
    expect(searchRes.body.pagination.page).toBe(1);

    // Búsqueda sin coincidencias
    const emptyRes = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants?search=TextoInexistenteXYZ`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data.length).toBe(0);
  });

  it('7. El rol VIEWER no debe poder crear ni modificar registros (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${event2026Id}/participants`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        firstName: 'Ana',
        lastName: 'Gómez',
        email: 'ana@example.com',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Acceso denegado');
  });

  it('8. Debe actualizar un registro existente como OPERADOR', async () => {
    const res = await request(app)
      .put(`/api/v1/events/${event2026Id}/participants/${createdReg2026Id}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        phone: '809-999-0000',
        totalAmount: 600.0,
        status: 'ATTENDED',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.participant.phone).toBe('809-999-0000');
    expect(Number(res.body.data.totalAmount)).toBe(600);
    expect(res.body.data.status).toBe('ATTENDED');
  });

  it('9. Debe exportar a formato Excel (.xlsx) con columnas oficiales BarCamp', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants/export?format=xlsx`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

    // Parsear el archivo Excel generado para verificar que es válido
    const workbook = XLSX.read(res.body, { type: 'buffer' });
    expect(workbook.SheetNames.length).toBeGreaterThan(0);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);
    expect(json.length).toBeGreaterThanOrEqual(1);

    const firstRow: any = json[0];
    expect(firstRow).toHaveProperty('No. Registro');
    expect(firstRow).toHaveProperty('Nombre Completo');
    expect(firstRow).toHaveProperty('Pago Total (RD$)');
  });

  it('10. Debe exportar a formato CSV', async () => {
    const res = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants/export?format=csv`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('No. Registro');
    expect(res.text).toContain('Juan Pérez');
  });

  it('11. Debe eliminar una inscripción correctamente', async () => {
    const res = await request(app)
      .delete(`/api/v1/events/${event2026Id}/participants/${createdReg2026Id}`)
      .set('Authorization', `Bearer ${operatorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // Confirmar que ya no existe en 2026
    const checkRes = await request(app)
      .get(`/api/v1/events/${event2026Id}/participants/${createdReg2026Id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(checkRes.status).toBe(404);
  });
});
