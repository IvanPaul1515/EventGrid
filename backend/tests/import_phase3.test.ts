import { describe, it, expect, beforeAll } from 'vitest';

process.env.DATABASE_URL = process.env.DATABASE_URL || 'file:./dev.db';
process.env.JWT_SECRET = 'test_jwt_secret_barcamp';

import request from 'supertest';
import { app } from '../src/app.js';
import * as XLSX from 'xlsx';

describe('Fase 3: Motor de Importación Inteligente de Excel', () => {
  let adminToken: string;
  let operatorToken: string;
  let viewerToken: string;
  let event2026Id: string;

  function generateExcelBase64() {
    const timestamp = Date.now() + Math.floor(Math.random() * 100000);
    const historicalRows = [
      {
        'No. Registro': `BC26-H${timestamp.toString().slice(-4)}A`,
        'Nombres': 'Franklin',
        'Apellidos': 'Mirabal Peña',
        'Doc. Identidad': `031-${timestamp.toString().slice(-7)}-1`,
        'EMail': `franklin.${timestamp}@pucmm.edu.do`,
        'Teléfono': '809-555-7788',
        'Forma Pago': 'Transferencia Banco Popular',
        'Pago Total': 'RD$ 500.00',
        'Responsable de Venta': 'Mesa PUCMM',
        'Horario de Venta': '2026-10-15 10:30',
      },
      {
        'No. Registro': `BC26-H${timestamp.toString().slice(-4)}B`,
        'Nombres': 'Rosa',
        'Apellidos': 'Cabrera Santos',
        'Doc. Identidad': `031-${timestamp.toString().slice(-7)}-2`,
        'EMail': `rosa.${timestamp}@innovacion.do`,
        'Teléfono': '829-555-9900',
        'Forma Pago': 'Cortesía Institucional',
        'Pago Total': '0',
        'Responsable de Venta': 'Comité Organizador',
        'Horario de Venta': '2026-10-15 11:00',
      },
      {
        'No. Registro': `BC26-H${timestamp.toString().slice(-4)}C`,
        'Nombres': 'Invalido',
        'Apellidos': 'Sin Correo',
        'Doc. Identidad': '',
        'EMail': 'correo-invalido-sin-arroba',
        'Teléfono': '',
        'Forma Pago': 'Efectivo',
        'Pago Total': '500',
        'Responsable de Venta': 'Mesa Registro',
        'Horario de Venta': '2026-10-15 11:15',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(historicalRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inscritos');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf.toString('base64');
  }

  beforeAll(async () => {
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

    const eventsRes = await request(app)
      .get('/api/v1/events')
      .set('Authorization', `Bearer ${adminToken}`);
    const e26 = eventsRes.body.data.find((e: any) => e.year === 2026);
    event2026Id = e26.id;
  });

  it('1. Debe analizar el archivo Excel y reconocer automáticamente las cabeceras por alias lingüísticos', async () => {
    const sampleBase64 = generateExcelBase64();
    const res = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/analyze`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        fileBase64: sampleBase64,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.sheets).toContain('Inscritos');
    expect(res.body.data.columns).toContain('Nombres');
    expect(res.body.data.columns).toContain('EMail');
    expect(res.body.data.columns).toContain('Doc. Identidad');

    const mapping = res.body.data.autoMapping;
    expect(mapping['Nombres']).toBe('firstName');
    expect(mapping['Apellidos']).toBe('lastName');
    expect(mapping['Doc. Identidad']).toBe('documentId');
    expect(mapping['EMail']).toBe('email');
    expect(mapping['Forma Pago']).toBe('paymentMethod');
    expect(mapping['Pago Total']).toBe('totalAmount');
  });

  it('2. Debe validar los registros antes de importar, detectando filas válidas e inconsistencias', async () => {
    const sampleBase64 = generateExcelBase64();
    const analyzeRes = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/analyze`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        fileBase64: sampleBase64,
      });

    const valRes = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/validate`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        sheetName: 'Inscritos',
        rows: analyzeRes.body.data.previewRows,
        columnMapping: analyzeRes.body.data.autoMapping,
      });

    expect(valRes.status).toBe(200);
    expect(valRes.body.data.totalRows).toBe(3);
    expect(valRes.body.data.validRows).toBe(2);
    expect(valRes.body.data.errorRows).toBe(1);
  });

  it('3. Debe ejecutar la importación por lotes guardando los registros en la base de datos', async () => {
    const sampleBase64 = generateExcelBase64();
    const analyzeRes = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/analyze`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        fileBase64: sampleBase64,
      });

    const execRes = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/execute`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        sheetName: 'Inscritos',
        rows: analyzeRes.body.data.previewRows,
        columnMapping: analyzeRes.body.data.autoMapping,
        conflictStrategy: 'SKIP',
      });

    expect(execRes.status).toBe(201);
    expect(execRes.body.data.importedCount).toBe(2);
    expect(execRes.body.data.errorCount).toBe(1);
    expect(execRes.body.data.batchId).toBeDefined();

    // 4. Re-importar el mismo archivo no debe duplicar participantes
    const reImportRes = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/execute`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({
        fileName: 'Historico_BarCamp_2026.xlsx',
        sheetName: 'Inscritos',
        rows: analyzeRes.body.data.previewRows,
        columnMapping: analyzeRes.body.data.autoMapping,
        conflictStrategy: 'SKIP',
      });

    expect(reImportRes.status).toBe(201);
    expect(reImportRes.body.data.importedCount).toBe(0);
    expect(reImportRes.body.data.skippedCount).toBe(2);
  });

  it('5. El rol VIEWER no debe tener permiso para ejecutar importaciones (403 Forbidden)', async () => {
    const res = await request(app)
      .post(`/api/v1/events/${event2026Id}/import/execute`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({
        fileName: 'Test.xlsx',
        sheetName: 'Sheet1',
        rows: [{ Nombres: 'Test' }],
        columnMapping: { Nombres: 'firstName' },
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('Acceso denegado');
  });

  it('6. Debe listar el historial de lotes importados y descargar el reporte de errores', async () => {
    const batchesRes = await request(app)
      .get(`/api/v1/events/${event2026Id}/import/batches`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(batchesRes.status).toBe(200);
    expect(batchesRes.body.data.length).toBeGreaterThanOrEqual(1);

    const firstBatchId = batchesRes.body.data[0].id;
    const errorsRes = await request(app)
      .get(`/api/v1/events/${event2026Id}/import/batches/${firstBatchId}/errors`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .responseType('blob');

    expect(errorsRes.status).toBe(200);
    expect(errorsRes.headers['content-type']).toContain('spreadsheetml.sheet');
  });
});
